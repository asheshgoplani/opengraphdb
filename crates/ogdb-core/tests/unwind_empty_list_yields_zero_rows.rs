//! RED test for task `unwind-in-core`, gate (d)(6) in PLAN.md §4.
//!
//! `UNWIND [] AS i RETURN i` must return zero rows without error —
//! this is the openCypher semantics for an empty driving list.
//! Concretely:
//!
//!   UNWIND []  AS i RETURN i   → 0 rows, no error
//!
//! Today this test fails at `Database::query` with
//! `physical planning for UNWIND is not implemented yet` before ever
//! reaching the empty-list branch. After Phase 3, the
//! `PhysicalUnwind` executor emits zero rows when the RHS evaluates
//! to an empty list, and the RETURN downstream passes the empty
//! row-set through unchanged.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header};

fn test_db_path(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-unwind-empty-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn unwind_empty_list_returns_no_rows_and_no_error() {
    let path = test_db_path("empty");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let result = db
        .query("UNWIND [] AS i RETURN i")
        .expect("UNWIND [] AS i RETURN i must succeed with zero rows, not error");

    assert_eq!(
        result.row_count(),
        0,
        "UNWIND [] must yield zero output rows; got {}",
        result.row_count()
    );
}
