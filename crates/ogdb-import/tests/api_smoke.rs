//! RED-phase API smoke test for the extracted ogdb-import crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_import::{DocumentFormat, IngestConfig, IngestResult,
//! ParsedSection, parse_pdf_sections, parse_markdown_sections,
//! parse_plaintext_sections, chunk_content,
//! detect_cross_references}` are not yet defined (`src/lib.rs` is
//! intentionally empty).
//!
//! GREEN state (Phase 5 of the 8-phase workflow, see
//! `.planning/ogdb-core-split-import/PLAN.md` §6): every test passes
//! because the items have been added to
//! `crates/ogdb-import/src/lib.rs` (`DocumentFormat`,
//! `IngestConfig`, `IngestResult` moved out of
//! `crates/ogdb-core/src/lib.rs` lines 1438-1492; `ParsedSection`
//! moved out of @1521-1529; the 5 parser helpers moved out of
//! @11653-11878).

use ogdb_import::{
    chunk_content, detect_cross_references, parse_plaintext_sections, DocumentFormat, IngestConfig,
    IngestError, IngestResult, ParsedSection,
};

#[test]
fn document_format_has_three_variants() {
    // The enum's three variants are the contract Database::ingest_document
    // (ogdb-core lib.rs:22149-22161) pattern-matches on.
    let variants = [
        DocumentFormat::Pdf,
        DocumentFormat::Markdown,
        DocumentFormat::PlainText,
    ];
    assert_eq!(variants.len(), 3);
    let copy = variants[0];
    assert_eq!(copy, DocumentFormat::Pdf);
    assert_eq!(format!("{:?}", DocumentFormat::PlainText), "PlainText");
}

#[test]
fn document_format_serde_roundtrip() {
    // ogdb-cli surfaces DocumentFormat via JSON output; pin the
    // serde-derived format byte-for-byte so the wire format does
    // not drift across the move.
    let json =
        serde_json::to_string(&DocumentFormat::Markdown).expect("DocumentFormat must serialize");
    assert_eq!(json, "\"Markdown\"");
    let back: DocumentFormat =
        serde_json::from_str("\"Pdf\"").expect("DocumentFormat must deserialize");
    assert_eq!(back, DocumentFormat::Pdf);
}

#[test]
fn ingest_config_default_pins_field_values() {
    let cfg = IngestConfig::default();
    assert_eq!(cfg.title, "");
    assert_eq!(cfg.format, DocumentFormat::PlainText);
    assert!(cfg.embed_fn.is_none());
    assert_eq!(cfg.embedding_dimensions, None);
    assert_eq!(cfg.source_uri, None);
    assert_eq!(cfg.max_chunk_words, 512);
}

#[test]
fn ingest_config_accepts_embedding_closure() {
    // Pin the closure-field type-erasure surface — Database::ingest_document
    // calls (config.embed_fn)(&chunk_text) at lib.rs:22268.
    let cfg = IngestConfig {
        title: "Doc".to_string(),
        format: DocumentFormat::Markdown,
        embed_fn: Some(Box::new(|_text: &str| vec![1.0f32, 0.0, 0.0])),
        embedding_dimensions: Some(3),
        source_uri: Some("https://example.com".to_string()),
        max_chunk_words: 256,
    };
    assert_eq!(cfg.title, "Doc");
    assert_eq!(cfg.embedding_dimensions, Some(3));
    let embed = cfg.embed_fn.as_ref().expect("embed_fn must round-trip");
    assert_eq!(embed("anything"), vec![1.0f32, 0.0, 0.0]);
}

#[test]
fn ingest_result_is_plain_data() {
    let r = IngestResult {
        document_node_id: 7,
        section_count: 3,
        content_count: 12,
        reference_count: 2,
        text_indexed: true,
        vector_indexed: false,
    };
    let cloned = r.clone();
    assert_eq!(cloned.document_node_id, 7);
    assert_eq!(cloned.section_count, 3);
    assert_eq!(cloned.content_count, 12);
    assert_eq!(cloned.reference_count, 2);
    assert!(cloned.text_indexed);
    assert!(!cloned.vector_indexed);
}

#[test]
fn ingest_result_serde_roundtrip() {
    let r = IngestResult {
        document_node_id: 1,
        section_count: 1,
        content_count: 1,
        reference_count: 0,
        text_indexed: true,
        vector_indexed: true,
    };
    let json = serde_json::to_string(&r).expect("IngestResult must serialize");
    let back: IngestResult = serde_json::from_str(&json).expect("IngestResult must round-trip");
    assert_eq!(back.document_node_id, 1);
    assert!(back.vector_indexed);
}

#[test]
fn parsed_section_is_plain_data() {
    let s = ParsedSection {
        title: "Intro".to_string(),
        level: 1,
        content: "Body".to_string(),
        page_start: Some(1),
        page_end: Some(2),
    };
    let cloned = s.clone();
    assert_eq!(cloned.title, "Intro");
    assert_eq!(cloned.level, 1);
    assert_eq!(cloned.content, "Body");
    assert_eq!(cloned.page_start, Some(1));
    assert_eq!(cloned.page_end, Some(2));
}

#[test]
fn plaintext_chunker_splits_on_word_count() {
    // 100 words, max_chunk_words = 30 ⇒ ceil(100/30) = 4 chunks.
    let words: Vec<String> = (0..100).map(|i| format!("w{i}")).collect();
    let text = words.join(" ");
    let sections = parse_plaintext_sections(&text, 30);
    assert_eq!(sections.len(), 4);
    assert_eq!(sections[0].title, "Chunk 1");
    assert_eq!(sections[1].title, "Chunk 2");
    assert_eq!(sections[2].title, "Chunk 3");
    assert_eq!(sections[3].title, "Chunk 4");
    assert_eq!(sections[0].level, 1);
    assert!(sections[0].page_start.is_none());
    assert!(sections[0].page_end.is_none());
}

#[test]
fn plaintext_chunker_handles_empty_input() {
    let sections = parse_plaintext_sections("", 10);
    assert!(sections.is_empty());
    let sections_ws = parse_plaintext_sections("   \n\t  ", 10);
    assert!(sections_ws.is_empty());
}

#[test]
fn plaintext_chunker_with_zero_max_returns_single_chunk() {
    // max_chunk_words = 0 is the "no chunking" sentinel; one chunk
    // containing all words.
    let sections = parse_plaintext_sections("a b c d e", 0);
    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0].content, "a b c d e");
}

#[test]
fn chunk_content_zero_max_returns_full_input() {
    let chunks = chunk_content("a b c d e", 0);
    assert_eq!(chunks, vec!["a b c d e".to_string()]);
}

#[test]
fn chunk_content_short_input_returns_single_chunk() {
    let chunks = chunk_content("a b c", 10);
    assert_eq!(chunks, vec!["a b c".to_string()]);
}

#[test]
fn chunk_content_long_input_splits() {
    let words: Vec<String> = (0..20).map(|i| format!("w{i}")).collect();
    let text = words.join(" ");
    let chunks = chunk_content(&text, 5);
    // 20 words / 5-per-chunk = 4 chunks.
    assert_eq!(chunks.len(), 4);
    assert_eq!(chunks[0], "w0 w1 w2 w3 w4");
    assert_eq!(chunks[3], "w15 w16 w17 w18 w19");
}

#[test]
fn cross_reference_detector_finds_3_word_title_mentions() {
    // Pinned from the in-core test_cross_reference_detection
    // (ogdb-core lib.rs:41184-41216) which is migrated in this plan.
    let sections = vec![
        ParsedSection {
            title: "Introduction".to_string(),
            level: 1,
            content: "This paper discusses graph algorithms.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "Graph Algorithms Overview".to_string(),
            level: 2,
            content: "Various algorithms exist.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "Results and Discussion".to_string(),
            level: 2,
            content: "As described in Graph Algorithms Overview, the results show improvement."
                .to_string(),
            page_start: None,
            page_end: None,
        },
    ];
    let refs = detect_cross_references(&sections);
    // (2, 1) — section[2].content contains section[1].title (3 words ≥ 3).
    assert!(
        refs.contains(&(2, 1)),
        "Should detect cross-reference from index 2 → index 1; got: {refs:?}"
    );
}

#[test]
fn ingest_error_is_thiserror_and_displayable() {
    // Eval/rust-quality §6.1 regression: parse_pdf_sections /
    // parse_markdown_sections used to return Result<_, String>, which
    // forced callers (DbError::InvalidArgument adapter in ogdb-core)
    // to lose type information. Now they return Result<_,
    // IngestError>; verify the new error type is a real
    // std::error::Error and produces the same human-readable strings
    // that the old String-based contract did, so DbError surface text
    // is preserved.
    let pdf = IngestError::Pdf("malformed xref table".into());
    assert_eq!(pdf.to_string(), "Failed to parse PDF: malformed xref table");
    let md = IngestError::Markdown("syntax error".into());
    assert_eq!(md.to_string(), "Failed to parse Markdown: syntax error");
    let _: &dyn std::error::Error = &pdf; // compile-time: implements Error.
}

#[test]
fn ingest_error_is_non_exhaustive() {
    // Callers must not exhaustively match — the enum is
    // #[non_exhaustive] (eval/rust-quality §6.2). This compiles iff
    // the wildcard arm is required.
    let e = IngestError::Pdf("x".into());
    let label = match &e {
        IngestError::Pdf(_) => "pdf",
        IngestError::Markdown(_) => "md",
        _ => "other",
    };
    assert_eq!(label, "pdf");
}

#[test]
fn cross_reference_detector_skips_short_titles() {
    // 1-word and 2-word titles should not produce false-positive refs
    // (heuristic: title must have ≥ 3 whitespace-delimited words).
    let sections = vec![
        ParsedSection {
            title: "Intro".to_string(), // 1 word
            level: 1,
            content: "We mention Intro a lot.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "The End".to_string(), // 2 words
            level: 2,
            content: "We mention The End frequently.".to_string(),
            page_start: None,
            page_end: None,
        },
    ];
    let refs = detect_cross_references(&sections);
    assert!(
        refs.is_empty(),
        "short titles must not generate refs; got: {refs:?}"
    );
}
