//! Plan reference: Task 5.3 — scaling driver, 10K tier first.
//!
//! Synthesizes a 10K-node graph in a temp dir, asserts the produced
//! `EvaluationRun` carries insert throughput, latency percentiles, and
//! file-size metrics, all populated and well-ordered. Must finish in <5s
//! per the plan's test budget.

use std::time::Instant;

use ogdb_eval::drivers::scaling::{run_tier, ScalingTier};
use tempfile::TempDir;

#[test]
fn scaling_10k_tier_emits_populated_evaluation_run() {
    let dir = TempDir::new().expect("temp");
    let started = Instant::now();
    let run = run_tier(dir.path(), ScalingTier::Tier10K).expect("run 10k tier");
    let elapsed = started.elapsed();
    assert!(
        elapsed.as_secs() < 5,
        "scaling 10K tier must finish in <5s, took {:?}",
        elapsed
    );

    assert_eq!(run.suite, "scaling");
    assert_eq!(run.subsuite, "10k");
    assert!(!run.dataset.is_empty());

    let inserts = run.metrics.get("inserts").expect("inserts metric").value;
    assert_eq!(inserts as u32, 10_000);

    let throughput = run
        .metrics
        .get("insert_throughput")
        .expect("insert_throughput metric")
        .value;
    assert!(
        throughput > 0.0,
        "throughput must be positive, got {throughput}"
    );
    assert!(run.metrics["insert_throughput"].higher_is_better);

    let p50 = run.metrics.get("p50_us").expect("p50_us").value;
    let p95 = run.metrics.get("p95_us").expect("p95_us").value;
    let p99 = run.metrics.get("p99_us").expect("p99_us").value;
    assert!(
        p50 <= p95 && p95 <= p99,
        "percentiles ordered: got p50={p50} p95={p95} p99={p99}"
    );

    let disk = run.metrics.get("file_size_mb").expect("file_size_mb").value;
    assert!(
        disk > 0.0,
        "10K-node DB must have non-empty on-disk footprint"
    );

    // RSS metric must exist even on platforms where it returns 0 (we always
    // emit the field so the diff engine has a stable schema).
    assert!(run.metrics.contains_key("rss_mb"));
}

/// 100K scaling tier — Phase-2 target. The ogdb-core write-tx has
/// super-linear overhead in debug builds (empirically several minutes for
/// 100K ops), so this test is `#[ignore]` by default and only runs under
/// `cargo test -- --ignored` or `cargo test --release`. The smaller 10K
/// smoke test above covers correctness; this one covers the tier.
#[test]
#[ignore]
fn scaling_100k_tier_emits_populated_evaluation_run() {
    let dir = TempDir::new().expect("temp");
    let started = Instant::now();
    let run = run_tier(dir.path(), ScalingTier::Tier100K).expect("run 100k tier");
    let elapsed = started.elapsed();
    assert!(
        elapsed.as_secs() < 180,
        "scaling 100K tier must finish in <180s, took {:?}",
        elapsed
    );

    assert_eq!(run.suite, "scaling");
    assert_eq!(run.subsuite, "100k");
    assert_eq!(run.metrics.get("inserts").unwrap().value as u32, 100_000);
    assert!(run.metrics.get("insert_throughput").unwrap().value > 0.0);
    assert!(run.metrics.contains_key("p50_us"));
    assert!(run.metrics.contains_key("p99_us"));
}

#[test]
fn scaling_tier_label_round_trip() {
    // Cheap assertion-only test that the 100K tier variant exists and
    // labels correctly. Combined with the #[ignore] test above, this gives
    // CI coverage that the tier is wired up without paying the full cost.
    assert_eq!(ScalingTier::Tier100K.label(), "100k");
    assert_eq!(ScalingTier::Tier100K.node_count(), 100_000);
}
