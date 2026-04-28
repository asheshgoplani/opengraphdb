//! RED-phase tests for EvaluationRun JSON round-trip.
//! See `.planning/evaluator-harness/PLAN.md` Task 2.3.

use ogdb_eval::{BinaryInfo, EvaluationRun, Metric, Platform, SCHEMA_VERSION};
use std::collections::BTreeMap;

fn sample_run() -> EvaluationRun {
    let mut metrics = BTreeMap::new();
    metrics.insert(
        "qps".into(),
        Metric {
            value: 98_750.4,
            unit: "ops/sec".into(),
            higher_is_better: true,
        },
    );
    metrics.insert(
        "p99_us".into(),
        Metric {
            value: 9100.0,
            unit: "us".into(),
            higher_is_better: false,
        },
    );
    EvaluationRun {
        schema_version: SCHEMA_VERSION.to_string(),
        run_id: "2026-04-19T14-32-01Z_a1b2c3".into(),
        suite: "ldbc-snb-interactive".into(),
        subsuite: "ic-3".into(),
        dataset: "sf0_1".into(),
        timestamp_utc: "2026-04-19T14:32:01Z".into(),
        git_sha: "db67696".into(),
        platform: Platform {
            os: "linux".into(),
            arch: "x86_64".into(),
            cpu_model: "Intel Core i9".into(),
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
fn schema_roundtrip_preserves_all_fields() {
    let original = sample_run();
    let json = original
        .to_json()
        .expect("to_json must succeed for valid run");
    let parsed = EvaluationRun::from_json(&json).expect("from_json must succeed for valid JSON");
    assert_eq!(
        original, parsed,
        "round-trip must preserve every field exactly"
    );
}

#[test]
fn schema_rejects_malformed_json() {
    let bad = r#"{ this is not JSON"#;
    let result = EvaluationRun::from_json(bad);
    assert!(
        result.is_err(),
        "from_json must reject malformed JSON; got Ok"
    );
}

#[test]
fn schema_enforces_schema_version_field() {
    // Missing schema_version must fail.
    let missing_version = r#"{
        "run_id": "x",
        "suite": "x",
        "subsuite": "x",
        "dataset": "x",
        "timestamp_utc": "x",
        "git_sha": "x",
        "platform": {"os":"x","arch":"x","cpu_model":"x","ram_gb":0},
        "binary": {"version":"x","build_profile":"x"},
        "metrics": {}
    }"#;
    let result = EvaluationRun::from_json(missing_version);
    assert!(
        result.is_err(),
        "from_json must reject input missing schema_version; got Ok"
    );
}
