//! RED-phase placeholder for the `ogdb-temporal` extraction.
//!
//! This file is intentionally empty for the Phase-2 RED commit. The
//! plan-and-RED commit on branch `plan/ogdb-core-split-temporal`
//! ships only the failing tests at:
//!
//!   * `crates/ogdb-temporal/tests/api_smoke.rs`
//!   * `crates/ogdb-core/tests/ogdb_temporal_reexport_shim.rs`
//!
//! Both expect `TemporalScope`, `TemporalFilter`,
//! `temporal_filter_matches`, and `validate_valid_window` to be
//! defined here; until Phase 3 (GREEN) populates this crate they
//! intentionally fail to compile, which is the correct RED signal.
//!
//! See `.planning/ogdb-core-split-temporal/PLAN.md` for the full
//! 8-phase recipe.
