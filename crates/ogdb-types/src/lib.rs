//! RED-phase scaffold for `ogdb-types`.
//!
//! Phase 2 of the 8-phase workflow: this `lib.rs` is intentionally empty.
//! Its sole purpose is to make `crates/ogdb-types/` a compilable workspace
//! member so the failing tests in `tests/api_smoke.rs` resolve their
//! `use ogdb_types::*` imports as unresolved-symbol errors (the canonical
//! RED signal).
//!
//! Phases 3–5 (GREEN) populate this file with `PropertyValue`,
//! `PropertyMap`, the `Serialize`/`Deserialize`/`Ord`/`PartialOrd`/`Eq`
//! impls, and the private `property_value_variant_rank` helper, all moved
//! verbatim from `crates/ogdb-core/src/lib.rs:593-896`. After GREEN,
//! `ogdb-core` re-exports them via
//! `pub use ogdb_types::{PropertyMap, PropertyValue};` so all 558
//! downstream call sites continue to compile byte-for-byte unchanged.
//!
//! See `.planning/ogdb-types-extraction/PLAN.md` for the full design.
