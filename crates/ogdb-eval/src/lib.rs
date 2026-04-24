//! OpenGraphDB evaluator harness — closed-loop measurement across graph-DB
//! benchmarks, scaling probes, and UI/UX. See
//! `.planning/evaluator-harness/PLAN.md` for full architecture.

pub mod drivers;
pub mod skill_regression;

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
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
    /// Deserialize an EvaluationRun from a JSON string. Rejects malformed
    /// JSON and input missing the required `schema_version` field (enforced
    /// by serde since the field has no `#[serde(default)]`).
    pub fn from_json(s: &str) -> Result<Self, EvalError> {
        let run: EvaluationRun = serde_json::from_str(s)?;
        if run.schema_version.is_empty() {
            return Err(EvalError::InvalidSchema(
                "schema_version must not be empty".into(),
            ));
        }
        Ok(run)
    }

    /// Serialize to a JSON string.
    pub fn to_json(&self) -> Result<String, EvalError> {
        Ok(serde_json::to_string(self)?)
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    SkillQualityDiff {
        skill: String,
        baseline_pass_rate: f64,
        current_pass_rate: f64,
        delta_pct: f64,
        severity: Severity,
    },
}

pub struct DiffEngine {
    threshold: Threshold,
}

impl DiffEngine {
    pub fn new(threshold: Threshold) -> Self {
        Self { threshold }
    }

    /// Compare `current` against `baseline` and emit one event per metric
    /// that crossed the threshold. Pure function; no I/O.
    pub fn diff(&self, baseline: &EvaluationRun, current: &EvaluationRun) -> Vec<RegressionEvent> {
        let mut events = Vec::new();
        for (name, base_metric) in &baseline.metrics {
            let Some(curr_metric) = current.metrics.get(name) else {
                continue;
            };
            let baseline_value = base_metric.value;
            let current_value = curr_metric.value;
            if baseline_value == 0.0 {
                continue;
            }

            let delta = current_value - baseline_value;
            let magnitude = (delta / baseline_value).abs();
            let threshold = category_threshold(name, base_metric.higher_is_better, &self.threshold);

            if magnitude < threshold {
                continue;
            }

            let is_regression = if base_metric.higher_is_better {
                current_value < baseline_value
            } else {
                current_value > baseline_value
            };

            if is_regression {
                events.push(RegressionEvent::Regression {
                    metric: name.clone(),
                    magnitude,
                    severity: severity_for(magnitude, threshold),
                    baseline_value,
                    current_value,
                });
            } else {
                events.push(RegressionEvent::Improvement {
                    metric: name.clone(),
                    magnitude,
                    baseline_value,
                    current_value,
                });
            }
        }
        events
    }

    /// Specialised diff for `suite == "skill_quality"` runs. Iterates
    /// `pass_rate_<slug>` metric pairs (plus the overall `pass_rate`
    /// under the special name `"<overall>"`) and emits one
    /// `RegressionEvent::SkillQualityDiff` per skill whose |delta_pct|
    /// meets the caller-supplied threshold. Difficulty-bucket metrics
    /// (`pass_rate_easy|medium|hard`) are skipped — they are not skills.
    /// `delta_pct` is signed percentage; negative = regression.
    pub fn diff_skill_quality(
        &self,
        baseline: &EvaluationRun,
        current: &EvaluationRun,
        threshold_pct: f64,
    ) -> Vec<RegressionEvent> {
        let mut events = Vec::new();
        for (name, base_metric) in &baseline.metrics {
            let skill_name = if name == "pass_rate" {
                "<overall>".to_string()
            } else if let Some(slug) = name.strip_prefix("pass_rate_") {
                if matches!(slug, "easy" | "medium" | "hard") {
                    continue;
                }
                slug.replace('_', "-")
            } else {
                continue;
            };

            let Some(curr_metric) = current.metrics.get(name) else {
                continue;
            };
            let baseline_value = base_metric.value;
            let current_value = curr_metric.value;
            if baseline_value == 0.0 {
                continue;
            }

            let delta_pct = (current_value - baseline_value) / baseline_value * 100.0;
            if delta_pct.abs() < threshold_pct {
                continue;
            }

            let severity = crate::skill_regression::severity_for_pct(
                delta_pct.abs(),
                threshold_pct,
            );

            events.push(RegressionEvent::SkillQualityDiff {
                skill: skill_name,
                baseline_pass_rate: baseline_value,
                current_pass_rate: current_value,
                delta_pct,
                severity,
            });
        }
        events
    }
}

fn category_threshold(metric_name: &str, higher_is_better: bool, th: &Threshold) -> f64 {
    let n = metric_name.to_ascii_lowercase();
    if n.contains("ndcg") || n.contains("recall") || n.contains("mrr") || n.contains("precision") {
        th.quality_pct
    } else if n.contains("tti") || n.contains("lcp") || n.contains("fcp") {
        th.tti_pct
    } else if higher_is_better {
        th.throughput_pct
    } else {
        th.latency_pct
    }
}

fn severity_for(magnitude: f64, threshold: f64) -> Severity {
    if magnitude >= threshold * 3.0 {
        Severity::Critical
    } else if magnitude >= threshold * 2.0 {
        Severity::Major
    } else {
        Severity::Minor
    }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

pub struct JsonlHistory;

impl JsonlHistory {
    pub fn append(run: &EvaluationRun, path: &Path) -> Result<(), EvalError> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
        let line = serde_json::to_string(run)?;
        file.write_all(line.as_bytes())?;
        file.write_all(b"\n")?;
        Ok(())
    }

    pub fn read_all(path: &Path) -> Result<Vec<EvaluationRun>, EvalError> {
        let file = OpenOptions::new().read(true).open(path)?;
        let reader = BufReader::new(file);
        let mut runs = Vec::new();
        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            let run: EvaluationRun = serde_json::from_str(&line)?;
            runs.push(run);
        }
        Ok(runs)
    }
}

// ---------------------------------------------------------------------------
// LDBC submission exporter
// ---------------------------------------------------------------------------

pub struct LdbcSubmission;

impl LdbcSubmission {
    /// Render an EvaluationRun as an LDBC SNB audit-report-compatible JSON
    /// value. See PLAN.md "Cross-Vendor Comparison Layer".
    pub fn from_run(run: &EvaluationRun) -> Result<serde_json::Value, EvalError> {
        let throughput_qps = run
            .metrics
            .get("qps")
            .map(|m| m.value)
            .unwrap_or(0.0);

        let p50 = run.metrics.get("p50_us").map(|m| m.value);
        let p95 = run.metrics.get("p95_us").map(|m| m.value);
        let p99 = run.metrics.get("p99_us").map(|m| m.value);

        if let (Some(p50), Some(p95), Some(p99)) = (p50, p95, p99) {
            if !(p50 < p95 && p95 < p99) {
                return Err(EvalError::InvalidSchema(format!(
                    "percentiles must satisfy p50 < p95 < p99; got {p50}/{p95}/{p99}"
                )));
            }
        }

        let scale_factor = parse_scale_factor(&run.dataset);

        let mut percentiles = serde_json::Map::new();
        if let Some(v) = p50 {
            percentiles.insert("p50_us".into(), json!(v));
        }
        if let Some(v) = p95 {
            percentiles.insert("p95_us".into(), json!(v));
        }
        if let Some(v) = p99 {
            percentiles.insert("p99_us".into(), json!(v));
        }

        Ok(json!({
            "sut_name": "OpenGraphDB",
            "sut_version": run.binary.version,
            "sut_vendor": "OpenGraphDB",
            "scale_factor": scale_factor,
            "run_date": run.timestamp_utc,
            "throughput_qps": throughput_qps,
            "percentiles": serde_json::Value::Object(percentiles),
            "hardware": {
                "os": run.platform.os,
                "arch": run.platform.arch,
                "cpu_model": run.platform.cpu_model,
                "ram_gb": run.platform.ram_gb,
            },
            "certification_status": "self-reported",
            "suite": run.suite,
            "subsuite": run.subsuite,
            "git_sha": run.git_sha,
        }))
    }
}

fn parse_scale_factor(dataset: &str) -> f64 {
    let lower = dataset.to_ascii_lowercase();
    let stripped = lower.strip_prefix("sf").unwrap_or(&lower);
    let normalised = stripped.replace('_', ".");
    normalised.parse::<f64>().unwrap_or(0.0)
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
