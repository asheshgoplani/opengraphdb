//! Caveat regression test for audit finding 2.3.
//!
//! OpenGraphDB advertises **Snapshot Isolation** (SI), not Serializable. This
//! test pins the current SI guarantees for index-backed label scans so they
//! cannot silently regress.
//!
//! Contract under test:
//! - `ReadSnapshot::find_nodes_by_label` goes through the snapshot-aware
//!   `find_nodes_by_label_at`, which walks `node_label_versions` chains and
//!   filters with `is_node_visible_at`. A reader holding an older snapshot
//!   must NOT observe a label added by a writer that committed after the
//!   snapshot was taken.
//! - `Database::find_nodes_by_label` (the non-snapshot API) always reflects
//!   the current committed state. That is documented behavior in
//!   `SPEC.md` §4.3 "Isolation level", not a violation.
//!
//! If a future change routes `ReadSnapshot::find_nodes_by_label` through a
//! materialized index rebuilt to reflect the latest committed state without
//! per-row version filtering (the risk the audit calls out), the first test
//! will fail — and so will the SI contract in `SPEC.md`.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Barrier};
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, SharedDatabase};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-si-phantom-read-caveat-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

#[test]
fn read_snapshot_find_nodes_by_label_is_snapshot_isolated() {
    let dir = test_dir("read-snapshot-isolation");
    let db_path = dir.join("graph.ogdb");

    let shared = Arc::new(
        SharedDatabase::init(&db_path, Header::default_v1()).expect("init shared database"),
    );

    // Baseline: create node 0 with label "Phantom", commit.
    shared
        .with_write_transaction(|mut tx| {
            let _ = tx.create_node_with(vec!["Phantom".to_string()], PropertyMap::new())?;
            tx.commit()
        })
        .expect("baseline commit");

    // Coordinate reader and writer threads so the reader captures its snapshot
    // BEFORE the writer commits, and re-queries AFTER the writer commits.
    // SharedDatabase serializes read/write via RwLock, so we can't hold a
    // ReadSnapshot while a writer proceeds — instead, capture the observation
    // inside the reader thread around a barrier with a writer thread.
    let pre_write_barrier = Arc::new(Barrier::new(2));
    let post_write_barrier = Arc::new(Barrier::new(2));

    let reader_shared = Arc::clone(&shared);
    let reader_pre = Arc::clone(&pre_write_barrier);
    let reader_post = Arc::clone(&post_write_barrier);
    let reader = std::thread::spawn(move || {
        // Phase A: take snapshot, record observation.
        let snap_a = reader_shared.read_snapshot().expect("snapshot A");
        let observed_a = snap_a.find_nodes_by_label("Phantom");
        let snapshot_txn_a = snap_a.snapshot_txn_id();
        drop(snap_a);

        // Release writer.
        reader_pre.wait();
        // Wait for writer to finish.
        reader_post.wait();

        // Phase B: after writer committed, an older snapshot_txn_id would have
        // shown only `observed_a`. Take a NEW snapshot at current time; it
        // must see BOTH nodes (which confirms the writer did land).
        let snap_b = reader_shared.read_snapshot().expect("snapshot B");
        let observed_b = snap_b.find_nodes_by_label("Phantom");
        let snapshot_txn_b = snap_b.snapshot_txn_id();
        drop(snap_b);

        (observed_a, snapshot_txn_a, observed_b, snapshot_txn_b)
    });

    let writer_shared = Arc::clone(&shared);
    let writer_pre = Arc::clone(&pre_write_barrier);
    let writer_post = Arc::clone(&post_write_barrier);
    let writer = std::thread::spawn(move || {
        // Wait for reader to finish snapshot A before committing.
        writer_pre.wait();
        writer_shared
            .with_write_transaction(|mut tx| {
                let _ = tx.create_node_with(vec!["Phantom".to_string()], PropertyMap::new())?;
                tx.commit()
            })
            .expect("concurrent writer commit");
        writer_post.wait();
    });

    let (observed_a, snap_txn_a, observed_b, snap_txn_b) = reader.join().expect("reader thread");
    writer.join().expect("writer thread");

    assert_eq!(
        observed_a.len(),
        1,
        "snapshot A (taken BEFORE concurrent writer) must see exactly 1 Phantom node; got {observed_a:?}"
    );
    assert_eq!(
        observed_b.len(),
        2,
        "snapshot B (taken AFTER writer committed) must see 2 Phantom nodes; got {observed_b:?}"
    );
    assert!(
        snap_txn_b > snap_txn_a,
        "snapshot B's snapshot_txn_id must advance past A's (A={snap_txn_a}, B={snap_txn_b})"
    );
    assert_ne!(
        observed_a, observed_b,
        "the two snapshots must have seen different sets — proving the snapshot_txn_id \
         is actually threaded into find_nodes_by_label_at"
    );
}

#[test]
fn non_snapshot_database_find_nodes_by_label_reflects_current_state() {
    // Caveat: `Database::find_nodes_by_label` (no snapshot) always reflects
    // the current committed state. Readers needing SI must go through
    // `ReadSnapshot`. Pinned here so the caveat cannot drift silently.
    let dir = test_dir("non-snapshot-reflects-current");
    let db_path = dir.join("graph.ogdb");

    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    {
        let mut tx = db.begin_write();
        let _ = tx
            .create_node_with(vec!["Ephemeral".to_string()], PropertyMap::new())
            .expect("create node");
        tx.commit().expect("commit");
    }

    assert_eq!(
        db.find_nodes_by_label("Ephemeral").len(),
        1,
        "Database::find_nodes_by_label reflects current state"
    );

    {
        let mut tx = db.begin_write();
        let _ = tx
            .create_node_with(vec!["Ephemeral".to_string()], PropertyMap::new())
            .expect("create second node");
        tx.commit().expect("commit");
    }

    assert_eq!(
        db.find_nodes_by_label("Ephemeral").len(),
        2,
        "Database::find_nodes_by_label reflects current state after 2nd commit"
    );
}
