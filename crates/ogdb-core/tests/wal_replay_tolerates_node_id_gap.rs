//! Regression test for audit finding 2.2: WAL replay must be tolerant of a
//! node-id gap rather than aborting with `Corrupt("wal node id gap …")`.
//!
//! The gap scenario models interrupted recovery: a prior `Database::open`
//! crashed in the window between advancing the in-memory header and
//! `sync_header_now` completing. On the next open, the on-disk header lags
//! the WAL, so a naive replay sees `header.next_node_id < record.node_id`
//! and errors — leaving the DB un-openable until manual WAL surgery.
//!
//! After the fix, replay pads the gap with empty-label / empty-property
//! placeholders for the missing ids. The DB becomes openable and the
//! post-gap records apply normally.

use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-wal-replay-gap-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

/// Append a CREATE_NODE (v1) WAL record for `node_id` to the given WAL file.
fn append_wal_create_node_v1(wal_path: &std::path::Path, node_id: u64) {
    const WAL_RECORD_CREATE_NODE_V1: u8 = 1;
    let mut f = fs::OpenOptions::new()
        .append(true)
        .open(wal_path)
        .expect("open wal for append");
    f.write_all(&[WAL_RECORD_CREATE_NODE_V1]).expect("tag");
    f.write_all(&node_id.to_le_bytes()).expect("node_id");
    f.sync_data().expect("sync");
}

#[test]
fn wal_replay_fills_node_id_gap_instead_of_erroring() {
    let dir = test_dir("pad-gap");
    let db_path = dir.join("graph.ogdb");
    let wal_path = dir.join("graph.ogdb-wal");

    // Phase 1: init a fresh database. This creates the WAL header.
    {
        let _db = Database::init(&db_path, Header::default_v1()).expect("init db");
    }

    // Phase 2: corrupt the WAL by injecting CREATE_NODE records with a gap:
    // records for node_ids 5 and 6, with no records for 0..=4. This
    // simulates an interrupted-recovery window: the on-disk header said
    // next_node_id=0 but the WAL accumulated records claiming ids 5 and 6.
    append_wal_create_node_v1(&wal_path, 5);
    append_wal_create_node_v1(&wal_path, 6);

    // Phase 3: reopen. Replay must tolerate the gap (pad ids 0..=4 as empty
    // placeholders, then apply 5 and 6). Before the fix this failed with
    // `Corrupt("wal node id gap: expected=0, got=5")`.
    let db = Database::open(&db_path).expect("reopen must succeed across interrupted-recovery gap");

    // Phase 4: verify the padded + applied nodes are all present.
    assert_eq!(
        db.node_count(),
        7,
        "after gap-tolerant replay, node_count should be 7 (0..=4 padded + 5, 6 from WAL)"
    );

    // Phase 5: the padded nodes should exist with empty labels; the
    // end-of-gap nodes should also exist (no labels either — v1 WAL records
    // carry only node_id, so labels come from meta which is empty on this
    // gap path).
    for id in 0..7u64 {
        let labels = db
            .node_labels(id)
            .expect("node_labels for padded/applied id");
        assert!(
            labels.is_empty(),
            "v1 WAL gap-fill produces empty labels for node {id}; got {labels:?}"
        );
    }
}

#[test]
fn wal_replay_is_idempotent_on_second_replay() {
    // Idempotency invariant: replaying the same WAL records twice (e.g.,
    // recovery interrupted and restarted) must not duplicate nodes. This
    // was already the case via the `header.next_node_id > node_id` guard,
    // pinned here to catch regressions.
    let dir = test_dir("idempotent");
    let db_path = dir.join("graph.ogdb");
    let wal_path = dir.join("graph.ogdb-wal");

    {
        let _db = Database::init(&db_path, Header::default_v1()).expect("init db");
    }

    // Append 3 CREATE_NODE records.
    append_wal_create_node_v1(&wal_path, 0);
    append_wal_create_node_v1(&wal_path, 1);
    append_wal_create_node_v1(&wal_path, 2);

    // First reopen: replay the 3 records.
    {
        let db = Database::open(&db_path).expect("first replay");
        assert_eq!(db.node_count(), 3, "first replay applies 3 records");
    }

    // Second reopen: checkpoint would have truncated WAL, so re-append the
    // same records and reopen — the `>` guard should skip them.
    append_wal_create_node_v1(&wal_path, 0);
    append_wal_create_node_v1(&wal_path, 1);
    append_wal_create_node_v1(&wal_path, 2);

    let db = Database::open(&db_path).expect("idempotent second replay");
    assert_eq!(
        db.node_count(),
        3,
        "second replay of the same records must be idempotent (no duplicate nodes)"
    );
}
