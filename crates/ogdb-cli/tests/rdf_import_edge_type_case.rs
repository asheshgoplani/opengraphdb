// Regression: RDF import must emit edge types in CYPHER_CASE (upper-snake-case)
// so MATCH ()-[:KNOWS]->() patterns work idiomatically with MovieLens/GoT
// datasets. (Audit issue #6: previously the local-name was taken verbatim and
// lowercased — ex:knows produced 'knows' instead of 'KNOWS'.)

use ogdb_cli::run;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_path(tag: &str, ext: &str) -> PathBuf {
    let mut path = env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-{tag}-{}-{ts}.{ext}", process::id()));
    path
}

fn cleanup_db(path: &PathBuf) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(format!("{}-wal", path.display()));
    let _ = fs::remove_file(format!("{}-meta.json", path.display()));
    let rdf_meta = format!("{}-rdf-meta.json", path.display());
    let _ = fs::remove_file(rdf_meta);
}

fn import_ttl(db: &PathBuf, ttl_body: &str) {
    let input = temp_path("rdf-edgecase-input", "ttl");
    fs::write(&input, ttl_body).expect("write ttl input");

    let init = run(&["init".to_string(), db.display().to_string()]);
    assert_eq!(init.exit_code, 0, "init failed: {}", init.stderr);

    let out = run(&[
        "import-rdf".to_string(),
        db.display().to_string(),
        input.display().to_string(),
    ]);
    assert_eq!(
        out.exit_code, 0,
        "import-rdf failed: stdout={} stderr={}",
        out.stdout, out.stderr
    );

    let _ = fs::remove_file(&input);
}

fn exported_edge_types(db: &PathBuf) -> Vec<String> {
    let export_path = temp_path("rdf-edgecase-export", "json");
    let export = run(&[
        "export".to_string(),
        db.display().to_string(),
        export_path.display().to_string(),
        "--format".to_string(),
        "json".to_string(),
    ]);
    assert_eq!(
        export.exit_code, 0,
        "export failed: stdout={} stderr={}",
        export.stdout, export.stderr
    );
    let body = fs::read_to_string(&export_path).expect("read export");
    let _ = fs::remove_file(&export_path);
    let doc: serde_json::Value = serde_json::from_str(&body).expect("parse export");
    doc["edges"]
        .as_array()
        .expect("edges array")
        .iter()
        .filter_map(|e| {
            e.get("type")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
        .collect()
}

#[test]
fn rdf_import_lowercase_local_name_becomes_upper_snake_case() {
    // ex:knows → KNOWS (pure lowercase local name)
    let db = temp_path("rdf-edgecase-knows", "ogdb");
    cleanup_db(&db);
    import_ttl(
        &db,
        r#"@prefix ex: <http://example.com/> .
ex:a ex:knows ex:b .
"#,
    );
    let types = exported_edge_types(&db);
    assert!(
        types.iter().any(|t| t == "KNOWS"),
        "expected edge type KNOWS, got {types:?}"
    );
    assert!(
        !types.iter().any(|t| t == "knows"),
        "edge type must not be lowercased: {types:?}"
    );
    cleanup_db(&db);
}

#[test]
fn rdf_import_camel_case_local_name_becomes_upper_snake_case() {
    // schema:worksAt → WORKS_AT (camelCase splits on lower→upper boundary)
    let db = temp_path("rdf-edgecase-worksat", "ogdb");
    cleanup_db(&db);
    import_ttl(
        &db,
        r#"@prefix ex: <http://example.com/> .
@prefix schema: <http://schema.org/> .
ex:alice schema:worksAt ex:acme .
"#,
    );
    let types = exported_edge_types(&db);
    assert!(
        types.iter().any(|t| t == "WORKS_AT"),
        "expected edge type WORKS_AT, got {types:?}"
    );
    cleanup_db(&db);
}

#[test]
fn rdf_import_snake_case_local_name_becomes_upper_snake_case() {
    // ex:is_member_of → IS_MEMBER_OF (snake_case simply uppercases)
    let db = temp_path("rdf-edgecase-snake", "ogdb");
    cleanup_db(&db);
    import_ttl(
        &db,
        r#"@prefix ex: <http://example.com/> .
ex:alice ex:is_member_of ex:team .
"#,
    );
    let types = exported_edge_types(&db);
    assert!(
        types.iter().any(|t| t == "IS_MEMBER_OF"),
        "expected edge type IS_MEMBER_OF, got {types:?}"
    );
    cleanup_db(&db);
}

#[test]
fn rdf_import_hyphenated_local_name_becomes_upper_snake_case() {
    // ex:has-child → HAS_CHILD (hyphens treated as separators)
    let db = temp_path("rdf-edgecase-hyphen", "ogdb");
    cleanup_db(&db);
    import_ttl(
        &db,
        r#"<http://example.com/a> <http://example.com/has-child> <http://example.com/b> .
"#,
    );
    let types = exported_edge_types(&db);
    assert!(
        types.iter().any(|t| t == "HAS_CHILD"),
        "expected edge type HAS_CHILD, got {types:?}"
    );
    cleanup_db(&db);
}

#[test]
fn rdf_import_preserves_original_iri_for_round_trip() {
    // Fidelity check: _uri property on the edge must still carry the exact
    // source IRI even though the edge type is CYPHER_CASE. This keeps RDF
    // round-trip export working through resolve_predicate_uri().
    let db = temp_path("rdf-edgecase-uri-preserved", "ogdb");
    cleanup_db(&db);
    import_ttl(
        &db,
        r#"@prefix ex: <http://example.com/> .
@prefix schema: <http://schema.org/> .
ex:alice schema:worksAt ex:acme .
"#,
    );

    let export_path = temp_path("rdf-edgecase-uri-export", "json");
    let export = run(&[
        "export".to_string(),
        db.display().to_string(),
        export_path.display().to_string(),
        "--format".to_string(),
        "json".to_string(),
    ]);
    assert_eq!(export.exit_code, 0, "export failed: {}", export.stderr);
    let body = fs::read_to_string(&export_path).expect("read export");
    let _ = fs::remove_file(&export_path);
    let doc: serde_json::Value = serde_json::from_str(&body).expect("parse export");
    let edges = doc["edges"].as_array().expect("edges array");
    let edge = edges
        .iter()
        .find(|e| e.get("type").and_then(|t| t.as_str()) == Some("WORKS_AT"))
        .expect("WORKS_AT edge in export");
    let uri = edge["properties"]["_uri"]
        .as_str()
        .expect("_uri property on edge");
    assert_eq!(
        uri, "http://schema.org/worksAt",
        "edge _uri must preserve the original predicate IRI verbatim"
    );
    cleanup_db(&db);
}
