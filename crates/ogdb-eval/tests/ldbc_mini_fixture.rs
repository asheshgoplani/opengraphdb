//! Tests the synthetic LDBC-mini fixture builder. Plan reference: Task 5.5
//! step 2 — "Commit a tiny synthetic SF-mini dataset (100 persons, 500 knows)".
//!
//! The fixture must be deterministic (seeded RNG) so the graphalytics oracle
//! in Task 5.6 stays stable. We assert exact node/edge counts, label/edge-type
//! presence, and that re-building with the same seed produces an identical
//! adjacency list.

use ogdb_eval::drivers::ldbc_mini::{build_ldbc_mini, LdbcMini};
use tempfile::TempDir;

#[test]
fn ldbc_mini_has_100_persons_and_500_knows_edges() {
    let dir = TempDir::new().expect("temp dir");
    let mini = build_ldbc_mini(&dir.path().join("graph.ogdb")).expect("build mini");

    assert_eq!(mini.person_count, 100, "expected 100 Person nodes");
    assert_eq!(mini.knows_count, 500, "expected 500 :KNOWS edges");
    assert_eq!(mini.person_node_ids.len(), 100);
}

#[test]
fn ldbc_mini_is_deterministic_across_rebuilds() {
    let dir_a = TempDir::new().expect("temp dir a");
    let dir_b = TempDir::new().expect("temp dir b");
    let a = build_ldbc_mini(&dir_a.path().join("a.ogdb")).expect("a");
    let b = build_ldbc_mini(&dir_b.path().join("b.ogdb")).expect("b");
    assert_eq!(
        a.adjacency, b.adjacency,
        "fixture must be deterministic — same seed must yield same edges"
    );
}

#[test]
fn ldbc_mini_adjacency_indexes_are_in_range() {
    let dir = TempDir::new().expect("temp dir");
    let mini: LdbcMini = build_ldbc_mini(&dir.path().join("graph.ogdb")).expect("build");
    for (src, dst) in &mini.adjacency {
        assert!(
            (*src as usize) < mini.person_count,
            "src {src} out of range"
        );
        assert!(
            (*dst as usize) < mini.person_count,
            "dst {dst} out of range"
        );
    }
}
