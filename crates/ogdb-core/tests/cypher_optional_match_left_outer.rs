//! Regression test: `OPTIONAL MATCH (a:Person)-[:KNOWS]->(b:Person)` must
//! follow Cypher LEFT-OUTER-JOIN semantics. Every `a` row from the left
//! side must appear in the result; for any `a` with no outgoing `:KNOWS`
//! the right-side variable `b` must be NULL-padded, not dropped.
//!
//! Today the planner builds an inner-join Expand for OPTIONAL MATCH, so
//! `a` rows without a matching `b` get dropped — this test currently
//! fails because the row count is 1 (only Alice→Bob) instead of 3
//! (Alice→Bob, Bob→NULL, Charlie→NULL).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue};

fn test_db_path(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-optional-match-left-outer-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

fn cleanup(path: &Path) {
    if let Some(parent) = path.parent() {
        let _ = fs::remove_dir_all(parent);
    }
}

fn create_person(db: &mut Database, name: &str) -> u64 {
    db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([(
            "name".to_string(),
            PropertyValue::String(name.to_string()),
        )]),
    )
    .expect("create person")
}

#[test]
fn optional_match_preserves_left_rows_with_partial_matches() {
    let path = test_db_path("partial");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let alice = create_person(&mut db, "Alice");
    let bob = create_person(&mut db, "Bob");
    let _charlie = create_person(&mut db, "Charlie");

    db.add_typed_edge(alice, bob, "KNOWS", &PropertyMap::default())
        .expect("create KNOWS edge");

    let result = db
        .query("OPTIONAL MATCH (a:Person)-[:KNOWS]->(b:Person) RETURN a.name AS a_name, b.name AS b_name")
        .expect("optional match query");

    assert_eq!(
        result.row_count(),
        3,
        "OPTIONAL MATCH must preserve all 3 left-side `a` rows (Alice→Bob, Bob→NULL, Charlie→NULL); got {} rows. Cypher LEFT-OUTER-JOIN semantics: rows without right-side match must be NULL-padded, not dropped.",
        result.row_count()
    );

    let rows = result.to_rows();
    let a_names = rows
        .iter()
        .filter_map(|row| match row.get("a_name") {
            Some(PropertyValue::String(s)) => Some(s.clone()),
            _ => None,
        })
        .collect::<std::collections::BTreeSet<_>>();
    assert!(
        a_names.contains("Alice"),
        "Alice (matched) must appear in result; a_names: {a_names:?}"
    );
    assert!(
        a_names.contains("Bob"),
        "Bob (no outgoing KNOWS) must still appear in result with NULL b_name; a_names: {a_names:?}"
    );
    assert!(
        a_names.contains("Charlie"),
        "Charlie (no outgoing KNOWS) must still appear in result with NULL b_name; a_names: {a_names:?}"
    );

    cleanup(&path);
}

#[test]
fn optional_match_preserves_left_rows_with_zero_matches() {
    let path = test_db_path("none-match");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    let _ = create_person(&mut db, "Alice");
    let _ = create_person(&mut db, "Bob");

    let result = db
        .query("OPTIONAL MATCH (a:Person)-[:KNOWS]->(b:Person) RETURN a.name AS a_name, b.name AS b_name")
        .expect("optional match query");

    assert_eq!(
        result.row_count(),
        2,
        "OPTIONAL MATCH with no edges in the graph must still return all 2 left-side `a` rows with NULL b_name; got {} rows.",
        result.row_count()
    );

    cleanup(&path);
}
