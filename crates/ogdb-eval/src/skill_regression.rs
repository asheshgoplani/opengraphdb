//! Closed-loop skill-quality regression reporter.
//!
//! Consumes two `EvaluationRun`s (one baseline, one current) + the
//! per-case diagnostics captured during the current run, and emits a
//! machine-readable `SkillRegressionReport` that the conductor's file
//! watcher uses to auto-spawn plan sessions when a skill's pass-rate
//! regresses past threshold.
//!
//! See `.planning/recursive-skill-improvement/PLAN.md` for the full
//! data-flow.

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

/// Read an array-of-EvaluationRuns file (e.g. `baseline-2026-04-23.json`).
/// Contrast with `JsonlHistory::read_all`, which reads newline-delimited.
pub fn load_runs_from_json_array(path: &Path) -> Result<Vec<EvaluationRun>, EvalError> {
    let body = std::fs::read_to_string(path)?;
    let runs: Vec<EvaluationRun> = serde_json::from_str(&body)?;
    Ok(runs)
}

/// First run whose `suite == "skill_quality"`, else `None`.
pub fn find_skill_quality_run(runs: &[EvaluationRun]) -> Option<&EvaluationRun> {
    runs.iter().find(|r| r.suite == "skill_quality")
}

/// `OGDB_SKILL_REGRESSION_THRESHOLD_PCT` parsed as f64, else
/// `DEFAULT_THRESHOLD_PCT` (5.0). Non-finite / negative / unparseable
/// values fall back to the default.
pub fn threshold_pct_from_env() -> f64 {
    match std::env::var(THRESHOLD_ENV) {
        Ok(s) => match s.parse::<f64>() {
            Ok(v) if v.is_finite() && v >= 0.0 => v,
            _ => DEFAULT_THRESHOLD_PCT,
        },
        Err(_) => DEFAULT_THRESHOLD_PCT,
    }
}

/// Pure function — deterministic output given fixed inputs.
pub fn generate_skill_regression_report(
    baseline: &EvaluationRun,
    current: &EvaluationRun,
    current_diagnostics: &[CaseDiagnostic],
    threshold_pct: f64,
    generated_at: &str,
) -> SkillRegressionReport {
    let overall_baseline = baseline
        .metrics
        .get("pass_rate")
        .map(|m| m.value)
        .unwrap_or(0.0);
    let overall_current = current
        .metrics
        .get("pass_rate")
        .map(|m| m.value)
        .unwrap_or(0.0);
    let overall_delta_pct = if overall_baseline == 0.0 {
        0.0
    } else {
        (overall_current - overall_baseline) / overall_baseline * 100.0
    };

    let mut regressed_skills: Vec<RegressedSkill> = Vec::new();

    for (name, base_metric) in &baseline.metrics {
        let slug = match name.strip_prefix("pass_rate_") {
            Some(s) => s,
            None => continue,
        };
        if matches!(slug, "easy" | "medium" | "hard") {
            continue;
        }
        let skill_display = slug.replace('_', "-");

        let Some(curr_metric) = current.metrics.get(name) else {
            continue;
        };
        let baseline_value = base_metric.value;
        let current_value = curr_metric.value;
        if baseline_value == 0.0 {
            continue;
        }
        let delta_pct = (current_value - baseline_value) / baseline_value * 100.0;

        if !(delta_pct < 0.0 && delta_pct.abs() >= threshold_pct) {
            continue;
        }

        let severity = severity_for_pct(delta_pct.abs(), threshold_pct);

        let mut failing_cases: Vec<FailingCase> = current_diagnostics
            .iter()
            .filter(|d| d.skill == skill_display && !d.passed)
            .map(|d| FailingCase {
                case_name: d.case_name.clone(),
                difficulty: d.difficulty,
                expected_must_contain: d.expected_must_contain.clone(),
                expected_pattern: d.expected_pattern.clone(),
                actual_response: d.actual_response.clone(),
                score: d.score,
            })
            .collect();
        failing_cases.sort_by(|a, b| a.case_name.cmp(&b.case_name));

        let case_names: Vec<&str> = failing_cases.iter().map(|c| c.case_name.as_str()).collect();
        let suggested_next_plan = format!(
            "plan/skill-quality-{}-fix — {} failing case(s): {}",
            skill_display,
            failing_cases.len(),
            case_names.join(", "),
        );

        regressed_skills.push(RegressedSkill {
            skill: skill_display,
            baseline_pass_rate: baseline_value,
            current_pass_rate: current_value,
            delta_pct,
            severity,
            failing_cases,
            suggested_next_plan,
        });
    }

    regressed_skills.sort_by(|a, b| a.skill.cmp(&b.skill));

    let total_failing_cases: usize = regressed_skills.iter().map(|r| r.failing_cases.len()).sum();

    let summary = SkillRegressionSummary {
        overall_pass_rate_baseline: overall_baseline,
        overall_pass_rate_current: overall_current,
        overall_pass_rate_delta_pct: overall_delta_pct,
        regressed_skill_count: regressed_skills.len(),
        total_failing_cases,
    };

    SkillRegressionReport {
        schema_version: REPORT_SCHEMA_VERSION.to_string(),
        generated_at: generated_at.to_string(),
        baseline_run_id: baseline.run_id.clone(),
        current_run_id: current.run_id.clone(),
        threshold_pct,
        summary,
        regressed_skills,
    }
}

/// Pretty-printed deterministic JSON → `path`. Over-writes.
pub fn write_report(path: &Path, report: &SkillRegressionReport) -> Result<(), EvalError> {
    let json = serde_json::to_string_pretty(report)?;
    std::fs::write(path, json)?;
    Ok(())
}

pub(crate) fn severity_for_pct(magnitude_pct: f64, threshold_pct: f64) -> Severity {
    if magnitude_pct >= threshold_pct * 3.0 {
        Severity::Critical
    } else if magnitude_pct >= threshold_pct * 2.0 {
        Severity::Major
    } else {
        Severity::Minor
    }
}
