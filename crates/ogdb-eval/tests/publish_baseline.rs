//! Release-mode bench harness: runs `RunAllConfig::full` plus graphalytics
//! BFS/PageRank and criterion_ingest, serializes every `EvaluationRun` into
//! a JSON array at `$OGDB_EVAL_BASELINE_JSON`, and also emits the auto
//! summary markdown at `$OGDB_EVAL_BASELINE_MD` if set.
//!
//! Gated by `OGDB_EVAL_BASELINE_JSON` being set so `cargo test -p ogdb-eval`
//! in debug mode doesn't drag in the full-tier workload.
//!
//! ## Noise-reduction harness (added 2026-04-25)
//!
//! Cold-cache variance on read paths is 40–70 % at N=1. Two levers tame it:
//!
//! 1. **Warm-up driver pass.** Runs `throughput::ingest_streaming` once
//!    *before* the measured iterations so the build-cache + page-cache are
//!    primed. The warm-up's `EvaluationRun` is discarded.
//!
//! 2. **N-iter median (`OGDB_EVAL_BASELINE_ITERS`, default 5 per cycle-9
//!    methodology contract).** Runs the full suite N times and medians each
//!    metric across iters by `(suite, subsuite, dataset)`. p99.9 is dropped
//!    — even at N=5 the tail is too noisy to publish. Set
//!    `OGDB_EVAL_BASELINE_ITERS=1` for the legacy single-shot smoke path.
//!
//! The `performance` CPU governor is the third lever; on a process without
//! root we can only log a warning. See `ogdb_eval::drivers::governor`.
//!
//! Invoke:
//!   cd crates/ogdb-eval
//!   OGDB_EVAL_BASELINE_JSON=/path/baseline.json \
//!   OGDB_EVAL_BASELINE_MD=/path/auto-summary.md \
//!   OGDB_EVAL_BASELINE_ITERS=5 \
//!   cargo test --release --test publish_baseline -- --nocapture

use std::path::{Path, PathBuf};

use ogdb_eval::drivers::cli_runner::{append_skill_quality_run, write_benchmarks_md, RunAllConfig};
use ogdb_eval::drivers::governor::{detect_governor, try_set_governor, GovernorState};
use ogdb_eval::drivers::multi_iter::{median_aggregate, run_warmup_then_iters};
use ogdb_eval::drivers::{criterion_ingest, graphalytics};
use ogdb_eval::EvaluationRun;

fn read_iters_env() -> u32 {
    // Default 5: matches the methodology contract in
    // documentation/BENCHMARKS.md § 1 (median of N=5 release-build iters
    // with 1 warm-up discarded). Cycle-9 perf surface audit follow-up #11.
    std::env::var("OGDB_EVAL_BASELINE_ITERS")
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .filter(|n| *n >= 1)
        .unwrap_or(5)
}

/// Diagnostic: log per-iter spread for the read-path + IS-1 metrics that
/// the acceptance gate cares about. Spread = (max-min)/median across iters.
/// Read paths are the noisiest cold-cache axis; this report is how we
/// confirm the read warm-up landed without inflating the published JSON.
fn report_variance(groups: &[Vec<EvaluationRun>]) {
    let key_metrics = [
        ("throughput", "read_point", "qps"),
        ("throughput", "read_point", "p50_us"),
        ("throughput", "read_point", "p95_us"),
        ("throughput", "read_point", "p99_us"),
        ("throughput", "read_traversal_2hop", "qps"),
        ("throughput", "read_traversal_2hop", "p50_us"),
        ("throughput", "read_traversal_2hop", "p95_us"),
        ("throughput", "read_traversal_2hop", "p99_us"),
        ("throughput", "ingest_bulk", "nodes_per_sec"),
        ("throughput", "ingest_streaming", "nodes_per_sec"),
        ("ldbc_snb", "is1", "qps"),
    ];
    eprintln!(
        "[variance] per-iter spread = (max-min)/median, computed over {} iters:",
        groups.len()
    );
    eprintln!(
        "  {:<11} {:<22} {:<14} {:>11} {:>11} {:>11} {:>8}",
        "suite", "subsuite", "metric", "median", "min", "max", "spread"
    );
    for (suite, subsuite, metric) in key_metrics {
        let mut values: Vec<f64> = groups
            .iter()
            .filter_map(|g| {
                g.iter()
                    .find(|r| r.suite == suite && r.subsuite == subsuite)
                    .and_then(|r| r.metrics.get(metric))
                    .map(|m| m.value)
            })
            .collect();
        if values.len() < 2 {
            continue;
        }
        values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let min = values.first().copied().unwrap_or(0.0);
        let max = values.last().copied().unwrap_or(0.0);
        let median = values[values.len() / 2];
        let spread = if median.abs() > f64::EPSILON {
            (max - min) / median.abs()
        } else {
            0.0
        };
        eprintln!(
            "  {:<11} {:<22} {:<14} {:>11.2} {:>11.2} {:>11.2} {:>7.1}%",
            suite,
            subsuite,
            metric,
            median,
            min,
            max,
            spread * 100.0
        );
    }
}

/// Probe + warn about CPU governor. Best-effort — never fails the run.
fn probe_governor_and_warn() {
    match detect_governor() {
        GovernorState::Available(name) => {
            eprintln!("[governor] cpu0 governor: {name}");
            if name != "performance" {
                if try_set_governor("performance").is_ok() {
                    eprintln!("[governor] pinned cpu0 to 'performance' for this run");
                } else {
                    eprintln!(
                        "[governor] WARNING: governor is '{name}', not 'performance'. \
                         Re-run with sudo (or `sudo cpupower frequency-set -g performance`) \
                         for true performance pinning. Warm-up driver pass is the more \
                         impactful lever; proceeding without governor change."
                    );
                }
            }
        }
        GovernorState::Unavailable => {
            eprintln!("[governor] cpufreq not available on this host — skipping pinning");
        }
    }
}

/// Post-pass: graphalytics + criterion-ingest + skill_quality. These run
/// once after the medianed core (looping them per-iter would only inflate
/// runtime; their numbers are stable enough to publish single-shot).
fn run_post_pass(workdir: &Path, runs: &mut Vec<EvaluationRun>) {
    let ldbc_db = workdir.join("ldbc").join("mini.ogdb");
    match graphalytics::run_bfs(&ldbc_db, 0, 3) {
        Ok(r) => {
            eprintln!(
                "  graphalytics BFS: levels={} nodes_visited={}",
                r.metrics.get("levels").map(|m| m.value).unwrap_or(0.0),
                r.metrics
                    .get("nodes_visited")
                    .map(|m| m.value)
                    .unwrap_or(0.0)
            );
            runs.push(r);
        }
        Err(e) => eprintln!("  graphalytics BFS FAILED: {e}"),
    }
    match graphalytics::run_pagerank(&ldbc_db, 20, 0.85) {
        Ok(res) => {
            eprintln!("  graphalytics PageRank: {} scores", res.scores.len());
            runs.push(res.run);
        }
        Err(e) => eprintln!("  graphalytics PageRank FAILED: {e}"),
    }

    let criterion_root = PathBuf::from(
        std::env::var("OGDB_EVAL_CRITERION_DIR").unwrap_or_else(|_| "target/criterion".to_string()),
    );
    match criterion_ingest::ingest_criterion_dir(&criterion_root) {
        Ok(mut ci_runs) => {
            eprintln!(
                "  criterion_ingest: {} run(s) from {}",
                ci_runs.len(),
                criterion_root.display()
            );
            runs.append(&mut ci_runs);
        }
        Err(e) => eprintln!("  criterion_ingest FAILED: {e}"),
    }

    if let Err(e) = append_skill_quality_run(runs) {
        eprintln!("  skill_quality step FAILED: {e}");
    }
}

#[test]
fn publish_full_suite_baseline() {
    let Ok(json_out) = std::env::var("OGDB_EVAL_BASELINE_JSON") else {
        eprintln!("skipping: set OGDB_EVAL_BASELINE_JSON to run");
        return;
    };
    let md_out = std::env::var("OGDB_EVAL_BASELINE_MD").ok();
    let iters = read_iters_env();

    let workdir = PathBuf::from(&json_out).with_extension("workdir");
    if workdir.exists() {
        std::fs::remove_dir_all(&workdir).ok();
    }
    std::fs::create_dir_all(&workdir).unwrap();

    probe_governor_and_warn();

    let cfg = RunAllConfig::full(&workdir);
    eprintln!(
        "[publish_baseline] iters={iters} (set OGDB_EVAL_BASELINE_ITERS to change), \
         workdir={}",
        workdir.display()
    );

    let groups = run_warmup_then_iters(&cfg, iters).expect("warmup + iters");
    for (i, g) in groups.iter().enumerate() {
        eprintln!("  iter {} contributed {} EvaluationRun(s)", i + 1, g.len());
    }

    if iters >= 2 {
        report_variance(&groups);
    }

    let mut runs: Vec<EvaluationRun> = if iters >= 2 {
        let medianed = median_aggregate(&groups);
        eprintln!(
            "[publish_baseline] medianed across {iters} iters → {} EvaluationRun(s) \
             (p99.9 dropped: still noisy at N=5)",
            medianed.len()
        );
        medianed
    } else {
        groups.into_iter().next().unwrap_or_default()
    };

    // Post-pass uses the LDBC mini DB built by iter-0 of the measured run.
    let post_workdir = workdir.join("iter-0");
    run_post_pass(&post_workdir, &mut runs);
    eprintln!("  runs now total: {}", runs.len());

    let json = serde_json::to_string_pretty(&runs).expect("serialize runs");
    if let Some(parent) = std::path::Path::new(&json_out).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&json_out, json).expect("write json");
    eprintln!("wrote {} runs to {}", runs.len(), json_out);

    if let Some(md_path) = md_out {
        write_benchmarks_md(&runs, Path::new(&md_path)).expect("write md");
        eprintln!("wrote auto-summary md to {}", md_path);
    }
}
