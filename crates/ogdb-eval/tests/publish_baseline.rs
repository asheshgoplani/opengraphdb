//! Release-mode bench harness: runs `RunAllConfig::full` plus graphalytics
//! BFS/PageRank and criterion_ingest, serializes every `EvaluationRun` into
//! a JSON array at `$OGDB_EVAL_BASELINE_JSON`, and also emits the auto
//! summary markdown at `$OGDB_EVAL_BASELINE_MD` if set.
//!
//! Gated by `OGDB_EVAL_BASELINE_JSON` being set so `cargo test -p ogdb-eval`
//! in debug mode doesn't drag in the full-tier workload.
//!
//! Invoke:
//!   cd crates/ogdb-eval
//!   OGDB_EVAL_BASELINE_JSON=/path/baseline.json \
//!   OGDB_EVAL_BASELINE_MD=/path/auto-summary.md \
//!   cargo test --release --test publish_baseline -- --nocapture

use std::path::PathBuf;

use ogdb_eval::drivers::cli_runner::{run_all, write_benchmarks_md, RunAllConfig};
use ogdb_eval::drivers::{criterion_ingest, graphalytics};
use ogdb_eval::EvaluationRun;

#[test]
fn publish_full_suite_baseline() {
    let Ok(json_out) = std::env::var("OGDB_EVAL_BASELINE_JSON") else {
        eprintln!("skipping: set OGDB_EVAL_BASELINE_JSON to run");
        return;
    };
    let md_out = std::env::var("OGDB_EVAL_BASELINE_MD").ok();

    // Workdir: sibling of the JSON output so driver artifacts survive
    // if the run is inspected.
    let workdir = PathBuf::from(&json_out).with_extension("workdir");
    if workdir.exists() {
        std::fs::remove_dir_all(&workdir).ok();
    }
    std::fs::create_dir_all(&workdir).unwrap();

    let cfg = RunAllConfig::full(&workdir);
    eprintln!("running RunAllConfig::full at {}", workdir.display());
    let mut runs: Vec<EvaluationRun> = run_all(&cfg).expect("run_all full");
    eprintln!("  run_all emitted {} EvaluationRun(s)", runs.len());

    // Graphalytics on the mini LDBC DB that run_all already built.
    let ldbc_db = workdir.join("ldbc").join("mini.ogdb");
    match graphalytics::run_bfs(&ldbc_db, 0, 3) {
        Ok(r) => {
            eprintln!(
                "  graphalytics BFS: levels={} nodes_visited={}",
                r.metrics.get("levels").map(|m| m.value).unwrap_or(0.0),
                r.metrics.get("nodes_visited").map(|m| m.value).unwrap_or(0.0)
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

    // Criterion ingest — tolerant of missing target/criterion.
    let criterion_root = PathBuf::from(
        std::env::var("OGDB_EVAL_CRITERION_DIR")
            .unwrap_or_else(|_| "target/criterion".to_string()),
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

    // Serialize every run as a JSON array so jq / downstream tooling can walk it.
    let json = serde_json::to_string_pretty(&runs).expect("serialize runs");
    if let Some(parent) = std::path::Path::new(&json_out).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&json_out, json).expect("write json");
    eprintln!("wrote {} runs to {}", runs.len(), json_out);

    if let Some(md_path) = md_out {
        write_benchmarks_md(&runs, std::path::Path::new(&md_path)).expect("write md");
        eprintln!("wrote auto-summary md to {}", md_path);
    }
}
