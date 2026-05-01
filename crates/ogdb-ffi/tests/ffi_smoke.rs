// EVAL-RUST-QUALITY-CYCLE2 H5: this integration test calls the FFI surface
// directly. Each `unsafe` block exercises the documented safety contract
// of the corresponding `pub unsafe extern "C" fn` (handle produced by
// `ogdb_init`, NUL-terminated UTF-8 inputs, single ownership transfer,
// etc.) — duplicating that contract on every line would obscure the test,
// so we suppress the per-block lint here and rely on the SAFETY comments
// in `crates/ogdb-ffi/src/lib.rs` for the documented invariants.
#![allow(clippy::undocumented_unsafe_blocks)]
#![allow(unsafe_op_in_unsafe_fn)]

use std::ffi::{CStr, CString};
use std::fs;
use std::os::raw::c_char;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use ogdb_ffi::{
    ogdb_add_edge, ogdb_backup, ogdb_checkpoint, ogdb_close, ogdb_create_node, ogdb_export,
    ogdb_free, ogdb_import, ogdb_init, ogdb_metrics, ogdb_query,
};

fn unique_path(tag: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_nanos();
    std::env::temp_dir().join(format!("ogdb-ffi-{tag}-{nanos}.ogdb"))
}

unsafe fn take_c_string(ptr: *mut c_char) -> String {
    let out = CStr::from_ptr(ptr).to_string_lossy().into_owned();
    ogdb_free(ptr);
    out
}

#[test]
fn ffi_create_query_metrics_checkpoint_and_backup() {
    let db_path = unique_path("main");
    let db_path_raw = CString::new(db_path.to_string_lossy().to_string()).expect("db path cstr");

    let handle = unsafe { ogdb_init(db_path_raw.as_ptr()) };
    assert!(!handle.is_null(), "ogdb_init should return a handle");

    let labels = CString::new("[\"Person\"]").expect("labels");
    let node_props = CString::new("{\"name\":\"Alice\",\"age\":30}").expect("props");
    let first_node = unsafe { ogdb_create_node(handle, labels.as_ptr(), node_props.as_ptr()) };
    assert_eq!(first_node, 0);

    let node_props_2 = CString::new("{\"name\":\"Bob\",\"age\":28}").expect("props");
    let second_node = unsafe { ogdb_create_node(handle, labels.as_ptr(), node_props_2.as_ptr()) };
    assert_eq!(second_node, 1);

    let edge_type = CString::new("KNOWS").expect("edge type");
    let edge_props = CString::new("{\"since\":2024}").expect("edge props");
    let edge_id = unsafe {
        ogdb_add_edge(
            handle,
            first_node,
            second_node,
            edge_type.as_ptr(),
            edge_props.as_ptr(),
        )
    };
    assert_eq!(edge_id, 0);

    let query = CString::new("MATCH (n:Person) RETURN n ORDER BY n").expect("query");
    let query_json_ptr = unsafe { ogdb_query(handle, query.as_ptr()) };
    assert!(!query_json_ptr.is_null());
    let query_json = unsafe { take_c_string(query_json_ptr) };
    assert!(
        query_json.contains("\"row_count\": 2"),
        "query output: {query_json}"
    );

    let metrics_ptr = unsafe { ogdb_metrics(handle) };
    assert!(!metrics_ptr.is_null());
    let metrics_json = unsafe { take_c_string(metrics_ptr) };
    assert!(
        metrics_json.contains("\"node_count\":2"),
        "metrics output: {metrics_json}"
    );

    let checkpoint_status = unsafe { ogdb_checkpoint(handle) };
    assert_eq!(checkpoint_status, 0);

    let backup_path = unique_path("backup");
    let backup_raw = CString::new(backup_path.to_string_lossy().to_string()).expect("backup path");
    let backup_status = unsafe { ogdb_backup(handle, backup_raw.as_ptr()) };
    assert_eq!(backup_status, 0);

    unsafe { ogdb_close(handle) };
}

#[test]
fn ffi_import_and_export_json() {
    let db_path = unique_path("import-export");
    let db_path_raw = CString::new(db_path.to_string_lossy().to_string()).expect("db path cstr");
    let handle = unsafe { ogdb_init(db_path_raw.as_ptr()) };
    assert!(!handle.is_null(), "ogdb_init should return a handle");

    let import_path = unique_path("import-payload").with_extension("json");
    fs::write(
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

    let format_json = CString::new("json").expect("format");
    let import_raw = CString::new(import_path.to_string_lossy().to_string()).expect("import path");
    let import_status = unsafe { ogdb_import(handle, format_json.as_ptr(), import_raw.as_ptr()) };
    assert_eq!(import_status, 0);

    let export_path = unique_path("export-payload").with_extension("json");
    let export_raw = CString::new(export_path.to_string_lossy().to_string()).expect("export path");
    let export_status = unsafe { ogdb_export(handle, export_raw.as_ptr(), format_json.as_ptr()) };
    assert_eq!(export_status, 0);

    let exported = fs::read_to_string(export_path).expect("read export payload");
    assert!(exported.contains("\"nodes\""), "export output: {exported}");
    assert!(exported.contains("\"edges\""), "export output: {exported}");

    unsafe { ogdb_close(handle) };
}
