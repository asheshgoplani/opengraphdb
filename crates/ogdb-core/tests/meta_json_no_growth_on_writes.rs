//! RED test for task `fix-write-perf`.
//!
//! Encodes the invariant "meta.json is persisted on commit, not on every op".
//! Currently `apply_node_metadata` calls `sync_meta` on every `create_node`,
//! which truncates and rewrites `<db>-meta.json`, bumping its mtime.
//! See `.planning/fix-write-perf/PLAN.md` §4.3.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-meta-no-growth-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

fn meta_path_for(db_path: &std::path::Path) -> PathBuf {
    let mut name = db_path.as_os_str().to_os_string();
    name.push("-meta.json");
    PathBuf::from(name)
}

#[test]
fn meta_json_not_rewritten_mid_transaction() {
    let dir = test_dir("mtime");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    let meta_path = meta_path_for(&db_path);
    assert!(
        meta_path.exists(),
        "expected meta sidecar at {:?} after Database::init",
        meta_path,
    );

    // Pause so the post-init mtime can be meaningfully compared against later
    // stat calls — filesystems with coarse mtime resolution (e.g., HFS+) would
    // otherwise produce false passes.
    thread::sleep(Duration::from_millis(50));
    let mtime_before = fs::metadata(&meta_path)
        .expect("stat meta.json")
        .modified()
        .expect("meta.json mtime");

    const N: usize = 100;
    let mtime_during = {
        let mut tx = db.begin_write();
        for _ in 0..N {
            tx.create_node().expect("create node");
        }
        // Read mtime BEFORE committing. If meta.json is persisted only at
        // commit, mtime should still equal `mtime_before`.
        let snapshot = fs::metadata(&meta_path)
            .expect("stat meta.json mid-txn")
            .modified()
            .expect("meta.json mtime mid-txn");
        tx.commit().expect("commit txn");
        snapshot
    };

    assert_eq!(
        mtime_before, mtime_during,
        "meta.json was rewritten mid-transaction ({} create_node calls before commit); \
         expected persistence to be deferred to commit. See .planning/fix-write-perf/PLAN.md §5.a",
        N,
    );
}
