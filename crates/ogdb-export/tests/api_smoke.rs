//! API-shape smoke tests for the new `ogdb-export` crate.
//!
//! Pins the public surface of `ExportNode` + `ExportEdge` — the two
//! plain-data record types extracted out of `ogdb-core` by
//! `plan/ogdb-core-split-export`. The `ogdb-cli` crate (the only
//! downstream consumer, with 16 source-level references in
//! `crates/ogdb-cli/src/lib.rs`) and the in-core integration tests
//! at `crates/ogdb-core/src/lib.rs:25952` and `:26012` depend on
//! every field name, every field type, and every derived trait
//! exercised by these tests. If any of them changes, this file stops
//! compiling and surfaces the break before downstream builds see it.
//!
//! RED state (this commit): fails to compile because
//! `crates/ogdb-export/src/lib.rs` is still doc-only — neither
//! `ExportNode` nor `ExportEdge` have been moved out of
//! `crates/ogdb-core/src/lib.rs:1003-1023` yet. Expected error:
//!
//! ```text
//! error[E0432]: unresolved imports `ogdb_export::ExportEdge`,
//! `ogdb_export::ExportNode`
//!   --> crates/ogdb-export/tests/api_smoke.rs:N:M
//! ```
//!
//! GREEN state (Phase 5): once the two structs land in
//! `crates/ogdb-export/src/lib.rs` and `ogdb-core` re-exports them
//! via `pub use ogdb_export::{ExportEdge, ExportNode};`, all 5 tests
//! pass.

use std::any::TypeId;

use ogdb_export::{ExportEdge, ExportNode};
use ogdb_types::{PropertyMap, PropertyValue};

#[test]
fn export_node_has_three_pub_fields() {
    // Pin every field name, type, and visibility. If a future refactor
    // renames `id` → `node_id` (or similar), this test stops compiling
    // and surfaces the break before the CLI rebuilds. The CLI consumes
    // `nodes[0].id` / `nodes[0].labels` / `nodes[0].properties` at
    // 16 source-level sites in `crates/ogdb-cli/src/lib.rs`.
    let mut props = PropertyMap::new();
    props.insert("name".to_string(), PropertyValue::String("Alice".into()));

    let n = ExportNode {
        id: 7u64,
        labels: vec!["Person".to_string(), "Employee".to_string()],
        properties: props.clone(),
    };

    assert_eq!(n.id, 7u64);
    assert_eq!(n.labels, vec!["Person".to_string(), "Employee".to_string()]);
    assert_eq!(
        n.properties.get("name"),
        Some(&PropertyValue::String("Alice".into()))
    );
}

#[test]
fn export_edge_has_eight_pub_fields() {
    // Pin all 8 fields on `ExportEdge`. The bitemporal trio
    // (`valid_from`, `valid_to`, `transaction_time_millis`) is
    // load-bearing for the CLI's CSV/JSON/RDF exporters and for the
    // in-core integration test at `lib.rs:26031` that asserts on
    // visibility under MVCC.
    let mut props = PropertyMap::new();
    props.insert("since".into(), PropertyValue::I64(2020));

    let e = ExportEdge {
        id: 0u64,
        src: 1u64,
        dst: 2u64,
        edge_type: Some("KNOWS".to_string()),
        properties: props,
        valid_from: Some(1_700_000_000_000),
        valid_to: None,
        transaction_time_millis: 1_700_000_500_000,
    };

    assert_eq!(e.id, 0u64);
    assert_eq!(e.src, 1u64);
    assert_eq!(e.dst, 2u64);
    assert_eq!(e.edge_type.as_deref(), Some("KNOWS"));
    assert_eq!(
        e.properties.get("since"),
        Some(&PropertyValue::I64(2020))
    );
    assert_eq!(e.valid_from, Some(1_700_000_000_000));
    assert_eq!(e.valid_to, None);
    assert_eq!(e.transaction_time_millis, 1_700_000_500_000);
}

#[test]
fn export_node_round_trips_via_clone_and_eq() {
    // Pin the `#[derive(Debug, Clone, PartialEq, Eq)]` contract used
    // by the CLI's `HashMap<u64, &ExportNode>` collection at
    // `crates/ogdb-cli/src/lib.rs:7311` and by the in-core
    // integration test at `lib.rs:25981` that calls `assert_eq!` on
    // returned records.
    let n = ExportNode {
        id: 42,
        labels: vec!["A".into(), "B".into()],
        properties: PropertyMap::new(),
    };
    let cloned = n.clone();
    assert_eq!(n, cloned);
    // `Debug` is also load-bearing — the CLI uses `format!("{:?}", n)`
    // in error reporting paths.
    let _ = format!("{:?}", n);
}

#[test]
fn export_edge_round_trips_via_clone_and_eq() {
    let e = ExportEdge {
        id: 9,
        src: 0,
        dst: 0,
        edge_type: None,
        properties: PropertyMap::new(),
        valid_from: None,
        valid_to: None,
        transaction_time_millis: 0,
    };
    let cloned = e.clone();
    assert_eq!(e, cloned);
    let _ = format!("{:?}", e);
}

#[test]
fn property_map_field_uses_ogdb_types_alias() {
    // Pin that the `properties` field type on `ExportNode` /
    // `ExportEdge` is *the* re-exported `ogdb_types::PropertyMap`
    // alias — not a private duplicate. If a future refactor
    // accidentally inlines a parallel `BTreeMap<String, PropertyValue>`
    // alias inside `ogdb-export`, the bolt-server / WAL / CLI
    // round-trip contract silently breaks because parallel aliases
    // produce parallel `TypeId`s.
    let n = ExportNode {
        id: 0,
        labels: Vec::new(),
        properties: PropertyMap::new(),
    };
    // `TypeId::of::<PropertyMap>()` is the alias's underlying
    // `BTreeMap<String, PropertyValue>` `TypeId`. The field's
    // run-time type must match it bit-for-bit.
    fn type_id_of_val<T: 'static>(_: &T) -> TypeId {
        TypeId::of::<T>()
    }
    assert_eq!(
        type_id_of_val(&n.properties),
        TypeId::of::<PropertyMap>(),
        "ExportNode.properties must be ogdb_types::PropertyMap (the \
         re-exported alias), not a parallel duplicate"
    );

    let e = ExportEdge {
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
        type_id_of_val(&e.properties),
        TypeId::of::<PropertyMap>(),
        "ExportEdge.properties must be ogdb_types::PropertyMap (the \
         re-exported alias), not a parallel duplicate"
    );
}
