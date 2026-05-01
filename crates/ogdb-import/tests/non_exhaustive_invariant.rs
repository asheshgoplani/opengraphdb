//! Regression test for EVAL-RUST-QUALITY-CYCLE3 B3.
//!
//! `DocumentFormat` is `#[non_exhaustive]`. Downstream crates must use a
//! wildcard arm in `match`. With `#[deny(unreachable_patterns)]`,
//! removing the marker would fail this test at compile time.

#![deny(unreachable_patterns)]

use ogdb_import::DocumentFormat;

#[test]
fn document_format_requires_wildcard_in_external_crate() {
    fn extension(format: DocumentFormat) -> &'static str {
        match format {
            DocumentFormat::Pdf => "pdf",
            DocumentFormat::Markdown => "md",
            DocumentFormat::PlainText => "txt",
            _ => "unknown",
        }
    }
    assert_eq!(extension(DocumentFormat::Pdf), "pdf");
}
