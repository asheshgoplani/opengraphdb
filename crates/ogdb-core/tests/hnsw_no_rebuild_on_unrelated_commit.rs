//! Regression test for EVAL-PERF-RELEASE Finding 2 (BLOCKER).
//!
//! Before the fix, `commit_txn` unconditionally called
//! `rebuild_vector_indexes_from_catalog_without_sidecar`, which clears
//! `materialized_vector_indexes` and rebuilds every HNSW from scratch via
//! `build_hnsw_from_entries`. On a 10k-vector index that is hundreds of ms
//! per *unrelated* commit (edge-only, label-only on a non-vector node, etc.),
//! consistent with the published row-6 mutation p99.9 = 720 ms outliers.
//!
//! Acceptance: opening a vector index and then performing a stream of
//! transactions that DO NOT touch any node (edge-only or no-op) must NOT
//! increment `Database::vector_index_rebuilds_total()`. The counter is the
//! single observable signal that proves the rebuild was skipped.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric};

const N_NODES: usize = 300; // > HNSW_MIN_N (256) so HNSW actually builds
const D: usize = 32;

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-hnsw-no-rebuild-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

fn rand_unit_vec(seed: u64, d: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(d);
    let mut s = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    let mut sumsq = 0f32;
    for _ in 0..d {
        s = s
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let u = ((s >> 33) as u32) as f32 / u32::MAX as f32;
        let v = u * 2.0 - 1.0;
        sumsq += v * v;
        out.push(v);
    }
    let norm = sumsq.sqrt().max(f32::MIN_POSITIVE);
    for v in &mut out {
        *v /= norm;
    }
    out
}

#[test]
fn vector_index_not_rebuilt_on_unrelated_commit() {
    let dir = test_dir("unrelated");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    // Seed: N_NODES nodes WITH a vector each + N_NODES "plain" nodes (no
    // vector) so we have edge endpoints we can mutate without affecting
    // the vector index.
    let mut vec_node_ids = Vec::with_capacity(N_NODES);
    for i in 0..N_NODES {
        let v = rand_unit_vec(i as u64, D);
        let id = db
            .create_node_with(
                &["Doc".to_string()],
                &PropertyMap::from([("embedding".to_string(), PropertyValue::Vector(v))]),
            )
            .expect("create vector node");
        vec_node_ids.push(id);
    }
    let mut plain_node_ids = Vec::with_capacity(N_NODES);
    for _ in 0..N_NODES {
        let id = db
            .create_node_with(&["Plain".to_string()], &PropertyMap::new())
            .expect("create plain node");
        plain_node_ids.push(id);
    }

    db.create_vector_index(
        "embedding_idx",
        Some("Doc"),
        "embedding",
        D,
        VectorDistanceMetric::Cosine,
    )
    .expect("create vector index");

    // Snapshot the rebuild counter after the index is built.
    let baseline_rebuilds = db.vector_index_rebuilds_total();
    assert!(
        baseline_rebuilds >= 1,
        "creating the vector index should have triggered at least one rebuild, got {}",
        baseline_rebuilds
    );

    // Run 20 edge-only transactions. None of these touch any node — they
    // only add edges between existing nodes.
    for i in 0..20 {
        let mut tx = db.begin_write();
        let src = plain_node_ids[i % plain_node_ids.len()];
        let dst = plain_node_ids[(i + 1) % plain_node_ids.len()];
        tx.add_edge(src, dst).expect("add edge");
        tx.commit().expect("commit edge-only txn");
    }

    let after_edge_only = db.vector_index_rebuilds_total();
    assert_eq!(
        after_edge_only, baseline_rebuilds,
        "edge-only commits must NOT rebuild the HNSW (eval Finding 2). \
         baseline={} after_20_edge_txns={}",
        baseline_rebuilds, after_edge_only
    );

    // Sanity: a txn that DOES change a vector node's properties SHOULD
    // still trigger a rebuild — we only want to skip when nothing
    // touches the index, not unconditionally suppress.
    {
        let mut tx = db.begin_write();
        let new_v = rand_unit_vec(99_999, D);
        tx.set_node_properties(
            vec_node_ids[0],
            PropertyMap::from([("embedding".to_string(), PropertyValue::Vector(new_v))]),
        )
        .expect("set vector property");
        tx.commit().expect("commit vector-touching txn");
    }
    let after_vector_change = db.vector_index_rebuilds_total();
    assert!(
        after_vector_change > after_edge_only,
        "a txn that modifies a vector-bearing node MUST rebuild. \
         after_edge_only={} after_vector_change={}",
        after_edge_only,
        after_vector_change
    );
}
