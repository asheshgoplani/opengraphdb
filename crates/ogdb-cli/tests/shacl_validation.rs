use ogdb_cli::{parse_shacl_shapes, validate_against_shacl, ShaclLoadError};
use ogdb_core::{Database, Header, PropertyMap, PropertyValue};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_test_dir(tag: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-shacl-{tag}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&path).expect("create test directory");
    path
}

fn write_shapes_file(dir: &Path) -> PathBuf {
    let shapes_path = dir.join("shapes.ttl");
    let shapes = r#"@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .

ex:PersonShape
  a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1 ;
  ] ;
  sh:property [
    sh:path ex:email ;
    sh:minCount 1 ;
  ] .
"#;
    fs::write(&shapes_path, shapes).expect("write shapes file");
    shapes_path
}

fn init_db(path: &Path) -> Database {
    Database::init(
        path,
        Header {
            format_version: 1,
            page_size: 4096,
            next_node_id: 0,
            edge_count: 0,
        },
    )
    .expect("init db")
}

fn props(entries: &[(&str, PropertyValue)]) -> PropertyMap {
    entries
        .iter()
        .map(|(k, v)| ((*k).to_string(), v.clone()))
        .collect()
}

#[test]
fn shacl_reports_violation_for_missing_property() {
    let dir = unique_test_dir("violation");
    let db_path = dir.join("graph.ogdb");
    let shapes_path = write_shapes_file(&dir);

    let mut db = init_db(&db_path);
    let node0 = db.create_node().expect("create node0");
    db.set_node_labels(node0, &["Person".to_string()])
        .expect("set labels node0");
    db.set_node_properties(
        node0,
        &props(&[("name", PropertyValue::String("Alice".to_string()))]),
    )
    .expect("set properties node0");

    let node1 = db.create_node().expect("create node1");
    db.set_node_labels(node1, &["Person".to_string()])
        .expect("set labels node1");
    db.set_node_properties(
        node1,
        &props(&[
            ("name", PropertyValue::String("Bob".to_string())),
            (
                "email",
                PropertyValue::String("bob@example.com".to_string()),
            ),
        ]),
    )
    .expect("set properties node1");

    let shapes = parse_shacl_shapes(&shapes_path).expect("parse shapes");
    let violations = validate_against_shacl(&db, &shapes);

    assert_eq!(violations.len(), 1);
    assert_eq!(violations[0].node_id, 0);
    assert_eq!(violations[0].violated_property, "email");
}

#[test]
fn shacl_reports_no_violations_for_conformant_graph() {
    let dir = unique_test_dir("conformant");
    let db_path = dir.join("graph.ogdb");
    let shapes_path = write_shapes_file(&dir);

    let mut db = init_db(&db_path);
    let node0 = db.create_node().expect("create node0");
    db.set_node_labels(node0, &["Person".to_string()])
        .expect("set labels node0");
    db.set_node_properties(
        node0,
        &props(&[
            ("name", PropertyValue::String("Alice".to_string())),
            (
                "email",
                PropertyValue::String("alice@example.com".to_string()),
            ),
        ]),
    )
    .expect("set properties node0");

    let node1 = db.create_node().expect("create node1");
    db.set_node_labels(node1, &["Person".to_string()])
        .expect("set labels node1");
    db.set_node_properties(
        node1,
        &props(&[
            ("name", PropertyValue::String("Bob".to_string())),
            (
                "email",
                PropertyValue::String("bob@example.com".to_string()),
            ),
        ]),
    )
    .expect("set properties node1");

    let shapes = parse_shacl_shapes(&shapes_path).expect("parse shapes");
    let violations = validate_against_shacl(&db, &shapes);

    assert!(violations.is_empty());
}

#[test]
fn shacl_ignores_nodes_without_target_class() {
    let dir = unique_test_dir("target-class");
    let db_path = dir.join("graph.ogdb");
    let shapes_path = write_shapes_file(&dir);

    let mut db = init_db(&db_path);

    let company = db.create_node().expect("create company");
    db.set_node_labels(company, &["Company".to_string()])
        .expect("set labels company");
    db.set_node_properties(
        company,
        &props(&[("name", PropertyValue::String("Acme".to_string()))]),
    )
    .expect("set properties company");

    let person = db.create_node().expect("create person");
    db.set_node_labels(person, &["Person".to_string()])
        .expect("set labels person");
    db.set_node_properties(
        person,
        &props(&[
            ("name", PropertyValue::String("Alice".to_string())),
            ("email", PropertyValue::String("a@b.com".to_string())),
        ]),
    )
    .expect("set properties person");

    let shapes = parse_shacl_shapes(&shapes_path).expect("parse shapes");
    let violations = validate_against_shacl(&db, &shapes);

    assert!(violations.is_empty());
}

#[test]
fn shacl_cli_exits_with_code_1_on_violations() {
    let dir = unique_test_dir("cli-violations");
    let db_path = dir.join("graph.ogdb");
    let shapes_path = write_shapes_file(&dir);

    let mut db = init_db(&db_path);
    let node = db.create_node().expect("create node");
    db.set_node_labels(node, &["Person".to_string()])
        .expect("set labels");
    db.set_node_properties(
        node,
        &props(&[("name", PropertyValue::String("Alice".to_string()))]),
    )
    .expect("set properties");
    drop(db);

    let output = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args([
            "validate-shacl",
            "--db",
            db_path.to_str().expect("db path as str"),
            shapes_path.to_str().expect("shapes path as str"),
        ])
        .output()
        .expect("run ogdb validate-shacl");

    assert!(!output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("VIOLATION"), "stdout was: {stdout}");
}

#[test]
fn shacl_cli_exits_with_code_0_on_conformance() {
    let dir = unique_test_dir("cli-conformant");
    let db_path = dir.join("graph.ogdb");
    let shapes_path = write_shapes_file(&dir);

    let mut db = init_db(&db_path);
    let node = db.create_node().expect("create node");
    db.set_node_labels(node, &["Person".to_string()])
        .expect("set labels");
    db.set_node_properties(
        node,
        &props(&[
            ("name", PropertyValue::String("Alice".to_string())),
            (
                "email",
                PropertyValue::String("alice@example.com".to_string()),
            ),
        ]),
    )
    .expect("set properties");
    drop(db);

    let output = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args([
            "validate-shacl",
            "--db",
            db_path.to_str().expect("db path as str"),
            shapes_path.to_str().expect("shapes path as str"),
        ])
        .output()
        .expect("run ogdb validate-shacl");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("conforms"), "stdout was: {stdout}");
}

#[test]
fn parse_shacl_shapes_returns_typed_io_error_for_missing_file() {
    // EVAL-RUST-QUALITY-CYCLE3 H9 regression: the function used to return
    // Box<dyn std::error::Error>, which forced callers to lose error variant
    // information at the boundary. Now it returns ShaclLoadError so callers
    // can match on Io vs RdfParse — exercise the Io path here.
    let missing = Path::new("/nonexistent-shapes-file-for-h9-regression.ttl");
    let err = parse_shacl_shapes(missing).expect_err("missing file must error");
    match err {
        ShaclLoadError::Io(_) => {}
        ShaclLoadError::RdfParse(msg) => panic!("expected Io, got RdfParse: {msg}"),
        // ShaclLoadError is non_exhaustive (CYCLE3 B3); future variants
        // surface here without breaking this test's intent.
        other => panic!("expected Io, got {other:?}"),
    }
}

#[test]
fn parse_shacl_shapes_returns_typed_rdf_parse_error_for_malformed_input() {
    // Exercise the RdfParse arm: a syntactically broken Turtle file must
    // surface as ShaclLoadError::RdfParse, not as a stringly-typed Box<dyn>.
    let dir = unique_test_dir("h9-rdf-parse");
    let bad = dir.join("bad.ttl");
    fs::write(
        &bad,
        "@prefix sh: <http://www.w3.org/ns/shacl#> .\nthis is not turtle ;;;",
    )
    .expect("write bad shapes");
    let err = parse_shacl_shapes(&bad).expect_err("malformed shapes must error");
    match err {
        ShaclLoadError::RdfParse(_) => {}
        ShaclLoadError::Io(io) => panic!("expected RdfParse, got Io: {io}"),
        other => panic!("expected RdfParse, got {other:?}"),
    }
}
