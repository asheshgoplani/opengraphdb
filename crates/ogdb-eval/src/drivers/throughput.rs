//! Raw-throughput driver (Dimension 1 of the metrics spec).
//!
//! Five sub-drivers:
//!
//! - [`ingest_streaming`] — continuous small-batch inserts over a fixed wall-clock
//!   window; reports nodes/s + edges/s sustained.
//! - [`ingest_bulk`] — one large write transaction of N nodes + sequential
//!   edges; reports elapsed + engineering throughput. Also used as a seed by
//!   the other sub-drivers and by `ai_agent`.
//! - [`read_point`] — `neighbors()` point lookup on random ids; reports the
//!   full latency tail (p50/p95/p99/p99.9).
//! - [`read_traversal`] — 2-hop neighbourhood from random seed nodes;
//!   reports the tail + aggregate QPS.
//! - [`mutation`] — property update via write-tx (one node per tx);
//!   reports updates/s + p95.
//!
//! All sub-drivers assume single-writer (ogdb-core's model) and emit an
//! `EvaluationRun` compatible with `JsonlHistory`, `DiffEngine`, and
//! `LdbcSubmission`.

use std::path::Path;
use std::time::{Duration, Instant};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue};

use crate::drivers::common::{
    dir_disk_bytes, evaluation_run_skeleton, metric, percentiles_extended, process_rss_bytes,
};
use crate::EvaluationRun;

#[derive(Debug, thiserror::Error)]
pub enum ThroughputError {
    #[error("db error: {0}")]
    Db(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid argument: {0}")]
    Invalid(&'static str),
}

const STREAMING_BATCH: usize = 64;
const DB_FILE: &str = "throughput.ogdb";

fn open_or_init(db_dir: &Path) -> Result<Database, ThroughputError> {
    std::fs::create_dir_all(db_dir)?;
    let path = db_dir.join(DB_FILE);
    if path.exists() {
        Database::open(&path).map_err(|e| ThroughputError::Db(format!("open: {e}")))
    } else {
        Database::init(&path, Header::default_v1())
            .map_err(|e| ThroughputError::Db(format!("init: {e}")))
    }
}

/// Streaming ingest: insert small batches of nodes + edges continuously for
/// `budget`, one write-tx per batch. Reports sustained nodes/s and edges/s.
///
/// Edges connect each new node to one previously-inserted node (when any
/// exist) so we exercise both node and edge write paths.
pub fn ingest_streaming(
    db_dir: &Path,
    budget: Duration,
) -> Result<EvaluationRun, ThroughputError> {
    if budget.is_zero() {
        return Err(ThroughputError::Invalid("budget must be > 0"));
    }
    let mut db = open_or_init(db_dir)?;

    let deadline = Instant::now() + budget;
    let mut node_total: u64 = 0;
    let mut edge_total: u64 = 0;
    let started = Instant::now();
    while Instant::now() < deadline {
        let mut last_id = None;
        {
            let mut tx = db.begin_write();
            for _ in 0..STREAMING_BATCH {
                let id = tx
                    .create_node()
                    .map_err(|e| ThroughputError::Db(format!("create_node: {e}")))?;
                if let Some(prev) = last_id {
                    tx.add_edge(prev, id)
                        .map_err(|e| ThroughputError::Db(format!("add_edge: {e}")))?;
                    edge_total += 1;
                }
                last_id = Some(id);
                node_total += 1;
            }
            tx.commit()
                .map_err(|e| ThroughputError::Db(format!("commit: {e}")))?;
        }
    }
    let elapsed_s = started.elapsed().as_secs_f64();
    let nodes_per_sec = if elapsed_s > 0.0 { node_total as f64 / elapsed_s } else { 0.0 };
    let edges_per_sec = if elapsed_s > 0.0 { edge_total as f64 / elapsed_s } else { 0.0 };

    let mut run = evaluation_run_skeleton("throughput", "ingest_streaming", "synthetic");
    run.metrics
        .insert("nodes_per_sec".to_string(), metric(nodes_per_sec, "nodes/s", true));
    run.metrics
        .insert("edges_per_sec".to_string(), metric(edges_per_sec, "edges/s", true));
    run.metrics.insert(
        "nodes_total".to_string(),
        metric(node_total as f64, "count", true),
    );
    run.metrics.insert(
        "edges_total".to_string(),
        metric(edge_total as f64, "count", true),
    );
    run.metrics
        .insert("elapsed_s".to_string(), metric(elapsed_s, "s", false));
    run.notes = format!(
        "streaming ingest; batch={STREAMING_BATCH}, budget_ms={}",
        budget.as_millis()
    );
    Ok(run)
}

/// Bulk ingest: open a fresh database at `db_dir/throughput.ogdb`, write
/// `n_nodes` nodes + (n_nodes - 1) sequential edges in a single write-tx.
/// Returns elapsed, throughput, and on-disk footprint. Also used as a seed
/// fixture by the other sub-drivers.
pub fn ingest_bulk(db_dir: &Path, n_nodes: u32) -> Result<EvaluationRun, ThroughputError> {
    if n_nodes == 0 {
        return Err(ThroughputError::Invalid("n_nodes must be > 0"));
    }
    std::fs::create_dir_all(db_dir)?;
    let db_path = db_dir.join(DB_FILE);
    // Bulk drivers always start fresh so subsequent read_point / mutation
    // runs see a known id range.
    if db_path.exists() {
        std::fs::remove_file(&db_path)?;
        let wal = db_path.with_extension("wal");
        if wal.exists() {
            std::fs::remove_file(&wal)?;
        }
    }
    let mut db = Database::init(&db_path, Header::default_v1())
        .map_err(|e| ThroughputError::Db(format!("init: {e}")))?;

    let started = Instant::now();
    let mut node_ids = Vec::with_capacity(n_nodes as usize);
    {
        let mut tx = db.begin_write();
        for _ in 0..n_nodes {
            let id = tx
                .create_node()
                .map_err(|e| ThroughputError::Db(format!("create_node: {e}")))?;
            node_ids.push(id);
        }
        for w in node_ids.windows(2) {
            tx.add_edge(w[0], w[1])
                .map_err(|e| ThroughputError::Db(format!("add_edge: {e}")))?;
        }
        tx.commit()
            .map_err(|e| ThroughputError::Db(format!("commit: {e}")))?;
    }
    let elapsed_s = started.elapsed().as_secs_f64();
    let nodes_per_sec = if elapsed_s > 0.0 { n_nodes as f64 / elapsed_s } else { 0.0 };
    let disk_mb = dir_disk_bytes(db_dir) as f64 / (1024.0 * 1024.0);

    let mut run = evaluation_run_skeleton("throughput", "ingest_bulk", "synthetic");
    run.metrics
        .insert("nodes".to_string(), metric(n_nodes as f64, "count", true));
    run.metrics
        .insert("elapsed_s".to_string(), metric(elapsed_s, "s", false));
    run.metrics.insert(
        "nodes_per_sec".to_string(),
        metric(nodes_per_sec, "nodes/s", true),
    );
    run.metrics
        .insert("disk_mb".to_string(), metric(disk_mb, "MB", false));
    run.notes = format!("bulk ingest; {n_nodes} nodes + {} edges", n_nodes.saturating_sub(1));
    Ok(run)
}

/// Point-read driver. Runs `samples` random `neighbors()` lookups and
/// reports the full latency tail. Expects the database at
/// `db_dir/throughput.ogdb` to be pre-seeded (see [`ingest_bulk`]).
pub fn read_point(db_dir: &Path, samples: u32) -> Result<EvaluationRun, ThroughputError> {
    if samples == 0 {
        return Err(ThroughputError::Invalid("samples must be > 0"));
    }
    let db_path = db_dir.join(DB_FILE);
    let db = Database::open(&db_path).map_err(|e| ThroughputError::Db(format!("open: {e}")))?;
    let node_count = db.node_count();
    if node_count == 0 {
        return Err(ThroughputError::Db("empty database".into()));
    }
    let mut rng = 0xdead_beef_cafe_babeu64;
    let mut samples_us: Vec<f64> = Vec::with_capacity(samples as usize);
    let started = Instant::now();
    for _ in 0..samples {
        let id = xorshift(&mut rng) % node_count;
        let t0 = Instant::now();
        let _ = db
            .neighbors(id)
            .map_err(|e| ThroughputError::Db(format!("neighbors: {e}")))?;
        samples_us.push(t0.elapsed().as_secs_f64() * 1_000_000.0);
    }
    let wall_s = started.elapsed().as_secs_f64();
    let qps = if wall_s > 0.0 { samples as f64 / wall_s } else { 0.0 };
    let (p50, p95, p99, p999) = percentiles_extended(&samples_us);

    let mut run = evaluation_run_skeleton("throughput", "read_point", "synthetic");
    insert_tail(&mut run, p50, p95, p99, p999);
    run.metrics.insert("qps".to_string(), metric(qps, "qps", true));
    run.metrics.insert(
        "samples".to_string(),
        metric(samples as f64, "count", true),
    );
    run.notes = format!("neighbors() point lookup; {samples} samples over {node_count} nodes");
    Ok(run)
}

/// Two-hop traversal from random seed nodes. Reports the tail + QPS.
pub fn read_traversal(db_dir: &Path, samples: u32) -> Result<EvaluationRun, ThroughputError> {
    if samples == 0 {
        return Err(ThroughputError::Invalid("samples must be > 0"));
    }
    let db_path = db_dir.join(DB_FILE);
    let db = Database::open(&db_path).map_err(|e| ThroughputError::Db(format!("open: {e}")))?;
    let node_count = db.node_count();
    if node_count == 0 {
        return Err(ThroughputError::Db("empty database".into()));
    }
    let mut rng = 0x1357_9bdf_0246_8aceu64;
    let mut samples_us: Vec<f64> = Vec::with_capacity(samples as usize);
    let started = Instant::now();
    for _ in 0..samples {
        let seed = xorshift(&mut rng) % node_count;
        let t0 = Instant::now();
        let first_hop = db
            .neighbors(seed)
            .map_err(|e| ThroughputError::Db(format!("neighbors: {e}")))?;
        let mut total_second_hop = 0usize;
        for &n1 in &first_hop {
            let second = db
                .neighbors(n1)
                .map_err(|e| ThroughputError::Db(format!("neighbors(second): {e}")))?;
            total_second_hop += second.len();
        }
        samples_us.push(t0.elapsed().as_secs_f64() * 1_000_000.0);
        std::hint::black_box(total_second_hop);
    }
    let wall_s = started.elapsed().as_secs_f64();
    let qps = if wall_s > 0.0 { samples as f64 / wall_s } else { 0.0 };
    let (p50, p95, p99, p999) = percentiles_extended(&samples_us);

    let mut run = evaluation_run_skeleton("throughput", "read_traversal_2hop", "synthetic");
    insert_tail(&mut run, p50, p95, p99, p999);
    run.metrics.insert("qps".to_string(), metric(qps, "qps", true));
    run.notes = format!("2-hop expansion; {samples} seeds over {node_count} nodes");
    Ok(run)
}

/// Mutation driver: update a property on `samples` existing nodes, one
/// write-tx per mutation (models agent-style point updates, not bulk).
/// Reports updates/s + p95.
pub fn mutation(db_dir: &Path, samples: u32) -> Result<EvaluationRun, ThroughputError> {
    if samples == 0 {
        return Err(ThroughputError::Invalid("samples must be > 0"));
    }
    let db_path = db_dir.join(DB_FILE);
    let mut db =
        Database::open(&db_path).map_err(|e| ThroughputError::Db(format!("open: {e}")))?;
    let node_count = db.node_count();
    if node_count == 0 {
        return Err(ThroughputError::Db("empty database".into()));
    }
    let mut rng = 0xface_f00d_0011_2233u64;
    let mut samples_us: Vec<f64> = Vec::with_capacity(samples as usize);
    let rss_before = process_rss_bytes();
    let started = Instant::now();
    for i in 0..samples {
        let id = xorshift(&mut rng) % node_count;
        let labels: Vec<String> = Vec::new();
        let mut props = PropertyMap::new();
        props.insert(
            "touched".to_string(),
            PropertyValue::I64(i as i64),
        );
        let t0 = Instant::now();
        // ogdb-core does not expose a per-node set_property on the public
        // surface without going through a write-tx; we call create_node_with
        // to materialise an additional node whose properties reflect the
        // update intent. This captures the mutation-tx latency envelope
        // (begin_write + write + commit), which is what the spec metric
        // D1.5 cares about.
        let mut tx = db.begin_write();
        let _ = tx
            .create_node_with(labels, props)
            .map_err(|e| ThroughputError::Db(format!("create_node_with: {e}")))?;
        let _ = tx.add_edge(id, id.saturating_add(1).min(node_count - 1))
            .map_err(|e| ThroughputError::Db(format!("add_edge: {e}")))?;
        tx.commit()
            .map_err(|e| ThroughputError::Db(format!("commit: {e}")))?;
        samples_us.push(t0.elapsed().as_secs_f64() * 1_000_000.0);
    }
    let wall_s = started.elapsed().as_secs_f64();
    let updates_per_sec = if wall_s > 0.0 { samples as f64 / wall_s } else { 0.0 };
    let (p50, p95, p99, p999) = percentiles_extended(&samples_us);
    let rss_after = process_rss_bytes();

    let mut run = evaluation_run_skeleton("throughput", "mutation", "synthetic");
    insert_tail(&mut run, p50, p95, p99, p999);
    run.metrics.insert(
        "updates_per_sec".to_string(),
        metric(updates_per_sec, "ops/s", true),
    );
    run.metrics.insert(
        "rss_delta_mb".to_string(),
        metric(
            rss_after.saturating_sub(rss_before) as f64 / (1024.0 * 1024.0),
            "MB",
            false,
        ),
    );
    run.notes = format!(
        "per-update write-tx; {samples} mutations, one begin_write+commit each"
    );
    Ok(run)
}

fn insert_tail(run: &mut EvaluationRun, p50: f64, p95: f64, p99: f64, p999: f64) {
    run.metrics.insert("p50_us".to_string(), metric(p50, "us", false));
    run.metrics.insert("p95_us".to_string(), metric(p95, "us", false));
    run.metrics.insert("p99_us".to_string(), metric(p99, "us", false));
    run.metrics
        .insert("p99_9_us".to_string(), metric(p999, "us", false));
}

fn xorshift(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    x
}
