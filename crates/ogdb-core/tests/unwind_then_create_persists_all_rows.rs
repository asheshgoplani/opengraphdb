//! RED test for task `unwind-in-core`, gate (d)(5) in PLAN.md §4.
//!
//! `UNWIND range(1, 7) AS i CREATE (:Person {id: i})` must persist 7
//! nodes with ids 1..=7. This mirrors the observable contract that the
//! CLI regression test
//! `query_command_unwind_range_create_persists_all_nodes` at
//! `crates/ogdb-cli/src/lib.rs:10020–10066` asserts via the CLI
//! string-desugar today. After Phase 3 + Phase 5 this same contract is
//! serviced by the core `PhysicalUnwind` operator — and the CLI
//! desugar is deleted — so the behaviour is transport-independent.
//!
//! Today this test fails at `Database::query` with
//! `physical planning for UNWIND is not implemented yet`. The CLI
//! regression test hides the failure by rewriting the query string
//! *above* the core engine; this test exercises the core engine
//! directly and therefore sees the real gap.

use std::collections::BTreeSet;
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
        "ogdb-unwind-create-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn unwind_then_create_persists_all_seven_nodes() {
    let path = test_db_path("persist");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    db.query("UNWIND range(1, 7) AS i CREATE (:Person {id: i})")
        .expect(
            "UNWIND range(1,7) AS i CREATE (:Person {id:i}) must succeed once core planner supports it",
        );

    let result = db
        .query("MATCH (n:Person) RETURN n.id AS id")
        .expect("MATCH after UNWIND+CREATE must succeed");

    assert_eq!(
        result.row_count(),
        7,
        "UNWIND range(1,7) AS i CREATE (:Person {{id:i}}) must persist 7 :Person nodes; got {}",
        result.row_count()
    );

    let ids = result
        .to_rows()
        .iter()
        .filter_map(|row| match row.get("id").cloned() {
            Some(PropertyValue::I64(value)) => Some(value),
            _ => None,
        })
        .collect::<BTreeSet<_>>();
    assert_eq!(
        ids,
        (1i64..=7).collect::<BTreeSet<_>>(),
        "each unwound i must be bound into the CREATE pattern's property map; got {ids:?}"
    );
}
