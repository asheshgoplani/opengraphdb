//! RED-phase API smoke test for the extracted ogdb-temporal crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_temporal::{TemporalScope, TemporalFilter,
//! temporal_filter_matches, validate_valid_window}` are not yet
//! defined (`src/lib.rs` is intentionally empty).
//!
//! GREEN state (Phase 5 of the 8-phase workflow, see
//! .planning/ogdb-core-split-temporal/PLAN.md §6): every test passes
//! because the items have been added to
//! `crates/ogdb-temporal/src/lib.rs` (`TemporalScope` +
//! `TemporalFilter` moved out of `crates/ogdb-core/src/lib.rs` lines
//! 1284-1294; `temporal_filter_matches` + `validate_valid_window`
//! are pure helpers re-derived from `edge_matches_temporal_filter`
//! @19861 and `parse_edge_valid_window` @5641 bodies).

use ogdb_temporal::{
    temporal_filter_matches, validate_valid_window, TemporalFilter,
    TemporalScope,
};

#[test]
fn temporal_scope_has_two_variants() {
    // The enum's two variants are the contract `parse_match_temporal_filter`
    // (ogdb-core lib.rs:6847-6850) and `edge_matches_temporal_filter`
    // (ogdb-core lib.rs:19871/19881) pattern-match on. Adding or
    // removing a variant is a breaking change for the in-core callers.
    let variants = [TemporalScope::ValidTime, TemporalScope::SystemTime];
    assert_eq!(variants.len(), 2);
    // Copy + Clone + PartialEq + Eq must survive the move.
    let copy = variants[0];
    assert_eq!(copy, TemporalScope::ValidTime);
    let cloned = variants[1].clone();
    assert_eq!(format!("{cloned:?}"), "SystemTime");
}

#[test]
fn temporal_filter_is_plain_data() {
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_750_000_000_000,
    };
    let cloned = f.clone();
    assert_eq!(f, cloned);
    assert_eq!(cloned.scope, TemporalScope::ValidTime);
    assert_eq!(cloned.timestamp_millis, 1_750_000_000_000);
}

#[test]
fn validtime_with_no_filter_window_always_passes() {
    // Open both ends → filter is satisfied for any timestamp.
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, None, None, 0));
}

#[test]
fn validtime_lower_bound_inclusive() {
    // valid_from <= timestamp_millis ⇒ pass.
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, Some(1_000), None, 0));
    assert!(temporal_filter_matches(&f, Some(999), None, 0));
    assert!(!temporal_filter_matches(&f, Some(1_001), None, 0));
}

#[test]
fn validtime_upper_bound_exclusive() {
    // valid_to > timestamp_millis ⇒ pass. Half-open interval.
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, None, Some(1_001), 0));
    assert!(!temporal_filter_matches(&f, None, Some(1_000), 0)); // exclusive
    assert!(!temporal_filter_matches(&f, None, Some(999), 0));
}

#[test]
fn validtime_both_bounds_combine() {
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    // [500, 1500) — 1000 is inside.
    assert!(temporal_filter_matches(&f, Some(500), Some(1_500), 0));
    // [1000, 1500) — 1000 is the lower bound (inclusive).
    assert!(temporal_filter_matches(&f, Some(1_000), Some(1_500), 0));
    // [500, 1000) — 1000 is the upper bound (exclusive).
    assert!(!temporal_filter_matches(&f, Some(500), Some(1_000), 0));
    // [1500, 2000) — 1000 is below the lower bound.
    assert!(!temporal_filter_matches(&f, Some(1_500), Some(2_000), 0));
}

#[test]
fn systemtime_uses_transaction_time_only() {
    // SystemTime: transaction_time_millis <= filter.timestamp_millis.
    // valid_from / valid_to are ignored entirely.
    let f = TemporalFilter {
        scope: TemporalScope::SystemTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, None, None, 1_000));
    assert!(temporal_filter_matches(&f, None, None, 999));
    assert!(!temporal_filter_matches(&f, None, None, 1_001));
    // Even with valid_from/valid_to set to mismatched values,
    // SystemTime ignores them.
    assert!(temporal_filter_matches(&f, Some(99_999), Some(99_999), 500));
}

#[test]
fn validate_valid_window_accepts_all_open_combinations() {
    assert!(validate_valid_window(None, None).is_ok());
    assert!(validate_valid_window(Some(100), None).is_ok());
    assert!(validate_valid_window(None, Some(200)).is_ok());
    assert!(validate_valid_window(Some(100), Some(200)).is_ok());
}

#[test]
fn validate_valid_window_rejects_inverted_or_zero_width() {
    let err_inverted = validate_valid_window(Some(200), Some(100))
        .expect_err("inverted window must be rejected");
    assert!(
        err_inverted.contains("valid_to must be greater than valid_from"),
        "got: {err_inverted}",
    );
    // valid_to == valid_from is also rejected (zero-width window).
    let err_equal = validate_valid_window(Some(100), Some(100))
        .expect_err("zero-width window must be rejected");
    assert!(
        err_equal.contains("valid_to must be greater than valid_from"),
        "got: {err_equal}",
    );
}

#[test]
fn validate_valid_window_error_message_pins_in_core_format() {
    // The exact error string is load-bearing: parse_edge_valid_window
    // (ogdb-core lib.rs:5648) wraps it via DbError::InvalidArgument(_)
    // and surfaces it to Cypher CREATE callers + the ogdb-e2e harness.
    // Changing this message is a user-visible breaking change.
    let err = validate_valid_window(Some(200), Some(100))
        .expect_err("inverted window");
    assert_eq!(err, "valid_to must be greater than valid_from");
}
