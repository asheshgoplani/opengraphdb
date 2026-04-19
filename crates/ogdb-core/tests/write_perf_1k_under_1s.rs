//! RED test for task `fix-write-perf`.
//!
//! Inserting 1,000 empty nodes in a single write transaction must finish under
//! 1 second of wall-clock time. On the unfixed code path this takes ~170 s
//! because `apply_node_metadata` rewrites and fsyncs `<db>-meta.json` on every
//! `create_node` call. See `.planning/fix-write-perf/PLAN.md` §4.1.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-write-perf-1k-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

#[test]
fn inserts_1k_empty_nodes_in_single_txn_under_1_second() {
    // Release mode only: debug builds are legitimately several times slower and
    // should not trigger this gate. The TDD loop runs this test with `--release`.
    if cfg!(debug_assertions) {
        eprintln!(
            "skipping write_perf_1k_under_1s in debug build; run with `cargo test --release`"
        );
        return;
    }

    let dir = test_dir("bench");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    const N: u64 = 1_000;
    let deadline = Duration::from_secs(1);

    let started = Instant::now();
    {
        let mut tx = db.begin_write();
        for _ in 0..N {
            tx.create_node().expect("create node");
        }
        tx.commit().expect("commit txn");
    }
    let elapsed = started.elapsed();

    assert!(
        elapsed < deadline,
        "1,000-node insert took {:?} (deadline {:?}); write path is O(N) per op — \
         see .planning/fix-write-perf/PLAN.md §3 (hop 6: sync_meta on every create_node)",
        elapsed,
        deadline,
    );
}
