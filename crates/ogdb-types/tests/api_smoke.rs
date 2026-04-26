//! RED-phase API smoke test for the extracted `ogdb-types` crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_types::{PropertyValue, PropertyMap}` are not yet defined
//! (`crates/ogdb-types/src/lib.rs` is intentionally empty — just a
//! module-level doc comment).
//!
//! GREEN state (Phase 5 of the 8-phase workflow, see PLAN §6):
//! every test passes because the items have been moved out of
//! `crates/ogdb-core/src/lib.rs:593-896` into
//! `crates/ogdb-types/src/lib.rs` (`PropertyValue` enum, the four
//! `Serialize`/`Deserialize`/`Eq`/`Ord` impls, the
//! `property_value_variant_rank` private helper, and the
//! `pub type PropertyMap = BTreeMap<String, PropertyValue>` alias).
//!
//! These tests exercise the four load-bearing contracts of the moved
//! type pair:
//!
//! 1. **All 11 `PropertyValue` variants survive** the move with their
//!    discriminants intact. Adding/removing a variant is a breaking change
//!    — pin every shape downstream code constructs today.
//! 2. **The custom `Serialize`/`Deserialize` round-trip is byte-stable**.
//!    `ogdb-core` writes `PropertyValue` to JSON manifests, the WAL header
//!    extension blob (`ogdb_core::header::HEADER_SIZE`), and the bolt
//!    wire `Map`/`List` payloads. Any silent reshape of the JSON form
//!    (e.g. `{"I64":42}` becoming `{"i64":42}`) corrupts every replica.
//! 3. **The `Ord` total order matches the in-core implementation
//!    bit-for-bit**. The `PartialOrd` derive on `VectorIndexDefinition`,
//!    the `BTreeMap` keys in `PropertyMap`, and the `MIN`/`MAX`
//!    aggregation in the Cypher executor all rely on the variant-rank
//!    fallback at `lib.rs:875` — silently breaking the tie order would
//!    re-rank query result rows.
//! 4. **`PropertyMap` is exactly `BTreeMap<String, PropertyValue>`**.
//!    The 558 downstream references (`ogdb-cli`, `ogdb-ffi`, `ogdb-python`,
//!    `ogdb-node`, `ogdb-bolt`, `ogdb-eval/*`, `ogdb-e2e`,
//!    `ogdb-cli/tests/shacl_validation.rs`, `ogdb-bench/tests/rag_accuracy.rs`)
//!    spell `PropertyMap::new()`, `map.insert(...)`, `map.iter()`, etc.
//!    The alias is non-negotiable — must NOT become a newtype.

use ogdb_types::{PropertyMap, PropertyValue};
use std::collections::BTreeMap;

#[test]
fn property_value_has_eleven_variants() {
    // Construct every variant once. If a future refactor accidentally
    // drops a variant, this test stops compiling. If it accidentally
    // renames a variant (e.g. `I64` → `Int64`), the constructor call
    // breaks — preserving the public discriminant naming used by every
    // downstream pattern-match.
    let variants: Vec<PropertyValue> = vec![
        PropertyValue::Bool(true),
        PropertyValue::I64(42),
        PropertyValue::F64(std::f64::consts::PI),
        PropertyValue::String("hello".into()),
        PropertyValue::Bytes(vec![0xDE, 0xAD, 0xBE, 0xEF]),
        PropertyValue::Vector(vec![1.0_f32, 2.0, 3.0]),
        PropertyValue::Date(20_000),
        PropertyValue::DateTime { micros: 1_700_000_000_000_000, tz_offset_minutes: 60 },
        PropertyValue::Duration { months: 1, days: 2, nanos: 3 },
        PropertyValue::List(vec![PropertyValue::I64(1)]),
        PropertyValue::Map(BTreeMap::from([("k".to_string(), PropertyValue::Bool(false))])),
    ];
    assert_eq!(variants.len(), 11);
    // Derives from the original type must survive the move.
    let cloned = variants[0].clone();
    assert_eq!(cloned, PropertyValue::Bool(true));
    assert_eq!(format!("{cloned:?}"), "Bool(true)");
}

#[test]
fn property_map_is_a_plain_btreemap_alias() {
    // `pub type PropertyMap = BTreeMap<String, PropertyValue>` — the alias
    // must remain a transparent re-export so every existing
    // `let mut map: PropertyMap = BTreeMap::new();` site keeps compiling.
    let mut map: PropertyMap = BTreeMap::new();
    map.insert("name".into(), PropertyValue::String("Alice".into()));
    map.insert("age".into(), PropertyValue::I64(30));
    assert_eq!(map.len(), 2);
    // The alias must accept any `BTreeMap<String, PropertyValue>` literal.
    let direct: BTreeMap<String, PropertyValue> = map.clone();
    let aliased: PropertyMap = direct;
    assert_eq!(aliased.len(), 2);
}

#[test]
fn serde_round_trip_preserves_every_variant() {
    // Pin the JSON shape that `ogdb-core` already writes to disk and to
    // the bolt protocol. If GREEN's serde impl emits a different JSON
    // shape, every replica + every cached bolt response breaks silently.
    // This test should pass byte-for-byte against the current
    // `ogdb_core::PropertyValue` JSON form (single-key object per variant).
    let cases: Vec<(PropertyValue, &str)> = vec![
        (PropertyValue::Bool(true), r#"{"Bool":true}"#),
        (PropertyValue::I64(42), r#"{"I64":42}"#),
        (PropertyValue::F64(1.5), r#"{"F64":1.5}"#),
        (PropertyValue::String("hi".into()), r#"{"String":"hi"}"#),
        (PropertyValue::Bytes(vec![1, 2, 3]), r#"{"Bytes":[1,2,3]}"#),
        (PropertyValue::Vector(vec![1.0, 2.0]), r#"{"Vector":[1.0,2.0]}"#),
        (PropertyValue::Date(123), r#"{"Date":123}"#),
        (
            PropertyValue::DateTime { micros: 100, tz_offset_minutes: 60 },
            r#"{"DateTime":{"micros":100,"tz_offset_minutes":60}}"#,
        ),
        (
            PropertyValue::Duration { months: 1, days: 2, nanos: 3 },
            r#"{"Duration":{"months":1,"days":2,"nanos":3}}"#,
        ),
        (
            PropertyValue::List(vec![PropertyValue::I64(7)]),
            r#"{"List":[{"I64":7}]}"#,
        ),
    ];
    for (value, expected_json) in cases {
        let serialized = serde_json::to_string(&value).expect("serialize");
        assert_eq!(serialized, expected_json, "serialize {value:?}");
        let round_tripped: PropertyValue = serde_json::from_str(&serialized).expect("deserialize");
        assert_eq!(round_tripped, value, "round-trip {value:?}");
    }
}

#[test]
fn ord_orders_within_numeric_family() {
    // I64 / F64 cross-compare under `total_cmp`. This is load-bearing for
    // the Cypher `MIN()` / `MAX()` aggregations and for `BTreeSet`
    // ordering of mixed numeric properties.
    use std::cmp::Ordering;
    assert_eq!(PropertyValue::I64(1).cmp(&PropertyValue::I64(2)), Ordering::Less);
    assert_eq!(PropertyValue::F64(1.0).cmp(&PropertyValue::I64(2)), Ordering::Less);
    assert_eq!(PropertyValue::I64(2).cmp(&PropertyValue::F64(1.5)), Ordering::Greater);
    // Same numeric value cross-type: I64(2) vs F64(2.0) ties under total_cmp.
    assert_eq!(PropertyValue::I64(2).cmp(&PropertyValue::F64(2.0)), Ordering::Equal);
}

#[test]
fn ord_orders_vectors_via_compare_f32_vectors() {
    // The PropertyValue::Vector branch delegates to
    // ogdb_vector::compare_f32_vectors (length-then-lex with NaN-safe
    // total_cmp). If the GREEN impl ever inlines this and diverges from
    // ogdb-vector's helper, BTreeSet<PropertyValue> iteration order shifts.
    use std::cmp::Ordering;
    let short = PropertyValue::Vector(vec![1.0_f32]);
    let long = PropertyValue::Vector(vec![1.0_f32, 0.0]);
    assert_eq!(short.cmp(&long), Ordering::Less);
    let lex_low = PropertyValue::Vector(vec![1.0_f32, 2.0]);
    let lex_high = PropertyValue::Vector(vec![1.0_f32, 3.0]);
    assert_eq!(lex_low.cmp(&lex_high), Ordering::Less);
}

#[test]
fn ord_falls_back_to_variant_rank_across_families() {
    // When variants don't share a comparable family (e.g. Bool vs String),
    // the impl falls back to a stable variant-rank order. This is what
    // makes `BTreeSet<PropertyValue>` deterministic across heterogenous
    // mixes — pin it.
    use std::cmp::Ordering;
    let bool_v = PropertyValue::Bool(true);
    let string_v = PropertyValue::String("a".into());
    let bytes_v = PropertyValue::Bytes(vec![1]);
    let vector_v = PropertyValue::Vector(vec![1.0]);
    assert_eq!(bool_v.cmp(&string_v), Ordering::Less);
    assert_eq!(string_v.cmp(&bytes_v), Ordering::Less);
    assert_eq!(bytes_v.cmp(&vector_v), Ordering::Less);
    // Numeric (I64/F64) sits at rank 1, between Bool (0) and String (2).
    assert_eq!(PropertyValue::I64(99).cmp(&string_v), Ordering::Less);
    assert_eq!(bool_v.cmp(&PropertyValue::F64(0.0)), Ordering::Less);
}

#[test]
fn property_value_is_eq_for_btreeset_membership() {
    // The `impl Eq for PropertyValue {}` line at lib.rs:822 is what makes
    // `BTreeSet<PropertyValue>` compile. If a future refactor accidentally
    // drops the marker impl, the entire vector-index catalog stops compiling.
    use std::collections::BTreeSet;
    let mut set = BTreeSet::<PropertyValue>::new();
    set.insert(PropertyValue::I64(1));
    set.insert(PropertyValue::I64(2));
    set.insert(PropertyValue::I64(1)); // duplicate — should not grow
    assert_eq!(set.len(), 2);
}

#[test]
fn deserialize_rejects_unknown_variant_and_multikey_object() {
    // Pin the two error paths the in-core deserializer enforces today:
    // `unknown PropertyValue variant 'Foo'` and `expected single-key
    // PropertyValue object`. Embedders that build `PropertyValue` JSON
    // by hand rely on these guardrails.
    let unknown_variant = r#"{"Foo":1}"#;
    assert!(serde_json::from_str::<PropertyValue>(unknown_variant).is_err());
    let multi_key = r#"{"I64":1,"F64":2.0}"#;
    assert!(serde_json::from_str::<PropertyValue>(multi_key).is_err());
}
