//! RED-phase tests for `DiffEngine::diff_skill_quality`.
//! PLAN.md §6 rows 1–2.

use std::collections::BTreeMap;

use ogdb_eval::{
    BinaryInfo, DiffEngine, EvaluationRun, Metric, Platform, RegressionEvent, Threshold,
    SCHEMA_VERSION,
};

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

/// Test 1: per-skill pass_rate drops 90% → 80% (delta ≈ -11.1%) at a 5%
/// threshold gate — a `SkillQualityDiff` event MUST be emitted naming
/// the regressed skill with the signed delta.
#[test]
fn diff_engine_detects_pass_rate_drop() {
    let baseline = skill_quality_run(
        "skill_quality-all-baseline",
        vec![
            ("pass_rate", 0.90),
            ("pass_rate_ogdb_cypher", 0.90),
            ("pass_rate_data_import", 0.95),
        ],
    );
    let current = skill_quality_run(
        "skill_quality-all-current",
        vec![
            ("pass_rate", 0.85),
            ("pass_rate_ogdb_cypher", 0.80), // regression: -11.1%
            ("pass_rate_data_import", 0.95), // unchanged
        ],
    );

    let engine = DiffEngine::new(Threshold::default());
    let events = engine.diff_skill_quality(&baseline, &current, 5.0);

    let matched = events.iter().any(|e| match e {
        RegressionEvent::SkillQualityDiff {
            skill,
            baseline_pass_rate,
            current_pass_rate,
            delta_pct,
            ..
        } => {
            skill == "ogdb-cypher"
                && (*baseline_pass_rate - 0.90).abs() < 1e-9
                && (*current_pass_rate - 0.80).abs() < 1e-9
                && *delta_pct < 0.0
                && (delta_pct.abs() - 11.1).abs() < 0.2
        }
        _ => false,
    });
    assert!(
        matched,
        "expected SkillQualityDiff for 'ogdb-cypher' with delta_pct ≈ -11.1; got {events:#?}"
    );

    // data_import was unchanged — must NOT appear.
    let spurious = events.iter().any(|e| match e {
        RegressionEvent::SkillQualityDiff { skill, .. } => skill == "data-import",
        _ => false,
    });
    assert!(
        !spurious,
        "unchanged skill 'data-import' must not emit SkillQualityDiff; got {events:#?}"
    );
}

/// Test 2: per-skill pass_rate drops 90% → 87% (delta ≈ -3.3%) at the
/// default 5% threshold — NO `SkillQualityDiff` event.
#[test]
fn no_regression_when_within_threshold() {
    let baseline = skill_quality_run(
        "skill_quality-all-baseline",
        vec![("pass_rate_ogdb_cypher", 0.90)],
    );
    let current = skill_quality_run(
        "skill_quality-all-current",
        vec![("pass_rate_ogdb_cypher", 0.87)], // -3.33%, under 5% threshold
    );

    let engine = DiffEngine::new(Threshold::default());
    let events = engine.diff_skill_quality(&baseline, &current, 5.0);

    let any = events
        .iter()
        .any(|e| matches!(e, RegressionEvent::SkillQualityDiff { .. }));
    assert!(
        !any,
        "3.3% drop must not trip the 5% threshold; got {events:#?}"
    );
}
