//! Regression test for EVAL-RUST-QUALITY-CYCLE3 B3.
//!
//! `PackValue` is `#[non_exhaustive]`. Downstream crates must use a
//! wildcard arm in `match`. With `#[deny(unreachable_patterns)]`,
//! removing the marker would fail this test at compile time.

#![deny(unreachable_patterns)]

use ogdb_bolt::PackValue;

#[test]
fn pack_value_requires_wildcard_in_external_crate() {
    fn name(value: &PackValue) -> &'static str {
        match value {
            PackValue::Null => "null",
            PackValue::Bool(_) => "bool",
            PackValue::Integer(_) => "integer",
            PackValue::Float(_) => "float",
            PackValue::Bytes(_) => "bytes",
            PackValue::String(_) => "string",
            PackValue::List(_) => "list",
            PackValue::Map(_) => "map",
            PackValue::Structure(_) => "structure",
            _ => "unknown",
        }
    }
    assert_eq!(name(&PackValue::Null), "null");
}
