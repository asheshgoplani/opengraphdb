//! Shim regression: `ogdb_core::DocumentFormat`,
//! `ogdb_core::IngestConfig`, and `ogdb_core::IngestResult` must
//! remain nameable from the `ogdb_core::` root after the Phase-4
//! import split.
//!
//! Four downstream files import these types today:
//!   * `ogdb-cli/src/lib.rs:3-4`
//!   * `ogdb-bench/benches/rag_benchmark.rs:2`
//!   * `ogdb-bench/tests/rag_accuracy.rs:1`
//! and 9 in-core integration tests at @41020-41250 construct them.
//! A silent parallel definition in ogdb-core would corrupt
//! `serde_json`-emitted DocumentFormat strings (ogdb-cli surfaces
//! these via JSON output) and break pattern matching inside
//! `Database::ingest_document` body @22149-22161. Pin the re-export
//! identity here.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-import (`unresolved import ogdb_import`),
//! and `ogdb_core::DocumentFormat` etc. are still the in-core
//! originals — so the TypeId equality below would spuriously hold
//! (same type on both sides) if the test compiled, but it does not
//! compile.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_import::{DocumentFormat, IngestConfig, IngestResult};`
//! and the TypeId equalities below hold because both sides resolve
//! to the single definitions in ogdb-import.

use std::any::TypeId;

#[test]
fn document_format_is_reexported_from_ogdb_import() {
    let _pdf = ogdb_core::DocumentFormat::Pdf;
    let _md = ogdb_core::DocumentFormat::Markdown;
    let _txt = ogdb_core::DocumentFormat::PlainText;

    assert_eq!(
        TypeId::of::<ogdb_core::DocumentFormat>(),
        TypeId::of::<ogdb_import::DocumentFormat>(),
        "ogdb_core::DocumentFormat must be a `pub use` re-export of \
         ogdb_import::DocumentFormat, not a duplicate type. See \
         .planning/ogdb-core-split-import/PLAN.md §7.",
    );
}

#[test]
fn ingest_config_is_reexported_from_ogdb_import() {
    assert_eq!(
        TypeId::of::<ogdb_core::IngestConfig>(),
        TypeId::of::<ogdb_import::IngestConfig>(),
        "ogdb_core::IngestConfig must be a `pub use` re-export of \
         ogdb_import::IngestConfig, not a duplicate type.",
    );

    // Construct via the ogdb-core re-export — proves field layout +
    // Default impl survive the re-export. Pinned to the literal value
    // used in ogdb-bench/tests/rag_accuracy.rs:54-59.
    let cfg = ogdb_core::IngestConfig {
        title: "Pinned".to_string(),
        format: ogdb_core::DocumentFormat::Markdown,
        ..ogdb_core::IngestConfig::default()
    };
    assert_eq!(cfg.title, "Pinned");
    assert_eq!(cfg.format, ogdb_core::DocumentFormat::Markdown);
    assert_eq!(cfg.max_chunk_words, 512);
}

#[test]
fn ingest_result_is_reexported_from_ogdb_import() {
    assert_eq!(
        TypeId::of::<ogdb_core::IngestResult>(),
        TypeId::of::<ogdb_import::IngestResult>(),
        "ogdb_core::IngestResult must be a `pub use` re-export of \
         ogdb_import::IngestResult, not a duplicate type.",
    );

    let r = ogdb_core::IngestResult {
        document_node_id: 99,
        section_count: 4,
        content_count: 16,
        reference_count: 1,
        text_indexed: true,
        vector_indexed: false,
    };
    assert_eq!(r.document_node_id, 99);
    assert_eq!(r.section_count, 4);
}

#[test]
fn cross_shim_equality_via_construction() {
    // Construct via the ogdb-core re-export, compare against a value
    // constructed via ogdb-import directly — proves the shim is a
    // pure re-export, not a parallel copy. Pattern matching is the
    // load-bearing path inside Database::ingest_document body
    // @22149-22161.
    let via_core = ogdb_core::DocumentFormat::Markdown;
    let via_import = ogdb_import::DocumentFormat::Markdown;
    assert_eq!(via_core, via_import);

    let via_import_to_core: ogdb_core::DocumentFormat = via_import;
    assert_eq!(via_import_to_core, via_core);
}

#[test]
fn ogdb_import_helpers_are_callable_via_ogdb_import_root() {
    // Regression pin: the 3 always-on pure helpers must be directly
    // callable from `ogdb_import::` — Database::ingest_document body
    // (refactored in Phase 4 to import them privately) depends on
    // these paths via `use ogdb_import::{parse_plaintext_sections,
    // chunk_content, detect_cross_references, ...};`.
    //
    // We assert the callable paths here (not just type identities)
    // because free fns cannot be compared via TypeId.
    let sections = ogdb_import::parse_plaintext_sections("hello world", 100);
    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0].title, "Chunk 1");

    let chunks = ogdb_import::chunk_content("a b c d", 2);
    assert_eq!(chunks.len(), 2);

    let refs = ogdb_import::detect_cross_references(&sections);
    assert!(refs.is_empty(), "single-section input has no cross-refs");
}

#[test]
fn pattern_match_through_shim_compiles() {
    // The hot path inside Database::ingest_document (@22149-22161)
    // does `match config.format { Pdf => …, Markdown => …, PlainText
    // => … }` against a `DocumentFormat` whose type is referenced via
    // the re-exported in-core path. Prove that pattern matching across
    // the shim still exhausts all three arms.
    fn classify(f: &ogdb_core::DocumentFormat) -> &'static str {
        match f {
            ogdb_core::DocumentFormat::Pdf => "pdf",
            ogdb_core::DocumentFormat::Markdown => "md",
            ogdb_core::DocumentFormat::PlainText => "txt",
        }
    }
    assert_eq!(classify(&ogdb_core::DocumentFormat::Pdf), "pdf");
    assert_eq!(classify(&ogdb_core::DocumentFormat::Markdown), "md");
    assert_eq!(classify(&ogdb_core::DocumentFormat::PlainText), "txt");
}
