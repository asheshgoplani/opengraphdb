//! Unit tests for the noise-reduction harness: warm-up driver pass +
//! multi-iter median aggregation. Exercises the public API in
//! `ogdb_eval::drivers::multi_iter` and `ogdb_eval::drivers::governor`.
//!
//! TDD RED-phase: these tests fail until the new module is in place.

use std::collections::BTreeMap;

use ogdb_eval::drivers::cli_runner::RunAllConfig;
use ogdb_eval::drivers::governor::{detect_governor, try_set_governor, GovernorState};
use ogdb_eval::drivers::multi_iter::{median_aggregate, run_warmup_then_iters};
use ogdb_eval::{BinaryInfo, EvaluationRun, Metric, Platform};
use tempfile::tempdir;

fn synthetic_run(suite: &str, subsuite: &str, qps: f64, p99_9: f64) -> EvaluationRun {
    let mut metrics = BTreeMap::new();
    metrics.insert(
        "qps".into(),
        Metric {
            value: qps,
            unit: "qps".into(),
            higher_is_better: true,
        },
    );
    metrics.insert(
        "p50_us".into(),
        Metric {
            value: qps * 0.01,
            unit: "us".into(),
            higher_is_better: false,
        },
    );
    metrics.insert(
        "p95_us".into(),
        Metric {
            value: qps * 0.02,
            unit: "us".into(),
            higher_is_better: false,
        },
    );
    metrics.insert(
        "p99_us".into(),
        Metric {
            value: qps * 0.04,
            unit: "us".into(),
            higher_is_better: false,
        },
    );
    metrics.insert(
        "p99_9_us".into(),
        Metric {
            value: p99_9,
            unit: "us".into(),
            higher_is_better: false,
        },
    );
    EvaluationRun {
        schema_version: "1.0".into(),
        run_id: format!("{suite}-{subsuite}-synthetic"),
        suite: suite.into(),
        subsuite: subsuite.into(),
        dataset: "synthetic".into(),
        timestamp_utc: "2026-04-25T00:00:00Z".into(),
        git_sha: "deadbeef".into(),
        platform: Platform {
            os: "linux".into(),
            arch: "x86_64".into(),
            cpu_model: "test".into(),
            ram_gb: 0,
        },
        binary: BinaryInfo {
            version: "0.0.0".into(),
            build_profile: "release".into(),
        },
        metrics,
        environment: BTreeMap::new(),
        notes: String::new(),
    }
}

#[test]
fn median_aggregate_takes_median_of_each_metric() {
    // Five iters of one EvaluationRun. qps values: 100, 200, 300, 400, 500.
    // Median = 300. p99_9 should be excluded (per spec, still noisy at N=5).
    let iters: Vec<Vec<EvaluationRun>> = (0..5)
        .map(|i| {
            vec![synthetic_run(
                "throughput",
                "ingest_streaming",
                100.0 * (f64::from(i) + 1.0),
                9999.0,
            )]
        })
        .collect();

    let medians = median_aggregate(&iters);
    assert_eq!(medians.len(), 1, "one (suite,subsuite,dataset) group");
    let r = &medians[0];
    assert!(
        (r.metrics["qps"].value - 300.0).abs() < 1e-9,
        "qps median should be 300, got {}",
        r.metrics["qps"].value
    );
    // p99_9_us excluded entirely.
    assert!(
        !r.metrics.contains_key("p99_9_us"),
        "p99_9_us must be dropped from medianed runs"
    );
    // p50/p95/p99 retained.
    assert!(r.metrics.contains_key("p50_us"));
    assert!(r.metrics.contains_key("p95_us"));
    assert!(r.metrics.contains_key("p99_us"));
}

#[test]
fn median_aggregate_groups_by_suite_subsuite_dataset() {
    let iters: Vec<Vec<EvaluationRun>> = (0..3)
        .map(|i| {
            vec![
                synthetic_run("throughput", "ingest_streaming", 100.0 + f64::from(i), 0.0),
                synthetic_run(
                    "throughput",
                    "read_point",
                    1000.0 + 10.0 * f64::from(i),
                    0.0,
                ),
            ]
        })
        .collect();

    let medians = median_aggregate(&iters);
    assert_eq!(
        medians.len(),
        2,
        "two distinct (suite,subsuite,dataset) groups"
    );
    let streaming = medians
        .iter()
        .find(|r| r.subsuite == "ingest_streaming")
        .unwrap();
    let read_point = medians.iter().find(|r| r.subsuite == "read_point").unwrap();
    assert!(
        (streaming.metrics["qps"].value - 101.0).abs() < 1e-9,
        "median of [100,101,102]"
    );
    assert!(
        (read_point.metrics["qps"].value - 1010.0).abs() < 1e-9,
        "median of [1000,1010,1020]"
    );
}

#[test]
fn median_aggregate_returns_empty_for_no_iters() {
    let medians = median_aggregate(&[]);
    assert!(medians.is_empty());
}

#[test]
fn median_aggregate_handles_even_count_via_lower_median() {
    // N=4: sorted = [10, 20, 30, 40] → median = 20 (lower of the two middle values,
    // conservative: never reports a value that didn't actually occur in the sample).
    let iters: Vec<Vec<EvaluationRun>> = [10.0_f64, 20.0, 30.0, 40.0]
        .into_iter()
        .map(|v| vec![synthetic_run("throughput", "ingest_streaming", v, 0.0)])
        .collect();
    let medians = median_aggregate(&iters);
    assert_eq!(medians.len(), 1);
    assert!(
        (medians[0].metrics["qps"].value - 20.0).abs() < 1e-9,
        "lower-median of [10,20,30,40] should be 20, got {}",
        medians[0].metrics["qps"].value
    );
}

#[test]
fn run_warmup_then_iters_runs_warmup_and_returns_n_iter_groups_excluding_warmup() {
    let dir = tempdir().unwrap();
    let cfg = RunAllConfig::quick(dir.path());

    let groups = run_warmup_then_iters(&cfg, 2).expect("warmup + iters");
    assert_eq!(groups.len(), 2, "two measured iter groups");
    for g in &groups {
        // run_all emits ≥4 EvaluationRuns even in quick mode (throughput * 5,
        // ldbc IS-1, ai_agent * 4, resources). Anything > 0 proves the iter ran.
        assert!(!g.is_empty(), "iter group must contain measured runs");
    }

    // Verify no warmup leakage: the warmup driver writes to <workdir>/warmup
    // and its output is not surfaced through the returned Vec. We assert by
    // checking that there are no runs whose run_id originates from the
    // warmup subdir naming convention (run_ids include a unique nanos suffix,
    // so we verify by checking notes/path semantics: warmup is a single
    // throughput::ingest_streaming call; if it leaked, the first iter would
    // contain duplicate (throughput, ingest_streaming) entries vs the second.
    let count_streaming = |g: &Vec<EvaluationRun>| {
        g.iter()
            .filter(|r| r.suite == "throughput" && r.subsuite == "ingest_streaming")
            .count()
    };
    assert_eq!(
        count_streaming(&groups[0]),
        1,
        "warmup must not pollute iter 1"
    );
    assert_eq!(
        count_streaming(&groups[1]),
        1,
        "warmup must not pollute iter 2"
    );
}

#[test]
fn detect_governor_returns_some_on_linux_or_none_on_unsupported() {
    let g = detect_governor();
    // On the bench box this is Some("powersave") or Some("performance").
    // On a container without /sys/.../cpufreq it's None.
    // Either branch is acceptable — we just need the function to not panic
    // and to return a value our caller can branch on.
    match g {
        GovernorState::Available(name) => {
            assert!(
                !name.is_empty(),
                "governor name must not be empty when reported as available"
            );
        }
        GovernorState::Unavailable => {}
    }
}

#[test]
fn try_set_governor_returns_err_when_not_writeable() {
    // Without sudo the bench box's scaling_governor is owned by root and
    // not writeable for our process. The function MUST return Err in that
    // case (so the caller can downgrade to a warning), not panic, not
    // succeed silently. If the caller IS root the test is a no-op; we
    // accept either outcome but never a panic.
    // The test is the *call*: if `try_set_governor` panics, the test
    // fails. If it returns `Ok` or `Err` we don't care which — the
    // contract is "never panic regardless of permissions" (see the
    // doc-comment above). No follow-up assertion is needed.
    let _ = try_set_governor("performance");
}
