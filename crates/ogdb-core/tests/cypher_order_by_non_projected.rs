//! RED test: `ORDER BY <key> DESC` was returning rows in INSERTION order
//! when the sort key was *not* in the RETURN projection.
//!
//! Repro:
//!   CREATE :Person {name:"Alice", age:30}
//!   CREATE :Person {name:"Bob",   age:25}
//!   CREATE :Person {name:"Carol", age:40}
//!   CREATE :Person {name:"Dave",  age:35}
//!
//!   MATCH (n:Person) RETURN n.age  ORDER BY n.age  DESC  // works: 40, 35, 30, 25
//!   MATCH (n:Person) RETURN n.name ORDER BY n.age  DESC  // BUG  : Alice, Bob, Carol, Dave (insertion order)
//!
//! After Project drops the source variable `n`, the PhysicalSort step
//! cannot evaluate `n.age` and falls back to a missing column, so every
//! comparison returns Equal and the sort degenerates to a stable no-op.
//! This test pins the contract that ORDER BY must observe the input
//! scope (variables present *before* projection) regardless of which
//! columns the RETURN exposes.

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
        "ogdb-order-by-non-projected-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

fn seed(db: &mut Database) {
    // Inserted in (Alice, Bob, Carol, Dave) order so that "insertion
    // order" is visibly different from any age-sorted order.
    db.query("CREATE (:Person {name:'Alice', age:30})")
        .expect("create Alice");
    db.query("CREATE (:Person {name:'Bob', age:25})")
        .expect("create Bob");
    db.query("CREATE (:Person {name:'Carol', age:40})")
        .expect("create Carol");
    db.query("CREATE (:Person {name:'Dave', age:35})")
        .expect("create Dave");
}

fn names(db: &mut Database, query: &str) -> Vec<String> {
    let result = db.query(query).expect("query must succeed");
    result
        .to_rows()
        .iter()
        .filter_map(|row| match row.get("name").cloned() {
            Some(PropertyValue::String(value)) => Some(value),
            _ => None,
        })
        .collect()
}

fn ages(db: &mut Database, query: &str) -> Vec<i64> {
    let result = db.query(query).expect("query must succeed");
    result
        .to_rows()
        .iter()
        .filter_map(|row| match row.get("age").cloned() {
            Some(PropertyValue::I64(value)) => Some(value),
            _ => None,
        })
        .collect()
}

#[test]
fn order_by_desc_sorts_when_key_is_not_in_return() {
    let path = test_db_path("desc-non-projected");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    seed(&mut db);

    // Control: sort key IS in projection — already-correct behaviour.
    let ages_desc = ages(
        &mut db,
        "MATCH (n:Person) RETURN n.age ORDER BY n.age DESC",
    );
    assert_eq!(
        ages_desc,
        vec![40, 35, 30, 25],
        "control: ORDER BY n.age DESC with n.age in projection must sort descending; got {ages_desc:?}"
    );

    // Bug: sort key is NOT in projection — must still sort by age DESC.
    let names_age_desc = names(
        &mut db,
        "MATCH (n:Person) RETURN n.name ORDER BY n.age DESC",
    );
    assert_eq!(
        names_age_desc,
        vec![
            "Carol".to_string(), // age 40
            "Dave".to_string(),  // age 35
            "Alice".to_string(), // age 30
            "Bob".to_string(),   // age 25
        ],
        "ORDER BY n.age DESC must sort by age even when only n.name is projected; got {names_age_desc:?}"
    );
}

#[test]
fn order_by_asc_sorts_when_key_is_not_in_return() {
    // Symmetric ASC check: the bug also degrades ASC into insertion
    // order, but it's masked when input happens to already be ascending.
    // Our seed order (30,25,40,35) is NOT ascending, so this asserts the
    // ASC path independently.
    let path = test_db_path("asc-non-projected");
    let mut db = Database::init(&path, Header::default_v1()).expect("init db");

    seed(&mut db);

    let names_age_asc = names(
        &mut db,
        "MATCH (n:Person) RETURN n.name ORDER BY n.age ASC",
    );
    assert_eq!(
        names_age_asc,
        vec![
            "Bob".to_string(),   // age 25
            "Alice".to_string(), // age 30
            "Dave".to_string(),  // age 35
            "Carol".to_string(), // age 40
        ],
        "ORDER BY n.age ASC must sort by age even when only n.name is projected; got {names_age_asc:?}"
    );
}
