//! Skill-quality driver — evaluator harness **Dimension 4**.
//!
//! Loads `skills/evals/*.eval.yaml` (JSON-in-yaml-extension) specs, drives
//! each case through an `LlmAdapter`, scores the response against the
//! `must_contain` / `must_not_contain` / `pattern` gates + weighted
//! `scoring` dict, and folds the per-case results into a single
//! `EvaluationRun` with per-difficulty and per-skill pass-rate breakdowns.
//!
//! See `.planning/skill-quality-dimension/PLAN.md` for the full data-flow.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::drivers::common::{evaluation_run_skeleton, metric, percentiles};
use crate::EvaluationRun;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum SkillQualityError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("invalid spec: {0}")]
    Invalid(&'static str),
    #[error("adapter: {0}")]
    Adapter(String),
    #[error("unimplemented: {0}")]
    Unimplemented(&'static str),
}

// ---------------------------------------------------------------------------
// Spec schema — mirrors `skills/evals/*.eval.yaml` (which is JSON despite
// the `.yaml` suffix).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SkillSpec {
    pub skill: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    pub cases: Vec<EvalCase>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvalCase {
    pub name: String,
    pub difficulty: Difficulty,
    pub input: String,
    #[serde(default)]
    pub context: serde_json::Value,
    pub expected: Expected,
    #[serde(default)]
    pub scoring: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Expected {
    #[serde(default)]
    pub must_contain: Vec<String>,
    #[serde(default)]
    pub must_not_contain: Vec<String>,
    #[serde(default)]
    pub pattern: Option<String>,
}

// ---------------------------------------------------------------------------
// Adapter trait — the pluggable LLM boundary.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct AdapterResponse {
    pub text: String,
    pub latency_us: u64,
}

pub trait LlmAdapter: Send + Sync {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError>;
}

/// Deterministic in-process adapter driven by a closure. CI-safe.
pub struct MockAdapter<F>(pub F)
where
    F: Fn(&EvalCase) -> AdapterResponse;

impl<F> LlmAdapter for MockAdapter<F>
where
    F: Fn(&EvalCase) -> AdapterResponse + Send + Sync,
{
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Ok((self.0)(case))
    }
}

// ---------------------------------------------------------------------------
// Per-case result (what the scorer emits, what the aggregator consumes).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct CaseResult {
    pub skill: String,
    pub case_name: String,
    pub difficulty: Difficulty,
    pub passed: bool,
    pub score: f64,
    pub latency_us: u64,
}

/// Diagnostic mirror of `CaseResult` with the extra fields a regression
/// report needs: the original expected-gates spec + the adapter's actual
/// response text. Produced by `run_with_diagnostics`.
#[derive(Debug, Clone, PartialEq)]
pub struct CaseDiagnostic {
    pub skill: String,
    pub case_name: String,
    pub difficulty: Difficulty,
    pub passed: bool,
    pub score: f64,
    pub latency_us: u64,
    pub expected_must_contain: Vec<String>,
    pub expected_pattern: Option<String>,
    pub actual_response: String,
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/// Parse a single `.eval.yaml` spec body (which is actually JSON). Rejects
/// input with no `cases` array via `SkillQualityError::Invalid`.
pub fn parse_spec(json: &str) -> Result<SkillSpec, SkillQualityError> {
    let raw: serde_json::Value = serde_json::from_str(json)?;
    let Some(obj) = raw.as_object() else {
        return Err(SkillQualityError::Invalid(
            "spec root must be a JSON object",
        ));
    };
    if !obj.get("cases").map(|v| v.is_array()).unwrap_or(false) {
        return Err(SkillQualityError::Invalid(
            "spec is missing required `cases` array",
        ));
    }
    let spec: SkillSpec = serde_json::from_value(raw)?;
    Ok(spec)
}

/// Walk `dir` non-recursively, load every `*.eval.yaml`, return one spec per file.
pub fn load_specs_from_dir(dir: &Path) -> Result<Vec<SkillSpec>, SkillQualityError> {
    let mut specs = Vec::new();
    let entries = std::fs::read_dir(dir)?;
    let mut paths: Vec<_> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.ends_with(".eval.yaml"))
                    .unwrap_or(false)
        })
        .collect();
    paths.sort();
    for path in paths {
        let body = std::fs::read_to_string(&path)?;
        specs.push(parse_spec(&body)?);
    }
    Ok(specs)
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

/// Pure function. Evaluates one case's `must_contain` / `must_not_contain`
/// / `pattern` against the adapter's response text and computes a weighted
/// `score ∈ [0.0, 1.0]` from the `scoring` dict.
pub fn score_case(case: &EvalCase, resp: &AdapterResponse, skill: &str) -> CaseResult {
    let text = resp.text.as_str();

    let must_contain_ok = case
        .expected
        .must_contain
        .iter()
        .all(|needle| text.contains(needle));

    let must_not_contain_ok = case
        .expected
        .must_not_contain
        .iter()
        .all(|needle| !text.contains(needle));

    let pattern_ok = match &case.expected.pattern {
        None => true,
        Some(pat) => Regex::new(pat).map(|re| re.is_match(text)).unwrap_or(false),
    };

    let passed = must_contain_ok && must_not_contain_ok && pattern_ok;

    let total_weight: f64 = case.scoring.values().copied().sum();
    let score = if total_weight == 0.0 {
        if passed {
            1.0
        } else {
            0.0
        }
    } else if passed {
        1.0
    } else {
        let matched: f64 = case
            .scoring
            .iter()
            .filter(|(key, _)| key_matches_text(key, text))
            .map(|(_, w)| *w)
            .sum();
        (matched / total_weight).clamp(0.0, 1.0)
    };

    CaseResult {
        skill: skill.to_string(),
        case_name: case.name.clone(),
        difficulty: case.difficulty,
        passed,
        score,
        latency_us: resp.latency_us,
    }
}

/// Substring heuristic: split the scoring key on `_`, return true if any
/// token (length ≥ 3) appears case-insensitively in the response text.
fn key_matches_text(key: &str, text: &str) -> bool {
    let text_lower = text.to_ascii_lowercase();
    key.split('_')
        .filter(|tok| tok.len() >= 3)
        .any(|tok| text_lower.contains(&tok.to_ascii_lowercase()))
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/// Aggregate per-case results into an `EvaluationRun` with the metric set
/// described in PLAN.md §3.
pub fn aggregate(results: &[CaseResult]) -> EvaluationRun {
    let total = results.len() as f64;
    let passed = results.iter().filter(|r| r.passed).count() as f64;
    let failed = total - passed;

    let pass_rate = if total > 0.0 { passed / total } else { 0.0 };
    let avg_score = if total > 0.0 {
        results.iter().map(|r| r.score).sum::<f64>() / total
    } else {
        0.0
    };

    let mut run = evaluation_run_skeleton("skill_quality", "all", "skills-v1");

    run.metrics
        .insert("pass_rate".to_string(), metric(pass_rate, "ratio", true));
    run.metrics
        .insert("avg_score".to_string(), metric(avg_score, "ratio", true));
    run.metrics
        .insert("total_cases".to_string(), metric(total, "count", false));
    run.metrics
        .insert("cases_failed".to_string(), metric(failed, "count", false));

    for (bucket, label) in [
        (Difficulty::Easy, "pass_rate_easy"),
        (Difficulty::Medium, "pass_rate_medium"),
        (Difficulty::Hard, "pass_rate_hard"),
    ] {
        let subset: Vec<&CaseResult> = results.iter().filter(|r| r.difficulty == bucket).collect();
        let value = if subset.is_empty() {
            0.0
        } else {
            let p = subset.iter().filter(|r| r.passed).count() as f64;
            p / subset.len() as f64
        };
        run.metrics
            .insert(label.to_string(), metric(value, "ratio", true));
    }

    let distinct_skills: BTreeSet<&str> = results.iter().map(|r| r.skill.as_str()).collect();
    for skill in distinct_skills {
        let subset: Vec<&CaseResult> = results.iter().filter(|r| r.skill == skill).collect();
        let p = subset.iter().filter(|r| r.passed).count() as f64;
        let t = subset.len() as f64;
        let value = if t > 0.0 { p / t } else { 0.0 };
        let metric_name = format!("pass_rate_{}", slugify(skill));
        run.metrics
            .insert(metric_name, metric(value, "ratio", true));
    }

    let latencies: Vec<f64> = results.iter().map(|r| r.latency_us as f64).collect();
    let (p50, p95, p99) = percentiles(&latencies);
    run.metrics
        .insert("latency_p50_us".to_string(), metric(p50, "us", false));
    run.metrics
        .insert("latency_p95_us".to_string(), metric(p95, "us", false));
    run.metrics
        .insert("latency_p99_us".to_string(), metric(p99, "us", false));

    run
}

/// Normalise a skill identifier for use as a metric-name suffix. Replaces
/// every non-alphanumeric char with `_`, lowercases, collapses repeats.
fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_underscore = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_underscore = false;
        } else if !prev_underscore {
            out.push('_');
            prev_underscore = true;
        }
    }
    out.trim_matches('_').to_string()
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Full pipeline: load every spec in `specs_dir`, drive the adapter once
/// per case, score, aggregate, return a single `EvaluationRun` with
/// `suite = "skill_quality"`.
pub fn run(specs_dir: &Path, adapter: &dyn LlmAdapter) -> Result<EvaluationRun, SkillQualityError> {
    let specs = load_specs_from_dir(specs_dir)?;

    let max_version = specs
        .iter()
        .map(|s| s.version.as_str())
        .max()
        .unwrap_or("0.0.0")
        .to_string();

    let mut results = Vec::new();
    for spec in &specs {
        for case in &spec.cases {
            let resp = adapter.respond(case)?;
            results.push(score_case(case, &resp, &spec.skill));
        }
    }

    let mut run = aggregate(&results);
    run.dataset = format!("skills-v{max_version}");
    Ok(run)
}

/// Like `run`, but also returns the per-case diagnostic payload the
/// recursive-skill-improvement reporter needs to describe *why* each
/// failing case failed.
pub fn run_with_diagnostics(
    specs_dir: &Path,
    adapter: &dyn LlmAdapter,
) -> Result<(EvaluationRun, Vec<CaseDiagnostic>), SkillQualityError> {
    let specs = load_specs_from_dir(specs_dir)?;

    let max_version = specs
        .iter()
        .map(|s| s.version.as_str())
        .max()
        .unwrap_or("0.0.0")
        .to_string();

    let mut results = Vec::new();
    let mut diagnostics = Vec::new();
    for spec in &specs {
        for case in &spec.cases {
            let resp = adapter.respond(case)?;
            let result = score_case(case, &resp, &spec.skill);
            diagnostics.push(CaseDiagnostic {
                skill: spec.skill.clone(),
                case_name: result.case_name.clone(),
                difficulty: result.difficulty,
                passed: result.passed,
                score: result.score,
                latency_us: result.latency_us,
                expected_must_contain: case.expected.must_contain.clone(),
                expected_pattern: case.expected.pattern.clone(),
                actual_response: resp.text.clone(),
            });
            results.push(result);
        }
    }

    let mut run = aggregate(&results);
    run.dataset = format!("skills-v{max_version}");
    Ok((run, diagnostics))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("ogdb-cypher"), "ogdb_cypher");
        assert_eq!(slugify("data-import"), "data_import");
        assert_eq!(slugify("Schema Advisor"), "schema_advisor");
    }

    #[test]
    fn key_matches_text_splits_on_underscore() {
        assert!(key_matches_text("uses_label", "this uses a label"));
        assert!(!key_matches_text("xy", "nope"));
    }
}
