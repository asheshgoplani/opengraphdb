//! RED-phase test for env-configurable threshold.
//! PLAN.md §6 row 6.

use std::collections::BTreeMap;
use std::sync::Mutex;

use ogdb_eval::skill_regression::{threshold_pct_from_env, DEFAULT_THRESHOLD_PCT, THRESHOLD_ENV};
use ogdb_eval::{
    BinaryInfo, DiffEngine, EvaluationRun, Metric, Platform, RegressionEvent, Threshold,
    SCHEMA_VERSION,
};

// Env is process-global; serialise around it so this file's sub-tests
// don't stomp each other under parallel `cargo test`.
static ENV_LOCK: Mutex<()> = Mutex::new(());

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

/// Test 6: env var `OGDB_SKILL_REGRESSION_THRESHOLD_PCT` overrides the
/// default 5.0. With threshold=15.0, an 8% drop does NOT fire. Unset,
/// default=5.0, an 8% drop DOES fire.
#[test]
fn threshold_configurable_via_env() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    // Baseline state: clear the var, verify default is 5.0.
    std::env::remove_var(THRESHOLD_ENV);
    let default_threshold = threshold_pct_from_env();
    assert!(
        (default_threshold - DEFAULT_THRESHOLD_PCT).abs() < 1e-9,
        "unset env ⇒ default {}, got {}",
        DEFAULT_THRESHOLD_PCT,
        default_threshold
    );

    // Build baseline (0.90) + current (0.828) ⇒ 8% drop.
    let baseline = skill_quality_run("sq-baseline", vec![("pass_rate_ogdb_cypher", 0.90)]);
    let current = skill_quality_run(
        "sq-current",
        vec![("pass_rate_ogdb_cypher", 0.828)], // -8.0%
    );
    let engine = DiffEngine::new(Threshold::default());

    // At default 5% threshold, 8% drop trips the gate.
    let events_default = engine.diff_skill_quality(&baseline, &current, default_threshold);
    let tripped_default = events_default
        .iter()
        .any(|e| matches!(e, RegressionEvent::SkillQualityDiff { .. }));
    assert!(
        tripped_default,
        "8% drop must trip default 5% gate; got {events_default:#?}"
    );

    // With env = 15.0, same 8% drop does NOT trip.
    std::env::set_var(THRESHOLD_ENV, "15.0");
    let raised_threshold = threshold_pct_from_env();
    assert!(
        (raised_threshold - 15.0).abs() < 1e-9,
        "env=15.0 ⇒ threshold 15.0, got {}",
        raised_threshold
    );
    let events_raised = engine.diff_skill_quality(&baseline, &current, raised_threshold);
    let tripped_raised = events_raised
        .iter()
        .any(|e| matches!(e, RegressionEvent::SkillQualityDiff { .. }));
    assert!(
        !tripped_raised,
        "8% drop must not trip raised 15% gate; got {events_raised:#?}"
    );

    std::env::remove_var(THRESHOLD_ENV);
}
