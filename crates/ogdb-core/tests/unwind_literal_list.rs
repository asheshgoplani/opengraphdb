//! RED test for task `unwind-in-core`, gate (d)(1) in PLAN.md §4.
//!
//! `UNWIND [1,2,3] AS i RETURN i` must produce three rows, with column
//! `i` bound to the integers 1, 2, and 3 in order. This is the simplest
//! UNWIND shape: a list literal, no input, no downstream CREATE/MATCH.
//!
//! Today this test fails at `Database::query` with
//! `physical planning for UNWIND is not implemented yet`
//! (`crates/ogdb-core/src/lib.rs:4934`). After Phase 3 adds
//! `PhysicalPlan::PhysicalUnwind` + the executor branch, this test goes
//! green.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyValue};

fn test_db_path(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-unwind-literal-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn unwind_literal_list_yields_three_rows_in_order() {
    let path = test_db_path("literal");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let result = db
        .query("UNWIND [1, 2, 3] AS i RETURN i")
        .expect("UNWIND over a list literal must succeed once core planner supports it");

    assert_eq!(
        result.row_count(),
        3,
        "UNWIND [1,2,3] AS i RETURN i must produce exactly 3 rows; got {}",
        result.row_count()
    );
    assert!(
        result.columns.iter().any(|c| c == "i"),
        "RETURN i must expose column 'i'; columns: {:?}",
        result.columns
    );

    let rows = result.to_rows();
    let values = rows
        .iter()
        .map(|row| row.get("i").cloned())
        .collect::<Vec<_>>();
    assert_eq!(
        values,
        vec![
            Some(PropertyValue::I64(1)),
            Some(PropertyValue::I64(2)),
            Some(PropertyValue::I64(3)),
        ],
        "UNWIND must bind `i` to each list element in order; got {values:?}"
    );
}
