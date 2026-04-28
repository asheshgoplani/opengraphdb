//! RED test for task `hnsw-vector-index`, gate (3) in PLAN.md.
//!
//! A vector-indexed DB must survive `drop(Database)` + `Database::open` and
//! return byte-identical top-k results for the same query vector after
//! reopen. This is the persistence gate: after Phase 6 wires HNSW into the
//! runtime, the on-disk sidecar (`<db>.ogdb.vecindex`) must be sufficient
//! to rebuild the same runtime HNSW graph (rebuild-on-load path) — the
//! scope contract forbids touching the WAL/storage format, so the HNSW
//! itself is *not* serialised; only the raw `(node_id, vector)` entries
//! are. This test proves that's enough.
//!
//! Today this passes on brute force because the sidecar already round-trips
//! entries. It is retained as a durability gate during the HNSW migration.
//! See `.planning/hnsw-vector-index/PLAN.md` §4.

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

// Deterministic pseudo-random unit vector in R^d seeded per-index.
fn rand_unit_vec(seed: u64, d: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(d);
    let mut s = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    for _ in 0..d {
        s = s
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let v = ((s >> 33) as u32) as f32 / u32::MAX as f32;
        out.push(v * 2.0 - 1.0);
    }
    let norm: f32 = out.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-8);
    for v in &mut out {
        *v /= norm;
    }
    out
}

#[test]
fn hnsw_survives_drop_and_reopen() {
    const N: usize = 200;
    const D: usize = 32;

    let dir = test_dir("drop-reopen");
    let db_path = dir.join("graph.ogdb");

    // ----- session 1: insert + index + snapshot -----
    let query = rand_unit_vec(999_999, D);
    let before: Vec<(u64, f32)>;
    {
        let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");
        for i in 0..N {
            let v = rand_unit_vec(i as u64, D);
            db.create_node_with(
                &["Doc".to_string()],
                &PropertyMap::from([("embedding".to_string(), PropertyValue::Vector(v))]),
            )
            .expect("create node");
        }
        db.create_vector_index(
            "embedding_idx",
            Some("Doc"),
            "embedding",
            D,
            VectorDistanceMetric::Cosine,
        )
        .expect("create vector index");
        // Optional explicit checkpoint — ensure main DB + WAL are flushed.
        db.checkpoint().ok();
        before = db
            .vector_search("embedding_idx", &query, 10, None)
            .expect("vector_search pre-reopen");
        // `db` dropped here.
    }

    // ----- session 2: reopen and re-query -----
    let db = Database::open(&db_path).expect("reopen db");
    let after = db
        .vector_search("embedding_idx", &query, 10, None)
        .expect("vector_search post-reopen");

    assert_eq!(
        before.len(),
        after.len(),
        "top-k length differs across reopen"
    );
    for (i, ((b_id, b_score), (a_id, a_score))) in before.iter().zip(after.iter()).enumerate() {
        assert_eq!(
            b_id, a_id,
            "top-{i} node_id mismatch across reopen: before={b_id} after={a_id}"
        );
        assert!(
            (b_score - a_score).abs() < 1e-6,
            "top-{i} score mismatch across reopen: before={b_score} after={a_score}"
        );
    }

    let _ = fs::remove_dir_all(&dir);
}
