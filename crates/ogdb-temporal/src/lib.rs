//! `ogdb-temporal` — plain-data temporal types + pure decision helpers.
//!
//! This is the 4th seed crate in the `ogdb-core` split (after
//! `ogdb-vector`, `ogdb-algorithms`, and `ogdb-text`). It owns two
//! pure plain-data types and two pure free functions:
//!
//! * [`TemporalScope`] — bitemporal axis selector (valid time vs.
//!   system time).
//! * [`TemporalFilter`] — snapshot-style filter for a Cypher
//!   `MATCH … AT TIME …` clause.
//! * [`temporal_filter_matches`] — pure predicate mirroring the
//!   decision logic inside `Database::edge_matches_temporal_filter`
//!   (in `ogdb-core`).
//! * [`validate_valid_window`] — pure invariant check mirroring the
//!   lower-bound clause inside `parse_edge_valid_window` (in
//!   `ogdb-core`).
//!
//! Everything coupled to `Database`, `PropertyMap`, `DbError`, the
//! Cypher parser, or the meta-catalog persist layer stays in
//! `ogdb-core`. See `.planning/ogdb-core-split-temporal/PLAN.md`
//! for the full rationale.

/// Bitemporal scope of a Cypher `AT TIME` / `AT SYSTEM TIME` filter.
///
/// `ValidTime` queries the application time axis (`valid_from` /
/// `valid_to` per edge); `SystemTime` queries the transaction-time
/// axis (`transaction_time_millis` per edge).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TemporalScope {
    ValidTime,
    SystemTime,
}

/// Snapshot-style temporal filter applied to a `MATCH` clause, e.g.
/// `MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000`.
///
/// Constructed by the Cypher parser's `parse_match_temporal_filter`
/// (in `ogdb-core`) and consumed by
/// `Database::edge_matches_temporal_filter` (in `ogdb-core`, body
/// delegates the pure decision to [`temporal_filter_matches`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemporalFilter {
    pub scope: TemporalScope,
    pub timestamp_millis: i64,
}

/// Pure decision predicate: does a single edge (described by its
/// valid-window endpoints + transaction time) satisfy `filter`?
///
/// * `ValidTime` — `valid_from <= filter.timestamp_millis` AND
///   `valid_to  > filter.timestamp_millis`. Open endpoints (`None`)
///   are treated as ∞ (always-ok).
/// * `SystemTime` — `transaction_time_millis <= filter.timestamp_millis`;
///   valid-window args are ignored.
#[inline]
pub fn temporal_filter_matches(
    filter: &TemporalFilter,
    valid_from: Option<i64>,
    valid_to: Option<i64>,
    transaction_time_millis: i64,
) -> bool {
    match filter.scope {
        TemporalScope::ValidTime => {
            let lower_ok = valid_from
                .map(|value| value <= filter.timestamp_millis)
                .unwrap_or(true);
            let upper_ok = valid_to
                .map(|value| value > filter.timestamp_millis)
                .unwrap_or(true);
            lower_ok && upper_ok
        }
        TemporalScope::SystemTime => transaction_time_millis <= filter.timestamp_millis,
    }
}

/// Pure invariant check for an edge's valid-time window: if both
/// `valid_from` and `valid_to` are present, `valid_to > valid_from`
/// MUST hold. The call site in `parse_edge_valid_window` (in
/// `ogdb-core`) adapts the error via
/// `.map_err(DbError::InvalidArgument)`.
#[inline]
pub fn validate_valid_window(valid_from: Option<i64>, valid_to: Option<i64>) -> Result<(), String> {
    if let (Some(from), Some(to)) = (valid_from, valid_to) {
        if to <= from {
            return Err("valid_to must be greater than valid_from".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_variants_roundtrip() {
        let vt = TemporalScope::ValidTime;
        let st = TemporalScope::SystemTime;
        assert_eq!(vt, TemporalScope::ValidTime);
        assert_ne!(vt, st);
        let copy = vt;
        assert_eq!(copy, vt);
    }

    #[test]
    fn filter_plain_data_roundtrip() {
        let f = TemporalFilter {
            scope: TemporalScope::ValidTime,
            timestamp_millis: 1_750_000_000_000,
        };
        let cloned = f.clone();
        assert_eq!(f, cloned);
    }

    #[test]
    fn validtime_open_window_passes() {
        let f = TemporalFilter {
            scope: TemporalScope::ValidTime,
            timestamp_millis: 1_000,
        };
        assert!(temporal_filter_matches(&f, None, None, 0));
    }

    #[test]
    fn validtime_lower_bound_inclusive() {
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
        let f = TemporalFilter {
            scope: TemporalScope::ValidTime,
            timestamp_millis: 1_000,
        };
        assert!(temporal_filter_matches(&f, None, Some(1_001), 0));
        assert!(!temporal_filter_matches(&f, None, Some(1_000), 0));
        assert!(!temporal_filter_matches(&f, None, Some(999), 0));
    }

    #[test]
    fn systemtime_ignores_valid_window() {
        let f = TemporalFilter {
            scope: TemporalScope::SystemTime,
            timestamp_millis: 1_000,
        };
        assert!(temporal_filter_matches(&f, None, None, 1_000));
        assert!(temporal_filter_matches(&f, None, None, 999));
        assert!(!temporal_filter_matches(&f, None, None, 1_001));
        assert!(temporal_filter_matches(&f, Some(99_999), Some(99_999), 500));
    }

    #[test]
    fn validator_accepts_open_combinations() {
        assert!(validate_valid_window(None, None).is_ok());
        assert!(validate_valid_window(Some(100), None).is_ok());
        assert!(validate_valid_window(None, Some(200)).is_ok());
        assert!(validate_valid_window(Some(100), Some(200)).is_ok());
    }

    #[test]
    fn validator_rejects_inverted_and_zero_width() {
        assert_eq!(
            validate_valid_window(Some(200), Some(100)).unwrap_err(),
            "valid_to must be greater than valid_from"
        );
        assert_eq!(
            validate_valid_window(Some(100), Some(100)).unwrap_err(),
            "valid_to must be greater than valid_from"
        );
    }
}
