//! Regression test for EVAL-RUST-QUALITY-CYCLE3 B3.
//!
//! `VectorDistanceMetric` is `#[non_exhaustive]` so downstream crates cannot
//! write exhaustive `match` arms over it. The trailing wildcard `_` arm is
//! only valid because the marker is in place; with
//! `#[deny(unreachable_patterns)]`, removing the marker would fail this
//! test at compile time.

#![deny(unreachable_patterns)]

use ogdb_vector::VectorDistanceMetric;

#[test]
fn vector_distance_metric_requires_wildcard_in_external_crate() {
    fn name(metric: VectorDistanceMetric) -> &'static str {
        match metric {
            VectorDistanceMetric::Cosine => "cosine",
            VectorDistanceMetric::Euclidean => "euclidean",
            VectorDistanceMetric::DotProduct => "dot",
            _ => "unknown",
        }
    }
    assert_eq!(name(VectorDistanceMetric::Cosine), "cosine");
}
