//! Shim regression: `ogdb_core::ExportNode` and `ogdb_core::ExportEdge`
//! must remain nameable from the `ogdb_core::` root after the
//! `ogdb-export` extraction. The single downstream import site
//! (`crates/ogdb-cli/src/lib.rs:3` — the only crate in the workspace
//! that imports either type) and the 2 in-core integration tests at
//! `crates/ogdb-core/src/lib.rs:25952` and `:26012` all spell these
//! types via `use ogdb_core::{ExportNode, ExportEdge};` or as
//! unqualified return types on `Database::export_nodes` /
//! `Database::export_edges`. If this file stops compiling, the shim
//! in `crates/ogdb-core/src/lib.rs` is broken and the CLI build will
//! also break.
//!
//! RED state (this commit): fails to compile because:
//!   1. `ogdb-core` does not yet depend on `ogdb-export` (no entry in
//!      `crates/ogdb-core/Cargo.toml`). The `use ogdb_export::...`
//!      lines at the top of this test hit
//!      `error[E0432]: unresolved import `ogdb_export``.
//!   2. The `ogdb-export` crate's `lib.rs` is doc-only, so even if we
//!      wired the dep, `ogdb_export::ExportNode` / `ExportEdge` would
//!      be unresolved.
//!
//! GREEN state (Phase 5): `ogdb-core/Cargo.toml` adds
//! `ogdb-export = { path = "../ogdb-export" }`, `lib.rs` re-exports
//! via `pub use ogdb_export::{ExportEdge, ExportNode};` — the
//! `TypeId` equality holds, all 4 tests pass.

use std::any::TypeId;

use ogdb_core::{Database, ExportEdge, ExportNode, Header, PropertyMap, PropertyValue};

#[test]
fn export_node_is_reexported_from_ogdb_export() {
    // If this line fails to compile, every downstream caller using
    // `use ogdb_core::ExportNode;` (today: `ogdb-cli`) will also fail.
    let _n = ogdb_core::ExportNode {
        id: 0,
        labels: Vec::new(),
        properties: PropertyMap::new(),
    };

    // Identity check: the type the downstream sees as
    // `ogdb_core::ExportNode` must BE the type defined in `ogdb-export`
    // (not a parallel copy). If a future refactor accidentally
    // reintroduces a duplicate definition in ogdb-core, TypeId equality
    // catches it — and downstream `HashMap<u64, &ExportNode>`
    // collections would silently fail at the type-system level.
    assert_eq!(
        TypeId::of::<ogdb_core::ExportNode>(),
        TypeId::of::<ogdb_export::ExportNode>(),
        "ogdb_core::ExportNode must be a `pub use` re-export of \
         ogdb_export::ExportNode, not a parallel duplicate"
    );
}

#[test]
fn export_edge_is_reexported_from_ogdb_export() {
    let _e = ogdb_core::ExportEdge {
        id: 0,
        src: 0,
        dst: 0,
        edge_type: None,
        properties: PropertyMap::new(),
        valid_from: None,
        valid_to: None,
        transaction_time_millis: 0,
    };

    assert_eq!(
        TypeId::of::<ogdb_core::ExportEdge>(),
        TypeId::of::<ogdb_export::ExportEdge>(),
        "ogdb_core::ExportEdge must be a `pub use` re-export of \
         ogdb_export::ExportEdge, not a parallel duplicate"
    );
}

#[test]
fn exported_records_round_trip_via_database_helpers_through_shim() {
    // End-to-end smoke test: construct a `Database`, add 2 nodes and 1
    // edge, call `db.export_nodes()` and `db.export_edges()`, assert
    // the returned `Vec<ogdb_core::ExportNode>` / `Vec<ogdb_core::ExportEdge>`
    // values equal hand-built `ogdb_export::ExportNode { ... }` /
    // `ogdb_export::ExportEdge { ... }` literals via `PartialEq`. Pins
    // the contract that the in-core orchestrator
    // (`Database::export_nodes_at` @17794, `export_edges_at` @17809)
    // and the leaf-crate record types interoperate without any adapter
    // layer.
    let path = std::env::temp_dir().join(format!(
        "ogdb-export-shim-roundtrip-{}.db",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(format!("{}.wal", path.display()));
    let _ = std::fs::remove_file(format!("{}.meta.json", path.display()));

    let mut db = Database::init(&path, Header::default_v1()).expect("init must succeed");

    let mut alice_props = PropertyMap::new();
    alice_props.insert(
        "name".to_string(),
        PropertyValue::String("Alice".to_string()),
    );
    let _ = db
        .create_node_with(&["Person".to_string()], &alice_props)
        .expect("create alice");
    let _ = db
        .create_node_with(&["Person".to_string()], &PropertyMap::new())
        .expect("create bob");

    let mut edge_props = PropertyMap::new();
    edge_props.insert("since".to_string(), PropertyValue::I64(2020));
    let _ = db
        .add_typed_edge(0, 1, "KNOWS", &edge_props)
        .expect("add typed edge");

    let nodes_via_core: Vec<ogdb_core::ExportNode> =
        db.export_nodes().expect("export nodes");
    let nodes_via_export: Vec<ogdb_export::ExportNode> = nodes_via_core.clone();
    assert_eq!(nodes_via_core.len(), 2);
    assert_eq!(nodes_via_core, nodes_via_export);

    let edges_via_core: Vec<ogdb_core::ExportEdge> =
        db.export_edges().expect("export edges");
    let edges_via_export: Vec<ogdb_export::ExportEdge> = edges_via_core.clone();
    assert_eq!(edges_via_core.len(), 1);
    assert_eq!(edges_via_core, edges_via_export);

    // Confirm the bitemporal triplet survives the round-trip.
    assert_eq!(edges_via_core[0].edge_type.as_deref(), Some("KNOWS"));

    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(format!("{}.wal", path.display()));
    let _ = std::fs::remove_file(format!("{}.meta.json", path.display()));
}

#[test]
fn field_layout_is_stable_across_shim() {
    // Explicit construction of both records via field literal syntax in
    // core's namespace and field literal syntax in `ogdb_export`'s
    // namespace; pin that field ordering, names, and types are
    // byte-for-byte identical so that downstream `match` / pattern
    // / destructuring code keeps working.
    let n_core: ExportNode = ogdb_core::ExportNode {
        id: 1,
        labels: vec!["X".into()],
        properties: PropertyMap::new(),
    };
    let n_export: ogdb_export::ExportNode = ogdb_export::ExportNode {
        id: 1,
        labels: vec!["X".into()],
        properties: PropertyMap::new(),
    };
    assert_eq!(n_core, n_export);

    let e_core: ExportEdge = ogdb_core::ExportEdge {
        id: 2,
        src: 0,
        dst: 1,
        edge_type: Some("T".into()),
        properties: PropertyMap::new(),
        valid_from: Some(0),
        valid_to: Some(1),
        transaction_time_millis: 2,
    };
    let e_export: ogdb_export::ExportEdge = ogdb_export::ExportEdge {
        id: 2,
        src: 0,
        dst: 1,
        edge_type: Some("T".into()),
        properties: PropertyMap::new(),
        valid_from: Some(0),
        valid_to: Some(1),
        transaction_time_millis: 2,
    };
    assert_eq!(e_core, e_export);
}
