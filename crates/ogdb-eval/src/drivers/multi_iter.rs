//! Multi-iteration measurement: warm-up driver pass + N-iter median
//! aggregation.
//!
//! Why: cold-cache variance on read paths is 40–70 % at N=1. The cure
//! is two pieces of plumbing — neither is a wall-clock filter (those
//! hide real outliers; we don't add drop-min/drop-max here).
//!
//! 1. **Warm-up driver pass.** Runs `throughput::ingest_streaming` once
//!    with a small budget *before* the measured iterations begin. This
//!    primes the build-cache and page-cache so iter-1 isn't punished.
//!    The warm-up's `EvaluationRun` is discarded — it never reaches
//!    the published JSON.
//!
//! 2. **N=5 median aggregation.** Runs `run_all(cfg)` `iters` times and
//!    medians each metric across iters, grouped by
//!    `(suite, subsuite, dataset)`. p99.9 metrics are dropped from the
//!    median output: even at N=5 the tail is too noisy to publish.
//!
//! Single-shot p99.9 should not be trusted; the manifest gate requires
//! N≥5 median for tail comparisons. See `docs/BENCHMARKS.md`
//! "Methodology" for the operator-facing version of this contract.

use std::collections::BTreeMap;
use std::time::Duration;

use crate::drivers::cli_runner::{run_all, RunAllConfig, RunAllError};
use crate::drivers::throughput;
use crate::{EvaluationRun, Metric};

const WARMUP_BUDGET: Duration = Duration::from_secs(5);

/// Run the warm-up driver once (discarded) and then `iters` measured
/// passes of `run_all(cfg)`. Each measured iter writes into its own
/// `<workdir>/iter-N` subdirectory so per-iter state can't pollute the
/// next.
///
/// Returns one `Vec<EvaluationRun>` per measured iter, in execution
/// order. The warm-up's run is *not* included.
pub fn run_warmup_then_iters(
    cfg: &RunAllConfig,
    iters: u32,
) -> Result<Vec<Vec<EvaluationRun>>, RunAllError> {
    let warmup_dir = cfg.workdir.join("warmup");
    std::fs::create_dir_all(&warmup_dir)?;
    eprintln!(
        "[multi_iter] warm-up: throughput::ingest_streaming budget={:?} (result discarded)",
        WARMUP_BUDGET
    );
    let _discard = throughput::ingest_streaming(&warmup_dir, WARMUP_BUDGET)?;

    let mut all = Vec::with_capacity(iters as usize);
    for i in 0..iters {
        let iter_dir = cfg.workdir.join(format!("iter-{i}"));
        std::fs::create_dir_all(&iter_dir)?;
        let iter_cfg = RunAllConfig {
            workdir: iter_dir,
            ..cfg.clone()
        };
        eprintln!("[multi_iter] iter {} of {}", i + 1, iters);
        all.push(run_all(&iter_cfg)?);
    }
    Ok(all)
}

/// Median-aggregate `iters` of `EvaluationRun`s grouped by
/// `(suite, subsuite, dataset)`. For each group, each metric is
/// medianed independently across the iters it appeared in. Metrics
/// whose name signals p99.9 (substring `p99_9` or `p999`) are dropped.
///
/// The returned runs preserve the `platform`, `binary`, and (first-seen)
/// `notes` of the first iter's matching run. `timestamp_utc` is taken
/// from the last iter (so the published baseline timestamp reflects the
/// measurement window's end). `git_sha` is taken from iter 1; in
/// practice all iters run from the same checkout.
pub fn median_aggregate(iters: &[Vec<EvaluationRun>]) -> Vec<EvaluationRun> {
    if iters.is_empty() {
        return Vec::new();
    }

    // Map (suite, subsuite, dataset) → (template, per-metric value lists).
    type Key = (String, String, String);
    let mut groups: BTreeMap<Key, GroupAcc> = BTreeMap::new();

    for (iter_idx, runs) in iters.iter().enumerate() {
        for r in runs {
            let key: Key = (r.suite.clone(), r.subsuite.clone(), r.dataset.clone());
            let acc = groups.entry(key).or_insert_with(|| GroupAcc::new(r.clone()));
            acc.last_seen_run = r.clone();
            acc.last_seen_iter = iter_idx;
            for (name, m) in &r.metrics {
                if is_excluded_metric(name) {
                    continue;
                }
                acc.metric_samples
                    .entry(name.clone())
                    .or_default()
                    .push(MetricSample {
                        value: m.value,
                        unit: m.unit.clone(),
                        higher_is_better: m.higher_is_better,
                    });
            }
        }
    }

    let mut out = Vec::with_capacity(groups.len());
    for ((_suite, _subsuite, _dataset), acc) in groups {
        let mut median_metrics: BTreeMap<String, Metric> = BTreeMap::new();
        for (name, samples) in acc.metric_samples {
            if samples.is_empty() {
                continue;
            }
            let mut values: Vec<f64> = samples.iter().map(|s| s.value).collect();
            values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let median = lower_median(&values);
            median_metrics.insert(
                name,
                Metric {
                    value: median,
                    unit: samples[0].unit.clone(),
                    higher_is_better: samples[0].higher_is_better,
                },
            );
        }
        let mut run = acc.first_seen_run;
        run.metrics = median_metrics;
        run.timestamp_utc = acc.last_seen_run.timestamp_utc;
        run.environment
            .entry("aggregation".into())
            .or_insert_with(|| format!("median-of-{}-iters", iters.len()));
        run.environment
            .entry("p99_9_excluded".into())
            .or_insert_with(|| "true (still noisy at N=5)".into());
        out.push(run);
    }
    out
}

/// Lower-median: for even-count samples, return the lower of the two
/// middle values. Conservative — never reports a value that didn't
/// actually occur in the sample.
fn lower_median(sorted: &[f64]) -> f64 {
    debug_assert!(!sorted.is_empty());
    let n = sorted.len();
    sorted[(n - 1) / 2]
}

fn is_excluded_metric(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.contains("p99_9") || n.contains("p999")
}

struct GroupAcc {
    first_seen_run: EvaluationRun,
    last_seen_run: EvaluationRun,
    last_seen_iter: usize,
    metric_samples: BTreeMap<String, Vec<MetricSample>>,
}

impl GroupAcc {
    fn new(template: EvaluationRun) -> Self {
        Self {
            first_seen_run: template.clone(),
            last_seen_run: template,
            last_seen_iter: 0,
            metric_samples: BTreeMap::new(),
        }
    }
}

struct MetricSample {
    value: f64,
    unit: String,
    higher_is_better: bool,
}
