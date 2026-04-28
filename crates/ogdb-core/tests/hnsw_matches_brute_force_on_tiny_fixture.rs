//! RED test for task `hnsw-vector-index`, gate (4) in PLAN.md.
//!
//! On a tiny, hand-picked fixture small enough to be exhaustively searched,
//! `Database::vector_search` must return the *exact* brute-force top-k,
//! with identical `node_id` order and identical `score` bytes. This is the
//! equivalence gate: after Phase 3 swaps the query path to HNSW, this
//! test guarantees we did not perturb the small-dataset happy path (HNSW
//! with `ef_search >= N` must behave identically to brute force).
//!
//! Today this test passes on the brute-force backend; it is retained as a
//! regression gate during the HNSW migration. See
//! `.planning/hnsw-vector-index/PLAN.md` §4 (failing-test matrix).

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!("ogdb-hnsw-{tag}-{}-{now}", std::process::id()));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

fn cosine_distance(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f32;
    let mut an = 0.0f32;
    let mut bn = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        an += x * x;
        bn += y * y;
    }
    if an == 0.0 || bn == 0.0 {
        return 1.0;
    }
    1.0 - (dot / (an.sqrt() * bn.sqrt()))
}

#[test]
fn hnsw_matches_brute_force_on_tiny_fixture() {
    // 20 deterministic 3-D unit vectors spread across the octant-sphere.
    // Dimension 3 keeps cosine math readable; 20 entries is small enough
    // that HNSW with any reasonable `ef_search` must coincide with brute
    // force (the graph at that size is effectively complete).
    let vectors: Vec<Vec<f32>> = (0..20u64)
        .map(|i| {
            let theta = (i as f32) * 0.31415;
            let phi = (i as f32) * 0.17320;
            let v = vec![theta.cos() * phi.sin(), theta.sin() * phi.sin(), phi.cos()];
            let n = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-8);
            v.into_iter().map(|x| x / n).collect()
        })
        .collect();

    let dir = test_dir("tiny-fixture");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    let mut ids = Vec::with_capacity(vectors.len());
    for v in &vectors {
        let id = db
            .create_node_with(
                &["Doc".to_string()],
                &PropertyMap::from([("embedding".to_string(), PropertyValue::Vector(v.clone()))]),
            )
            .expect("create node");
        ids.push(id);
    }

    db.create_vector_index(
        "embedding_idx",
        Some("Doc"),
        "embedding",
        3,
        VectorDistanceMetric::Cosine,
    )
    .expect("create vector index");

    // Query near vectors[7].
    let query = vectors[7].clone();

    let got = db
        .vector_search("embedding_idx", &query, 5, None)
        .expect("vector_search");

    // Hand-rolled brute force reference.
    let mut expected: Vec<(u64, f32)> = ids
        .iter()
        .copied()
        .zip(vectors.iter())
        .map(|(id, v)| (id, cosine_distance(&query, v)))
        .collect();
    expected.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
    expected.truncate(5);

    assert_eq!(
        got.len(),
        expected.len(),
        "top-k length mismatch: got {:?} expected {:?}",
        got,
        expected
    );
    for (i, ((g_id, g_score), (e_id, e_score))) in got.iter().zip(expected.iter()).enumerate() {
        assert_eq!(
            g_id, e_id,
            "top-{i} node_id mismatch: got {g_id} expected {e_id}"
        );
        assert!(
            (g_score - e_score).abs() < 1e-6,
            "top-{i} score mismatch: got {g_score} expected {e_score}"
        );
    }

    let _ = fs::remove_dir_all(&dir);
}
