//! RED test for task `unwind-in-core`, gate (d)(2) in PLAN.md §4.
//!
//! `UNWIND range(1, 5) AS i RETURN i` must produce 5 rows with
//! `i = 1, 2, 3, 4, 5` in order. The `range()` builtin already returns
//! `PropertyValue::List(Vec<PropertyValue::I64>)` from the core
//! expression evaluator (see `crates/ogdb-core/src/lib.rs:15835–15873`),
//! so the only missing piece is the `PhysicalUnwind` operator that
//! turns that list into output rows.
//!
//! Today this test fails at `Database::query` with
//! `physical planning for UNWIND is not implemented yet`.

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
        "ogdb-unwind-range2-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn unwind_range_two_arg_inclusive_yields_five_rows() {
    let path = test_db_path("range2");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let result = db
        .query("UNWIND range(1, 5) AS i RETURN i")
        .expect("UNWIND range(A, B) must succeed once core planner supports it");

    assert_eq!(
        result.row_count(),
        5,
        "range(1, 5) is inclusive on both ends → 5 rows; got {}",
        result.row_count()
    );

    let values = result
        .to_rows()
        .iter()
        .map(|row| row.get("i").cloned())
        .collect::<Vec<_>>();
    assert_eq!(
        values,
        (1..=5)
            .map(|v| Some(PropertyValue::I64(v)))
            .collect::<Vec<_>>(),
        "range(1, 5) must yield 1,2,3,4,5 in order; got {values:?}"
    );
}
