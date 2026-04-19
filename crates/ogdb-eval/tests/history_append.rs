//! RED-phase tests for JSONL history append semantics.
//! See `.planning/evaluator-harness/PLAN.md` Task 2.4.

use ogdb_eval::{BinaryInfo, EvaluationRun, JsonlHistory, Metric, Platform, SCHEMA_VERSION};
use std::collections::BTreeMap;
use tempfile::TempDir;

fn run(run_id: &str, qps: f64) -> EvaluationRun {
    let mut metrics = BTreeMap::new();
    metrics.insert(
        "qps".into(),
        Metric {
            value: qps,
            unit: "ops/sec".into(),
            higher_is_better: true,
        },
    );
    EvaluationRun {
        schema_version: SCHEMA_VERSION.to_string(),
        run_id: run_id.into(),
        suite: "ldbc-snb".into(),
        subsuite: "ic-3".into(),
        dataset: "sf0_1".into(),
        timestamp_utc: "2026-04-19T00:00:00Z".into(),
        git_sha: "deadbeef".into(),
        platform: Platform {
            os: "linux".into(),
            arch: "x86_64".into(),
            cpu_model: "test".into(),
            ram_gb: 32,
        },
        binary: BinaryInfo {
            version: "0.2.0".into(),
            build_profile: "release".into(),
        },
        metrics,
        environment: BTreeMap::new(),
        notes: String::new(),
    }
}

#[test]
fn history_append_produces_valid_jsonl() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.jsonl");

    JsonlHistory::append(&run("r1", 100_000.0), &path).expect("first append must succeed");

    let contents = std::fs::read_to_string(&path).expect("file must exist after append");
    let lines: Vec<&str> = contents.lines().collect();
    assert_eq!(lines.len(), 1, "one append → one line; got {lines:?}");
    let _: serde_json::Value =
        serde_json::from_str(lines[0]).expect("each line must be valid JSON");
}

#[test]
fn history_append_twice_yields_two_lines() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.jsonl");

    JsonlHistory::append(&run("r1", 100_000.0), &path).unwrap();
    JsonlHistory::append(&run("r2", 101_000.0), &path).unwrap();

    let contents = std::fs::read_to_string(&path).unwrap();
    let lines: Vec<&str> = contents.lines().collect();
    assert_eq!(lines.len(), 2, "two appends → two lines; got {lines:?}");
}

#[test]
fn history_read_all_roundtrips_appended_runs() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("history.jsonl");

    let r1 = run("r1", 100_000.0);
    let r2 = run("r2", 101_000.0);
    JsonlHistory::append(&r1, &path).unwrap();
    JsonlHistory::append(&r2, &path).unwrap();

    let runs = JsonlHistory::read_all(&path).expect("read_all must succeed");
    assert_eq!(runs.len(), 2, "read_all must return all appended runs");
    assert_eq!(runs[0], r1, "first run must round-trip exactly");
    assert_eq!(runs[1], r2, "second run must round-trip exactly");
}
