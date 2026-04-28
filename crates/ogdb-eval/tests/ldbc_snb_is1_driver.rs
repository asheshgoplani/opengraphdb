//! Plan reference: Task 5.5 — IS-1 driver smoke test. Builds the LDBC mini
//! fixture (100 Person / 500 KNOWS), runs N IS-1 (Profile of Person)
//! queries, asserts the produced `EvaluationRun` carries qps + p50/p95/p99
//! and obeys the LdbcSubmission percentile invariant. Must run in <5s.

use std::time::Instant;

use ogdb_eval::drivers::ldbc_mini::build_ldbc_mini;
use ogdb_eval::drivers::ldbc_snb::run_is1;
use ogdb_eval::LdbcSubmission;
use tempfile::TempDir;

const QUERY_COUNT: u32 = 200;

#[test]
fn ldbc_snb_is1_emits_evaluation_run_with_qps_and_percentiles() {
    let dir = TempDir::new().expect("temp dir");
    let db_path = dir.path().join("graph.ogdb");
    build_ldbc_mini(&db_path).expect("build mini");

    let started = Instant::now();
    let run = run_is1(&db_path, QUERY_COUNT).expect("run IS-1");
    let elapsed = started.elapsed();
    assert!(
        elapsed.as_secs() < 5,
        "IS-1 driver must finish in <5s, took {:?}",
        elapsed
    );

    assert_eq!(run.suite, "ldbc_snb");
    assert_eq!(run.subsuite, "IS-1");
    assert!(!run.dataset.is_empty(), "dataset label required");

    let qps = run.metrics.get("qps").expect("qps metric");
    assert!(qps.value > 0.0, "qps must be positive, got {}", qps.value);
    assert!(qps.higher_is_better);
    assert_eq!(qps.unit, "qps");

    let p50 = run.metrics.get("p50_us").expect("p50_us metric").value;
    let p95 = run.metrics.get("p95_us").expect("p95_us metric").value;
    let p99 = run.metrics.get("p99_us").expect("p99_us metric").value;
    assert!(
        p50 <= p95 && p95 <= p99,
        "percentiles must be ordered, got p50={p50} p95={p95} p99={p99}"
    );

    // Going through the LdbcSubmission exporter doubles as a schema check —
    // it asserts strict p50 < p95 < p99 (LdbcSubmission rejects ties), so
    // the test wants STRICT inequality on the timed samples we measured. If
    // the timer resolution is too coarse for this on a fast box, the driver
    // sorts samples and we still expect >0 spread across 200 calls.
    let _submission = LdbcSubmission::from_run(&run).expect("LdbcSubmission must accept the run");
}

#[test]
fn ldbc_snb_is1_emits_p99_9_latency_tail() {
    let dir = TempDir::new().expect("temp dir");
    let db_path = dir.path().join("graph.ogdb");
    build_ldbc_mini(&db_path).expect("build mini");

    let run = run_is1(&db_path, 1000).expect("run IS-1");
    let p99 = run.metrics.get("p99_us").expect("p99_us").value;
    let p999 = run
        .metrics
        .get("p99_9_us")
        .expect("p99_9_us missing — spec requires full tail")
        .value;
    assert!(p99 <= p999, "p99 {p99} should be ≤ p99.9 {p999}");
}

#[test]
fn ldbc_snb_is1_query_count_matches_metric() {
    let dir = TempDir::new().expect("temp dir");
    let db_path = dir.path().join("graph.ogdb");
    build_ldbc_mini(&db_path).expect("build mini");

    let run = run_is1(&db_path, 50).expect("run IS-1");
    let queries = run.metrics.get("queries").expect("queries metric").value;
    assert_eq!(queries, 50.0);
}
