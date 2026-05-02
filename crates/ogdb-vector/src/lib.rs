//! Pure-Rust vector primitives extracted from `ogdb-core`.
//!
//! This crate is the beachhead of the 7-crate decomposition of the
//! `ogdb-core` monolith (see `.planning/ogdb-core-split-vector/PLAN.md`
//! and `ARCHITECTURE.md` §13). It owns exactly five items, all
//! dependency-free beyond `serde`:
//!
//! - [`VectorDistanceMetric`] — the 3-variant metric enum.
//! - [`VectorIndexDefinition`] — catalog row for a vector index.
//! - [`vector_distance`] — the metric-dispatching distance function
//!   used by the Cypher planner and HNSW runtime.
//! - [`parse_vector_literal_text`] — `"[1.0, 2.5, -3.0]"` → `Vec<f32>`.
//! - [`compare_f32_vectors`] — NaN-safe total ordering used by
//!   `PropertyValue::Vector`'s `Ord` impl.
//!
//! The HNSW runtime, catalog persistence, and Cypher planner hooks
//! stay in `ogdb-core` for now (follow-up plan).

#![warn(missing_docs)]

use serde::{Deserialize, Serialize};

/// Distance metric variants supported by `ogdb-core`'s vector index.
///
/// `#[non_exhaustive]` so additional metrics (e.g. Manhattan, Hamming) can
/// be added without breaking downstream `match` arms. (EVAL-RUST-QUALITY-CYCLE3 B3.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[non_exhaustive]
pub enum VectorDistanceMetric {
    /// Cosine distance (`1 - dot/(‖a‖·‖b‖)`); zero-norm vectors return 1.0.
    Cosine,
    /// Standard Euclidean (L2) distance.
    Euclidean,
    /// Negated dot product, so smaller-is-better matches the other variants.
    DotProduct,
}

/// Catalog row for a Cypher vector index. Pinned in `meta.json`;
/// consumed by the HNSW index runtime in `ogdb-core`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct VectorIndexDefinition {
    /// User-supplied unique index name.
    pub name: String,
    /// Optional `:Label` filter; `None` means index spans all node labels.
    pub label: Option<String>,
    /// Single property key whose `Vector` value feeds the index.
    pub property_key: String,
    /// Vector dimensionality enforced at insert time.
    pub dimensions: usize,
    /// Distance metric used for ranking and recall.
    pub metric: VectorDistanceMetric,
}

/// NaN-safe total ordering between two `f32` slices.
///
/// Length is compared first; equal lengths fall back to per-element
/// `f32::total_cmp`. Used by `PropertyValue::Vector`'s `Ord` impl.
#[inline]
#[must_use]
pub fn compare_f32_vectors(left: &[f32], right: &[f32]) -> std::cmp::Ordering {
    let len_cmp = left.len().cmp(&right.len());
    if len_cmp != std::cmp::Ordering::Equal {
        return len_cmp;
    }
    for (l, r) in left.iter().zip(right.iter()) {
        let cmp = l.total_cmp(r);
        if cmp != std::cmp::Ordering::Equal {
            return cmp;
        }
    }
    std::cmp::Ordering::Equal
}

/// Parse a Cypher vector literal of the form `[1.0, 2.5, -3.0]` into a
/// `Vec<f32>`. Optional element prefixes `f64:` and `i64:` are
/// tolerated (and stripped). Returns `None` on any parse failure.
#[inline]
#[must_use]
pub fn parse_vector_literal_text(value: &str) -> Option<Vec<f32>> {
    let trimmed = value.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return None;
    }
    let body = &trimmed[1..trimmed.len() - 1];
    if body.trim().is_empty() {
        return Some(Vec::new());
    }
    body.split(',')
        .map(|entry| {
            let entry = entry.trim();
            let entry = entry
                .strip_prefix("f64:")
                .or_else(|| entry.strip_prefix("i64:"))
                .unwrap_or(entry);
            entry.parse::<f32>().ok()
        })
        .collect::<Option<Vec<_>>>()
}

/// Parse a user-supplied metric name (the binding-crate input shape:
/// `Option<&str>` from a JS/Python caller, defaulting to `"cosine"` on
/// `None`) into a [`VectorDistanceMetric`].
///
/// Accepted aliases (ASCII-lowercased and trimmed before matching):
/// - `"cosine"` → `Cosine`
/// - `"euclidean"` / `"l2"` → `Euclidean`
/// - `"dot"` / `"dotproduct"` / `"dot_product"` → `DotProduct`
///
/// EVAL-RUST-QUALITY-CYCLE9 H4: deduped from the byte-identical
/// `parse_metric` previously copy-pasted into `ogdb-python` and
/// `ogdb-node`.
#[inline]
pub fn parse_distance_metric(raw: Option<&str>) -> Result<VectorDistanceMetric, String> {
    match raw.unwrap_or("cosine").trim().to_ascii_lowercase().as_str() {
        "cosine" => Ok(VectorDistanceMetric::Cosine),
        "euclidean" | "l2" => Ok(VectorDistanceMetric::Euclidean),
        "dot" | "dotproduct" | "dot_product" => Ok(VectorDistanceMetric::DotProduct),
        other => Err(format!("unsupported vector distance metric: {other}")),
    }
}

/// Compute the metric-specific distance between two equal-length
/// non-empty vectors. Returns `None` when the lengths differ or
/// either vector is empty.
#[inline]
#[must_use]
pub fn vector_distance(metric: VectorDistanceMetric, left: &[f32], right: &[f32]) -> Option<f32> {
    if left.len() != right.len() || left.is_empty() {
        return None;
    }
    match metric {
        VectorDistanceMetric::Cosine => {
            let mut dot = 0.0f32;
            let mut left_norm = 0.0f32;
            let mut right_norm = 0.0f32;
            for (l, r) in left.iter().zip(right.iter()) {
                dot += *l * *r;
                left_norm += *l * *l;
                right_norm += *r * *r;
            }
            if left_norm == 0.0 || right_norm == 0.0 {
                return Some(1.0);
            }
            Some(1.0 - (dot / (left_norm.sqrt() * right_norm.sqrt())))
        }
        VectorDistanceMetric::Euclidean => {
            let sum_sq = left
                .iter()
                .zip(right.iter())
                .map(|(l, r)| {
                    let diff = *l - *r;
                    diff * diff
                })
                .sum::<f32>();
            Some(sum_sq.sqrt())
        }
        VectorDistanceMetric::DotProduct => {
            let dot = left
                .iter()
                .zip(right.iter())
                .map(|(l, r)| *l * *r)
                .sum::<f32>();
            Some(-dot)
        }
    }
}
