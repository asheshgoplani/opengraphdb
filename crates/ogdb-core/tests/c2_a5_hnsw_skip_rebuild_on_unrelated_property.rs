//! C2-A5 (HIGH) regression pin.
//!
//! cycle-1's `node_changes` gate (eval Finding 2 fix) skipped the HNSW
//! rebuild when a transaction touched no nodes. That closed the
//! edge-only / no-op case. cycle-2 C2-A5 refines the gate further: when
//! the txn DOES touch nodes but the only property changes are on keys
//! the catalog doesn't index, the rebuild is still skippable. This test
//! pins the new behavior.
//!
//! Setup:
//!   * 300 Doc nodes carrying `embedding` (vector index target).
//!   * 1 vector index on (Doc, embedding).
//!
//! Acceptance:
//!   * Updating a non-indexed property (e.g. `last_modified`) on a Doc
//!     node MUST NOT rebuild the HNSW.
//!   * Updating the `embedding` property MUST still rebuild (sanity —
//!     we only suppress when truly safe).

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric};

const N_NODES: usize = 300; // > HNSW_MIN_N (256) so HNSW actually builds.
const D: usize = 32;

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-c2-a5-{tag}-{}-{now}",
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
fn vector_index_not_rebuilt_on_unrelated_property_change() {
    let dir = test_dir("unrelated-prop");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    let mut doc_ids = Vec::with_capacity(N_NODES);
    for i in 0..N_NODES {
        let v = rand_unit_vec(i as u64, D);
        let id = db
            .create_node_with(
                &["Doc".to_string()],
                &PropertyMap::from([("embedding".to_string(), PropertyValue::Vector(v))]),
            )
            .expect("create doc");
        doc_ids.push(id);
    }

    db.create_vector_index(
        "embedding_idx",
        Some("Doc"),
        "embedding",
        D,
        VectorDistanceMetric::Cosine,
    )
    .expect("create vector index");

    let baseline = db.vector_index_rebuilds_total();
    assert!(baseline >= 1, "vector index creation rebuilds at least once");

    // Update an unrelated property (`last_modified`) on 20 Doc nodes,
    // each in its own transaction. The catalog is not indexed on
    // last_modified, so the HNSW must NOT rebuild.
    for (i, id) in doc_ids.iter().take(20).enumerate() {
        let mut tx = db.begin_write();
        tx.set_node_properties(
            *id,
            PropertyMap::from([(
                "last_modified".to_string(),
                PropertyValue::I64(1_700_000_000 + i as i64),
            )]),
        )
        .expect("set last_modified");
        tx.commit().expect("commit unrelated-property txn");
    }

    let after_unrelated = db.vector_index_rebuilds_total();
    assert_eq!(
        after_unrelated, baseline,
        "C2-A5: 20 commits that mutated only `last_modified` (not in the \
         vector catalog) must NOT trigger an HNSW rebuild. \
         baseline={} after={}",
        baseline, after_unrelated
    );

    // Sanity: mutating the indexed property MUST still rebuild — we
    // only suppress when truly safe.
    {
        let mut tx = db.begin_write();
        let new_v = rand_unit_vec(98_765, D);
        tx.set_node_properties(
            doc_ids[0],
            PropertyMap::from([("embedding".to_string(), PropertyValue::Vector(new_v))]),
        )
        .expect("set embedding");
        tx.commit().expect("commit indexed-property txn");
    }
    let after_indexed = db.vector_index_rebuilds_total();
    assert!(
        after_indexed > after_unrelated,
        "a txn modifying the indexed `embedding` property MUST rebuild. \
         after_unrelated={} after_indexed={}",
        after_unrelated, after_indexed
    );
}
