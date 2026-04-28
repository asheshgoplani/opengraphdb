//! Throughput driver tests — one test per sub-driver. All sub-drivers are
//! capped to sub-second budgets so the full file runs in <5s.

use ogdb_eval::drivers::throughput;
use tempfile::TempDir;

#[test]
fn ingest_streaming_emits_nodes_per_second_metric() {
    let dir = TempDir::new().unwrap();
    let run = throughput::ingest_streaming(dir.path(), std::time::Duration::from_millis(300))
        .expect("ingest_streaming");
    assert_eq!(run.suite, "throughput");
    assert_eq!(run.subsuite, "ingest_streaming");
    let m = run
        .metrics
        .get("nodes_per_sec")
        .expect("nodes_per_sec metric");
    assert!(m.higher_is_better);
    assert!(
        m.value > 0.0,
        "expected positive throughput, got {}",
        m.value
    );
    assert!(run.metrics.contains_key("edges_per_sec"));
    assert!(run.metrics.contains_key("elapsed_s"));
}

#[test]
fn ingest_bulk_emits_elapsed_and_throughput() {
    let dir = TempDir::new().unwrap();
    // Test uses 1K — debug-mode add_edge + WAL overhead is the bottleneck at
    // 10K; the driver API still accepts any N (cli_runner picks 10K for full
    // runs). 1K is enough to exercise every code path.
    let run = throughput::ingest_bulk(dir.path(), 1_000).expect("ingest_bulk");
    assert_eq!(run.subsuite, "ingest_bulk");
    assert!(run.metrics.get("nodes_per_sec").unwrap().value > 0.0);
    assert_eq!(
        run.metrics.get("nodes").unwrap().value as u64,
        1_000,
        "should report node count"
    );
}

#[test]
fn read_point_emits_latency_percentiles() {
    let dir = TempDir::new().unwrap();
    // Seed 1000 nodes first
    throughput::ingest_bulk(dir.path(), 1_000).expect("seed");
    let run = throughput::read_point(dir.path(), 1_000).expect("read_point");
    assert_eq!(run.subsuite, "read_point");
    for key in ["p50_us", "p95_us", "p99_us", "p99_9_us"] {
        let v = run
            .metrics
            .get(key)
            .unwrap_or_else(|| panic!("{key} missing"))
            .value;
        assert!(v >= 0.0, "{key} should be non-negative, got {v}");
    }
    let p95 = run.metrics.get("p95_us").unwrap().value;
    let p99 = run.metrics.get("p99_us").unwrap().value;
    let p999 = run.metrics.get("p99_9_us").unwrap().value;
    assert!(p95 <= p99, "p95 {p95} should be ≤ p99 {p99}");
    assert!(p99 <= p999, "p99 {p99} should be ≤ p99.9 {p999}");
}

#[test]
fn read_traversal_2hop_reports_percentiles_and_qps() {
    let dir = TempDir::new().unwrap();
    // Seed: bulk ingest creates nodes+edges (see driver impl)
    throughput::ingest_bulk(dir.path(), 1_000).expect("seed");
    let run = throughput::read_traversal(dir.path(), 200).expect("read_traversal");
    assert_eq!(run.subsuite, "read_traversal_2hop");
    assert!(run.metrics.contains_key("p50_us"));
    assert!(run.metrics.contains_key("p95_us"));
    assert!(run.metrics.contains_key("p99_us"));
    assert!(run.metrics.get("qps").unwrap().value >= 0.0);
}

#[test]
fn mutation_reports_throughput_and_p95() {
    let dir = TempDir::new().unwrap();
    throughput::ingest_bulk(dir.path(), 1_000).expect("seed");
    let run = throughput::mutation(dir.path(), 500).expect("mutation");
    assert_eq!(run.subsuite, "mutation");
    assert!(run.metrics.get("updates_per_sec").unwrap().value > 0.0);
    assert!(run.metrics.contains_key("p95_us"));
}
