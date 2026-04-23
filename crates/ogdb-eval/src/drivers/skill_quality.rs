//! Skill-quality driver — evaluator harness **Dimension 4**.
//!
//! RED-phase stub. See `.planning/skill-quality-dimension/PLAN.md` for the
//! full data-flow trace. Every public function below is `unimplemented!`
//! on purpose; Phase 3 replaces each stub with the real loader / scorer /
//! aggregator / driver entry-point, and the Phase-2 tests under
//! `tests/skill_quality_*.rs` go from RED to GREEN at that point.
//!
//! Nothing outside `crates/ogdb-eval/` is touched by this module.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

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

pub trait LlmAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError>;
}

/// Deterministic in-process adapter driven by a closure. CI-safe.
pub struct MockAdapter<F>(pub F)
where
    F: Fn(&EvalCase) -> AdapterResponse;

impl<F> LlmAdapter for MockAdapter<F>
where
    F: Fn(&EvalCase) -> AdapterResponse,
{
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        unimplemented!("MockAdapter::respond — Phase 3 wires the closure call")
    }
}

/// Placeholder for the real LLM adapter — Phase 5 fills this in.
pub struct StubRealAdapter;

impl LlmAdapter for StubRealAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Err(SkillQualityError::Unimplemented(
            "real LLM adapter lands in Phase 5",
        ))
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

// ---------------------------------------------------------------------------
// Public API — every function is an unimplemented stub for RED.
// ---------------------------------------------------------------------------

/// Parse a single `.eval.yaml` spec body (which is actually JSON). Rejects
/// input with no `cases` array via `SkillQualityError::Invalid`.
pub fn parse_spec(_json: &str) -> Result<SkillSpec, SkillQualityError> {
    unimplemented!("parse_spec — Phase 3")
}

/// Walk `dir` non-recursively, load every `*.eval.yaml`, return one spec per file.
pub fn load_specs_from_dir(_dir: &Path) -> Result<Vec<SkillSpec>, SkillQualityError> {
    unimplemented!("load_specs_from_dir — Phase 3")
}

/// Pure function. Evaluates one case's `must_contain` / `must_not_contain`
/// / `pattern` against the adapter's response text and computes a weighted
/// `score ∈ [0.0, 1.0]` from the `scoring` dict.
pub fn score_case(_case: &EvalCase, _resp: &AdapterResponse, _skill: &str) -> CaseResult {
    unimplemented!("score_case — Phase 3")
}

/// Aggregate per-case results into an `EvaluationRun` with the metric set
/// described in PLAN.md §3.
pub fn aggregate(_results: &[CaseResult]) -> EvaluationRun {
    unimplemented!("aggregate — Phase 3")
}

/// Full pipeline: load every spec in `specs_dir`, drive the adapter once
/// per case, score, aggregate, return a single `EvaluationRun` with
/// `suite = "skill_quality"`.
pub fn run(
    _specs_dir: &Path,
    _adapter: &dyn LlmAdapter,
) -> Result<EvaluationRun, SkillQualityError> {
    unimplemented!("skill_quality::run — Phase 3")
}
