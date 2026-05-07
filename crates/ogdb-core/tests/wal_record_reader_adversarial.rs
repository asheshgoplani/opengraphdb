//! Regression test for the `fuzz_wal_record_reader` finding (libfuzzer
//! status 70 / timeout-a882a14… in nightly run 25479643932).
//!
//! The crash input is 18 bytes:
//!
//! ```text
//! 4f 47 57 41 4c 30 30 31  "OGWAL001" magic
//! 01                       WAL_RECORD_CREATE_NODE (v1) tag
//! 2a 00 00 00 00 32 00 00  node_id u64-le ≈ 5.5e13
//! ```
//!
//! Without bounds, `replay_wal_create_node` happily padded the gap from
//! `next_node_id = 0` up to ~5.5×10¹³ one node at a time, locking up the
//! reader long enough for libfuzzer to call it a timeout (and in practice
//! exhausting RAM). Any caller of `Database::open` is reachable from this
//! path, so a malformed sidecar/WAL on disk turns into a denial-of-service
//! at every open.
//!
//! After the fix, `recover_from_wal_bytes` rejects the input with
//! `DbError::Corrupt(..)` quickly (microseconds). The test wraps
//! `Database::open` in a thread with a 5 s recv timeout so a regression
//! presents as a fast test failure rather than an indefinite CI hang.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header};

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-wal-adversarial-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

/// Exact bytes of `timeout-a882a1409ae16580fbf0b8c255b06f94929540fc` from the
/// fuzz-corpus-fuzz_wal_record_reader artifact.
const TIMEOUT_FUZZ_INPUT: &[u8] = &[
    0x4f, 0x47, 0x57, 0x41, 0x4c, 0x30, 0x30, 0x31, // "OGWAL001"
    0x01, // WAL_RECORD_CREATE_NODE
    0x2a, 0x00, 0x00, 0x00, 0x00, 0x32, 0x00, 0x00, // node_id = 0x000032000000002A
];

#[test]
fn database_open_rejects_create_node_record_with_unbounded_id_gap() {
    let dir = test_dir("create-node-gap");
    let db_path = dir.join("graph.ogdb");

    {
        let _db = Database::init(&db_path, Header::default_v1()).expect("init db");
    }

    let wal_path = {
        let db = Database::open(&db_path).expect("reopen fresh db");
        db.wal_path()
    };
    fs::write(&wal_path, TIMEOUT_FUZZ_INPUT).expect("inject adversarial wal");

    let (tx, rx) = mpsc::channel::<Result<bool, String>>();
    let db_path_thread = db_path.clone();
    thread::spawn(move || {
        let outcome = Database::open(&db_path_thread)
            .map(|_| true)
            .map_err(|e| format!("{e:?}"));
        let _ = tx.send(outcome);
    });

    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(_)) => panic!(
            "Database::open accepted adversarial WAL with ~5.5e13 node_id gap; \
             it must reject as Corrupt"
        ),
        Ok(Err(_corrupt)) => {
            // Expected: rejected fast with DbError::Corrupt. Pass.
        }
        Err(mpsc::RecvTimeoutError::Timeout) => panic!(
            "Database::open hung for >5s on adversarial WAL — \
             replay_wal_create_node gap cap regression (fuzz finding \
             timeout-a882a14…). Without the cap the pad loop runs ~5.5×10¹³ \
             iterations."
        ),
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            panic!("worker thread panicked while opening adversarial WAL");
        }
    }
}

#[test]
fn database_open_rejects_create_node_record_with_max_u64_id() {
    let dir = test_dir("max-u64");
    let db_path = dir.join("graph.ogdb");

    {
        let _db = Database::init(&db_path, Header::default_v1()).expect("init db");
    }

    let wal_path = {
        let db = Database::open(&db_path).expect("reopen fresh db");
        db.wal_path()
    };

    let mut bytes = Vec::with_capacity(8 + 1 + 8);
    bytes.extend_from_slice(b"OGWAL001");
    bytes.push(0x01); // WAL_RECORD_CREATE_NODE v1
    bytes.extend_from_slice(&u64::MAX.to_le_bytes());
    fs::write(&wal_path, &bytes).expect("inject u64::MAX wal");

    let (tx, rx) = mpsc::channel::<Result<bool, String>>();
    let db_path_thread = db_path.clone();
    thread::spawn(move || {
        let outcome = Database::open(&db_path_thread)
            .map(|_| true)
            .map_err(|e| format!("{e:?}"));
        let _ = tx.send(outcome);
    });

    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(_)) => panic!("Database::open accepted node_id = u64::MAX; must reject as Corrupt"),
        Ok(Err(_)) => {
            // Pass.
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            panic!("Database::open hung for >5s on node_id = u64::MAX — gap cap regression")
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            panic!("worker thread panicked while opening adversarial WAL");
        }
    }
}
