#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Hermetic: each iteration gets a fresh tempdir so the per-iter DB
    // state never leaks between corpus entries. See PLAN §3.2 for why
    // per-iteration (not per-process) is load-bearing.
    let Ok(tmp) = tempfile::tempdir() else {
        return;
    };
    let db_path = tmp.path().join("fuzz.ogdb");

    // Use the public init API to lay down a valid sidecar set. Any
    // failure here (disk flake, permission) is not the WAL reader's
    // fault — bail and let libFuzzer pick a new mutation.
    let db = match ogdb_core::Database::init(&db_path, ogdb_core::Header::default_v1()) {
        Ok(db) => db,
        Err(_) => return,
    };
    let wal = db.wal_path();
    drop(db); // release file handles before overwriting the WAL

    if std::fs::write(&wal, data).is_err() {
        return;
    }

    // Re-open through the public surface. This runs the private
    // recover_from_wal_bytes pipeline over `data` verbatim. Ok(_) and
    // any Err(_) are both acceptable; only a panic is a bug.
    let _ = ogdb_core::Database::open(&db_path);
});
