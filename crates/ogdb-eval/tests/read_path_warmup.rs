//! Read-path warm-up regression: verifies that the multi-iter warm-up
//! drives both READS and writes, not just writes.
//!
//! Why: cold-cache variance on read paths was 30–50 % across iters in
//! the 2026-04-25 N=5 rebaseline because the warm-up only primed write
//! tx + page-cache via `throughput::ingest_streaming`. The read code
//! paths (buffer pool for `db.neighbors()`, snapshot cache, query plan
//! cache) stayed cold for iter-1.
//!
//! These tests fix that contract:
//!   1. `run_warmup_pass` returns a `WarmupReport` with non-zero counts
//!      for streaming-write, bulk-write, read_point, and read_traversal
//!      sub-phases. (Fast — runs by default.)
//!   2. With the read warm-up in place, 5-iter `read_point` qps spread
//!      is ≤ 15 % (was 30 %+ pre-warmup). Marked `#[ignore]` because it
//!      runs the full multi-iter pipeline (~60 s in release); invoke
//!      with `cargo test --release --test read_path_warmup -- --ignored`.

use ogdb_eval::drivers::cli_runner::RunAllConfig;
use ogdb_eval::drivers::multi_iter::{run_warmup_pass, run_warmup_then_iters, WarmupReport};
use tempfile::tempdir;

#[test]
fn run_warmup_pass_drives_reads_and_writes_and_returns_report() {
    let dir = tempdir().unwrap();
    let report: WarmupReport = run_warmup_pass(dir.path()).expect("warmup pass must succeed");

    assert!(
        report.streaming_writes > 0,
        "phase-1 streaming warm-up must drive >0 writes (got {}); empty DB makes phases 2-4 meaningless",
        report.streaming_writes
    );
    assert!(
        report.bulk_writes > 0,
        "phase-2 bulk warm-up must insert >0 nodes (got {}); without a populated dataset, read warm-up has nothing to read",
        report.bulk_writes
    );
    assert!(
        report.read_point_samples > 0,
        "phase-3 must drive >0 read_point queries (got {}); cold read_point is the source of 30%+ iter-1 qps variance",
        report.read_point_samples
    );
    assert!(
        report.read_traversal_samples > 0,
        "phase-4 must drive >0 read_traversal_2hop queries (got {}); cold 2-hop traversal is the source of 46% iter-1 qps variance",
        report.read_traversal_samples
    );
}

#[test]
#[ignore = "release-mode variance gate; ~60s; invoke with --release --ignored"]
fn read_point_qps_variance_across_5_iters_within_15_percent() {
    let dir = tempdir().unwrap();
    let cfg = RunAllConfig::quick(dir.path());
    let groups = run_warmup_then_iters(&cfg, 5).expect("5 measured iters");
    assert_eq!(groups.len(), 5, "expected 5 iter groups");

    let qps: Vec<f64> = groups
        .iter()
        .map(|g| {
            g.iter()
                .find(|r| r.suite == "throughput" && r.subsuite == "read_point")
                .and_then(|r| r.metrics.get("qps"))
                .map(|m| m.value)
                .expect("each iter must report throughput.read_point.qps")
        })
        .collect();

    let min = qps.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = qps.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let mut sorted = qps.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = sorted[sorted.len() / 2];
    let spread = (max - min) / median;

    assert!(
        spread <= 0.15,
        "read_point qps spread = {:.1}% across 5 iters; spec gate is ≤15% post-warmup (was 30-50% pre-warmup). values={:?}",
        spread * 100.0,
        qps
    );
}
