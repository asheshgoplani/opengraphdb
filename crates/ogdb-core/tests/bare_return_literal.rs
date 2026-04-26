//! RED test for the bare-RETURN-literal row-count bug surfaced by the
//! live-ui-smoke run on 2026-04-26.
//!
//! Reproducer (HTTP):
//!
//! ```text
//! curl -X POST http://localhost:18080/query \
//!     -H 'Content-Type: application/json' \
//!     -d '{"query":"RETURN 1 AS x"}'
//!     -> row_count: 0   (BUG; should be 1 row with x=1)
//!
//! curl -X POST http://localhost:18080/query \
//!     -H 'Content-Type: application/json' \
//!     -d '{"query":"UNWIND [1] AS x RETURN x"}'
//!     -> 1 row    (OK; UNWIND-then-RETURN already synthesizes the source row)
//! ```
//!
//! Per Cypher semantics a query that consists only of a `RETURN` clause
//! must produce exactly one synthetic row regardless of graph state — the
//! projection runs once over an implicit single empty source row. Today
//! ogdb-core's planner falls back to `LogicalPlan::Scan { label: None,
//! variable: None }` as the projection input (see
//! `crates/ogdb-core/src/lib.rs` in `aggregate_and_project`), and the
//! executor scans the (empty) node table, so the projection never fires.
//!
//! These tests pin the contract so the executor cannot quietly regress
//! once the fix lands.
//!
//! Parallel-paths audit (must stay consistent after the fix):
//!   - bare RETURN literal               (this file — was 0 rows, must be 1)
//!   - bare RETURN multi-projection      (this file — was 0 rows, must be 1)
//!   - RETURN after UNWIND               (already green, see
//!     `unwind_literal_list.rs`)
//!   - RETURN after MATCH (empty graph)  (must stay 0 rows — the MATCH
//!     genuinely produced no source rows; this test pins that).

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
        "ogdb-bare-return-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn bare_return_single_literal_yields_one_row() {
    let path = test_db_path("single");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let result = db
        .query("RETURN 1 AS x")
        .expect("bare RETURN of an integer literal must succeed");

    assert_eq!(
        result.row_count(),
        1,
        "RETURN 1 AS x must produce exactly 1 row regardless of graph \
         state; got {} (this is the live-ui-smoke 2026-04-26 bug — the \
         executor was short-circuiting because the synthetic Scan over an \
         empty graph produced 0 source rows)",
        result.row_count()
    );
    assert!(
        result.columns.iter().any(|c| c == "x"),
        "RETURN 1 AS x must expose column 'x'; columns: {:?}",
        result.columns
    );

    let rows = result.to_rows();
    assert_eq!(
        rows.len(),
        1,
        "rows() must mirror row_count(); got {} rows",
        rows.len()
    );
    assert_eq!(
        rows[0].get("x").cloned(),
        Some(PropertyValue::I64(1)),
        "row.x must be I64(1) — the projected literal value; got {:?}",
        rows[0].get("x")
    );
}

#[test]
fn bare_return_multi_projection_yields_one_row_with_all_columns() {
    let path = test_db_path("multi");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let result = db
        .query("RETURN 1 AS a, 2 AS b, 3 AS c")
        .expect("bare RETURN with multiple projections must succeed");

    assert_eq!(
        result.row_count(),
        1,
        "RETURN 1 AS a, 2 AS b, 3 AS c must produce exactly 1 row; got {}",
        result.row_count()
    );

    let rows = result.to_rows();
    assert_eq!(rows.len(), 1, "rows() must mirror row_count()");
    assert_eq!(
        rows[0].get("a").cloned(),
        Some(PropertyValue::I64(1)),
        "row.a must be I64(1); got {:?}",
        rows[0].get("a")
    );
    assert_eq!(
        rows[0].get("b").cloned(),
        Some(PropertyValue::I64(2)),
        "row.b must be I64(2); got {:?}",
        rows[0].get("b")
    );
    assert_eq!(
        rows[0].get("c").cloned(),
        Some(PropertyValue::I64(3)),
        "row.c must be I64(3); got {:?}",
        rows[0].get("c")
    );
}

#[test]
fn match_with_empty_graph_still_returns_zero_rows() {
    // Parallel-path guard: the bare-RETURN fix must NOT change the
    // semantics of `MATCH (n) RETURN ...` over an empty graph. MATCH
    // produced no source rows, so the projection legitimately sees
    // zero — Cypher returns 0 rows (not a synthetic row).
    let path = test_db_path("match-empty");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let result = db
        .query("MATCH (n) RETURN 1 AS x")
        .expect("MATCH ... RETURN over empty graph must succeed");

    assert_eq!(
        result.row_count(),
        0,
        "MATCH (n) RETURN 1 AS x on an empty graph must still return 0 \
         rows — the synthetic-single-row fix for bare RETURN must not \
         leak into the MATCH path; got {}",
        result.row_count()
    );
}
