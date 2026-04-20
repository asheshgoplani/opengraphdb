//! RED-phase failing tests for the diff engine.
//! See `.planning/evaluator-harness/PLAN.md` Task 2.2.
//!
//! These tests panic at runtime against `unimplemented!()` stubs.
//! Phase 3 (Task 3.2) replaces stubs with a pure diff function that
//! satisfies every assertion below.

use ogdb_eval::{
    BinaryInfo, DiffEngine, EvaluationRun, Metric, Platform, RegressionEvent, Threshold,
    SCHEMA_VERSION,
};
use std::collections::BTreeMap;

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
        version: "0.2.0".into(),
        build_profile: "release".into(),
    }
}

fn run_with_metrics(suite: &str, metrics: Vec<(&str, f64, &str, bool)>) -> EvaluationRun {
    let mut m = BTreeMap::new();
    for (k, v, unit, higher_is_better) in metrics {
        m.insert(
            k.to_string(),
            Metric {
                value: v,
                unit: unit.into(),
                higher_is_better,
            },
        );
    }
    EvaluationRun {
        schema_version: SCHEMA_VERSION.to_string(),
        run_id: format!("test_{suite}"),
        suite: suite.into(),
        subsuite: "default".into(),
        dataset: "sf0_1".into(),
        timestamp_utc: "2026-04-19T00:00:00Z".into(),
        git_sha: "deadbeef".into(),
        platform: platform(),
        binary: binary(),
        metrics: m,
        environment: BTreeMap::new(),
        notes: String::new(),
    }
}

/// User's canonical example: frozen baseline + current with 10% QPS
/// regression in LDBC-SNB must emit a REGRESSION event naming the metric
/// and magnitude.
#[test]
fn diff_engine_emits_regression_on_10pct_qps_drop() {
    let baseline = run_with_metrics(
        "ldbc-snb-interactive",
        vec![("qps", 100_000.0, "ops/sec", true)],
    );
    let current = run_with_metrics(
        "ldbc-snb-interactive",
        vec![("qps", 90_000.0, "ops/sec", true)],
    );

    let engine = DiffEngine::new(Threshold::default());
    let events = engine.diff(&baseline, &current);

    let matched = events.iter().any(|e| match e {
        RegressionEvent::Regression {
            metric, magnitude, baseline_value, current_value, ..
        } => {
            metric == "qps"
                && (*magnitude - 0.10).abs() < 0.005
                && (*baseline_value - 100_000.0).abs() < 1.0
                && (*current_value - 90_000.0).abs() < 1.0
        }
        _ => false,
    });
    assert!(
        matched,
        "expected a Regression event for 'qps' with magnitude ~0.10; got {events:#?}"
    );
}

/// An improvement must NOT emit a Regression event (it may emit Improvement).
#[test]
fn diff_engine_no_regression_on_improvement() {
    let baseline = run_with_metrics("beir", vec![("ndcg_10", 0.60, "score", true)]);
    let current = run_with_metrics("beir", vec![("ndcg_10", 0.65, "score", true)]);

    let engine = DiffEngine::new(Threshold::default());
    let events = engine.diff(&baseline, &current);

    let any_regression = events
        .iter()
        .any(|e| matches!(e, RegressionEvent::Regression { .. }));
    assert!(
        !any_regression,
        "improvement must not emit Regression events; got {events:#?}"
    );
}

/// Latency metrics (higher_is_better=false) must emit a Regression when they
/// INCREASE past threshold, not when they decrease.
#[test]
fn diff_engine_flags_latency_regression_on_p99_increase() {
    let baseline = run_with_metrics("scaling", vec![("read_p99_us", 1_000.0, "us", false)]);
    let current = run_with_metrics("scaling", vec![("read_p99_us", 1_150.0, "us", false)]);

    let engine = DiffEngine::new(Threshold::default());
    let events = engine.diff(&baseline, &current);

    let matched = events.iter().any(|e| match e {
        RegressionEvent::Regression {
            metric, magnitude, ..
        } => metric == "read_p99_us" && *magnitude >= 0.10 && *magnitude <= 0.20,
        _ => false,
    });
    assert!(
        matched,
        "expected p99 latency regression; got {events:#?}"
    );
}

/// Per-metric category threshold is respected: a 4% throughput drop crosses
/// the default 5% threshold? No. But a 6% drop does.
#[test]
fn diff_engine_respects_per_metric_threshold() {
    let engine = DiffEngine::new(Threshold::default());

    // 4% throughput drop — below the 5% throughput threshold → no regression.
    let b1 = run_with_metrics("ldbc-snb", vec![("qps", 100_000.0, "ops/sec", true)]);
    let c1 = run_with_metrics("ldbc-snb", vec![("qps", 96_000.0, "ops/sec", true)]);
    let events_under = engine.diff(&b1, &c1);
    assert!(
        !events_under
            .iter()
            .any(|e| matches!(e, RegressionEvent::Regression { .. })),
        "4% drop should not trip the 5% throughput threshold; got {events_under:#?}"
    );

    // 6% throughput drop — above threshold → regression expected.
    let b2 = run_with_metrics("ldbc-snb", vec![("qps", 100_000.0, "ops/sec", true)]);
    let c2 = run_with_metrics("ldbc-snb", vec![("qps", 94_000.0, "ops/sec", true)]);
    let events_over = engine.diff(&b2, &c2);
    assert!(
        events_over
            .iter()
            .any(|e| matches!(e, RegressionEvent::Regression { metric, .. } if metric == "qps")),
        "6% drop should trip the 5% throughput threshold; got {events_over:#?}"
    );
}
