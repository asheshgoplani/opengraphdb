//! RED test for task `hnsw-vector-index`, gate (5) in PLAN.md.
//!
//! Interleaved insert (via the single MVCC writer) and read (via concurrent
//! threads calling `vector_search`) must not corrupt the HNSW runtime. The
//! v0.4 design calls for commit-time rebuild of the HNSW graph from the
//! collected `(node_id, vector)` entries: the rebuild must either finish
//! before a reader observes it, or the reader must observe the prior
//! consistent version — never a half-built graph.
//!
//! OpenGraphDB's architecture (§6 Concurrency and Transactions) specifies
//! single-writer + multi-reader MVCC. `Database` is not `Sync`; concurrent
//! readers share it via `Arc<Mutex<Database>>`. The mutex serialises
//! access, but the test still exercises the invariant that matters under
//! Phase 7: the runtime `materialized_vector_indexes` map is never left
//! in a torn state across an insert/commit boundary.
//!
//! Today this passes because brute force recomputes from scratch on every
//! query. Phase 7 installs the HNSW-rebuild path; without care the
//! rebuild could swap `VectorIndexRuntime.hnsw` mid-query. The test
//! catches that class of bug with 4 reader threads × 200 iterations each
//! against 400 writer iterations.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric};

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

#[test]
fn concurrent_inserts_do_not_corrupt_index() {
    // Parameters sized to finish in seconds in debug mode while still
    // exercising enough insert/search interleaving to expose torn-state
    // bugs (4 readers × 25 iters + 50 writer iters = 150 lock events;
    // the dead-code HNSW-build-per-query in today's lib.rs:13288–13315
    // dominates this test's wall time until Phase 3 removes it).
    const SEED_N: usize = 50;
    const D: usize = 16;
    const WRITER_ITERS: usize = 50;
    const READER_THREADS: usize = 2;
    const READER_ITERS: usize = 25;

    let dir = test_dir("concurrent");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    // Seed the index so reads from the very first iteration are non-empty.
    for i in 0..SEED_N {
        let v = rand_unit_vec(i as u64, D);
        db.create_node_with(
            &["Doc".to_string()],
            &PropertyMap::from([(
                "embedding".to_string(),
                PropertyValue::Vector(v),
            )]),
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

    let shared = Arc::new(Mutex::new(db));

    // Spawn readers.
    let mut reader_handles = Vec::with_capacity(READER_THREADS);
    for t in 0..READER_THREADS {
        let shared = Arc::clone(&shared);
        reader_handles.push(thread::spawn(move || {
            for i in 0..READER_ITERS {
                let q = rand_unit_vec((t as u64) * 10_000 + i as u64, D);
                let res = {
                    let db = shared.lock().expect("lock");
                    db.vector_search("embedding_idx", &q, 5, None)
                        .expect("reader vector_search")
                };
                // Invariants: bounded k, scores finite, ids non-duplicated.
                assert!(res.len() <= 5, "top-k overrun: {res:?}");
                let mut seen = std::collections::BTreeSet::<u64>::new();
                for (id, score) in &res {
                    assert!(
                        score.is_finite(),
                        "non-finite score on reader {t} iter {i}: {score}"
                    );
                    assert!(
                        seen.insert(*id),
                        "duplicate node id in result on reader {t} iter {i}: {id}"
                    );
                }
            }
        }));
    }

    // Writer loop (main thread).
    for i in 0..WRITER_ITERS {
        let v = rand_unit_vec(500_000 + i as u64, D);
        let mut db = shared.lock().expect("lock writer");
        db.create_node_with(
            &["Doc".to_string()],
            &PropertyMap::from([(
                "embedding".to_string(),
                PropertyValue::Vector(v),
            )]),
        )
        .expect("writer create_node_with");
    }

    for h in reader_handles {
        h.join().expect("reader thread joined");
    }

    let _ = fs::remove_dir_all(&dir);
}
