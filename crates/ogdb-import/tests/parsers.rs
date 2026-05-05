//! Coverage-audit BLOCKER 2 (2026-05-05): pin behaviour of the three
//! publicly-exported parser helpers in `ogdb-import` —
//! `parse_pdf_sections`, `parse_markdown_sections`,
//! `detect_cross_references` — which previously had zero direct
//! tests despite being the document-ingest crate's primary surface.
//!
//! Each test asserts a concrete shape the call site in
//! `Database::ingest_document` (`ogdb-core` lib.rs:21915) relies on,
//! so a silent regression in heading detection, code-block handling,
//! mixed heading levels, or PDF malformed-input handling fails red
//! here before it ships.

use ogdb_import::{
    detect_cross_references, parse_markdown_sections, parse_pdf_sections, IngestError,
    ParsedSection,
};

// ---------- parse_markdown_sections ----------

#[test]
fn parse_markdown_sections_heading_only_doc_returns_empty() {
    // No prose between headings ⇒ no section is flushed (each flush
    // is gated on `current_content.trim().is_empty() == false`).
    // Pinning this is important: if a future refactor starts
    // emitting empty-content sections, downstream chunkers will
    // create zero-word :Content nodes and bloat the graph.
    let md = "# Heading One\n\n## Heading Two\n\n### Heading Three\n";
    let sections = parse_markdown_sections(md).expect("markdown parse must succeed");
    assert!(
        sections.is_empty(),
        "heading-only doc must produce zero sections; got: {sections:?}"
    );
}

#[test]
fn parse_markdown_sections_handles_code_blocks() {
    // Fenced code blocks emit Event::Text events for each line; they
    // must end up inside the surrounding section's content (not lost,
    // not mistaken for headings).
    let md = "# Setup\n\nRun this:\n\n```sh\ncargo build --release\necho done\n```\n\nThat compiles the binary.\n";
    let sections = parse_markdown_sections(md).expect("markdown parse must succeed");
    assert_eq!(sections.len(), 1, "single H1 ⇒ single section; got: {sections:?}");
    let s = &sections[0];
    assert_eq!(s.title, "Setup");
    assert_eq!(s.level, 1);
    assert!(
        s.content.contains("cargo build --release"),
        "code block contents must be preserved; got content: {:?}",
        s.content
    );
    assert!(
        s.content.contains("That compiles the binary"),
        "post-code-block prose must be preserved; got content: {:?}",
        s.content
    );
}

#[test]
fn parse_markdown_sections_preserves_mixed_heading_levels() {
    // Each heading level should round-trip into ParsedSection.level
    // unchanged. This is the property the cross-reference detector
    // and the on-disk :Section nodes rely on.
    let md = "\
# Top\n\nTop body text.\n\n\
## Sub A\n\nSub A body.\n\n\
### Sub A.1\n\nDeep body.\n\n\
## Sub B\n\nSub B body.\n";
    let sections = parse_markdown_sections(md).expect("markdown parse must succeed");
    assert_eq!(
        sections.len(),
        4,
        "expected 4 sections (Top, Sub A, Sub A.1, Sub B); got: {sections:?}"
    );
    let by_title: std::collections::HashMap<&str, u32> =
        sections.iter().map(|s| (s.title.as_str(), s.level)).collect();
    assert_eq!(by_title.get("Top"), Some(&1));
    assert_eq!(by_title.get("Sub A"), Some(&2));
    assert_eq!(by_title.get("Sub A.1"), Some(&3));
    assert_eq!(by_title.get("Sub B"), Some(&2));
}

// ---------- parse_pdf_sections ----------

#[test]
fn parse_pdf_sections_extracts_text_from_valid_pdf() {
    // Fixture is a 2-page PDF generated via reportlab; see
    // tests/fixtures/sample.pdf. We assert the parser returns at
    // least one non-empty section whose content includes prose from
    // the fixture, without pinning the heading-heuristic outcome
    // (the heuristic is intentionally fuzzy and tweaks to it should
    // not break this test).
    let bytes = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/sample.pdf"
    ))
    .expect("fixture must exist");
    let sections = parse_pdf_sections(&bytes).expect("valid PDF must parse");
    assert!(
        !sections.is_empty(),
        "valid PDF with text must produce at least one section"
    );
    let combined: String = sections.iter().map(|s| s.content.as_str()).collect::<Vec<_>>().join("\n");
    assert!(
        combined.contains("parsing of small PDF fixtures")
            || combined.contains("parse_pdf_sections has bytes")
            || combined.contains("All page text is extracted"),
        "extracted text must include fixture body prose; got: {combined:?}"
    );
    for s in &sections {
        assert!(s.page_start.is_some(), "PDF sections must carry page_start");
        assert!(s.page_end.is_some(), "PDF sections must carry page_end");
    }
}

#[test]
fn parse_pdf_sections_malformed_returns_err() {
    // Anything that does not start with `%PDF-` (or that lopdf
    // cannot load) must surface as `IngestError::Pdf(_)` — the
    // contract `Database::ingest_document` adapts via
    // `DbError::InvalidArgument`.
    let garbage = b"not a pdf at all, just bytes";
    let err = parse_pdf_sections(garbage).expect_err("malformed input must fail");
    match err {
        IngestError::Pdf(_) => {}
        other => panic!("expected IngestError::Pdf, got: {other:?}"),
    }
}

// ---------- detect_cross_references ----------

#[test]
fn detect_cross_references_finds_title_mention_in_markdown_doc() {
    // Markdown doc with an explicit anchor-style cross-reference:
    // section "Implementation Strategy" is referenced from
    // "Conclusion" via `[link](#implementation-strategy)`. The
    // detector keys off plain title-text mentions (>= 3 words), not
    // the anchor URL — but the link text is the title, so the
    // detector still fires. Pinning this guards against the
    // detector regressing into a NOOP when fed real markdown
    // sections (vs. hand-built `ParsedSection` arrays).
    // Title must have ≥ 3 whitespace-delimited words (the detector's
    // floor — see `detect_cross_references` impl). Both candidate
    // section titles below satisfy that.
    let md = "\
# Introduction To The Work\n\nSetting the stage.\n\n\
# The Implementation Strategy We Chose\n\nDescribes the approach.\n\n\
# Conclusion And Future Outlook\n\nAs covered in [The Implementation Strategy We Chose](#the-implementation-strategy-we-chose), the approach holds.\n";
    let sections = parse_markdown_sections(md).expect("markdown parse must succeed");
    assert_eq!(sections.len(), 3, "three H1 sections; got: {sections:?}");
    let conclusion_idx = sections
        .iter()
        .position(|s| s.title == "Conclusion And Future Outlook")
        .expect("Conclusion section must exist");
    let impl_idx = sections
        .iter()
        .position(|s| s.title == "The Implementation Strategy We Chose")
        .expect("Implementation Strategy section must exist");
    let refs = detect_cross_references(&sections);
    assert!(
        refs.contains(&(conclusion_idx, impl_idx)),
        "expected ({conclusion_idx}, {impl_idx}) ∈ refs; got: {refs:?}"
    );
}

#[test]
fn detect_cross_references_returns_empty_when_no_titles_match() {
    // Three sections, none of which mentions another's title in its
    // body. The detector's >= 3-word title floor also rules out the
    // single-word titles entirely.
    let sections = vec![
        ParsedSection {
            title: "Background".to_string(),
            level: 1,
            content: "Bees are small flying insects.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "Methods".to_string(),
            level: 1,
            content: "We collected pollen samples weekly.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "Findings".to_string(),
            level: 1,
            content: "Yields rose 12% across the season.".to_string(),
            page_start: None,
            page_end: None,
        },
    ];
    let refs = detect_cross_references(&sections);
    assert!(
        refs.is_empty(),
        "no body should mention another title; got: {refs:?}"
    );
}
