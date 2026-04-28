//! Plan reference: Task 5.4 — `criterion_ingest` driver.
//!
//! Builds a synthetic `target/criterion/`-shaped tree under a `TempDir`
//! (mirroring the real layout: `<group>/<bench>/new/estimates.json`),
//! invokes the driver, and asserts the produced `EvaluationRun`s carry
//! mean/median latency in microseconds and the bench identity is recoverable
//! from `subsuite`.

use std::fs;

use ogdb_eval::drivers::criterion_ingest::ingest_criterion_dir;
use tempfile::TempDir;

fn write_estimates(dir: &std::path::Path, point_ns_mean: f64, point_ns_median: f64) {
    fs::create_dir_all(dir).expect("mkdir");
    let body = format!(
        "{{\"mean\":{{\"point_estimate\":{point_ns_mean},\"standard_error\":1.0,\"confidence_interval\":{{\"confidence_level\":0.95,\"lower_bound\":{},\"upper_bound\":{}}}}},\
         \"median\":{{\"point_estimate\":{point_ns_median},\"standard_error\":1.0,\"confidence_interval\":{{\"confidence_level\":0.95,\"lower_bound\":{},\"upper_bound\":{}}}}},\
         \"median_abs_dev\":{{\"point_estimate\":10.0,\"standard_error\":1.0,\"confidence_interval\":{{\"confidence_level\":0.95,\"lower_bound\":1.0,\"upper_bound\":20.0}}}},\
         \"slope\":null,\
         \"std_dev\":{{\"point_estimate\":50.0,\"standard_error\":1.0,\"confidence_interval\":{{\"confidence_level\":0.95,\"lower_bound\":1.0,\"upper_bound\":100.0}}}}}}",
        point_ns_mean - 100.0,
        point_ns_mean + 100.0,
        point_ns_median - 50.0,
        point_ns_median + 50.0,
    );
    fs::write(dir.join("estimates.json"), body).expect("write estimates.json");
}

#[test]
fn ingests_two_benchmarks_into_two_evaluation_runs() {
    let dir = TempDir::new().expect("temp dir");
    let root = dir.path().join("criterion");
    write_estimates(
        &root
            .join("write_throughput")
            .join("create_nodes")
            .join("new"),
        3_000_000_000.0, // 3 s mean
        2_900_000_000.0, // 2.9 s median
    );
    write_estimates(
        &root.join("query_throughput").join("match_path").join("new"),
        1_500_000.0, // 1.5 ms mean
        1_400_000.0, // 1.4 ms median
    );

    let runs = ingest_criterion_dir(&root).expect("ingest");
    assert_eq!(runs.len(), 2, "one run per benchmark, got {runs:?}");

    let by_subsuite: std::collections::HashMap<_, _> =
        runs.iter().map(|r| (r.subsuite.clone(), r)).collect();
    let wt = by_subsuite
        .get("write_throughput/create_nodes")
        .expect("write_throughput/create_nodes run");
    assert_eq!(wt.suite, "criterion");
    let mean_us = wt.metrics.get("mean_us").expect("mean_us").value;
    let median_us = wt.metrics.get("median_us").expect("median_us").value;
    assert!((mean_us - 3_000_000.0).abs() < 1e-3, "mean_us = {mean_us}");
    assert!(
        (median_us - 2_900_000.0).abs() < 1e-3,
        "median_us = {median_us}"
    );
    assert!(!wt.metrics["mean_us"].higher_is_better);

    let qt = by_subsuite
        .get("query_throughput/match_path")
        .expect("query_throughput/match_path run");
    let mean_us = qt.metrics["mean_us"].value;
    assert!((mean_us - 1_500.0).abs() < 1e-3, "mean_us = {mean_us}");
}

#[test]
fn ignores_missing_directory() {
    let dir = TempDir::new().expect("temp");
    let runs = ingest_criterion_dir(&dir.path().join("missing")).expect("absent dir is ok");
    assert!(runs.is_empty());
}

#[test]
fn skips_directories_without_estimates_json() {
    let dir = TempDir::new().expect("temp");
    let root = dir.path().join("criterion");
    fs::create_dir_all(root.join("orphan_group").join("orphan_bench")).expect("mkdir");
    let runs = ingest_criterion_dir(&root).expect("ingest");
    assert!(
        runs.is_empty(),
        "no estimates.json => no runs, got {runs:?}"
    );
}
