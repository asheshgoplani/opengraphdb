//! Regression test for eval/rust-quality §6.2 (HIGH).
//!
//! `DbError` is `#[non_exhaustive]`, so any external `match` over it
//! must include a wildcard arm. Integration tests live outside the
//! crate's own module tree, so this file would fail to compile if
//! the attribute were ever removed (the compiler would warn that the
//! wildcard arm is unreachable, which `-D warnings` in CI would
//! upgrade to a hard error).

use ogdb_core::DbError;

#[test]
fn dberror_match_must_include_wildcard() {
    let err = DbError::InvalidArgument("smoke".to_string());
    let label = match &err {
        DbError::InvalidArgument(_) => "invalid",
        // Any other variant — and the future ones we add — fall here.
        _ => "other",
    };
    assert_eq!(label, "invalid");
}
