//! Codifies the durability contract introduced by `fix-write-perf` (the
//! deferred-sync-to-commit regime): committed writes survive a graceful
//! close + reopen, with labels intact.
//!
//! Contract under test:
//! 1. A transaction that commits N nodes with labels is authoritative —
//!    after closing the `Database` (dropping the value, releasing file
//!    handles) and reopening, all N nodes exist and their labels are
//!    observable.
//! 2. Node existence is guaranteed by the WAL: the per-commit
//!    `fdatasync` on `<db>-wal` makes every `CREATE_NODE` record durable
//!    even if the operating system has not yet flushed the kernel page
//!    cache entries written for `meta.json`, `props-meta.json`, or the
//!    `<db>.ogdb` header. `recover_from_wal` replays those records on
//!    open, so node count is recoverable from WAL alone.
//! 3. Labels are persisted in `meta.json`, which this fix writes at
//!    commit time **without `fdatasync`** (the write lands in the kernel
//!    page cache; see `Database::flush_deferred_meta` and
//!    `docs/IMPLEMENTATION-LOG.md` under `## fix-write-perf profile
//!    2026-04-19`). Because the Linux page cache is coherent across
//!    processes on the same filesystem, a subsequent `Database::open` in
//!    the same OS session reads the up-to-date meta bytes and observes
//!    the labels.
//!
//! This test therefore simulates a graceful-close power loss
//! (unmount-like: file handles dropped, no additional fsync). It does
//! NOT simulate a hard kernel reset — a true power failure that wipes
//! the page cache before its writeback can drop the labels written at
//! this commit. That stronger contract would require either (a) a WAL
//! record type that carries labels/properties or (b) an explicit
//! `fdatasync` on `meta.json` at commit; both are tracked as future
//! work (PLAN §5.c + `docs/IMPLEMENTATION-LOG.md` option (a)).
//!
//! See `ARCHITECTURE.md` File Model section for the authoritative
//! persistence-vs-recovery matrix.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-wal-replay-labels-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

#[test]
fn committed_nodes_and_labels_survive_drop_plus_reopen() {
    let dir = test_dir("labels");
    let db_path = dir.join("graph.ogdb");

    // Phase 1: open, create 10 nodes with labels {Foo, Bar}, commit.
    {
        let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");
        let mut tx = db.begin_write();
        for _ in 0..10 {
            tx.create_node_with(
                vec!["Foo".to_string(), "Bar".to_string()],
                Default::default(),
            )
            .expect("create node with labels");
        }
        let _summary = tx.commit().expect("commit txn");
        // `db` drops here — file handles close, no additional fsync.
    }

    // Phase 2: simulated graceful power loss — we do nothing between
    // drop and reopen. `Database::open` is the next actor on the
    // filesystem for this database.
    let db = Database::open(&db_path).expect("reopen db after simulated drop");

    // Phase 3: verify the existence contract (WAL-authoritative).
    assert_eq!(
        db.node_count(),
        10,
        "expected 10 committed nodes to survive reopen — node_count authoritative via WAL replay"
    );

    // Phase 4: verify the label contract (kernel-page-cache-authoritative
    // under graceful close; see module doc comment for caveats under hard
    // power loss).
    for node_id in 0..10u64 {
        let labels = db.node_labels(node_id).expect("read labels for node");
        let observed: BTreeSet<String> = labels.into_iter().collect();
        let expected: BTreeSet<String> =
            ["Bar".to_string(), "Foo".to_string()].into_iter().collect();
        assert_eq!(
            observed, expected,
            "labels for node {} should survive drop + reopen via deferred meta.json \
             written to the kernel page cache at commit (fix-write-perf 2026-04-19); \
             observed={:?}, expected={:?}",
            node_id, observed, expected
        );
    }
}
