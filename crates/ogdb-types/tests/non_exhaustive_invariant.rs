//! Regression test for EVAL-RUST-QUALITY-CYCLE3 B3.
//!
//! `PropertyValue` is `#[non_exhaustive]` so downstream crates cannot write
//! exhaustive `match` arms over it. With `#[deny(unreachable_patterns)]`,
//! the trailing wildcard `_` arm below is only valid because the marker
//! is in place: removing the `#[non_exhaustive]` attribute would make the
//! wildcard unreachable, failing this test at compile time.

#![deny(unreachable_patterns)]

use ogdb_types::PropertyValue;

#[test]
fn property_value_requires_wildcard_in_external_crate() {
    fn classify(value: &PropertyValue) -> &'static str {
        match value {
            PropertyValue::Bool(_) => "bool",
            PropertyValue::I64(_) => "i64",
            PropertyValue::F64(_) => "f64",
            PropertyValue::String(_) => "string",
            PropertyValue::Bytes(_) => "bytes",
            PropertyValue::Vector(_) => "vector",
            PropertyValue::Date(_) => "date",
            PropertyValue::DateTime { .. } => "datetime",
            PropertyValue::Duration { .. } => "duration",
            PropertyValue::List(_) => "list",
            PropertyValue::Map(_) => "map",
            // SAFETY: this wildcard is required because PropertyValue is
            // marked `#[non_exhaustive]`. If a future PR removes the
            // attribute, `unreachable_patterns` will fire here.
            _ => "unknown",
        }
    }
    assert_eq!(classify(&PropertyValue::Bool(true)), "bool");
}
