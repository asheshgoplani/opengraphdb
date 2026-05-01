//! Regression test for EVAL-RUST-QUALITY-CYCLE3 B3.
//!
//! `TemporalScope` is `#[non_exhaustive]`. Downstream crates must use a
//! wildcard arm in `match`. With `#[deny(unreachable_patterns)]`,
//! removing the marker would fail this test at compile time.

#![deny(unreachable_patterns)]

use ogdb_temporal::TemporalScope;

#[test]
fn temporal_scope_requires_wildcard_in_external_crate() {
    fn axis(scope: TemporalScope) -> &'static str {
        match scope {
            TemporalScope::ValidTime => "valid",
            TemporalScope::SystemTime => "system",
            _ => "unknown",
        }
    }
    assert_eq!(axis(TemporalScope::ValidTime), "valid");
}
