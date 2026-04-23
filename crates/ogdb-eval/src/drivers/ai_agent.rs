//! AI-agent driver (spec Dimension 6 / Part B).
//!
//! Four sub-drivers, all driven by ogdb-core's public API:
//!
//! - [`enrichment_roundtrip`] (B.1) — simulates an agent persisting N docs,
//!   each with `entities_per_doc` nodes + `edges_per_doc` edges. Measures
//!   per-document persist latency.
//! - [`hybrid_retrieval`] (B.2/B.3) — builds a vector-indexed graph and
//!   combines kNN with 1-hop expansion. Reports latency; NDCG quality is
//!   **deferred** (requires a BEIR-style gold corpus — see notes).
//! - [`concurrent_writes`] (B.5) — spawns N OS threads, each owning its own
//!   Database (ogdb-core is single-writer), and measures aggregate
//!   commits/s. True contention-aware conflict_rate is 0 by construction;
//!   disclosed in notes.
//! - [`re_ranking`] (B.6) — 1-hop graph-feature boost over a candidate list.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Barrier};
use std::thread;
use std::time::Instant;

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric};

use crate::drivers::common::{evaluation_run_skeleton, metric, percentiles_extended};
use crate::EvaluationRun;

#[derive(Debug, thiserror::Error)]
pub enum AiAgentError {
    #[error("db error: {0}")]
    Db(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid argument: {0}")]
    Invalid(&'static str),
    #[error("thread join failed")]
    Join,
}

const ENRICH_DB: &str = "agent-enrich.ogdb";
const HYBRID_DB: &str = "agent-hybrid.ogdb";
const RERANK_DB: &str = "agent-rerank.ogdb";

/// Simulate an agent persisting `n_docs` documents. Each document produces
/// `entities_per_doc` nodes + `edges_per_doc` edges in a single write-tx.
/// The per-document wall-clock is the metric reported.
pub fn enrichment_roundtrip(
    db_dir: &Path,
    n_docs: u32,
    entities_per_doc: u32,
    edges_per_doc: u32,
) -> Result<EvaluationRun, AiAgentError> {
    if n_docs == 0 || entities_per_doc == 0 {
        return Err(AiAgentError::Invalid("counts must be > 0"));
    }
    std::fs::create_dir_all(db_dir)?;
    let path = db_dir.join(ENRICH_DB);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    let mut db = Database::init(&path, Header::default_v1())
        .map_err(|e| AiAgentError::Db(format!("init: {e}")))?;

    let mut latencies_us = Vec::with_capacity(n_docs as usize);
    let started = Instant::now();
    for doc in 0..n_docs {
        let t0 = Instant::now();
        let mut tx = db.begin_write();
        let mut ids = Vec::with_capacity(entities_per_doc as usize);
        for i in 0..entities_per_doc {
            let mut props = PropertyMap::new();
            props.insert(
                "doc_id".to_string(),
                PropertyValue::I64(doc as i64),
            );
            props.insert(
                "entity_ord".to_string(),
                PropertyValue::I64(i as i64),
            );
            let id = tx
                .create_node_with(vec!["Entity".to_string()], props)
                .map_err(|e| AiAgentError::Db(format!("create_node_with: {e}")))?;
            ids.push(id);
        }
        for e in 0..edges_per_doc {
            if ids.len() < 2 {
                break;
            }
            let src = ids[(e as usize) % ids.len()];
            let dst = ids[(e as usize + 1) % ids.len()];
            if src != dst {
                tx.add_typed_edge(
                    src,
                    dst,
                    "MENTIONS".to_string(),
                    PropertyMap::new(),
                )
                .map_err(|e| AiAgentError::Db(format!("add_typed_edge: {e}")))?;
            }
        }
        tx.commit()
            .map_err(|e| AiAgentError::Db(format!("commit: {e}")))?;
        latencies_us.push(t0.elapsed().as_secs_f64() * 1_000_000.0);
    }
    let wall_s = started.elapsed().as_secs_f64();
    let docs_per_sec = if wall_s > 0.0 { n_docs as f64 / wall_s } else { 0.0 };
    let (p50, p95, p99, p999) = percentiles_extended(&latencies_us);

    let mut run = evaluation_run_skeleton("ai_agent", "enrichment_roundtrip", "synthetic");
    run.metrics.insert(
        "docs_per_sec".to_string(),
        metric(docs_per_sec, "docs/s", true),
    );
    run.metrics
        .insert("t_persist_p50_us".to_string(), metric(p50, "us", false));
    run.metrics
        .insert("t_persist_p95_us".to_string(), metric(p95, "us", false));
    run.metrics
        .insert("t_persist_p99_us".to_string(), metric(p99, "us", false));
    run.metrics
        .insert("t_persist_p99_9_us".to_string(), metric(p999, "us", false));
    run.metrics
        .insert("docs".to_string(), metric(n_docs as f64, "count", true));
    run.notes = format!(
        "enrichment; {n_docs} docs × {entities_per_doc} entities + {edges_per_doc} edges; single-writer tx per doc"
    );
    Ok(run)
}

/// Hybrid vector-kNN + 1-hop graph expansion. Builds a small vector-indexed
/// graph, then issues `n_queries` composite queries. Reports p50/p95/p99.
/// NDCG@10 is deferred (no BEIR corpus available in-tree — see notes).
pub fn hybrid_retrieval(
    db_dir: &Path,
    n_nodes: u32,
    n_queries: u32,
) -> Result<EvaluationRun, AiAgentError> {
    if n_nodes == 0 || n_queries == 0 {
        return Err(AiAgentError::Invalid("counts must be > 0"));
    }
    std::fs::create_dir_all(db_dir)?;
    let path = db_dir.join(HYBRID_DB);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    let mut db = Database::init(&path, Header::default_v1())
        .map_err(|e| AiAgentError::Db(format!("init: {e}")))?;

    const DIM: usize = 16;
    db.create_vector_index(
        "agent_embedding",
        Some("Entity"),
        "embedding",
        DIM,
        VectorDistanceMetric::Cosine,
    )
    .map_err(|e| AiAgentError::Db(format!("create_vector_index: {e}")))?;

    let mut rng = 0xa5a5_5a5a_f0f0_0f0fu64;
    let mut ids = Vec::with_capacity(n_nodes as usize);
    {
        let mut tx = db.begin_write();
        for i in 0..n_nodes {
            let vec = random_vector(&mut rng, DIM);
            let mut props = PropertyMap::new();
            props.insert(
                "ord".to_string(),
                PropertyValue::I64(i as i64),
            );
            props.insert("embedding".to_string(), PropertyValue::Vector(vec));
            let id = tx
                .create_node_with(vec!["Entity".to_string()], props)
                .map_err(|e| AiAgentError::Db(format!("create_node_with: {e}")))?;
            ids.push(id);
        }
        // Connect in a small-world-ish ring so 1-hop expansion has
        // non-empty work.
        for i in 0..ids.len() {
            let src = ids[i];
            let dst = ids[(i + 1) % ids.len()];
            tx.add_typed_edge(src, dst, "NEAR".to_string(), PropertyMap::new())
                .map_err(|e| AiAgentError::Db(format!("add_typed_edge: {e}")))?;
        }
        tx.commit()
            .map_err(|e| AiAgentError::Db(format!("commit: {e}")))?;
    }

    let mut samples_us: Vec<f64> = Vec::with_capacity(n_queries as usize);
    for _ in 0..n_queries {
        let q = random_vector(&mut rng, DIM);
        let t0 = Instant::now();
        let hits = db
            .vector_search("agent_embedding", &q, 10, None)
            .map_err(|e| AiAgentError::Db(format!("vector_search: {e}")))?;
        // 1-hop expansion per hit — this is the "graph-constrained kNN"
        // shape from spec B.2.
        let mut expanded = 0usize;
        for (nid, _score) in &hits {
            if let Ok(ns) = db.neighbors(*nid) {
                expanded += ns.len();
            }
        }
        samples_us.push(t0.elapsed().as_secs_f64() * 1_000_000.0);
        std::hint::black_box(expanded);
    }
    let (p50, p95, p99, p999) = percentiles_extended(&samples_us);

    let mut run = evaluation_run_skeleton("ai_agent", "hybrid_retrieval", "synthetic");
    run.metrics
        .insert("p50_us".to_string(), metric(p50, "us", false));
    run.metrics
        .insert("p95_us".to_string(), metric(p95, "us", false));
    run.metrics
        .insert("p99_us".to_string(), metric(p99, "us", false));
    run.metrics
        .insert("p99_9_us".to_string(), metric(p999, "us", false));
    run.metrics.insert(
        "queries".to_string(),
        metric(n_queries as f64, "count", true),
    );
    run.metrics
        .insert("nodes".to_string(), metric(n_nodes as f64, "count", true));
    run.notes = format!(
        "vector kNN + 1-hop expansion; {n_queries} queries over {n_nodes} nodes (dim={DIM}). \
         NDCG@10 DEFERRED: no BEIR corpus in-tree — see docs/BENCHMARKS.md"
    );
    Ok(run)
}

/// N-thread concurrent-writer throughput. Each thread owns its own Database
/// because ogdb-core is single-writer; that's honest about the current
/// engine's model and is disclosed in the `notes` field.
pub fn concurrent_writes(
    db_dir: &Path,
    n_threads: u32,
    ops_per_thread: u32,
) -> Result<EvaluationRun, AiAgentError> {
    if n_threads == 0 || ops_per_thread == 0 {
        return Err(AiAgentError::Invalid("counts must be > 0"));
    }
    std::fs::create_dir_all(db_dir)?;

    let barrier = Arc::new(Barrier::new(n_threads as usize));
    let mut handles = Vec::new();
    let started = Instant::now();
    for t in 0..n_threads {
        let thread_dir: PathBuf = db_dir.join(format!("agent-concurrent-{t}.ogdb"));
        if thread_dir.exists() {
            std::fs::remove_file(&thread_dir)?;
        }
        let b = Arc::clone(&barrier);
        handles.push(thread::spawn(move || -> Result<u32, String> {
            let mut db = Database::init(&thread_dir, Header::default_v1())
                .map_err(|e| format!("init: {e}"))?;
            b.wait();
            let mut committed = 0u32;
            for _ in 0..ops_per_thread {
                let mut tx = db.begin_write();
                let a = tx
                    .create_node()
                    .map_err(|e| format!("create_node: {e}"))?;
                let b2 = tx
                    .create_node()
                    .map_err(|e| format!("create_node: {e}"))?;
                tx.add_edge(a, b2).map_err(|e| format!("add_edge: {e}"))?;
                tx.commit().map_err(|e| format!("commit: {e}"))?;
                committed += 1;
            }
            Ok(committed)
        }));
    }
    let mut total_commits = 0u64;
    for h in handles {
        match h.join() {
            Ok(Ok(n)) => total_commits += n as u64,
            Ok(Err(e)) => return Err(AiAgentError::Db(e)),
            Err(_) => return Err(AiAgentError::Join),
        }
    }
    let wall_s = started.elapsed().as_secs_f64();
    let commits_per_sec = if wall_s > 0.0 {
        total_commits as f64 / wall_s
    } else {
        0.0
    };

    let mut run = evaluation_run_skeleton("ai_agent", "concurrent_writes", "synthetic");
    run.metrics
        .insert("threads".to_string(), metric(n_threads as f64, "count", true));
    run.metrics.insert(
        "commits_total".to_string(),
        metric(total_commits as f64, "count", true),
    );
    run.metrics.insert(
        "commits_per_sec".to_string(),
        metric(commits_per_sec, "ops/s", true),
    );
    // Conflict rate is 0 because each thread owns its own DB (ogdb-core is
    // single-writer). Reported explicitly so downstream tooling sees the
    // schema field; the note discloses the limitation.
    run.metrics
        .insert("conflict_rate".to_string(), metric(0.0, "fraction", false));
    run.metrics.insert(
        "elapsed_s".to_string(),
        metric(wall_s, "s", false),
    );
    run.notes = format!(
        "{n_threads} threads × {ops_per_thread} ops; separate DB per thread (single-writer kernel). \
         True contention-aware conflict_rate requires multi-writer — DEFERRED."
    );
    Ok(run)
}

/// Graph-feature re-ranking: seed a graph, then for each of `candidates`
/// nodes run one 1-hop neighbourhood lookup + synthesize a boost score
/// from neighbour ids. The full (candidate × 1-hop) batch constitutes a
/// single "rerank" query; we run it `1` time here and report elapsed +
/// amortized per-candidate p95. Tests drive small sizes so the run is
/// deterministic and fast.
pub fn re_ranking(
    db_dir: &Path,
    n_nodes: u32,
    candidates: u32,
) -> Result<EvaluationRun, AiAgentError> {
    if n_nodes == 0 || candidates == 0 {
        return Err(AiAgentError::Invalid("counts must be > 0"));
    }
    if candidates > n_nodes {
        return Err(AiAgentError::Invalid("candidates must be ≤ n_nodes"));
    }
    std::fs::create_dir_all(db_dir)?;
    let path = db_dir.join(RERANK_DB);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    let mut db = Database::init(&path, Header::default_v1())
        .map_err(|e| AiAgentError::Db(format!("init: {e}")))?;
    let mut ids = Vec::with_capacity(n_nodes as usize);
    {
        let mut tx = db.begin_write();
        for _ in 0..n_nodes {
            ids.push(
                tx.create_node()
                    .map_err(|e| AiAgentError::Db(format!("create_node: {e}")))?,
            );
        }
        for i in 0..ids.len() {
            let src = ids[i];
            let dst = ids[(i + 7) % ids.len()];
            if src != dst {
                tx.add_edge(src, dst)
                    .map_err(|e| AiAgentError::Db(format!("add_edge: {e}")))?;
            }
        }
        tx.commit()
            .map_err(|e| AiAgentError::Db(format!("commit: {e}")))?;
    }

    let mut per_candidate_us: Vec<f64> = Vec::with_capacity(candidates as usize);
    let batch_started = Instant::now();
    for i in 0..candidates {
        let nid = ids[(i as usize) % ids.len()];
        let t0 = Instant::now();
        let ns = db
            .neighbors(nid)
            .map_err(|e| AiAgentError::Db(format!("neighbors: {e}")))?;
        // Synthetic graph boost: sum of neighbour ids (stand-in for
        // neighbour-similarity dot product). Deterministic, cheap.
        let boost: u64 = ns.iter().copied().sum();
        per_candidate_us.push(t0.elapsed().as_secs_f64() * 1_000_000.0);
        std::hint::black_box(boost);
    }
    let batch_us = batch_started.elapsed().as_secs_f64() * 1_000_000.0;
    let (p50, p95, p99, p999) = percentiles_extended(&per_candidate_us);

    let mut run = evaluation_run_skeleton("ai_agent", "re_ranking", "synthetic");
    run.metrics.insert(
        "candidates".to_string(),
        metric(candidates as f64, "count", true),
    );
    run.metrics
        .insert("batch_us".to_string(), metric(batch_us, "us", false));
    run.metrics
        .insert("p50_us".to_string(), metric(p50, "us", false));
    run.metrics
        .insert("p95_us".to_string(), metric(p95, "us", false));
    run.metrics
        .insert("p99_us".to_string(), metric(p99, "us", false));
    run.metrics
        .insert("p99_9_us".to_string(), metric(p999, "us", false));
    run.notes = format!(
        "graph-feature rerank; {candidates} candidates × 1-hop lookup. Synthetic boost (sum-of-ids) stands in for neighbour-similarity dot product."
    );
    Ok(run)
}

fn random_vector(state: &mut u64, dim: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(dim);
    for _ in 0..dim {
        let mut x = *state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        *state = x;
        // Map u64 → [-1, 1]
        let as_f = ((x as u32) as f32 / u32::MAX as f32) * 2.0 - 1.0;
        out.push(as_f);
    }
    out
}
