//! Task 5.3 — scaling driver. Synthesizes a graph at a chosen tier,
//! measures insert throughput + read latency percentiles, and reports the
//! on-disk footprint plus process RSS. 10K is the baseline tier exercised
//! by the regression test; 100K and 1M are wired up but should run via
//! the release-test harness, not normal `cargo test`.

use std::path::Path;
use std::time::Instant;

use ogdb_core::{Database, Header};

use crate::drivers::common::{
    dir_disk_bytes, evaluation_run_skeleton, metric, percentiles, process_rss_bytes,
};
use crate::EvaluationRun;

#[derive(Debug, thiserror::Error)]
pub enum ScalingError {
    #[error("eval error: {0}")]
    Eval(#[from] crate::EvalError),
    #[error("db error: {0}")]
    Db(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScalingTier {
    Tier10K,
    Tier100K,
    Tier1M,
}

impl ScalingTier {
    #[must_use]
    pub fn node_count(self) -> u32 {
        match self {
            ScalingTier::Tier10K => 10_000,
            ScalingTier::Tier100K => 100_000,
            ScalingTier::Tier1M => 1_000_000,
        }
    }
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            ScalingTier::Tier10K => "10k",
            ScalingTier::Tier100K => "100k",
            ScalingTier::Tier1M => "1m",
        }
    }
}

const READ_SAMPLES: usize = 1_000;

/// Run the scaling probe for the given tier:
///   1. Open a fresh DB at `db_dir/scaling-<tier>.ogdb`
///   2. Insert N bare nodes in a single write transaction (timed)
///   3. Sample `READ_SAMPLES` `neighbors()` lookups against random nodes
///      (timed individually for percentile computation)
///   4. Measure on-disk footprint and process RSS
pub fn run_tier(db_dir: &Path, tier: ScalingTier) -> Result<EvaluationRun, ScalingError> {
    std::fs::create_dir_all(db_dir)?;
    let db_path = db_dir.join(format!("scaling-{}.ogdb", tier.label()));
    let mut db = Database::init(&db_path, Header::default_v1())
        .map_err(|e| ScalingError::Db(format!("init: {e}")))?;

    let n = tier.node_count();
    let insert_started = Instant::now();
    {
        let mut tx = db.begin_write();
        for _ in 0..n {
            tx.create_node()
                .map_err(|e| ScalingError::Db(format!("create_node: {e}")))?;
        }
        tx.commit()
            .map_err(|e| ScalingError::Db(format!("commit: {e}")))?;
    }
    let insert_secs = insert_started.elapsed().as_secs_f64();
    let insert_throughput = if insert_secs > 0.0 {
        f64::from(n) / insert_secs
    } else {
        0.0
    };

    let mut rng = 0x9e37_79b9_7f4a_7c15u64;
    let mut samples_us = Vec::with_capacity(READ_SAMPLES);
    for _ in 0..READ_SAMPLES {
        let node = next_u64(&mut rng) % u64::from(n);
        let q_start = Instant::now();
        let _ = db
            .neighbors(node)
            .map_err(|e| ScalingError::Db(format!("neighbors({node}): {e}")))?;
        samples_us.push(q_start.elapsed().as_secs_f64() * 1_000_000.0);
    }
    let (p50, p95, p99) = percentiles(&samples_us);

    let on_disk_bytes = dir_disk_bytes(db_dir);
    let rss_bytes = process_rss_bytes();

    let mut run = evaluation_run_skeleton(
        "scaling",
        tier.label(),
        &format!("synthetic-{}", tier.label()),
    );
    run.metrics
        .insert("inserts".to_string(), metric(f64::from(n), "count", true));
    run.metrics
        .insert("insert_secs".to_string(), metric(insert_secs, "s", false));
    run.metrics.insert(
        "insert_throughput".to_string(),
        metric(insert_throughput, "elem/s", true),
    );
    run.metrics
        .insert("p50_us".to_string(), metric(p50, "us", false));
    run.metrics
        .insert("p95_us".to_string(), metric(p95, "us", false));
    run.metrics
        .insert("p99_us".to_string(), metric(p99, "us", false));
    run.metrics.insert(
        "file_size_mb".to_string(),
        metric(on_disk_bytes as f64 / (1024.0 * 1024.0), "MB", false),
    );
    run.metrics.insert(
        "rss_mb".to_string(),
        metric(rss_bytes as f64 / (1024.0 * 1024.0), "MB", false),
    );
    run.notes = format!(
        "tier={}, inserts={n}, read_samples={READ_SAMPLES}",
        tier.label()
    );
    Ok(run)
}

fn next_u64(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    x
}
