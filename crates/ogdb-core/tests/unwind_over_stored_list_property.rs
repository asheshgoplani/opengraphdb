//! RED test for task `unwind-in-core`, gate (d)(4) in PLAN.md §4.
//!
//! A stored list property must be unwindable. Concretely:
//!
//!   CREATE (:Doc {tags: ['a', 'b', 'c']})
//!   MATCH (n:Doc) UNWIND n.tags AS t RETURN t
//!
//! must yield 3 rows with `t = 'a'`, `'b'`, `'c'` in list order. This
//! exercises the UNWIND path that has an *input* sub-plan (the MATCH
//! produces a row binding `n`), and that reads the list from a
//! `PropertyValue::List` on disk rather than from a literal in the
//! query text.
//!
//! Expression evaluation already resolves `n.tags` to the stored list
//! via the `CypherExpression::PropertyAccess` branch at
//! `crates/ogdb-core/src/lib.rs:15724–15745`. The only missing piece
//! is the UNWIND operator that turns the evaluated list into rows.
//!
//! Today this test fails at `Database::query` with
//! `physical planning for UNWIND is not implemented yet`.

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
        "ogdb-unwind-stored-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn unwind_over_stored_list_property_yields_row_per_element() {
    let path = test_db_path("stored");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    // Seed: one :Doc with a 3-element string list stored as a property.
    db.query("CREATE (:Doc {tags: ['a', 'b', 'c']})")
        .expect("seed CREATE must succeed at HEAD");

    let result = db
        .query("MATCH (n:Doc) UNWIND n.tags AS t RETURN t")
        .expect("UNWIND over a stored list property must succeed once core planner supports it");

    assert_eq!(
        result.row_count(),
        3,
        "one :Doc with tags=[a,b,c] must fan out to 3 rows; got {}",
        result.row_count()
    );

    // Order is list-order, but we don't commit to it here — we only
    // require that all three elements appear as the `t` column. List
    // order is exercised explicitly by unwind_literal_list and
    // unwind_range_two_arg; this test pins the property-access +
    // fanout contract.
    let values = result
        .to_rows()
        .iter()
        .filter_map(|row| match row.get("t").cloned() {
            Some(PropertyValue::String(value)) => Some(value),
            _ => None,
        })
        .collect::<BTreeSet<_>>();
    assert_eq!(
        values,
        ["a", "b", "c"]
            .into_iter()
            .map(|s| s.to_string())
            .collect::<BTreeSet<_>>(),
        "UNWIND n.tags must bind `t` to each stored element; got {values:?}"
    );
}
