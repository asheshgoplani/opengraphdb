//! Shim regression: the plain-data `FullTextIndexDefinition` type
//! must remain nameable from the `ogdb_core::` root after the
//! Phase-3 text split. No downstream crate today imports this type,
//! but `DbMeta::fulltext_index_catalog: BTreeSet<FullTextIndexDefinition>`
//! is serialized into the on-disk meta-catalog — a silent parallel
//! definition in ogdb-core would corrupt catalog iteration order
//! and serde round-trips across the shim boundary. This test pins
//! the re-export identity.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-text (`unresolved import ogdb_text`), and
//! `ogdb_core::FullTextIndexDefinition` is still the in-core original,
//! not a re-export — so the TypeId equality below would spuriously
//! hold (same type is on both sides of the equation) if the test
//! compiled, but it does not compile.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_text::FullTextIndexDefinition;` and the TypeId
//! equality below holds because both sides resolve to the single
//! definition in ogdb-text.

use std::any::TypeId;

#[test]
fn full_text_index_definition_is_reexported_from_ogdb_text() {
    // If this line fails to compile, any downstream caller (future or
    // current) writing `use ogdb_core::FullTextIndexDefinition;` will
    // also break — and more subtly, the serde round-trip of the
    // on-disk meta-catalog would go through two parallel type
    // definitions.
    let def = ogdb_core::FullTextIndexDefinition {
        name: "shim_idx".to_string(),
        label: Some("Doc".to_string()),
        property_keys: vec!["title".to_string()],
    };
    assert_eq!(def.property_keys.len(), 1);

    assert_eq!(
        TypeId::of::<ogdb_core::FullTextIndexDefinition>(),
        TypeId::of::<ogdb_text::FullTextIndexDefinition>(),
        "ogdb_core::FullTextIndexDefinition must be a `pub use` \
         re-export of ogdb_text::FullTextIndexDefinition, not a \
         duplicate type. See .planning/ogdb-core-split-text/PLAN.md §7.",
    );
}

#[test]
fn btreeset_ordering_is_stable_across_shim() {
    // DbMeta.fulltext_index_catalog: BTreeSet<FullTextIndexDefinition>
    // (ogdb-core lib.rs:7975). BTreeSet requires Ord, derived
    // lexicographically across (name, label, property_keys). Any
    // re-derivation divergence between the old in-core type and the
    // new ogdb-text type would silently corrupt catalog iteration
    // order. Pin it here.
    use std::collections::BTreeSet;
    let a = ogdb_core::FullTextIndexDefinition {
        name: "a".into(),
        label: Some("Doc".into()),
        property_keys: vec!["k".into()],
    };
    let b = ogdb_core::FullTextIndexDefinition {
        name: "b".into(),
        label: Some("Doc".into()),
        property_keys: vec!["k".into()],
    };
    let mut set = BTreeSet::new();
    set.insert(b.clone());
    set.insert(a.clone());
    let ordered: Vec<_> = set.iter().collect();
    assert_eq!(ordered[0].name, "a");
    assert_eq!(ordered[1].name, "b");
}

#[test]
fn serde_round_trip_survives_shim() {
    // The meta-catalog persists FullTextIndexDefinition via serde.
    // Round-trip through serde_json at the shim boundary to prove
    // both sides share derive output (Serialize + Deserialize).
    let original = ogdb_core::FullTextIndexDefinition {
        name: "serde_idx".into(),
        label: Some("Doc".into()),
        property_keys: vec!["title".into(), "body".into()],
    };
    let wire = serde_json::to_string(&original).expect("serialize shim-origin");
    // Deserialize into the ogdb-text-origin type to prove the wire
    // format is identical.
    let landed: ogdb_text::FullTextIndexDefinition =
        serde_json::from_str(&wire).expect("deserialize ogdb-text-origin");
    assert_eq!(landed.name, original.name);
    assert_eq!(landed.label, original.label);
    assert_eq!(landed.property_keys, original.property_keys);
}

#[test]
fn ogdb_text_helpers_are_callable_via_ogdb_text_root() {
    // Regression pin: the 4 pure fns must be directly callable from
    // `ogdb_text::` — `ogdb-core`'s `Database::create_fulltext_index`
    // and `Database::rebuild_fulltext_indexes_from_catalog` depend on
    // these paths via
    // `use ogdb_text::{normalize_fulltext_index_definition as
    // normalize_fulltext_index_definition_pure, fulltext_index_root_path_for_db,
    // sanitize_index_component, fulltext_index_path_for_name};`.
    //
    // We assert the callable paths here (not just type identities)
    // because free fns cannot be compared via TypeId.
    let def = ogdb_text::normalize_fulltext_index_definition(
        "call_idx",
        Some("Doc"),
        &["k".to_string()],
    )
    .expect("validator callable");
    assert_eq!(def.name, "call_idx");

    let root = ogdb_text::fulltext_index_root_path_for_db(
        std::path::Path::new("/tmp/ogdb-x"),
    );
    assert!(root.to_string_lossy().ends_with(".ogdb.ftindex"));

    let slug = ogdb_text::sanitize_index_component("has space");
    assert_eq!(slug, "has_space");

    let per = ogdb_text::fulltext_index_path_for_name(
        std::path::Path::new("/tmp/ogdb-y"),
        "x y",
    );
    assert!(per.to_string_lossy().ends_with(".ogdb.ftindex/x_y"));
}

#[test]
fn definition_constructor_round_trips_across_shim() {
    // Construct via the ogdb-core re-export, serde through
    // ogdb-text, land back on the ogdb-core view — proves the shim
    // is a pure re-export, not a parallel copy. The existing in-core
    // integration tests at lib.rs:34866–34872 already cover the
    // DbError::InvalidArgument mapping on the validator wrapper; we
    // do not duplicate that here (it would require spinning up a
    // Database on a tempdir, which is orthogonal to the shim).
    let via_core = ogdb_core::FullTextIndexDefinition {
        name: "round_idx".into(),
        label: None,
        property_keys: vec!["k1".into(), "k2".into()],
    };
    let wire = serde_json::to_string(&via_core).expect("serialize");
    let via_text: ogdb_text::FullTextIndexDefinition =
        serde_json::from_str(&wire).expect("deserialize");
    // And back again.
    let wire2 = serde_json::to_string(&via_text).expect("serialize ogdb-text");
    let via_core_again: ogdb_core::FullTextIndexDefinition =
        serde_json::from_str(&wire2).expect("deserialize back to ogdb-core");
    assert_eq!(via_core_again, via_core);
}
