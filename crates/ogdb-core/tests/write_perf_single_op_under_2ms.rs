//! RED test for task `fix-write-perf`.
//!
//! Single `create_node` inside an open transaction must have p50 latency < 2 ms.
//! Currently ~31 ms (dominated by meta.json pretty-serialize + fsync). See
//! `.planning/fix-write-perf/PLAN.md` §4.2.

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
        "ogdb-write-perf-single-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

#[test]
fn single_create_node_p50_under_2ms() {
    if cfg!(debug_assertions) {
        eprintln!(
            "skipping write_perf_single_op_under_2ms in debug build; run with `cargo test --release`"
        );
        return;
    }

    let dir = test_dir("p50");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    const ITERS: usize = 100;
    let mut samples: Vec<Duration> = Vec::with_capacity(ITERS);

    {
        let mut tx = db.begin_write();
        // Warm-up: one call outside the measurement loop to pay page-cache /
        // first-WAL-touch costs that aren't representative of steady-state per-op work.
        tx.create_node().expect("warm-up create node");

        for _ in 0..ITERS {
            let started = Instant::now();
            tx.create_node().expect("create node");
            samples.push(started.elapsed());
        }
        tx.commit().expect("commit txn");
    }

    samples.sort();
    let p50 = samples[ITERS / 2];
    let p99 = samples[(ITERS * 99) / 100];
    let threshold = Duration::from_millis(2);

    assert!(
        p50 < threshold,
        "p50 per-op latency was {:?} (threshold {:?}); p99={:?}. \
         The write path does a full `sync_meta` (JSON pretty-print + fsync of O(N) meta.json) \
         on every create_node — see .planning/fix-write-perf/PLAN.md §3 hop 6c",
        p50,
        threshold,
        p99,
    );
}
