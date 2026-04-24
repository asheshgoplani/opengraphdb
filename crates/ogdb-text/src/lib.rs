//! `ogdb-text` — full-text index plain-data + validation + path
//! helpers (the third facet of the 7-crate split from
//! `ARCHITECTURE.md` §13, after `ogdb-vector` and `ogdb-algorithms`).
//!
//! RED phase (this commit): intentionally empty. The GREEN phase
//! moves `FullTextIndexDefinition`,
//! `normalize_fulltext_index_definition`,
//! `fulltext_index_root_path_for_db`, `sanitize_index_component`,
//! and `fulltext_index_path_for_name` out of
//! `crates/ogdb-core/src/lib.rs` into this crate. See
//! `.planning/ogdb-core-split-text/PLAN.md`.
