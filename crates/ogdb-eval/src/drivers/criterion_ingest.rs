//! Task 5.4 — Walks `target/criterion/**/estimates.json` and emits one
//! `EvaluationRun` per benchmark.
//!
//! Layout assumed (criterion 0.5.x): `<root>/<group>/<bench>/new/estimates.json`,
//! where `<root>` is typically `target/criterion`. The driver is recursive
//! enough to also ingest `change/` and `base/` subtrees if pointed at one;
//! by default it picks the deepest `new/` subdirs.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::drivers::common::{evaluation_run_skeleton, metric};
use crate::EvaluationRun;

#[derive(Debug, thiserror::Error)]
pub enum CriterionIngestError {
    #[error("eval error: {0}")]
    Eval(#[from] crate::EvalError),
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("malformed estimates.json at {path}: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

#[derive(Debug, Deserialize)]
struct PointEstimate {
    point_estimate: f64,
}

#[derive(Debug, Deserialize)]
struct CriterionEstimates {
    mean: PointEstimate,
    median: PointEstimate,
    #[serde(default)]
    std_dev: Option<PointEstimate>,
    #[serde(default)]
    median_abs_dev: Option<PointEstimate>,
}

/// Walk `root` and emit one `EvaluationRun` per `*/new/estimates.json` found.
/// Returns `Ok(vec![])` if `root` doesn't exist (so callers can opt in to
/// the driver without first checking that benches have been run).
pub fn ingest_criterion_dir(root: &Path) -> Result<Vec<EvaluationRun>, CriterionIngestError> {
    let mut runs = Vec::new();
    if !root.exists() {
        return Ok(runs);
    }

    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(source) => {
                return Err(CriterionIngestError::Io {
                    path: dir.clone(),
                    source,
                })
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            if path.file_name().and_then(|n| n.to_str()) != Some("estimates.json") {
                continue;
            }
            // Only ingest the `new/` subdir to avoid double-counting against
            // criterion's `base/` and `change/` siblings.
            let parent_name = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if parent_name != "new" {
                continue;
            }
            runs.push(parse_one(&path, root)?);
        }
    }

    runs.sort_by(|a, b| a.subsuite.cmp(&b.subsuite));
    Ok(runs)
}

fn parse_one(path: &Path, root: &Path) -> Result<EvaluationRun, CriterionIngestError> {
    let body = std::fs::read_to_string(path).map_err(|source| CriterionIngestError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    let estimates: CriterionEstimates =
        serde_json::from_str(&body).map_err(|source| CriterionIngestError::Parse {
            path: path.to_path_buf(),
            source,
        })?;

    let bench_dir = path.parent().and_then(|p| p.parent()).unwrap_or(path);
    let subsuite = bench_dir
        .strip_prefix(root)
        .unwrap_or(bench_dir)
        .to_string_lossy()
        .to_string();

    let mut run = evaluation_run_skeleton("criterion", &subsuite, "criterion-local");
    run.metrics.insert(
        "mean_us".to_string(),
        metric(estimates.mean.point_estimate / 1_000.0, "us", false),
    );
    run.metrics.insert(
        "median_us".to_string(),
        metric(estimates.median.point_estimate / 1_000.0, "us", false),
    );
    if let Some(sd) = estimates.std_dev {
        run.metrics.insert(
            "std_dev_us".to_string(),
            metric(sd.point_estimate / 1_000.0, "us", false),
        );
    }
    if let Some(mad) = estimates.median_abs_dev {
        run.metrics.insert(
            "median_abs_dev_us".to_string(),
            metric(mad.point_estimate / 1_000.0, "us", false),
        );
    }
    run.notes = format!("ingested from {}", path.display());
    Ok(run)
}
