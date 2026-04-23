//! CLI-runner smoke test: drives every new driver end-to-end, produces a
//! Vec<EvaluationRun>, and writes a summary markdown table. Must finish in
//! <15s so it fits the overall <60s budget.

use ogdb_eval::drivers::cli_runner::{run_all, write_benchmarks_md, RunAllConfig};
use tempfile::TempDir;

#[test]
fn run_all_produces_evaluation_runs_for_every_driver() {
    let dir = TempDir::new().unwrap();
    let cfg = RunAllConfig::quick(dir.path());
    let runs = run_all(&cfg).expect("run_all");

    // Every driver family must appear at least once.
    let suites: std::collections::BTreeSet<_> =
        runs.iter().map(|r| r.suite.clone()).collect();
    for expected in ["throughput", "ldbc_snb", "ai_agent", "resources"] {
        assert!(
            suites.contains(expected),
            "missing suite {expected}; got {:?}",
            suites
        );
    }

    // Each run must have at least one metric populated.
    for r in &runs {
        assert!(
            !r.metrics.is_empty(),
            "run {}/{} has no metrics",
            r.suite,
            r.subsuite
        );
    }
}

#[test]
fn write_benchmarks_md_emits_markdown_table() {
    let dir = TempDir::new().unwrap();
    let cfg = RunAllConfig::quick(dir.path());
    let runs = run_all(&cfg).expect("run_all");
    let out = dir.path().join("BENCHMARKS.md");
    write_benchmarks_md(&runs, &out).expect("write md");
    let body = std::fs::read_to_string(&out).unwrap();
    assert!(body.contains("# OpenGraphDB Benchmarks"));
    assert!(body.contains("| Suite"));
    assert!(body.contains("throughput"));
    assert!(body.contains("ai_agent"));
}
