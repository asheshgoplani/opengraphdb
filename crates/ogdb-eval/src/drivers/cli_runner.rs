//! CLI-style runner that drives every new driver end-to-end and produces
//! a list of `EvaluationRun`s + a summary markdown table.
//!
//! `RunAllConfig::quick(path)` picks conservative sizes for tests and CI
//! (everything finishes in <10s). `RunAllConfig::full(path)` unlocks the
//! larger sizes that match the spec's Phase-1 thresholds (e.g. 10K bulk
//! ingest, 100K scaling tier); those are intentionally NOT exercised by
//! the regression tests because debug-mode overhead makes them too slow.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::drivers::common::{evaluation_run_skeleton, metric};
use crate::drivers::real_llm_adapter::{resolve_adapter, DeterministicMockAdapter};
use crate::drivers::skill_quality::{self, LlmAdapter};
use crate::drivers::{ai_agent, ldbc_mini, ldbc_snb, resources, scaling, throughput};
use crate::EvaluationRun;

#[derive(Debug, thiserror::Error)]
pub enum RunAllError {
    #[error("throughput: {0}")]
    Throughput(#[from] throughput::ThroughputError),
    #[error("ai_agent: {0}")]
    AiAgent(#[from] ai_agent::AiAgentError),
    #[error("is1: {0}")]
    Is1(#[from] ldbc_snb::Is1Error),
    #[error("scaling: {0}")]
    Scaling(#[from] scaling::ScalingError),
    #[error("resources: {0}")]
    Resources(#[from] resources::ResourceError),
    #[error("eval: {0}")]
    Eval(#[from] crate::EvalError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

/// Knobs that keep the runner fast for tests (`quick`) or realistic for a
/// full benchmark invocation (`full`). Fields are deliberately public so
/// operators can tweak individual values.
#[derive(Debug, Clone)]
pub struct RunAllConfig {
    pub workdir: PathBuf,
    /// Streaming-ingest window.
    pub streaming_budget: Duration,
    /// Bulk-ingest node count.
    pub bulk_nodes: u32,
    /// Read-point sample count.
    pub read_samples: u32,
    /// Traversal sample count.
    pub traversal_samples: u32,
    /// Mutation sample count.
    pub mutation_samples: u32,
    /// IS-1 query count.
    pub is1_queries: u32,
    /// AI-agent enrichment docs.
    pub enrich_docs: u32,
    /// AI-agent hybrid nodes / queries.
    pub hybrid_nodes: u32,
    pub hybrid_queries: u32,
    /// AI-agent concurrent threads / ops.
    pub concurrent_threads: u32,
    pub concurrent_ops: u32,
    /// AI-agent re-ranking nodes / candidates.
    pub rerank_nodes: u32,
    pub rerank_candidates: u32,
    /// Whether to exercise the scaling 10K tier (30K+ takes too long in debug).
    pub include_scaling_10k: bool,
}

impl RunAllConfig {
    /// Conservative sizes for CI / test runs (<10s total).
    pub fn quick(workdir: &Path) -> Self {
        Self {
            workdir: workdir.to_path_buf(),
            streaming_budget: Duration::from_millis(200),
            bulk_nodes: 500,
            read_samples: 200,
            traversal_samples: 100,
            mutation_samples: 200,
            is1_queries: 100,
            enrich_docs: 20,
            hybrid_nodes: 200,
            hybrid_queries: 20,
            concurrent_threads: 2,
            concurrent_ops: 50,
            rerank_nodes: 200,
            rerank_candidates: 50,
            include_scaling_10k: false,
        }
    }

    /// Full-fidelity sizes matching the spec's Phase-1 thresholds. Not used
    /// from `cargo test` because debug-mode scaling-tier inserts are
    /// prohibitively slow; invoke from a release-mode bench harness.
    pub fn full(workdir: &Path) -> Self {
        Self {
            workdir: workdir.to_path_buf(),
            streaming_budget: Duration::from_secs(30),
            bulk_nodes: 10_000,
            read_samples: 1_000,
            traversal_samples: 1_000,
            mutation_samples: 1_000,
            is1_queries: 1_000,
            enrich_docs: 100,
            hybrid_nodes: 1_000,
            hybrid_queries: 100,
            concurrent_threads: 4,
            concurrent_ops: 500,
            rerank_nodes: 1_000,
            rerank_candidates: 100,
            include_scaling_10k: true,
        }
    }
}

/// Execute every driver in sequence. Subdirectories isolate per-driver
/// databases so one can't poison another. Returns all runs in insertion
/// order — callers can hand the slice to `JsonlHistory::append`, `DiffEngine`,
/// `LdbcSubmission`, or `write_benchmarks_md`.
pub fn run_all(cfg: &RunAllConfig) -> Result<Vec<EvaluationRun>, RunAllError> {
    fs::create_dir_all(&cfg.workdir)?;
    let mut runs = Vec::new();

    // ── throughput ──────────────────────────────────────────────────────
    let throughput_dir = cfg.workdir.join("throughput");
    runs.push(throughput::ingest_streaming(
        &throughput_dir,
        cfg.streaming_budget,
    )?);
    runs.push(throughput::ingest_bulk(&throughput_dir, cfg.bulk_nodes)?);
    runs.push(throughput::read_point(&throughput_dir, cfg.read_samples)?);
    runs.push(throughput::read_traversal(
        &throughput_dir,
        cfg.traversal_samples,
    )?);
    runs.push(throughput::mutation(&throughput_dir, cfg.mutation_samples)?);

    // ── ldbc_snb IS-1 ───────────────────────────────────────────────────
    let ldbc_dir = cfg.workdir.join("ldbc");
    fs::create_dir_all(&ldbc_dir)?;
    let ldbc_db = ldbc_dir.join("mini.ogdb");
    ldbc_mini::build_ldbc_mini(&ldbc_db)?;
    runs.push(ldbc_snb::run_is1(&ldbc_db, cfg.is1_queries)?);

    // ── ai_agent ────────────────────────────────────────────────────────
    let agent_dir = cfg.workdir.join("agent");
    runs.push(ai_agent::enrichment_roundtrip(
        &agent_dir,
        cfg.enrich_docs,
        10,
        15,
    )?);
    runs.push(ai_agent::hybrid_retrieval(
        &agent_dir,
        cfg.hybrid_nodes,
        cfg.hybrid_queries,
    )?);
    runs.push(ai_agent::concurrent_writes(
        &agent_dir,
        cfg.concurrent_threads,
        cfg.concurrent_ops,
    )?);
    runs.push(ai_agent::re_ranking(
        &agent_dir,
        cfg.rerank_nodes,
        cfg.rerank_candidates,
    )?);

    // ── resources (wraps the bulk-ingest workload so we get RSS/disk
    //    alongside the throughput numbers) ────────────────────────────────
    let res_dir = cfg.workdir.join("resources");
    let bulk_nodes = cfg.bulk_nodes;
    let res_work = res_dir.clone();
    runs.push(resources::measure(
        "throughput",
        "ingest_bulk",
        "synthetic",
        move || {
            let _ = throughput::ingest_bulk(&res_work, bulk_nodes);
            resources::ResourceSample::from_dir(&res_work)
        },
    )?);

    // ── scaling 10K ──────────────────────────────────────────────────────
    if cfg.include_scaling_10k {
        let scaling_dir = cfg.workdir.join("scaling");
        runs.push(scaling::run_tier(
            &scaling_dir,
            scaling::ScalingTier::Tier10K,
        )?);
    }

    Ok(runs)
}

/// Render a compact markdown summary of the EvaluationRuns to `path`.
/// Format: one section header per suite, one table row per (subsuite ×
/// key-metric). Columns are (Suite, Subsuite, Metric, Value, Unit).
pub fn write_benchmarks_md(runs: &[EvaluationRun], path: &Path) -> Result<(), RunAllError> {
    let mut body = String::new();
    writeln!(body, "# OpenGraphDB Benchmarks").unwrap();
    writeln!(body).unwrap();
    writeln!(
        body,
        "Auto-generated by `ogdb_eval::drivers::cli_runner::write_benchmarks_md`. See \
         the metrics spec for threshold context."
    )
    .unwrap();
    writeln!(body).unwrap();
    writeln!(body, "| Suite | Subsuite | Metric | Value | Unit |").unwrap();
    writeln!(body, "|---|---|---|---:|---|").unwrap();
    for r in runs {
        let mut names: Vec<&String> = r.metrics.keys().collect();
        names.sort();
        for name in names {
            let m = &r.metrics[name];
            writeln!(
                body,
                "| {} | {} | {} | {:.3} | {} |",
                r.suite, r.subsuite, name, m.value, m.unit
            )
            .unwrap();
        }
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(path, body)?;
    Ok(())
}

/// Append one `skill_quality` EvaluationRun to `runs`, using the
/// factory-selected adapter (mock by default). Tolerant of adapter
/// failures — the run is still pushed, tagged `suite_status=degraded`.
/// Returns `Ok(())` unless the specs directory itself is missing, in
/// which case the step is skipped without pushing a run (see PLAN §3.1).
pub fn append_skill_quality_run(runs: &mut Vec<EvaluationRun>) -> Result<(), RunAllError> {
    let specs_dir = default_skill_evals_dir();
    if !specs_dir.is_dir() {
        eprintln!(
            "skill_quality: specs dir not found at {} — skipping",
            specs_dir.display()
        );
        return Ok(());
    }

    let (adapter, factory_degraded): (Box<dyn LlmAdapter>, bool) = match resolve_adapter() {
        Ok(a) => (a, false),
        Err(e) => {
            eprintln!("skill_quality: adapter factory failed ({e}); falling back to mock");
            (Box::new(DeterministicMockAdapter), true)
        }
    };

    append_skill_quality_run_with_adapter(runs, adapter.as_ref(), factory_degraded)
}

/// Test seam — takes an explicit adapter so callers can inject a failing
/// or deterministic adapter without touching env vars. Pushes exactly one
/// `EvaluationRun` with `suite = "skill_quality"`, tagged
/// `environment["suite_status"] = "degraded"` if either the caller signals
/// a factory-degradation or the driver itself surfaced an error.
pub fn append_skill_quality_run_with_adapter(
    runs: &mut Vec<EvaluationRun>,
    adapter: &dyn LlmAdapter,
    factory_degraded: bool,
) -> Result<(), RunAllError> {
    let specs_dir = default_skill_evals_dir();

    let (mut run, degraded) = match skill_quality::run(&specs_dir, adapter) {
        Ok(r) => (r, factory_degraded),
        Err(e) => {
            eprintln!("skill_quality: driver failed ({e}); emitting degraded skeleton");
            (degraded_skill_quality_skeleton(), true)
        }
    };
    run.environment.insert(
        "suite_status".into(),
        if degraded {
            "degraded".into()
        } else {
            "ok".into()
        },
    );
    runs.push(run);
    Ok(())
}

fn default_skill_evals_dir() -> PathBuf {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest.join("..").join("..").join("skills").join("evals")
}

fn degraded_skill_quality_skeleton() -> EvaluationRun {
    let mut run = evaluation_run_skeleton("skill_quality", "all", "skills-degraded");
    run.metrics
        .insert("pass_rate".into(), metric(0.0, "ratio", true));
    run.metrics
        .insert("total_cases".into(), metric(0.0, "count", false));
    run
}
