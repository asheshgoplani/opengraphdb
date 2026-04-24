//! RED-phase tests for the skill_regression report generator + writer.
//! PLAN.md §6 rows 3–4.

use std::collections::BTreeMap;
use std::fs;

use ogdb_eval::drivers::skill_quality::{CaseDiagnostic, Difficulty};
use ogdb_eval::skill_regression::{
    generate_skill_regression_report, write_report, SkillRegressionReport,
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

fn skill_quality_run(run_id: &str, metrics: Vec<(&str, f64)>) -> EvaluationRun {
    let mut m = BTreeMap::new();
    for (k, v) in metrics {
        m.insert(
            k.to_string(),
            Metric {
                value: v,
                unit: "ratio".into(),
                higher_is_better: true,
            },
        );
    }
    EvaluationRun {
        schema_version: SCHEMA_VERSION.to_string(),
        run_id: run_id.into(),
        suite: "skill_quality".into(),
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

fn diag(
    skill: &str,
    case_name: &str,
    difficulty: Difficulty,
    passed: bool,
    score: f64,
    actual_response: &str,
    expected_must_contain: Vec<&str>,
    expected_pattern: Option<&str>,
) -> CaseDiagnostic {
    CaseDiagnostic {
        skill: skill.to_string(),
        case_name: case_name.to_string(),
        difficulty,
        passed,
        score,
        latency_us: 1_000,
        expected_must_contain: expected_must_contain.into_iter().map(String::from).collect(),
        expected_pattern: expected_pattern.map(String::from),
        actual_response: actual_response.to_string(),
    }
}

/// Test 3: report lists failing cases per regressed skill, with expected
/// gates + actual response text preserved, and a suggested_next_plan
/// one-liner that the conductor file-watcher can parse.
#[test]
fn report_lists_failing_cases_per_skill() {
    let baseline = skill_quality_run(
        "skill_quality-all-baseline",
        vec![
            ("pass_rate", 0.90),
            ("pass_rate_ogdb_cypher", 1.00),
            ("pass_rate_data_import", 1.00),
            ("pass_rate_graph_explore", 1.00),
        ],
    );
    let current = skill_quality_run(
        "skill_quality-all-current",
        vec![
            ("pass_rate", 0.70),
            ("pass_rate_ogdb_cypher", 0.50),   // regressed: 2 of 4 failing
            ("pass_rate_data_import", 1.00),   // unchanged
            ("pass_rate_graph_explore", 1.00), // unchanged
        ],
    );

    let diagnostics = vec![
        diag(
            "ogdb-cypher",
            "basic-node-query",
            Difficulty::Easy,
            false,
            0.3,
            "SELECT * FROM Person",
            vec!["MATCH", "Person"],
            Some("MATCH"),
        ),
        diag(
            "ogdb-cypher",
            "complex-join",
            Difficulty::Hard,
            false,
            0.1,
            "I don't know",
            vec!["MATCH", "WITH"],
            Some("MATCH.*WITH"),
        ),
        diag(
            "ogdb-cypher",
            "trivial-return",
            Difficulty::Easy,
            true,
            1.0,
            "MATCH (n) RETURN n",
            vec!["MATCH"],
            None,
        ),
        diag(
            "data-import",
            "csv-simple",
            Difficulty::Easy,
            true,
            1.0,
            "MERGE (p:Person)",
            vec!["MERGE"],
            None,
        ),
    ];

    let report: SkillRegressionReport = generate_skill_regression_report(
        &baseline,
        &current,
        &diagnostics,
        5.0,
        "2026-04-24T00:00:00Z",
    );

    assert_eq!(report.schema_version, "1.0");
    assert_eq!(report.baseline_run_id, "skill_quality-all-baseline");
    assert_eq!(report.current_run_id, "skill_quality-all-current");
    assert!(
        (report.threshold_pct - 5.0).abs() < 1e-9,
        "threshold echoed into report; got {}",
        report.threshold_pct
    );

    assert_eq!(
        report.regressed_skills.len(),
        1,
        "only ogdb-cypher regressed past 5%; got {:#?}",
        report.regressed_skills
    );
    let regressed = &report.regressed_skills[0];
    assert_eq!(regressed.skill, "ogdb-cypher");
    assert!(regressed.delta_pct < 0.0, "regression ⇒ negative delta_pct");
    assert_eq!(
        regressed.failing_cases.len(),
        2,
        "2 of 4 diagnostics failed for ogdb-cypher; got {:#?}",
        regressed.failing_cases
    );

    let names: Vec<&str> = regressed
        .failing_cases
        .iter()
        .map(|c| c.case_name.as_str())
        .collect();
    assert!(names.contains(&"basic-node-query"));
    assert!(names.contains(&"complex-join"));

    let first = regressed
        .failing_cases
        .iter()
        .find(|c| c.case_name == "basic-node-query")
        .unwrap();
    assert_eq!(first.actual_response, "SELECT * FROM Person");
    assert_eq!(first.expected_must_contain, vec!["MATCH", "Person"]);
    assert_eq!(first.expected_pattern.as_deref(), Some("MATCH"));

    assert!(
        regressed.suggested_next_plan.contains("plan/skill-quality-"),
        "suggested_next_plan must start with a plan/ prefix; got {}",
        regressed.suggested_next_plan
    );
    assert!(
        regressed.suggested_next_plan.contains("ogdb-cypher"),
        "suggested_next_plan must name the regressed skill; got {}",
        regressed.suggested_next_plan
    );

    assert_eq!(report.summary.regressed_skill_count, 1);
    assert_eq!(report.summary.total_failing_cases, 2);
}

/// Test 4: deterministic — same inputs ⇒ byte-identical JSON output.
#[test]
fn report_is_deterministic_across_runs() {
    let baseline = skill_quality_run(
        "skill_quality-all-baseline",
        vec![
            ("pass_rate", 0.95),
            ("pass_rate_ogdb_cypher", 0.95),
            ("pass_rate_data_import", 0.95),
        ],
    );
    let current = skill_quality_run(
        "skill_quality-all-current",
        vec![
            ("pass_rate", 0.75),
            ("pass_rate_ogdb_cypher", 0.70),
            ("pass_rate_data_import", 0.70),
        ],
    );

    let diagnostics = vec![
        diag(
            "ogdb-cypher",
            "a",
            Difficulty::Easy,
            false,
            0.2,
            "wrong-a",
            vec!["MATCH"],
            None,
        ),
        diag(
            "data-import",
            "b",
            Difficulty::Medium,
            false,
            0.3,
            "wrong-b",
            vec!["MERGE"],
            None,
        ),
    ];

    let r1 = generate_skill_regression_report(
        &baseline,
        &current,
        &diagnostics,
        5.0,
        "2026-04-24T00:00:00Z",
    );
    let r2 = generate_skill_regression_report(
        &baseline,
        &current,
        &diagnostics,
        5.0,
        "2026-04-24T00:00:00Z",
    );

    let s1 = serde_json::to_string(&r1).expect("serialise r1");
    let s2 = serde_json::to_string(&r2).expect("serialise r2");
    assert_eq!(
        s1, s2,
        "generate_skill_regression_report must be deterministic; got\nS1={s1}\nS2={s2}"
    );

    // write_report must also be deterministic on disk.
    let tmp = TempDir::new().expect("tempdir");
    let p1 = tmp.path().join("r1.json");
    let p2 = tmp.path().join("r2.json");
    write_report(&p1, &r1).expect("write r1");
    write_report(&p2, &r2).expect("write r2");
    let b1 = fs::read(&p1).expect("read r1");
    let b2 = fs::read(&p2).expect("read r2");
    assert_eq!(b1, b2, "write_report must produce byte-identical files");
}
