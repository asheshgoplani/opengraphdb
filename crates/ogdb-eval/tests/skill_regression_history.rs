//! RED-phase integration test for the baseline-array loader + end-to-end
//! wiring into the report generator.
//! PLAN.md §6 row 5.

use std::collections::BTreeMap;
use std::fs;

use ogdb_eval::drivers::skill_quality::{CaseDiagnostic, Difficulty};
use ogdb_eval::skill_regression::{
    find_skill_quality_run, generate_skill_regression_report, load_runs_from_json_array,
};
use ogdb_eval::{BinaryInfo, EvaluationRun, Metric, Platform, SCHEMA_VERSION};
use tempfile::TempDir;

fn platform() -> Platform {
    Platform {
        os: "linux".into(),
        arch: "x86_64".into(),
        cpu_model: "test-cpu".into(),
        ram_gb: 32,
    }
}

fn binary() -> BinaryInfo {
    BinaryInfo {
        version: "0.3.0".into(),
        build_profile: "release".into(),
    }
}

fn run(suite: &str, run_id: &str, metrics: Vec<(&str, f64, bool)>) -> EvaluationRun {
    let mut m = BTreeMap::new();
    for (k, v, hib) in metrics {
        m.insert(
            k.to_string(),
            Metric {
                value: v,
                unit: if hib { "ratio".into() } else { "us".into() },
                higher_is_better: hib,
            },
        );
    }
    EvaluationRun {
        schema_version: SCHEMA_VERSION.to_string(),
        run_id: run_id.into(),
        suite: suite.into(),
        subsuite: "all".into(),
        dataset: "skills-v0.1.0".into(),
        timestamp_utc: "2026-04-24T00:00:00Z".into(),
        git_sha: "deadbeef".into(),
        platform: platform(),
        binary: binary(),
        metrics: m,
        environment: BTreeMap::new(),
        notes: String::new(),
    }
}

/// Test 5: full pipeline from a baseline-history JSON ARRAY (shape of
/// `docs/evaluation-runs/baseline-YYYY-MM-DD.json`) to a regression
/// report. Must tolerate non-skill-quality neighbours in the array.
#[test]
fn integration_with_diff_history_file() {
    let baseline_sq = run(
        "skill_quality",
        "sq-baseline",
        vec![
            ("pass_rate", 0.90, true),
            ("pass_rate_ogdb_cypher", 0.90, true),
        ],
    );
    let neighbour = run(
        "throughput",
        "throughput-baseline",
        vec![("qps", 100_000.0, true)],
    );
    let array = vec![neighbour.clone(), baseline_sq.clone()];

    let tmp = TempDir::new().expect("tempdir");
    let path = tmp.path().join("baseline-2026-04-24.json");
    fs::write(&path, serde_json::to_string_pretty(&array).unwrap()).expect("write");

    // Load the array and find the skill_quality run.
    let loaded = load_runs_from_json_array(&path).expect("load baseline array");
    assert_eq!(loaded.len(), 2, "both runs loaded");

    let found = find_skill_quality_run(&loaded).expect("skill_quality run must be picked out");
    assert_eq!(found.suite, "skill_quality");
    assert_eq!(found.run_id, "sq-baseline");

    // Diff it against a current run.
    let current = run(
        "skill_quality",
        "sq-current",
        vec![
            ("pass_rate", 0.75, true),
            ("pass_rate_ogdb_cypher", 0.70, true), // -22%, well past 5%
        ],
    );

    let diagnostics = vec![CaseDiagnostic {
        skill: "ogdb-cypher".into(),
        case_name: "broken".into(),
        difficulty: Difficulty::Medium,
        passed: false,
        score: 0.0,
        latency_us: 500,
        expected_must_contain: vec!["MATCH".into()],
        expected_pattern: None,
        actual_response: "garbage".into(),
    }];

    let report = generate_skill_regression_report(
        found,
        &current,
        &diagnostics,
        5.0,
        "2026-04-24T00:00:00Z",
    );

    assert!(
        !report.regressed_skills.is_empty(),
        "end-to-end must surface ≥ 1 regressed skill; got {report:#?}"
    );
    assert!(
        report
            .regressed_skills
            .iter()
            .any(|r| r.skill == "ogdb-cypher"),
        "ogdb-cypher must be flagged as regressed; got {:#?}",
        report.regressed_skills
    );
}
