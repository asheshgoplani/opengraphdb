//! Closed-loop skill-quality regression reporter — RED-phase stubs.
//!
//! Consumes two `EvaluationRun`s (one baseline, one current) + the
//! per-case diagnostics captured during the current run, and emits a
//! machine-readable `SkillRegressionReport` that the conductor's file
//! watcher uses to auto-spawn plan sessions when a skill's pass-rate
//! regresses past threshold.
//!
//! See `.planning/recursive-skill-improvement/PLAN.md` for the full
//! data-flow. Phase 3 replaces the `unimplemented!()` bodies below with
//! real implementations that satisfy every test in
//! `crates/ogdb-eval/tests/skill_regression_*.rs`.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::drivers::skill_quality::{CaseDiagnostic, Difficulty};
use crate::{EvalError, EvaluationRun, Severity};

pub const REPORT_SCHEMA_VERSION: &str = "1.0";
pub const DEFAULT_THRESHOLD_PCT: f64 = 5.0;
pub const THRESHOLD_ENV: &str = "OGDB_SKILL_REGRESSION_THRESHOLD_PCT";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkillRegressionReport {
    pub schema_version: String,
    pub generated_at: String,
    pub baseline_run_id: String,
    pub current_run_id: String,
    pub threshold_pct: f64,
    pub summary: SkillRegressionSummary,
    pub regressed_skills: Vec<RegressedSkill>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkillRegressionSummary {
    pub overall_pass_rate_baseline: f64,
    pub overall_pass_rate_current: f64,
    pub overall_pass_rate_delta_pct: f64,
    pub regressed_skill_count: usize,
    pub total_failing_cases: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RegressedSkill {
    pub skill: String,
    pub baseline_pass_rate: f64,
    pub current_pass_rate: f64,
    pub delta_pct: f64,
    pub severity: Severity,
    pub failing_cases: Vec<FailingCase>,
    pub suggested_next_plan: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FailingCase {
    pub case_name: String,
    pub difficulty: Difficulty,
    pub expected_must_contain: Vec<String>,
    pub expected_pattern: Option<String>,
    pub actual_response: String,
    pub score: f64,
}

pub fn load_runs_from_json_array(_path: &Path) -> Result<Vec<EvaluationRun>, EvalError> {
    unimplemented!("Phase 3 GREEN: load array-of-EvaluationRun JSON file")
}

pub fn find_skill_quality_run(_runs: &[EvaluationRun]) -> Option<&EvaluationRun> {
    unimplemented!("Phase 3 GREEN: first run with suite == 'skill_quality'")
}

pub fn threshold_pct_from_env() -> f64 {
    unimplemented!(
        "Phase 3 GREEN: parse OGDB_SKILL_REGRESSION_THRESHOLD_PCT, default 5.0"
    )
}

pub fn generate_skill_regression_report(
    _baseline: &EvaluationRun,
    _current: &EvaluationRun,
    _current_diagnostics: &[CaseDiagnostic],
    _threshold_pct: f64,
    _generated_at: &str,
) -> SkillRegressionReport {
    unimplemented!("Phase 3 GREEN: build SkillRegressionReport from inputs")
}

pub fn write_report(
    _path: &Path,
    _report: &SkillRegressionReport,
) -> Result<(), EvalError> {
    unimplemented!("Phase 3 GREEN: pretty-print deterministic JSON to disk")
}
