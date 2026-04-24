//! RED/quality-floor test for task `hnsw-vector-index`, gate (1) in PLAN.md.
//!
//! On a 10,000-vector dataset at d=384, `Database::vector_search(...)` —
//! which Phase 3 replumbs onto the HNSW backend — must achieve recall@10
//! ≥ 0.95 against an independently-computed brute-force ground truth.
//!
//! Today this test passes trivially because the backend *is* brute force
//! (recall = 1.0). It is installed RED-first so that Phase 4 (HNSW
//! parameter tuning: `ef_construction`, `ef_search`, `M`) has a hard
//! machine-checkable acceptance criterion; any parameter choice that
//! drops recall below 0.95 will regress this test.
//!
//! The HNSW spec (Malkov & Yashunin 2016) reports recall@10 ≥ 0.95
//! achievable at N=10k, d=384 with `M=16`, `ef_construction=100`,
//! `ef_search ≈ 32–64` — which are `instant-distance`'s defaults plus a
//! small bump. Phase 4 picks the exact settings.
//!
//! Release-only: the test is intentionally compute-heavy (10k inserts +
//! 50 queries + 50 brute-force scans) so debug builds would dominate wall
//! time without shedding signal. Run with
//! `cargo test -p ogdb-core --release --test hnsw_recall_at_10_over_0_95_at_10k`.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric};

const N: usize = 10_000;
const D: usize = 384;
const QUERIES: usize = 50;
const K: usize = 10;
const RECALL_FLOOR: f64 = 0.95;

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-hnsw-{tag}-{}-{now}",
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
fn hnsw_recall_at_10_over_0_95_at_10k() {
    if cfg!(debug_assertions) {
        eprintln!(
            "skipping hnsw_recall_at_10_over_0_95_at_10k in debug build; \
             run with `cargo test -p ogdb-core --release --test hnsw_recall_at_10_over_0_95_at_10k`"
        );
        return;
    }

    let dir = test_dir("recall-10k");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    // Hold the corpus in memory so we can compute brute-force ground truth
    // without re-reading vectors from the DB (which would couple the gate
    // to the storage layer's visibility semantics).
    let mut corpus: Vec<(u64, Vec<f32>)> = Vec::with_capacity(N);
    for i in 0..N {
        let v = rand_unit_vec(i as u64, D);
        let id = db
            .create_node_with(
                &["Doc".to_string()],
                &PropertyMap::from([(
                    "embedding".to_string(),
                    PropertyValue::Vector(v.clone()),
                )]),
            )
            .expect("create node");
        corpus.push((id, v));
    }

    db.create_vector_index(
        "embedding_idx",
        Some("Doc"),
        "embedding",
        D,
        VectorDistanceMetric::Cosine,
    )
    .expect("create vector index");

    // Run QUERIES distinct query vectors. For each, compute:
    //   truth   = brute-force top-K (by cosine distance)
    //   got     = db.vector_search(...)  (HNSW once Phase 3 lands)
    // and accumulate |truth ∩ got| / K across queries.
    let mut total_hits: usize = 0;
    for qi in 0..QUERIES {
        let q = rand_unit_vec(1_000_000 + qi as u64, D);

        let mut truth: Vec<(u64, f32)> = corpus
            .iter()
            .map(|(id, v)| (*id, cosine_distance(&q, v)))
            .collect();
        truth.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
        truth.truncate(K);
        let truth_ids: std::collections::BTreeSet<u64> =
            truth.iter().map(|(id, _)| *id).collect();

        let got = db
            .vector_search("embedding_idx", &q, K, None)
            .expect("vector_search");
        for (id, _) in got {
            if truth_ids.contains(&id) {
                total_hits += 1;
            }
        }
    }

    let recall = total_hits as f64 / (QUERIES * K) as f64;
    assert!(
        recall >= RECALL_FLOOR,
        "recall@{K} = {recall:.3} < floor {RECALL_FLOOR}; \
         HNSW parameters need tuning (see Phase 4 in PLAN.md)"
    );

    let _ = fs::remove_dir_all(&dir);
}
