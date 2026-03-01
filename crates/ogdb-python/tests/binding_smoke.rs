use serde_json::json;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_python::BindingDatabase;

fn unique_path(tag: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_nanos();
    std::env::temp_dir().join(format!("ogdb-python-{tag}-{nanos}.ogdb"))
}

#[test]
fn binding_database_crud_query_and_metrics() {
    let path = unique_path("crud");
    let mut db = BindingDatabase::init(path.to_string_lossy().as_ref()).expect("init db");

    let a = db
        .create_node(vec!["Person".to_string()], json!({"name":"Alice","age":30}))
        .expect("create node a");
    let b = db
        .create_node(vec!["Person".to_string()], json!({"name":"Bob","age":28}))
        .expect("create node b");
    assert_eq!(a, 0);
    assert_eq!(b, 1);

    let edge_id = db
        .add_edge(a, b, Some("KNOWS".to_string()), json!({"since": 2024}))
        .expect("add edge");
    assert_eq!(edge_id, 0);

    let rows = db
        .query("MATCH (n:Person) RETURN n ORDER BY n")
        .expect("query people");
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].get("n"), Some(&json!(0)));

    let metrics = db.metrics().expect("metrics");
    assert_eq!(metrics.get("node_count"), Some(&json!(2)));
    assert_eq!(metrics.get("edge_count"), Some(&json!(1)));

    db.checkpoint().expect("checkpoint");
    db.close();
}

#[test]
fn binding_database_index_and_search_helpers() {
    let path = unique_path("search");
    let mut db = BindingDatabase::init(path.to_string_lossy().as_ref()).expect("init db");

    let _ = db
        .create_node(
            vec!["Doc".to_string()],
            json!({"name":"Alice","embedding":[1.0,0.0,0.0]}),
        )
        .expect("create doc a");
    let _ = db
        .create_node(
            vec!["Doc".to_string()],
            json!({"name":"Bob","embedding":[0.0,1.0,0.0]}),
        )
        .expect("create doc b");

    db.create_vector_index("embedding_idx", Some("Doc"), "embedding", 3, Some("cosine"))
        .expect("create vector index");
    db.create_fulltext_index("name_idx", Some("Doc"), vec!["name".to_string()])
        .expect("create fulltext index");

    let vector_rows = db
        .vector_search("embedding_idx", vec![1.0, 0.0, 0.0], 1)
        .expect("vector search");
    assert_eq!(vector_rows.len(), 1);
    assert_eq!(vector_rows[0].get("node"), Some(&json!(0)));

    let text_rows = db.text_search("name_idx", "alice", 5).expect("text search");
    assert!(!text_rows.is_empty());
    assert_eq!(text_rows[0].get("node"), Some(&json!(0)));
}

#[test]
fn binding_database_import_and_export_json() {
    let path = unique_path("import-export");
    let mut db = BindingDatabase::init(path.to_string_lossy().as_ref()).expect("init db");

    let import_path = unique_path("import").with_extension("json");
    std::fs::write(
        &import_path,
        r#"{
  "nodes": [
    {"id": 0, "labels": ["Doc"], "properties": {"title": "Alpha"}},
    {"id": 1, "labels": ["Doc"], "properties": {"title": "Beta"}}
  ],
  "edges": [
    {"src": 0, "dst": 1, "type": "LINKS", "properties": {"weight": 1}}
  ]
}"#,
    )
    .expect("write import payload");

    db.import_json(import_path.to_string_lossy().as_ref())
        .expect("import json");

    let export_path = unique_path("export").with_extension("json");
    db.export(
        export_path.to_string_lossy().as_ref(),
        Some("json".to_string()),
    )
    .expect("export json");

    let exported = std::fs::read_to_string(export_path).expect("read exported payload");
    assert!(exported.contains("\"nodes\""));
    assert!(exported.contains("\"edges\""));
}
