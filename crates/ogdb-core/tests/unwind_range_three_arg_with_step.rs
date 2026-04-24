//! RED test for task `unwind-in-core`, gate (d)(3) in PLAN.md §4.
//!
//! `UNWIND range(0, 10, 2) AS i RETURN i` must produce 6 rows with
//! `i = 0, 2, 4, 6, 8, 10` in order. This is the shape the CLI
//! string-desugar at `crates/ogdb-cli/src/lib.rs:1887–1909`
//! explicitly does NOT handle (it parses `range(A, B)` only), so today
//! it fails uniformly on every transport — CLI and HTTP alike. After
//! Phase 3 adds `PhysicalUnwind`, every transport picks it up.
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
        "ogdb-unwind-range3-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn unwind_range_three_arg_with_step_yields_stride() {
    let path = test_db_path("range3");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let result = db
        .query("UNWIND range(0, 10, 2) AS i RETURN i")
        .expect("UNWIND range(A, B, step) must succeed once core planner supports it");

    assert_eq!(
        result.row_count(),
        6,
        "range(0, 10, 2) must yield 0,2,4,6,8,10 → 6 rows; got {}",
        result.row_count()
    );

    let values = result
        .to_rows()
        .iter()
        .map(|row| row.get("i").cloned())
        .collect::<Vec<_>>();
    assert_eq!(
        values,
        vec![0, 2, 4, 6, 8, 10]
            .into_iter()
            .map(|v| Some(PropertyValue::I64(v)))
            .collect::<Vec<_>>(),
        "range(0,10,2) must emit the stride in order; got {values:?}"
    );
}
