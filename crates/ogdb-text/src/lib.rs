//! `ogdb-text` — full-text index plain-data + validation + path
//! helpers (the third facet of the 7-crate split from
//! `ARCHITECTURE.md` §13, after `ogdb-vector` and `ogdb-algorithms`).
//!
//! This crate owns one plain-data type (`FullTextIndexDefinition`),
//! one pure validator (`normalize_fulltext_index_definition`), and
//! three pure path helpers (`fulltext_index_root_path_for_db`,
//! `sanitize_index_component`, `fulltext_index_path_for_name`). Every
//! moved item has a signature that depends only on `&str`,
//! `&[String]`, `&Path`, and `PathBuf` — no `Database`, no
//! `DbError`, no `tantivy` dep. The tantivy-bound runtime cohort
//! (query/rebuild/hybrid) stays in `ogdb-core` for a follow-up plan.
//! See `.planning/ogdb-core-split-text/PLAN.md`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct FullTextIndexDefinition {
    pub name: String,
    pub label: Option<String>,
    pub property_keys: Vec<String>,
}

/// Validate and normalize caller-supplied name / label / property keys
/// into a canonical [`FullTextIndexDefinition`].
///
/// * `name` is trimmed and must be non-empty.
/// * `property_keys` must be non-empty; each is trimmed, must be
///   non-empty, and duplicates are rejected.
/// * `label` is trimmed; an empty string becomes `None`.
///
/// Returns `Result<_, String>`; the caller (`Database::create_fulltext_index`
/// in `ogdb-core`) wraps via `.map_err(DbError::InvalidArgument)`.
#[inline]
pub fn normalize_fulltext_index_definition(
    name: &str,
    label: Option<&str>,
    property_keys: &[String],
) -> Result<FullTextIndexDefinition, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("fulltext index name cannot be empty".to_string());
    }
    if property_keys.is_empty() {
        return Err("fulltext index must include at least one property key".to_string());
    }
    let mut normalized = Vec::<String>::new();
    let mut seen = BTreeSet::<String>::new();
    for key in property_keys {
        let key = key.trim();
        if key.is_empty() {
            return Err("fulltext index property key cannot be empty".to_string());
        }
        if !seen.insert(key.to_string()) {
            return Err(format!("duplicate fulltext index property key: {key}"));
        }
        normalized.push(key.to_string());
    }
    Ok(FullTextIndexDefinition {
        name: name.to_string(),
        label: label
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        property_keys: normalized,
    })
}

/// Compute the sidecar directory path where a database at `path`
/// stores its per-definition tantivy indexes (suffix `.ogdb.ftindex`).
pub fn fulltext_index_root_path_for_db(path: &Path) -> PathBuf {
    let mut root_name = path.as_os_str().to_os_string();
    root_name.push(".ogdb.ftindex");
    PathBuf::from(root_name)
}

/// Sanitize an arbitrary index name into an ASCII-alphanumeric +
/// `-` + `_` slug suitable for a filesystem path component. Empty
/// input maps to `"_"` so the filesystem never sees a blank
/// component.
#[inline]
pub fn sanitize_index_component(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "_".to_string()
    } else {
        out
    }
}

/// Compute the per-index sidecar path for a database at `path` and
/// an index named `index_name`.
pub fn fulltext_index_path_for_name(path: &Path, index_name: &str) -> PathBuf {
    fulltext_index_root_path_for_db(path).join(sanitize_index_component(index_name))
}
