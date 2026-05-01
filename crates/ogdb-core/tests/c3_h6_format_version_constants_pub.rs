//! C3-H6 regression gate: the five file-format version constants documented
//! in `documentation/COMPATIBILITY.md` § 2 must be reachable from outside the
//! crate. The doc claimed they were `pub const` but cycle 3 found them all
//! crate-private — a downstream consumer trying to gate at compile time hit
//! `error[E0603]: constant ... is private`. Promoting them to `pub const`
//! also makes them render on docs.rs/ogdb-core (private items don't).
//!
//! This integration test (which can only see the crate's `pub` surface)
//! references each constant; failure here means a future refactor demoted
//! one back to crate-private, breaking the COMPATIBILITY policy.

use ogdb_core::{
    CSR_LAYOUT_FORMAT_VERSION, FREE_LIST_FORMAT_VERSION, META_FORMAT_VERSION,
    NODE_PROPERTY_STORE_FORMAT_VERSION, VECTOR_INDEX_FORMAT_VERSION,
};

#[test]
fn format_version_constants_are_publicly_observable() {
    // The exact value doesn't matter here — only that the constant is
    // reachable from a consumer crate. If the integration test compiles,
    // the constant is pub. The runtime asserts pin the v1 baseline so a
    // value bump shows up in code review.
    assert_eq!(META_FORMAT_VERSION, 1);
    assert_eq!(FREE_LIST_FORMAT_VERSION, 1);
    assert_eq!(CSR_LAYOUT_FORMAT_VERSION, 1);
    assert_eq!(NODE_PROPERTY_STORE_FORMAT_VERSION, 1);
    assert_eq!(VECTOR_INDEX_FORMAT_VERSION, 1);
}
