//! `ogdb-export` — plain-data export-record types extracted out of
//! `ogdb-core` (6th facet of the 7-crate split: vector → algorithms →
//! text → temporal → import → types → **export**).
//!
//! Public surface:
//! * [`ExportNode`] — 3 fields (`id: u64`, `labels: Vec<String>`,
//!   `properties: ogdb_types::PropertyMap`). Returned by
//!   `ogdb_core::Database::export_nodes` (which stays in `ogdb-core`).
//! * [`ExportEdge`] — 8 fields (`id`, `src`, `dst`, `edge_type`,
//!   `properties`, `valid_from`, `valid_to`,
//!   `transaction_time_millis`). Returned by
//!   `ogdb_core::Database::export_edges`.
//!
//! Both records are pure plain-data: `#[derive(Debug, Clone, PartialEq,
//! Eq)]` with no methods, no custom impls, no `Default`. The
//! `properties: PropertyMap` field type is provided by the
//! `ogdb-types` workspace path dep — the foundational extraction
//! shipped on `2026-04-26` (commit `39f9e7c`) that resolved the
//! `PropertyMap` cycle which had previously BLOCKED this seed (see
//! `.planning/ogdb-core-split-import/PLAN.md` §1).
//!
//! The Database-coupled orchestrator layer
//! (`Database::export_nodes`, `Database::export_edges`,
//! `Database::export_nodes_at`, `Database::export_edges_at`) **stays
//! in `ogdb-core`** for this seed because every method body iterates
//! `Snapshot`-coupled internals (`is_node_visible_at`,
//! `node_labels_at`, `node_properties_at`, `edge_records`,
//! `is_edge_visible_at`, `edge_valid_window_at`, `edge_type_at`,
//! `edge_properties_at`, `edge_transaction_time_millis_at`). Lifting
//! them requires the `ExportableDatabase` trait designed alongside
//! `NodeRead` / `EdgeRead` from
//! `plan/ogdb-core-split-algorithms-traversal`. Follow-up:
//! `plan/ogdb-core-split-export-runtime`.
//!
//! See `.planning/ogdb-core-split-export/PLAN.md` for rationale.

use ogdb_types::PropertyMap;

/// Export representation for one graph node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportNode {
    pub id: u64,
    pub labels: Vec<String>,
    pub properties: PropertyMap,
}

/// Export representation for one graph edge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportEdge {
    pub id: u64,
    pub src: u64,
    pub dst: u64,
    pub edge_type: Option<String>,
    pub properties: PropertyMap,
    pub valid_from: Option<i64>,
    pub valid_to: Option<i64>,
    pub transaction_time_millis: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ogdb_types::PropertyValue;

    #[test]
    fn export_node_default_construction_has_empty_collections() {
        let n = ExportNode {
            id: 0,
            labels: Vec::new(),
            properties: PropertyMap::new(),
        };
        assert_eq!(n.id, 0);
        assert!(n.labels.is_empty());
        assert!(n.properties.is_empty());
    }

    #[test]
    fn export_edge_default_construction_has_empty_properties() {
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
        assert!(e.properties.is_empty());
        assert!(e.edge_type.is_none());
        assert!(e.valid_from.is_none());
        assert!(e.valid_to.is_none());
    }

    #[test]
    fn export_node_clone_preserves_property_bag() {
        let mut props = PropertyMap::new();
        props.insert("k".into(), PropertyValue::String("v".into()));
        let n = ExportNode {
            id: 1,
            labels: vec!["L".into()],
            properties: props,
        };
        let cloned = n.clone();
        assert_eq!(n, cloned);
        assert_eq!(
            cloned.properties.get("k"),
            Some(&PropertyValue::String("v".into()))
        );
    }

    #[test]
    fn export_edge_clone_preserves_bitemporal_triplet() {
        let e = ExportEdge {
            id: 5,
            src: 1,
            dst: 2,
            edge_type: Some("KNOWS".into()),
            properties: PropertyMap::new(),
            valid_from: Some(100),
            valid_to: Some(200),
            transaction_time_millis: 150,
        };
        let cloned = e.clone();
        assert_eq!(e, cloned);
        assert_eq!(cloned.valid_from, Some(100));
        assert_eq!(cloned.valid_to, Some(200));
        assert_eq!(cloned.transaction_time_millis, 150);
    }
}
