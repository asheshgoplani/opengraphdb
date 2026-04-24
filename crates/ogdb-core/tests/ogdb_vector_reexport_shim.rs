//! Shim regression: `ogdb_core::VectorDistanceMetric` and
//! `ogdb_core::VectorIndexDefinition` must remain nameable from the
//! `ogdb_core::` root after the Phase-1 vector primitive split. The
//! 7 downstream crates (ogdb-cli, ogdb-eval, ogdb-ffi, ogdb-python,
//! ogdb-e2e, ogdb-node, ogdb-bolt) + 5 ogdb-core integration tests
//! all spell these types via `use ogdb_core::VectorDistanceMetric;`
//! — if this file stops compiling, the shim in lib.rs is broken.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-vector (`unresolved import ogdb_vector`),
//! and `ogdb_core::VectorIndexDefinition` is not yet a re-export.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};`
//! and the TypeId equality below holds.

use std::any::TypeId;

#[test]
fn vector_distance_metric_is_reexported_from_ogdb_vector() {
    // If this line fails to compile, a downstream caller using
    // `use ogdb_core::VectorDistanceMetric;` will also break.
    let _cosine = ogdb_core::VectorDistanceMetric::Cosine;
    let _euclidean = ogdb_core::VectorDistanceMetric::Euclidean;
    let _dot = ogdb_core::VectorDistanceMetric::DotProduct;

    // Identity check: the type the downstream sees as
    // `ogdb_core::VectorDistanceMetric` must BE the type defined in
    // ogdb-vector (not a parallel copy). If a future refactor
    // accidentally reintroduces a duplicate definition in ogdb-core,
    // TypeId equality catches it — and the Serde/BTreeSet catalogue
    // would silently break on cross-crate boundaries otherwise.
    assert_eq!(
        TypeId::of::<ogdb_core::VectorDistanceMetric>(),
        TypeId::of::<ogdb_vector::VectorDistanceMetric>(),
        "ogdb_core::VectorDistanceMetric must be a `pub use` re-export \
         of ogdb_vector::VectorDistanceMetric, not a duplicate type. \
         See .planning/ogdb-core-split-vector/PLAN.md §7.",
    );
}

#[test]
fn vector_index_definition_is_reexported_from_ogdb_vector() {
    assert_eq!(
        TypeId::of::<ogdb_core::VectorIndexDefinition>(),
        TypeId::of::<ogdb_vector::VectorIndexDefinition>(),
        "ogdb_core::VectorIndexDefinition must be a `pub use` \
         re-export of ogdb_vector::VectorIndexDefinition.",
    );

    // Constructor round-trip across the shim — proves field layout
    // survives the re-export.
    let def = ogdb_core::VectorIndexDefinition {
        name: "idx".into(),
        label: None,
        property_key: "emb".into(),
        dimensions: 4,
        metric: ogdb_core::VectorDistanceMetric::Euclidean,
    };
    assert_eq!(def.dimensions, 4);
}

#[test]
fn catalog_btreeset_ordering_is_stable_across_shim() {
    // ogdb-core stores `vector_index_catalog: BTreeSet<VectorIndexDefinition>`
    // (lib.rs:8080). BTreeSet requires `Ord`, which is derived lexicographically
    // across (name, label, property_key, dimensions, metric). Any
    // re-derivation divergence between the old in-core type and the
    // new ogdb-vector type would silently corrupt catalog iteration
    // order. Pin it here.
    use std::collections::BTreeSet;
    let a = ogdb_core::VectorIndexDefinition {
        name: "a".into(),
        label: None,
        property_key: "e".into(),
        dimensions: 2,
        metric: ogdb_core::VectorDistanceMetric::Cosine,
    };
    let b = ogdb_core::VectorIndexDefinition {
        name: "b".into(),
        label: None,
        property_key: "e".into(),
        dimensions: 2,
        metric: ogdb_core::VectorDistanceMetric::Cosine,
    };
    let mut set = BTreeSet::new();
    set.insert(b.clone());
    set.insert(a.clone());
    let ordered: Vec<_> = set.iter().collect();
    assert_eq!(ordered[0].name, "a");
    assert_eq!(ordered[1].name, "b");
}
