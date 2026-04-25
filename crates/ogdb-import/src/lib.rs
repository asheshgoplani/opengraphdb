//! `ogdb-import` — RED-phase placeholder.
//!
//! Phase 2 of the import-facet extraction (5th `ogdb-core` split,
//! after `ogdb-vector`, `ogdb-algorithms`, `ogdb-text`, and
//! `ogdb-temporal`). This file is intentionally empty so that the
//! companion RED tests at
//!
//! * `crates/ogdb-import/tests/api_smoke.rs`
//! * `crates/ogdb-core/tests/ogdb_import_reexport_shim.rs`
//!
//! both fail to compile with `unresolved import ogdb_import::*` —
//! the expected RED signal. Phase 3 (GREEN) populates this file
//! with the four plain-data document-ingest types
//! (`DocumentFormat`, `IngestConfig`, `IngestResult`,
//! `ParsedSection`) plus the five pure parser/chunker helpers
//! moved out of `crates/ogdb-core/src/lib.rs`.
//!
//! See `.planning/ogdb-core-split-import/PLAN.md` for the full
//! rationale, module map, and 8-phase TDD recipe.
