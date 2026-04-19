//! OpenGraphDB evaluator harness — closed-loop measurement across graph-DB
//! benchmarks, scaling probes, and UI/UX. See
//! `.planning/evaluator-harness/PLAN.md` for full architecture.
//!
//! Phase 2 (RED-TDD): this crate exposes the public API surface as
//! `unimplemented!()` stubs. Tests in `tests/` exercise the contract and
//! panic at runtime. Phase 3+ replaces stubs with real impls.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

pub const SCHEMA_VERSION: &str = "1.0";

// ---------------------------------------------------------------------------
// Schema — EvaluationRun
// ---------------------------------------------------------------------------

/// A single evaluation run — one suite × one subsuite × one dataset × one moment.
/// See PLAN.md "JSON Output Schema".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvaluationRun {
    pub schema_version: String,
    pub run_id: String,
    pub suite: String,
    pub subsuite: String,
    pub dataset: String,
    pub timestamp_utc: String,
    pub git_sha: String,
    pub platform: Platform,
    pub binary: BinaryInfo,
    pub metrics: BTreeMap<String, Metric>,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Platform {
    pub os: String,
    pub arch: String,
    pub cpu_model: String,
    pub ram_gb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BinaryInfo {
    pub version: String,
    pub build_profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Metric {
    pub value: f64,
    pub unit: String,
    pub higher_is_better: bool,
}

impl EvaluationRun {
    /// Deserialize an EvaluationRun from a JSON string. Phase-3 impl must
    /// reject missing `schema_version` fields.
    pub fn from_json(_s: &str) -> Result<Self, EvalError> {
        unimplemented!("phase 3 — see .planning/evaluator-harness/PLAN.md Task 3.1");
    }

    /// Serialize to a JSON string.
    pub fn to_json(&self) -> Result<String, EvalError> {
        unimplemented!("phase 3 — see .planning/evaluator-harness/PLAN.md Task 3.1");
    }
}

// ---------------------------------------------------------------------------
// Diff engine
// ---------------------------------------------------------------------------

/// Per-metric-category regression tolerance. See PLAN.md decision D6.
#[derive(Debug, Clone, Copy)]
pub struct Threshold {
    pub throughput_pct: f64,
    pub latency_pct: f64,
    pub quality_pct: f64,
    pub tti_pct: f64,
}

impl Default for Threshold {
    fn default() -> Self {
        Self {
            throughput_pct: 0.05,
            latency_pct: 0.10,
            quality_pct: 0.03,
            tti_pct: 0.20,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Severity {
    Minor,
    Major,
    Critical,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RegressionEvent {
    Regression {
        metric: String,
        magnitude: f64,
        severity: Severity,
        baseline_value: f64,
        current_value: f64,
    },
    Improvement {
        metric: String,
        magnitude: f64,
        baseline_value: f64,
        current_value: f64,
    },
}

pub struct DiffEngine {
    _threshold: Threshold,
}

impl DiffEngine {
    pub fn new(threshold: Threshold) -> Self {
        Self { _threshold: threshold }
    }

    /// Compare `current` against `baseline` and emit one event per metric
    /// that crossed the threshold. Pure function; no I/O.
    pub fn diff(&self, _baseline: &EvaluationRun, _current: &EvaluationRun) -> Vec<RegressionEvent> {
        unimplemented!("phase 3 — see .planning/evaluator-harness/PLAN.md Task 3.2");
    }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

pub struct JsonlHistory;

impl JsonlHistory {
    pub fn append(_run: &EvaluationRun, _path: &Path) -> Result<(), EvalError> {
        unimplemented!("phase 3 — see .planning/evaluator-harness/PLAN.md Task 3.3");
    }

    pub fn read_all(_path: &Path) -> Result<Vec<EvaluationRun>, EvalError> {
        unimplemented!("phase 3 — see .planning/evaluator-harness/PLAN.md Task 3.3");
    }
}

// ---------------------------------------------------------------------------
// LDBC submission exporter
// ---------------------------------------------------------------------------

pub struct LdbcSubmission;

impl LdbcSubmission {
    /// Render an EvaluationRun as an LDBC SNB audit-report-compatible JSON
    /// value. See PLAN.md "Cross-Vendor Comparison Layer".
    pub fn from_run(_run: &EvaluationRun) -> Result<serde_json::Value, EvalError> {
        unimplemented!("phase 3 — see .planning/evaluator-harness/PLAN.md Task 3.4");
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum EvalError {
    #[error("invalid schema: {0}")]
    InvalidSchema(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde_json error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("unimplemented: {0}")]
    Unimplemented(&'static str),
}
