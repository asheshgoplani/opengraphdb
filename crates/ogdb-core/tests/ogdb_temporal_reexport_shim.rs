//! Shim regression: `ogdb_core::TemporalScope` and
//! `ogdb_core::TemporalFilter` must remain nameable from the
//! `ogdb_core::` root after the Phase-4 temporal split.
//!
//! No downstream crate today imports either type, but the in-core
//! Cypher AST (`MatchClause.temporal_filter` @1705 + 5 planner-op
//! variants @2097/2192/2231/2341 + 1 SQL-builder field @4259) and
//! the Cypher parser's `parse_match_temporal_filter` (@6846) rely on
//! these types being the same single definition shared with
//! `ogdb_temporal`. A silent parallel definition in ogdb-core would
//! corrupt pattern matching in `edge_matches_temporal_filter`
//! (@19871/19881) and break the parser's constructor at @6854. Pin
//! the re-export identity here.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-temporal (`unresolved import
//! ogdb_temporal`), and `ogdb_core::TemporalScope` /
//! `ogdb_core::TemporalFilter` are still the in-core originals, not
//! re-exports — so the TypeId equality below would spuriously hold
//! (same type is on both sides) if the test compiled, but it does
//! not compile.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_temporal::{TemporalFilter, TemporalScope};` and the
//! TypeId equalities below hold because both sides resolve to the
//! single definitions in ogdb-temporal.

use std::any::TypeId;

#[test]
fn temporal_scope_is_reexported_from_ogdb_temporal() {
    // If this line fails to compile, any future downstream caller
    // writing `use ogdb_core::TemporalScope;` will also break.
    let _vt = ogdb_core::TemporalScope::ValidTime;
    let _st = ogdb_core::TemporalScope::SystemTime;

    assert_eq!(
        TypeId::of::<ogdb_core::TemporalScope>(),
        TypeId::of::<ogdb_temporal::TemporalScope>(),
        "ogdb_core::TemporalScope must be a `pub use` re-export of \
         ogdb_temporal::TemporalScope, not a duplicate type. See \
         .planning/ogdb-core-split-temporal/PLAN.md §7.",
    );
}

#[test]
fn temporal_filter_is_reexported_from_ogdb_temporal() {
    assert_eq!(
        TypeId::of::<ogdb_core::TemporalFilter>(),
        TypeId::of::<ogdb_temporal::TemporalFilter>(),
        "ogdb_core::TemporalFilter must be a `pub use` re-export of \
         ogdb_temporal::TemporalFilter, not a duplicate type.",
    );

    // Constructor round-trip across the shim — proves field layout
    // survives the re-export. Pinned to the literal value used in
    // the in-core parser test at lib.rs:37671/37682.
    let f = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::ValidTime,
        timestamp_millis: 1_750_000_000_000,
    };
    assert_eq!(f.timestamp_millis, 1_750_000_000_000);
    assert_eq!(f.scope, ogdb_core::TemporalScope::ValidTime);
}

#[test]
fn cross_shim_equality_via_construction() {
    // Construct via the ogdb-core re-export, compare against a value
    // constructed via ogdb-temporal directly — proves the shim is a
    // pure re-export, not a parallel copy. Pattern-match is the
    // load-bearing path inside Database::edge_matches_temporal_filter.
    let via_core = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::SystemTime,
        timestamp_millis: 42,
    };
    let via_temporal = ogdb_temporal::TemporalFilter {
        scope: ogdb_temporal::TemporalScope::SystemTime,
        timestamp_millis: 42,
    };
    assert_eq!(via_core, via_temporal);
    // And the inverse construction direction.
    let via_temporal_to_core: ogdb_core::TemporalFilter = via_temporal.clone();
    assert_eq!(via_temporal_to_core, via_core);
}

#[test]
fn ogdb_temporal_helpers_are_callable_via_ogdb_temporal_root() {
    // Regression pin: the 2 pure fns must be directly callable from
    // `ogdb_temporal::` — `ogdb-core`'s `Database::edge_matches_temporal_filter`
    // (body refactored in Phase 4) and `parse_edge_valid_window`
    // (body refactored in Phase 4) both depend on these paths via
    // `use ogdb_temporal::{temporal_filter_matches, validate_valid_window};`.
    //
    // We assert the callable paths here (not just type identities)
    // because free fns cannot be compared via TypeId.
    let f = ogdb_temporal::TemporalFilter {
        scope: ogdb_temporal::TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(ogdb_temporal::temporal_filter_matches(
        &f,
        Some(500),
        Some(1_500),
        0,
    ));
    assert!(!ogdb_temporal::temporal_filter_matches(
        &f,
        Some(2_000),
        None,
        0,
    ));

    assert!(ogdb_temporal::validate_valid_window(Some(100), Some(200)).is_ok());
    let err = ogdb_temporal::validate_valid_window(Some(200), Some(100))
        .expect_err("inverted window");
    assert_eq!(err, "valid_to must be greater than valid_from");
}

#[test]
fn pattern_match_through_shim_compiles() {
    // The hot path inside Database::edge_matches_temporal_filter
    // (@19871/19881) does `match filter.scope { ValidTime => …,
    // SystemTime => … }` against a `&TemporalFilter` whose type is
    // referenced via the re-exported in-core path. Prove that pattern
    // matching across the shim still exhausts both arms.
    fn classify(f: &ogdb_core::TemporalFilter) -> &'static str {
        match f.scope {
            ogdb_core::TemporalScope::ValidTime => "valid",
            ogdb_core::TemporalScope::SystemTime => "system",
        }
    }
    let v = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::ValidTime,
        timestamp_millis: 0,
    };
    let s = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::SystemTime,
        timestamp_millis: 0,
    };
    assert_eq!(classify(&v), "valid");
    assert_eq!(classify(&s), "system");
}
