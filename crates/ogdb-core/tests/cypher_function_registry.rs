//! RED tests for the cypher built-in function registry.
//!
//! These 11 functions are currently silent: the evaluator's
//! `match name.to_ascii_uppercase()` arm in `lib.rs` falls through to
//! `_ => Ok(RuntimeValue::Null)`, which surfaces in result rows as the
//! literal string `"null"` (`PropertyValue::String("null")`). Each test
//! below executes the function via Cypher and asserts a concrete,
//! non-null value — so any registry regression that re-introduces the
//! silent-null behaviour is caught immediately.

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
        "ogdb-cypher-fn-registry-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir.join("graph.ogdb")
}

fn fresh_db(tag: &str) -> Database {
    let path = test_db_path(tag);
    Database::init(&path, Header::default_v1()).expect("init db")
}

fn single_value(db: &mut Database, query: &str, column: &str) -> PropertyValue {
    let result = db
        .query(query)
        .unwrap_or_else(|err| panic!("query `{query}` must succeed: {err:?}"));
    let rows = result.to_rows();
    assert_eq!(
        rows.len(),
        1,
        "query `{query}` must return exactly one row; got {}",
        rows.len()
    );
    rows[0].get(column).cloned().unwrap_or_else(|| {
        panic!(
            "query `{query}` must expose column `{column}`; row: {:?}",
            rows[0]
        )
    })
}

fn assert_not_silent_null(value: &PropertyValue, fn_name: &str) {
    assert!(
        !matches!(value, PropertyValue::String(s) if s == "null"),
        "function `{fn_name}` silently returned the string \"null\" — registry impl is missing"
    );
}

#[test]
fn id_of_node_returns_integer() {
    let mut db = fresh_db("id-node");
    db.query("CREATE (:Thing {tag: 'a'})").expect("create node");

    let value = single_value(&mut db, "MATCH (n:Thing) RETURN id(n) AS i", "i");
    assert_not_silent_null(&value, "id");
    assert!(
        matches!(value, PropertyValue::I64(_)),
        "id(n) must return an integer; got {value:?}"
    );
}

#[test]
fn type_of_relationship_returns_type_name() {
    let mut db = fresh_db("type-rel");
    db.query("CREATE (a:Person {n:'a'})-[:KNOWS]->(b:Person {n:'b'})")
        .expect("create rel");

    let value = single_value(
        &mut db,
        "MATCH (a:Person {n:'a'})-[r]->(b:Person {n:'b'}) RETURN type(r) AS t",
        "t",
    );
    assert_not_silent_null(&value, "type");
    assert_eq!(
        value,
        PropertyValue::String("KNOWS".to_string()),
        "type(r) must return the relationship type"
    );
}

#[test]
fn labels_of_node_returns_label_list() {
    let mut db = fresh_db("labels-node");
    db.query("CREATE (:Person:Employee {n:'a'})")
        .expect("create node");

    let value = single_value(
        &mut db,
        "MATCH (n:Person {n:'a'}) RETURN labels(n) AS ls",
        "ls",
    );
    assert_not_silent_null(&value, "labels");
    let list = match value {
        PropertyValue::List(values) => values,
        other => panic!("labels(n) must return a list; got {other:?}"),
    };
    let mut got = list
        .into_iter()
        .map(|v| match v {
            PropertyValue::String(s) => s,
            other => panic!("labels list element must be a string; got {other:?}"),
        })
        .collect::<Vec<_>>();
    got.sort();
    assert_eq!(
        got,
        vec!["Employee".to_string(), "Person".to_string()],
        "labels(n) must return both labels"
    );
}

#[test]
fn abs_of_negative_int_returns_positive() {
    let mut db = fresh_db("abs");
    let value = single_value(&mut db, "RETURN abs(-7) AS x", "x");
    assert_not_silent_null(&value, "abs");
    let as_f64 = match &value {
        PropertyValue::I64(v) => *v as f64,
        PropertyValue::F64(v) => *v,
        other => panic!("abs must return a number; got {other:?}"),
    };
    assert!(
        (as_f64 - 7.0).abs() < 1e-9,
        "abs(-7) must equal 7; got {value:?}"
    );
}

#[test]
fn ceil_of_fractional_returns_next_integer() {
    let mut db = fresh_db("ceil");
    let value = single_value(&mut db, "RETURN ceil(2.3) AS x", "x");
    assert_not_silent_null(&value, "ceil");
    let as_f64 = match &value {
        PropertyValue::I64(v) => *v as f64,
        PropertyValue::F64(v) => *v,
        other => panic!("ceil must return a number; got {other:?}"),
    };
    assert!(
        (as_f64 - 3.0).abs() < 1e-9,
        "ceil(2.3) must equal 3; got {value:?}"
    );
}

#[test]
fn floor_of_fractional_returns_previous_integer() {
    let mut db = fresh_db("floor");
    let value = single_value(&mut db, "RETURN floor(2.8) AS x", "x");
    assert_not_silent_null(&value, "floor");
    let as_f64 = match &value {
        PropertyValue::I64(v) => *v as f64,
        PropertyValue::F64(v) => *v,
        other => panic!("floor must return a number; got {other:?}"),
    };
    assert!(
        (as_f64 - 2.0).abs() < 1e-9,
        "floor(2.8) must equal 2; got {value:?}"
    );
}

#[test]
fn round_of_half_returns_nearest_integer() {
    let mut db = fresh_db("round");
    let value = single_value(&mut db, "RETURN round(2.6) AS x", "x");
    assert_not_silent_null(&value, "round");
    let as_f64 = match &value {
        PropertyValue::I64(v) => *v as f64,
        PropertyValue::F64(v) => *v,
        other => panic!("round must return a number; got {other:?}"),
    };
    assert!(
        (as_f64 - 3.0).abs() < 1e-9,
        "round(2.6) must equal 3; got {value:?}"
    );
}

#[test]
fn to_integer_of_float_returns_integer() {
    let mut db = fresh_db("toint");
    let value = single_value(&mut db, "RETURN toInteger(3.7) AS x", "x");
    assert_not_silent_null(&value, "toInteger");
    assert_eq!(
        value,
        PropertyValue::I64(3),
        "toInteger(3.7) must truncate to 3; got {value:?}"
    );
}

#[test]
fn to_float_of_integer_returns_float() {
    let mut db = fresh_db("tofloat");
    let value = single_value(&mut db, "RETURN toFloat(5) AS x", "x");
    assert_not_silent_null(&value, "toFloat");
    let as_f64 = match &value {
        PropertyValue::F64(v) => *v,
        other => panic!("toFloat must return f64; got {other:?}"),
    };
    assert!(
        (as_f64 - 5.0).abs() < 1e-9,
        "toFloat(5) must equal 5.0; got {value:?}"
    );
}

#[test]
fn to_string_of_integer_returns_string() {
    let mut db = fresh_db("tostring");
    let value = single_value(&mut db, "RETURN toString(42) AS x", "x");
    assert_not_silent_null(&value, "toString");
    assert_eq!(
        value,
        PropertyValue::String("42".to_string()),
        "toString(42) must equal \"42\"; got {value:?}"
    );
}

#[test]
fn last_of_list_returns_final_element() {
    let mut db = fresh_db("last");
    let value = single_value(&mut db, "RETURN last([10, 20, 30]) AS x", "x");
    assert_not_silent_null(&value, "last");
    assert_eq!(
        value,
        PropertyValue::I64(30),
        "last([10,20,30]) must equal 30; got {value:?}"
    );
}

#[test]
fn reverse_of_list_returns_reversed() {
    let mut db = fresh_db("reverse");
    let value = single_value(&mut db, "RETURN reverse([1, 2, 3]) AS x", "x");
    assert_not_silent_null(&value, "reverse");
    assert_eq!(
        value,
        PropertyValue::List(vec![
            PropertyValue::I64(3),
            PropertyValue::I64(2),
            PropertyValue::I64(1),
        ]),
        "reverse([1,2,3]) must equal [3,2,1]; got {value:?}"
    );
}
