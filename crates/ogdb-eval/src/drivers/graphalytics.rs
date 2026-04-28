//! Task 5.6 — Graphalytics BFS + PageRank driver.
//!
//! Both algorithms run over `ogdb-core`'s public neighbor / hop_levels API.
//! Per the audit on 2026-04-23, `ogdb-core` does not expose PageRank as a
//! kernel; we implement it here using `Database::neighbors` and the
//! standard power-iteration formulation with damping.

use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

use ogdb_core::Database;

use crate::drivers::common::{evaluation_run_skeleton, metric};
use crate::EvaluationRun;

#[derive(Debug, thiserror::Error)]
pub enum GraphalyticsError {
    #[error("eval error: {0}")]
    Eval(#[from] crate::EvalError),
    #[error("db error: {0}")]
    Db(String),
}

/// PageRank result: the `EvaluationRun` carries summary metrics; `scores`
/// gives the per-node score for downstream tooling (oracle assertions,
/// CSV export, etc.).
#[derive(Debug, Clone)]
pub struct PageRankResult {
    pub run: EvaluationRun,
    pub scores: HashMap<u64, f64>,
}

// ---------------------------------------------------------------------------
// BFS — uses `Database::hop_levels(seed, max_hops)` and aggregates the
// per-level visited set. Includes the seed itself.
// ---------------------------------------------------------------------------

pub fn run_bfs(
    db_path: &Path,
    seed_node: u64,
    max_hops: u32,
) -> Result<EvaluationRun, GraphalyticsError> {
    let db = Database::open(db_path).map_err(|e| GraphalyticsError::Db(format!("open: {e}")))?;
    if seed_node >= db.node_count() {
        return Err(GraphalyticsError::Db(format!(
            "seed_node {seed_node} >= node_count {}",
            db.node_count()
        )));
    }

    let started = Instant::now();
    let levels = db
        .hop_levels(seed_node, max_hops)
        .map_err(|e| GraphalyticsError::Db(format!("hop_levels: {e}")))?;
    let elapsed_us = started.elapsed().as_secs_f64() * 1_000_000.0;

    let mut visited: std::collections::HashSet<u64> = std::collections::HashSet::new();
    visited.insert(seed_node);
    for level in &levels {
        for &node in level {
            visited.insert(node);
        }
    }

    let mut run = evaluation_run_skeleton("graphalytics", "BFS", "ldbc-mini-sf0");
    run.metrics.insert(
        "nodes_visited".to_string(),
        metric(visited.len() as f64, "nodes", true),
    );
    run.metrics.insert(
        "levels".to_string(),
        metric(levels.len() as f64, "levels", true),
    );
    run.metrics
        .insert("levels_us".to_string(), metric(elapsed_us, "us", false));
    run.notes = format!(
        "BFS from seed={seed_node}, max_hops={max_hops}, depth_explored={}",
        levels.len()
    );
    Ok(run)
}

// ---------------------------------------------------------------------------
// PageRank — power iteration over `Database::neighbors`. Damping default
// 0.85 per the LDBC Graphalytics specification §5.4.
// ---------------------------------------------------------------------------

pub fn run_pagerank(
    db_path: &Path,
    iterations: u32,
    damping: f64,
) -> Result<PageRankResult, GraphalyticsError> {
    let db = Database::open(db_path).map_err(|e| GraphalyticsError::Db(format!("open: {e}")))?;
    let n = db.node_count();
    if n == 0 {
        return Err(GraphalyticsError::Db("empty database".to_string()));
    }

    let mut out: HashMap<u64, Vec<u64>> = HashMap::with_capacity(n as usize);
    let started_setup = Instant::now();
    for node in 0..n {
        let neigh = db
            .neighbors(node)
            .map_err(|e| GraphalyticsError::Db(format!("neighbors({node}): {e}")))?;
        if !neigh.is_empty() {
            out.insert(node, neigh);
        }
    }
    let setup_us = started_setup.elapsed().as_secs_f64() * 1_000_000.0;

    let init = 1.0 / n as f64;
    let mut scores: HashMap<u64, f64> = (0..n).map(|i| (i, init)).collect();
    let started_iter = Instant::now();
    for _ in 0..iterations {
        let base = (1.0 - damping) / n as f64;
        let mut next: HashMap<u64, f64> = (0..n).map(|i| (i, base)).collect();
        let mut dangling = 0.0;
        for (&node, &score) in &scores {
            if let Some(neigh) = out.get(&node) {
                let share = damping * score / neigh.len() as f64;
                for &m in neigh {
                    *next.entry(m).or_insert(base) += share;
                }
            } else {
                dangling += damping * score / n as f64;
            }
        }
        if dangling > 0.0 {
            for v in next.values_mut() {
                *v += dangling;
            }
        }
        scores = next;
    }
    let iter_us = started_iter.elapsed().as_secs_f64() * 1_000_000.0;

    let mut run = evaluation_run_skeleton("graphalytics", "PageRank", "ldbc-mini-sf0");
    run.metrics.insert(
        "iterations".to_string(),
        metric(iterations as f64, "count", false),
    );
    run.metrics
        .insert("nodes".to_string(), metric(n as f64, "nodes", true));
    run.metrics
        .insert("setup_us".to_string(), metric(setup_us, "us", false));
    run.metrics
        .insert("iter_us".to_string(), metric(iter_us, "us", false));
    run.notes = format!("PageRank {iterations} iters, damping={damping}, n={n}");
    Ok(PageRankResult { run, scores })
}
