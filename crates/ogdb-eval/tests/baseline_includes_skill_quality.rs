//! RED-phase integration tests for the wire-skill-quality-baseline plan.
//! See `.planning/wire-skill-quality-baseline/PLAN.md` §4.
//!
//! These tests MUST fail against HEAD `e09aa4d` (the pre-plan tip) because
//! `cli_runner::append_skill_quality_run*` does not yet exist. They flip
//! green after Phase 3 (GREEN) lands the helper in
//! `crates/ogdb-eval/src/drivers/cli_runner.rs`.
//!
//! Run with:
//!   cargo test -p ogdb-eval --test baseline_includes_skill_quality
//! No env vars required — helpers are invoked directly; no release-mode
//! harness spawn.

use std::path::Path;

use ogdb_eval::drivers::cli_runner::{
    append_skill_quality_run, append_skill_quality_run_with_adapter, write_benchmarks_md,
};
use ogdb_eval::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};
use ogdb_eval::EvaluationRun;
use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Shims — drive the factory seam without touching env vars.
// ---------------------------------------------------------------------------

/// Always errors — exercises the "LLM failure ≠ release block" path.
struct FailingAdapter;

impl LlmAdapter for FailingAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Err(SkillQualityError::Adapter(
            "simulated provider outage".into(),
        ))
    }
}

/// Always returns a deterministic string — exercises the happy path when
/// the test must not rely on the global factory's env-var resolution.
struct OkAdapter;

impl LlmAdapter for OkAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Ok(AdapterResponse {
            text: format!("[test-ok] {}", case.input),
            latency_us: 100,
        })
    }
}

// ---------------------------------------------------------------------------
// Tests (PLAN §4, rows 1–4)
// ---------------------------------------------------------------------------

/// PLAN §4 row 1 — mock-mode call adds exactly one skill_quality run.
#[test]
fn mock_mode_adds_one_skill_quality_run() {
    // Isolate from the ambient factory env so this test is deterministic
    // regardless of the developer's shell state.
    // SAFETY: single-threaded test; no other test in this file reads the var.
    std::env::remove_var("OGDB_SKILL_LLM_PROVIDER");

    let mut runs: Vec<EvaluationRun> = Vec::new();
    let before = runs.len();
    append_skill_quality_run(&mut runs).expect("append_skill_quality_run");
    assert_eq!(
        runs.len() - before,
        1,
        "exactly one skill_quality run must be appended (mock mode)"
    );
    let appended = runs.last().expect("one run");
    assert_eq!(
        appended.suite, "skill_quality",
        "appended run must carry suite=skill_quality",
    );
}

/// PLAN §4 row 2 — one `pass_rate_<skill>` metric per spec file in
/// `skills/evals/`. This deliberately fails loudly if a fifth spec is
/// added without updating the assertion (forced review gate).
#[test]
fn skill_quality_run_has_one_pass_rate_per_skill() {
    std::env::remove_var("OGDB_SKILL_LLM_PROVIDER");

    let mut runs: Vec<EvaluationRun> = Vec::new();
    append_skill_quality_run(&mut runs).expect("append_skill_quality_run");
    let run = runs.last().expect("one run");

    let per_skill: Vec<&String> = run
        .metrics
        .keys()
        .filter(|k| {
            k.starts_with("pass_rate_")
                && !matches!(k.as_str(), "pass_rate_easy" | "pass_rate_medium" | "pass_rate_hard")
        })
        .collect();

    let mut found: Vec<String> = per_skill.iter().map(|s| (*s).clone()).collect();
    found.sort();
    let expected = vec![
        "pass_rate_data_import".to_string(),
        "pass_rate_graph_explore".to_string(),
        "pass_rate_ogdb_cypher".to_string(),
        "pass_rate_schema_advisor".to_string(),
    ];
    assert_eq!(
        found, expected,
        "per-skill pass_rate metrics must match the four skills/evals/*.eval.yaml specs exactly"
    );
}

/// PLAN §4 row 3 — adapter errors must not propagate. The harness must
/// still push a run so downstream diff tooling has something to compare,
/// and the run must be tagged degraded.
#[test]
fn llm_adapter_failure_does_not_panic() {
    let mut runs: Vec<EvaluationRun> = Vec::new();
    let result = append_skill_quality_run_with_adapter(&mut runs, &FailingAdapter, false);
    assert!(
        result.is_ok(),
        "append helper must swallow adapter errors: got {result:?}"
    );
    assert_eq!(
        runs.len(),
        1,
        "adapter failure still produces one (degraded) skill_quality run"
    );
    let run = &runs[0];
    assert_eq!(run.suite, "skill_quality");
    assert_eq!(
        run.environment.get("suite_status").map(String::as_str),
        Some("degraded"),
        "adapter failure must tag suite_status=degraded in environment map"
    );
}

/// PLAN §4 row 4 — auto-summary markdown must contain a skill_quality row
/// once a skill_quality run is in the vector handed to
/// `write_benchmarks_md`.
#[test]
fn auto_summary_lists_skill_quality_section() {
    let mut runs: Vec<EvaluationRun> = Vec::new();
    append_skill_quality_run_with_adapter(&mut runs, &OkAdapter, false)
        .expect("append with OkAdapter");

    let tmp = TempDir::new().expect("tempdir");
    let md_path = tmp.path().join("auto-summary.md");
    write_benchmarks_md(&runs, Path::new(&md_path)).expect("write md");

    let body = std::fs::read_to_string(&md_path).expect("read md");
    assert!(
        body.contains("| skill_quality |"),
        "auto-summary markdown must contain at least one `| skill_quality |` row; got:\n{body}"
    );
}
