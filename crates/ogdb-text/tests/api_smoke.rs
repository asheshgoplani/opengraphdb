//! RED-phase API smoke test for the extracted ogdb-text crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_text::{FullTextIndexDefinition,
//! normalize_fulltext_index_definition, fulltext_index_root_path_for_db,
//! sanitize_index_component, fulltext_index_path_for_name}` are not
//! yet defined (src/lib.rs is intentionally empty).
//!
//! GREEN state (Phases 3–5 of the 8-phase workflow, see
//! .planning/ogdb-core-split-text/PLAN.md §6): every test passes
//! because the items have been moved out of
//! crates/ogdb-core/src/lib.rs into crates/ogdb-text/src/lib.rs.

use std::path::{Path, PathBuf};

use ogdb_text::{
    fulltext_index_path_for_name, fulltext_index_root_path_for_db,
    normalize_fulltext_index_definition, sanitize_index_component,
    FullTextIndexDefinition,
};

#[test]
fn definition_is_plain_data_with_full_derive_surface() {
    // Load-bearing for the on-disk meta-catalog: FullTextIndexDefinition
    // lives in BTreeSet<_> on DbMeta.fulltext_index_catalog (ogdb-core
    // lib.rs:7975). Ord lexicographic across (name, label,
    // property_keys) is required — any derivation divergence silently
    // corrupts catalog iteration order across the shim boundary.
    let a = FullTextIndexDefinition {
        name: "a_idx".to_string(),
        label: Some("Doc".to_string()),
        property_keys: vec!["title".to_string(), "body".to_string()],
    };
    let b = a.clone();
    assert_eq!(a, b);
    assert!(a <= b); // Ord preserved
    // Debug + Serialize + Deserialize survive the move (WAL records
    // encode this struct via serde).
    let json = serde_json::to_string(&a).expect("serialize");
    let round: FullTextIndexDefinition =
        serde_json::from_str(&json).expect("deserialize");
    assert_eq!(round, a);
    assert!(format!("{a:?}").contains("a_idx"));
}

#[test]
fn normalize_accepts_valid_input() {
    let def = normalize_fulltext_index_definition(
        "  name_idx  ",
        Some("  Doc  "),
        &["title".to_string(), "body".to_string()],
    )
    .expect("valid input should normalize");
    assert_eq!(def.name, "name_idx"); // trimmed
    assert_eq!(def.label, Some("Doc".to_string())); // trimmed
    assert_eq!(
        def.property_keys,
        vec!["title".to_string(), "body".to_string()]
    );
}

#[test]
fn normalize_rejects_empty_name() {
    let err = normalize_fulltext_index_definition(
        "   ",
        Some("Doc"),
        &["title".to_string()],
    )
    .expect_err("blank name must error");
    assert!(
        err.contains("name cannot be empty"),
        "expected empty-name error, got: {err}",
    );
}

#[test]
fn normalize_rejects_empty_property_keys() {
    let err = normalize_fulltext_index_definition("idx", Some("Doc"), &[])
        .expect_err("empty property_keys must error");
    assert!(
        err.contains("at least one property key"),
        "expected empty-keys error, got: {err}",
    );
}

#[test]
fn normalize_rejects_blank_property_key() {
    let err = normalize_fulltext_index_definition(
        "idx",
        Some("Doc"),
        &["   ".to_string()],
    )
    .expect_err("blank key must error");
    assert!(
        err.contains("property key cannot be empty"),
        "expected blank-key error, got: {err}",
    );
}

#[test]
fn normalize_rejects_duplicate_property_keys() {
    let err = normalize_fulltext_index_definition(
        "idx",
        Some("Doc"),
        &["title".to_string(), "title".to_string()],
    )
    .expect_err("duplicate keys must error");
    assert!(
        err.contains("duplicate"),
        "expected duplicate-key error, got: {err}",
    );
    assert!(err.contains("title"));
}

#[test]
fn normalize_treats_blank_label_as_none() {
    let def =
        normalize_fulltext_index_definition("idx", Some("   "), &["k".to_string()])
            .expect("blank label → None");
    assert_eq!(def.label, None, "blank label should become None");
}

#[test]
fn normalize_accepts_none_label() {
    let def = normalize_fulltext_index_definition("idx", None, &["k".to_string()])
        .expect("None label is valid");
    assert_eq!(def.label, None);
}

#[test]
fn root_path_appends_ftindex_suffix() {
    // Regression pin: the `.ogdb.ftindex` suffix is load-bearing for
    // sidecar directory discovery and on-disk layout compatibility
    // (see ARCHITECTURE.md line 93 and ogdb-core lib.rs:10894).
    let base = Path::new("/tmp/mydb");
    let root = fulltext_index_root_path_for_db(base);
    assert_eq!(root, PathBuf::from("/tmp/mydb.ogdb.ftindex"));
}

#[test]
fn sanitize_preserves_alphanumerics_and_separators() {
    assert_eq!(sanitize_index_component("doc_idx-1"), "doc_idx-1");
}

#[test]
fn sanitize_replaces_unsafe_characters_with_underscore() {
    assert_eq!(sanitize_index_component("name with space"), "name_with_space");
    assert_eq!(sanitize_index_component("path/traversal"), "path_traversal");
    assert_eq!(sanitize_index_component("unicode:é"), "unicode__");
}

#[test]
fn sanitize_empty_yields_single_underscore() {
    // Regression pin: empty index-name slug maps to "_" (never empty
    // string), so the filesystem never sees a blank path component.
    assert_eq!(sanitize_index_component(""), "_");
}

#[test]
fn path_for_name_composes_root_and_slug() {
    let base = Path::new("/var/lib/ogdb/mydb");
    let p = fulltext_index_path_for_name(base, "weird name!");
    assert_eq!(
        p,
        PathBuf::from("/var/lib/ogdb/mydb.ogdb.ftindex/weird_name_"),
    );
}
