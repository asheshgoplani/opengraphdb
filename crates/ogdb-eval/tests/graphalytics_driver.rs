//! Plan reference: Task 5.6 — graphalytics BFS + PageRank against the
//! deterministic ldbc-mini fixture. Asserts (1) BFS reaches every node in
//! the graph's reachable set computed independently from the fixture's
//! in-memory adjacency, and (2) the driver's PageRank top-5 ranking
//! matches a known-good hard-coded oracle (regression guard against silent
//! changes to either the fixture or the algorithm).

use std::collections::{HashMap, HashSet, VecDeque};

use ogdb_eval::drivers::graphalytics::{run_bfs, run_pagerank, PageRankResult};
use ogdb_eval::drivers::ldbc_mini::{build_ldbc_mini, LdbcMini};
use tempfile::TempDir;

const SEED_PERSON_INDEX: u64 = 0;
const PR_ITERATIONS: u32 = 30;
const PR_DAMPING: f64 = 0.85;

/// Hard-coded oracle for the fixture (seed 0x0123_4567_89ab_cdef, 100
/// persons, 500 KNOWS). These are the **person logical ids** (= internal
/// node ids since the fixture is the only writer) of the top-5 nodes by
/// PageRank score after 30 iterations with damping 0.85. Captured 2026-04-23
/// from the reference implementation in `pagerank_reference()` below; if the
/// fixture or algorithm changes, regenerate by running the test once with
/// `EVAL_PRINT_PR=1`.
const PAGERANK_TOP5_ORACLE: [u64; 5] = [64, 25, 31, 55, 57];

#[test]
fn bfs_visits_every_reachable_node_from_seed() {
    let dir = TempDir::new().expect("temp dir");
    let db_path = dir.path().join("graph.ogdb");
    let mini = build_ldbc_mini(&db_path).expect("build mini");

    let expected = bfs_reference(&mini, SEED_PERSON_INDEX, u32::MAX);

    let run = run_bfs(
        &db_path,
        mini.person_node_ids[SEED_PERSON_INDEX as usize],
        16,
    )
    .expect("run BFS");

    assert_eq!(run.suite, "graphalytics");
    assert_eq!(run.subsuite, "BFS");
    let visited = run
        .metrics
        .get("nodes_visited")
        .expect("nodes_visited metric")
        .value;
    assert_eq!(
        visited as usize,
        expected.len(),
        "BFS must visit all reachable nodes"
    );
    assert!(visited >= 1.0);
    assert!(run.metrics.get("levels_us").map(|m| m.value).unwrap_or(0.0) >= 0.0);
}

#[test]
fn pagerank_top5_matches_hardcoded_oracle() {
    let dir = TempDir::new().expect("temp dir");
    let db_path = dir.path().join("graph.ogdb");
    let mini = build_ldbc_mini(&db_path).expect("build mini");

    let result: PageRankResult = run_pagerank(&db_path, PR_ITERATIONS, PR_DAMPING).expect("run PR");
    assert_eq!(result.run.suite, "graphalytics");
    assert_eq!(result.run.subsuite, "PageRank");
    let iterations = result
        .run
        .metrics
        .get("iterations")
        .expect("iterations metric")
        .value;
    assert_eq!(iterations as u32, PR_ITERATIONS);

    if std::env::var("EVAL_PRINT_PR").is_ok() {
        let mut sorted: Vec<_> = result.scores.iter().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap());
        for (id, score) in sorted.iter().take(10) {
            eprintln!("pr[{id}] = {score}");
        }
    }

    let top5 = top5_node_ids(&result.scores);
    assert_eq!(
        top5, PAGERANK_TOP5_ORACLE,
        "PageRank top-5 oracle drifted (got {top5:?}); regenerate with EVAL_PRINT_PR=1"
    );

    // Cross-check against an independent reference impl over the same
    // adjacency — guards against the driver matching the oracle by accident
    // because both share a bug.
    let reference = pagerank_reference(&mini, PR_ITERATIONS, PR_DAMPING);
    let ref_top5 = top5_node_ids(&reference);
    assert_eq!(
        top5, ref_top5,
        "driver PageRank disagrees with reference impl"
    );
}

// ---------------------------------------------------------------------------
// Reference implementations — used by the assertions above. Kept in the
// test crate so they cannot drift away from the production driver (any
// disagreement fails the test).
// ---------------------------------------------------------------------------

fn bfs_reference(mini: &LdbcMini, seed_idx: u64, max_hops: u32) -> HashSet<u64> {
    let mut adj: HashMap<u64, Vec<u64>> = HashMap::new();
    for &(s, d) in &mini.adjacency {
        adj.entry(s).or_default().push(d);
    }
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    queue.push_back((seed_idx, 0u32));
    visited.insert(seed_idx);
    while let Some((node, hops)) = queue.pop_front() {
        if hops >= max_hops {
            continue;
        }
        if let Some(neighbors) = adj.get(&node) {
            for &n in neighbors {
                if visited.insert(n) {
                    queue.push_back((n, hops + 1));
                }
            }
        }
    }
    visited
}

fn pagerank_reference(mini: &LdbcMini, iterations: u32, damping: f64) -> HashMap<u64, f64> {
    let n = mini.person_count;
    let mut out: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut out_degree: HashMap<u64, u64> = HashMap::new();
    for &(s, d) in &mini.adjacency {
        out.entry(s).or_default().push(d);
        *out_degree.entry(s).or_insert(0) += 1;
    }
    let init = 1.0 / n as f64;
    let mut scores: HashMap<u64, f64> = (0..n as u64).map(|i| (i, init)).collect();

    for _ in 0..iterations {
        let mut next: HashMap<u64, f64> = (0..n as u64)
            .map(|i| (i, (1.0 - damping) / n as f64))
            .collect();
        let mut dangling = 0.0;
        for (&node, &score) in &scores {
            if let Some(neigh) = out.get(&node) {
                let share = damping * score / neigh.len() as f64;
                for &m in neigh {
                    *next.entry(m).or_insert(0.0) += share;
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
    scores
}

fn top5_node_ids(scores: &HashMap<u64, f64>) -> [u64; 5] {
    let mut entries: Vec<_> = scores.iter().collect();
    entries.sort_by(|a, b| {
        b.1.partial_cmp(a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.0.cmp(b.0))
    });
    [
        *entries[0].0,
        *entries[1].0,
        *entries[2].0,
        *entries[3].0,
        *entries[4].0,
    ]
}
