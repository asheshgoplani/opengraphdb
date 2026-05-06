//! Phase B H-20: direct unit-style coverage for `Database::vector_search`.
//!
//! Existing tests cover HNSW recall@10 / latency on 10k vectors and a
//! brute-force-equivalence fixture; this test fills the gap of pinning the
//! tightest possible contract — a hand-picked 5-vector fixture where the
//! identity of the top-1 result and its score (cosine distance) are both
//! computed in the test and asserted within a tight tolerance.
//!
//! Signature pinned (lib.rs:12430):
//!   `fn vector_search(&self, index_name, query_vector, k, metric_override)
//!     -> Result<Vec<(u64, f32)>, DbError>`.

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
    let dir = env::temp_dir().join(format!("ogdb-vsd-{tag}-{}-{now}", std::process::id()));
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
fn vector_search_returns_nearest_and_score_within_tolerance() {
    // Five known unit vectors in 3-D — small enough that brute-force
    // distances are visually verifiable, large enough that "nearest-1"
    // is a meaningful claim.
    let vectors: Vec<Vec<f32>> = vec![
        vec![1.0, 0.0, 0.0], // axis-x
        vec![0.0, 1.0, 0.0], // axis-y
        vec![0.0, 0.0, 1.0], // axis-z
        vec![0.7071, 0.7071, 0.0],
        vec![0.5773, 0.5773, 0.5773],
    ];

    let dir = test_dir("nearest-1");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    let mut ids = Vec::with_capacity(vectors.len());
    for v in &vectors {
        let id = db
            .create_node_with(
                &["Doc".to_string()],
                &PropertyMap::from([(
                    "embedding".to_string(),
                    PropertyValue::Vector(v.clone()),
                )]),
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

    // Query is identical to vectors[3] (the (0.7071, 0.7071, 0) diagonal),
    // so the top-1 nearest must be ids[3] with cosine distance ≈ 0.0.
    let query = vectors[3].clone();
    let hits = db
        .vector_search("embedding_idx", &query, 1, None)
        .expect("vector_search");

    assert_eq!(hits.len(), 1, "k=1 must return exactly one hit");
    let (top_id, top_score) = hits[0];
    assert_eq!(
        top_id, ids[3],
        "top-1 must be the seeded vector identical to the query (id={}, got id={})",
        ids[3], top_id
    );
    let expected = cosine_distance(&query, &vectors[3]);
    assert!(
        (top_score - expected).abs() < 1e-5,
        "top-1 score {top_score} should match brute-force cosine distance {expected} \
         (tolerance 1e-5)"
    );
    // Score for an exact match must be effectively zero.
    assert!(
        top_score.abs() < 1e-4,
        "top-1 score for exact-match query must be ~0, got {top_score}"
    );

    let _ = fs::remove_dir_all(&dir);
}
