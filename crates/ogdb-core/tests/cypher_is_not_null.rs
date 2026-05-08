//! RED test: `WHERE n.prop IS NOT NULL` must return rows where the
//! property *is* set, not zero rows. The dual `IS NULL` should return
//! zero rows when every node has the property set.
//!
//! Bug: `IS NOT NULL` evaluation appears flipped or short-circuited
//! wrong, returning 0 rows even when all nodes have the property
//! present.

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
        "ogdb-is-not-null-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

#[test]
fn is_not_null_returns_rows_when_property_is_set() {
    let path = test_db_path("present");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    db.query("CREATE (:Person {name: 'Alice', age: 30})")
        .expect("seed Alice");
    db.query("CREATE (:Person {name: 'Bob', age: 25})")
        .expect("seed Bob");
    db.query("CREATE (:Person {name: 'Carol', age: 40})")
        .expect("seed Carol");
    db.query("CREATE (:Person {name: 'Dave', age: 35})")
        .expect("seed Dave");

    let not_null = db
        .query("MATCH (n:Person) WHERE n.age IS NOT NULL RETURN n")
        .expect("IS NOT NULL query must succeed");
    assert_eq!(
        not_null.row_count(),
        4,
        "all 4 Persons have age set; IS NOT NULL must return 4, got {}",
        not_null.row_count()
    );

    let is_null = db
        .query("MATCH (n:Person) WHERE n.age IS NULL RETURN n")
        .expect("IS NULL query must succeed");
    assert_eq!(
        is_null.row_count(),
        0,
        "no Persons are missing age; IS NULL must return 0, got {}",
        is_null.row_count()
    );
}
