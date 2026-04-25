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

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum VectorDistanceMetric {
    Cosine,
    Euclidean,
    DotProduct,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct VectorIndexDefinition {
    pub name: String,
    pub label: Option<String>,
    pub property_key: String,
    pub dimensions: usize,
    pub metric: VectorDistanceMetric,
}

#[inline]
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

#[inline]
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

#[inline]
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
