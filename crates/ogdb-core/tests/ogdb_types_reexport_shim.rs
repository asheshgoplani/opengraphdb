//! Shim regression: `ogdb_core::PropertyValue` and `ogdb_core::PropertyMap`
//! must remain nameable from the `ogdb_core::` root after the
//! ogdb-types extraction. The 8 downstream crate import sites
//! (`ogdb-cli/src/lib.rs`, `ogdb-eval/src/drivers/{ai_agent,ldbc_mini,ldbc_snb,throughput}.rs`,
//! `ogdb-bolt/src/lib.rs` x2, `ogdb-cli/tests/shacl_validation.rs`,
//! `ogdb-ffi/src/lib.rs`, `ogdb-python/src/lib.rs`, `ogdb-node/src/lib.rs`,
//! `ogdb-e2e/tests/comprehensive_e2e.rs`) plus the 2 fully-qualified
//! `ogdb_core::PropertyValue::String(...)` matches in
//! `ogdb-bench/tests/rag_accuracy.rs:88,92` — total **558 source-level
//! references** across **14 files** — all spell these types via
//! `use ogdb_core::{PropertyMap, PropertyValue};` or
//! `ogdb_core::PropertyValue::Variant`. If this file stops compiling,
//! the shim in `crates/ogdb-core/src/lib.rs` is broken and a downstream
//! caller will break too.
//!
//! RED state (this commit): fails to compile because:
//!   1. `ogdb-core` does not yet depend on `ogdb-types` (no entry in
//!      `crates/ogdb-core/Cargo.toml`). The `use ogdb_types::PropertyValue`
//!      at the bottom of this test (the `TypeId` equality check) hits
//!      `error[E0432]: unresolved import `ogdb_types``.
//!   2. The `ogdb-types` crate's `lib.rs` is empty, so even if we wired
//!      the dep, `ogdb_types::PropertyValue` would be unresolved.
//!
//! GREEN state (Phase 5): `ogdb-core/Cargo.toml` adds
//! `ogdb-types = { path = "../ogdb-types" }` (and `dev-dependencies`
//! pulls it in for tests), `lib.rs` re-exports via
//! `pub use ogdb_types::{PropertyMap, PropertyValue};` — the `TypeId`
//! equality holds, all 8 tests pass.

use std::any::TypeId;
use std::collections::BTreeMap;

#[test]
fn property_value_is_reexported_from_ogdb_types() {
    // If this line fails to compile, every downstream caller using
    // `use ogdb_core::PropertyValue;` will also fail.
    let _bool = ogdb_core::PropertyValue::Bool(true);
    let _i64 = ogdb_core::PropertyValue::I64(42);
    let _string = ogdb_core::PropertyValue::String("x".into());

    // Identity check: the type the downstream sees as
    // `ogdb_core::PropertyValue` must BE the type defined in `ogdb-types`
    // (not a parallel copy). If a future refactor accidentally
    // reintroduces a duplicate definition in ogdb-core, TypeId equality
    // catches it — and the Serde JSON manifests + bolt wire `Map`/`List`
    // payloads would silently break on cross-crate boundaries otherwise.
    assert_eq!(
        TypeId::of::<ogdb_core::PropertyValue>(),
        TypeId::of::<ogdb_types::PropertyValue>(),
        "ogdb_core::PropertyValue must be a `pub use` re-export of \
         ogdb_types::PropertyValue, not a duplicate type. \
         See .planning/ogdb-types-extraction/PLAN.md §7.",
    );
}

#[test]
fn property_map_is_reexported_from_ogdb_types() {
    // Constructor sanity: `PropertyMap` must accept the
    // `BTreeMap<String, PropertyValue>` literal that 558 downstream
    // sites build via `BTreeMap::new()` + `.insert(...)`.
    let mut map: ogdb_core::PropertyMap = BTreeMap::new();
    map.insert("k".into(), ogdb_core::PropertyValue::I64(1));
    assert_eq!(map.len(), 1);

    // The alias must point to exactly `BTreeMap<String, PropertyValue>`.
    // Type-equality is checked via the `TypeId` of the alias's expansion.
    assert_eq!(
        TypeId::of::<ogdb_core::PropertyMap>(),
        TypeId::of::<BTreeMap<String, ogdb_types::PropertyValue>>(),
        "ogdb_core::PropertyMap must be `BTreeMap<String, ogdb_types::PropertyValue>`, \
         not a newtype or wrapper.",
    );
}

#[test]
fn all_eleven_variants_pattern_match_through_shim() {
    // Pin the variant names against the downstream pattern-match sites
    // (e.g. `ogdb-bench/tests/rag_accuracy.rs:88` writes
    // `Some(ogdb_core::PropertyValue::String(s)) => s.to_lowercase()`).
    // If a variant gets renamed in ogdb-types, this test stops compiling
    // and surfaces the break before downstream crates even build.
    let _ = match ogdb_core::PropertyValue::Bool(true) {
        ogdb_core::PropertyValue::Bool(_) => 0,
        ogdb_core::PropertyValue::I64(_) => 1,
        ogdb_core::PropertyValue::F64(_) => 2,
        ogdb_core::PropertyValue::String(_) => 3,
        ogdb_core::PropertyValue::Bytes(_) => 4,
        ogdb_core::PropertyValue::Vector(_) => 5,
        ogdb_core::PropertyValue::Date(_) => 6,
        ogdb_core::PropertyValue::DateTime { .. } => 7,
        ogdb_core::PropertyValue::Duration { .. } => 8,
        ogdb_core::PropertyValue::List(_) => 9,
        ogdb_core::PropertyValue::Map(_) => 10,
    };
}

#[test]
fn json_round_trip_through_shim_matches_ogdb_types_directly() {
    // Two-step contract: serializing via `ogdb_core::PropertyValue` and
    // deserializing via `ogdb_types::PropertyValue` must produce the
    // identical value (and vice versa). This is what makes the bolt
    // server (uses ogdb_core::PropertyValue) interoperable with any
    // future direct ogdb_types consumer (e.g. an export crate).
    let core_value = ogdb_core::PropertyValue::List(vec![
        ogdb_core::PropertyValue::I64(1),
        ogdb_core::PropertyValue::String("two".into()),
    ]);
    let json = serde_json::to_string(&core_value).expect("serialize via core shim");
    let types_value: ogdb_types::PropertyValue =
        serde_json::from_str(&json).expect("deserialize via ogdb-types directly");
    // Because the types ARE the same after `pub use`, equality compares
    // the values structurally — no cross-crate adapter needed.
    let expected_via_types_directly = ogdb_types::PropertyValue::List(vec![
        ogdb_types::PropertyValue::I64(1),
        ogdb_types::PropertyValue::String("two".into()),
    ]);
    assert_eq!(types_value, expected_via_types_directly);
}
