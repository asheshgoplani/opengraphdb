//! RED-phase API smoke test for the extracted ogdb-vector crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition,
//! vector_distance, parse_vector_literal_text, compare_f32_vectors}`
//! are not yet defined (src/lib.rs is intentionally empty).
//!
//! GREEN state (Phase 3 of the 8-phase workflow, see PLAN §6):
//! every test passes because the items have been moved out of
//! crates/ogdb-core/src/lib.rs into crates/ogdb-vector/src/lib.rs.

use ogdb_vector::{
    compare_f32_vectors, parse_vector_literal_text, vector_distance,
    VectorDistanceMetric, VectorIndexDefinition,
};

#[test]
fn distance_metric_has_three_variants() {
    // The enum's three variants are the public contract downstream
    // crates (ogdb-cli, ogdb-ffi, ogdb-python) already pattern-match
    // on. Adding or removing a variant is a breaking change.
    let variants = [
        VectorDistanceMetric::Cosine,
        VectorDistanceMetric::Euclidean,
        VectorDistanceMetric::DotProduct,
    ];
    assert_eq!(variants.len(), 3);
    // Derives from the original type must survive the move.
    let cloned = variants[0].clone();
    assert_eq!(format!("{cloned:?}"), "Cosine");
}

#[test]
fn vector_index_definition_is_plain_data() {
    // Sanity-check that the struct survives the move with its derives
    // intact (PartialOrd + Ord + Serialize + Deserialize). These are
    // load-bearing for the BTreeSet<VectorIndexDefinition> catalog
    // in ogdb-core (lib.rs:8080).
    let a = VectorIndexDefinition {
        name: "idx_a".to_string(),
        label: Some("Doc".to_string()),
        property_key: "embedding".to_string(),
        dimensions: 3,
        metric: VectorDistanceMetric::Cosine,
    };
    let b = a.clone();
    assert_eq!(a, b);
    assert!(a <= b); // Ord preserved
}

#[test]
fn cosine_distance_of_identical_vectors_is_zero() {
    // Cosine: 1 - dot/(|l|*|r|). Identical non-zero vectors → 1 - 1 = 0.
    let v = [1.0_f32, 2.0, 3.0];
    let d = vector_distance(VectorDistanceMetric::Cosine, &v, &v)
        .expect("identical-length non-empty vectors should return Some");
    assert!(d.abs() < 1e-5, "cosine(v,v) ≈ 0, got {d}");
}

#[test]
fn euclidean_distance_is_l2_norm_of_diff() {
    let l = [0.0_f32, 0.0];
    let r = [3.0_f32, 4.0];
    let d = vector_distance(VectorDistanceMetric::Euclidean, &l, &r)
        .expect("same-length vectors");
    assert!((d - 5.0).abs() < 1e-5, "sqrt(9+16)=5, got {d}");
}

#[test]
fn dot_product_distance_is_negative_dot() {
    // Planner convention: distance = -dot so smaller = closer, matching
    // cosine/euclidean. Regressing this flips query ordering silently.
    let l = [1.0_f32, 2.0, 3.0];
    let r = [1.0_f32, 1.0, 1.0];
    let d = vector_distance(VectorDistanceMetric::DotProduct, &l, &r)
        .expect("same-length vectors");
    assert!((d + 6.0).abs() < 1e-5, "-(1+2+3) = -6, got {d}");
}

#[test]
fn vector_distance_on_mismatched_or_empty_returns_none() {
    // Regression pin: the HNSW layer + Cypher planner both rely on
    // None meaning "invalid pair, fall back to NULL in Cypher / skip
    // in HNSW". A panic or Some(NaN) here is a bug.
    let l = [1.0_f32, 2.0];
    let r = [1.0_f32, 2.0, 3.0];
    assert!(vector_distance(VectorDistanceMetric::Cosine, &l, &r).is_none());

    let empty: [f32; 0] = [];
    assert!(vector_distance(VectorDistanceMetric::Cosine, &empty, &empty).is_none());
}

#[test]
fn parse_vector_literal_text_accepts_bracketed_csv() {
    assert_eq!(
        parse_vector_literal_text("[1.0, 2.5, -3.0]"),
        Some(vec![1.0_f32, 2.5, -3.0]),
    );
    // Empty vector literal `[]` is a legitimate sentinel — `Some(vec![])`
    // NOT `None`.
    assert_eq!(parse_vector_literal_text("[]"), Some(Vec::<f32>::new()));
    // Type-prefix tolerance for `i64:` / `f64:` that the Cypher
    // runtime emits is load-bearing — see lib.rs:5958.
    assert_eq!(
        parse_vector_literal_text("[f64:1.0, i64:2]"),
        Some(vec![1.0_f32, 2.0]),
    );
}

#[test]
fn parse_vector_literal_text_rejects_unbracketed_or_garbage() {
    assert!(parse_vector_literal_text("1.0, 2.0").is_none());
    assert!(parse_vector_literal_text("[1.0, not-a-number]").is_none());
    assert!(parse_vector_literal_text("").is_none());
}

#[test]
fn compare_f32_vectors_orders_by_length_then_lex() {
    use std::cmp::Ordering;
    // Length mismatch: shorter is Less.
    assert_eq!(
        compare_f32_vectors(&[1.0], &[1.0, 0.0]),
        Ordering::Less,
    );
    // Equal length: lex compare via total_cmp (NaN-safe).
    assert_eq!(
        compare_f32_vectors(&[1.0, 2.0], &[1.0, 3.0]),
        Ordering::Less,
    );
    assert_eq!(
        compare_f32_vectors(&[1.0, 2.0], &[1.0, 2.0]),
        Ordering::Equal,
    );
}
