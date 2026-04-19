//! RED-phase tests for LDBC SNB audit-report exporter.
//! See `.planning/evaluator-harness/PLAN.md` Task 2.5 and
//! "Cross-Vendor Comparison Layer".

use ogdb_eval::{BinaryInfo, EvaluationRun, LdbcSubmission, Metric, Platform, SCHEMA_VERSION};
use std::collections::BTreeMap;

fn ldbc_run() -> EvaluationRun {
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
        "p50_us".into(),
        Metric {
            value: 820.0,
            unit: "us".into(),
            higher_is_better: false,
        },
    );
    metrics.insert(
        "p95_us".into(),
        Metric {
            value: 3200.0,
            unit: "us".into(),
            higher_is_better: false,
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
        run_id: "2026-04-19_run1".into(),
        suite: "ldbc-snb-interactive".into(),
        subsuite: "ic-3".into(),
        dataset: "sf0_1".into(),
        timestamp_utc: "2026-04-19T14:32:01Z".into(),
        git_sha: "db67696".into(),
        platform: Platform {
            os: "linux".into(),
            arch: "x86_64".into(),
            cpu_model: "Intel Core i9-13900K".into(),
            ram_gb: 64,
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
fn ldbc_submission_emits_required_audit_fields() {
    let run = ldbc_run();
    let submission =
        LdbcSubmission::from_run(&run).expect("from_run must succeed for a complete run");

    for key in [
        "sut_name",
        "sut_version",
        "sut_vendor",
        "scale_factor",
        "run_date",
        "throughput_qps",
        "hardware",
        "certification_status",
    ] {
        assert!(
            submission.get(key).is_some(),
            "LDBC submission must include '{key}'; got {submission:#}"
        );
    }
}

#[test]
fn ldbc_submission_defaults_sut_name_to_opengraphdb() {
    let run = ldbc_run();
    let submission = LdbcSubmission::from_run(&run).unwrap();
    assert_eq!(
        submission["sut_name"].as_str(),
        Some("OpenGraphDB"),
        "sut_name must default to 'OpenGraphDB'; got {}",
        submission["sut_name"]
    );
}

#[test]
fn ldbc_submission_percentiles_are_strictly_ordered() {
    let run = ldbc_run();
    let submission = LdbcSubmission::from_run(&run).unwrap();

    let p50 = submission["percentiles"]["p50_us"]
        .as_f64()
        .expect("p50_us must be present as f64");
    let p95 = submission["percentiles"]["p95_us"]
        .as_f64()
        .expect("p95_us must be present as f64");
    let p99 = submission["percentiles"]["p99_us"]
        .as_f64()
        .expect("p99_us must be present as f64");

    assert!(
        p50 < p95 && p95 < p99,
        "percentiles must be strictly ordered p50 < p95 < p99; got {p50} / {p95} / {p99}"
    );
}
