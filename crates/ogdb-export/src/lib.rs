//! `ogdb-export` — plain-data export-record types extracted out of
//! `ogdb-core` (6th facet of the 7-crate split: vector → algorithms →
//! text → temporal → import → types → **export**).
//!
//! Public surface (when populated by Phase 3 of the GREEN commit):
//! * `ExportNode` — 3 fields (`id: u64`, `labels: Vec<String>`,
//!   `properties: ogdb_types::PropertyMap`). Returned by
//!   `ogdb_core::Database::export_nodes` (which stays in `ogdb-core`).
//! * `ExportEdge` — 8 fields (`id`, `src`, `dst`, `edge_type`,
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
//!
//! **RED state (this commit):** this file is doc-only. The two record
//! struct definitions are still in `crates/ogdb-core/src/lib.rs:1003-1023`
//! and will be moved here in Phase 3 of the GREEN commit.
