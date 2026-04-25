//! `ogdb-import` — document-ingest plain-data + pure parser/chunker
//! helpers extracted out of `ogdb-core` (5th facet of the 7-crate
//! split: vector → algorithms → text → temporal → import).
//!
//! Public surface (always-on):
//! * [`DocumentFormat`], [`IngestConfig`], [`IngestResult`],
//!   [`ParsedSection`] — plain-data types consumed by
//!   `Database::ingest_document` (which stays in `ogdb-core`).
//! * [`parse_plaintext_sections`], [`chunk_content`],
//!   [`detect_cross_references`] — pure stdlib helpers.
//!
//! Public surface gated by the `document-ingest` feature:
//! * [`parse_pdf_sections`] (uses `lopdf`)
//! * [`parse_markdown_sections`] (uses `pulldown_cmark`)
//!
//! Both feature-gated parsers return `Result<_, String>`; the call
//! site in `Database::ingest_document` (in `ogdb-core`) adapts via
//! `.map_err(DbError::InvalidArgument)` so `DbError` does not leak
//! into this crate.
//!
//! See `.planning/ogdb-core-split-import/PLAN.md` for rationale.

use serde::{Deserialize, Serialize};

/// Supported document formats for ingestion
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DocumentFormat {
    Pdf,
    Markdown,
    PlainText,
}

/// Configuration for document ingestion
pub struct IngestConfig {
    /// Document title (used as :Document node title property)
    pub title: String,
    /// Document format
    pub format: DocumentFormat,
    /// Optional embedding callback: given text, returns embedding vector.
    /// If None, content nodes are added to text index only (no vector index).
    #[allow(clippy::type_complexity)]
    pub embed_fn: Option<Box<dyn Fn(&str) -> Vec<f32> + Send + Sync>>,
    /// Vector dimensions (required if embed_fn is provided)
    pub embedding_dimensions: Option<usize>,
    /// Optional source URI for provenance tracking
    pub source_uri: Option<String>,
    /// Max words per content chunk (default: 512)
    pub max_chunk_words: usize,
}

impl Default for IngestConfig {
    fn default() -> Self {
        Self {
            title: String::new(),
            format: DocumentFormat::PlainText,
            embed_fn: None,
            embedding_dimensions: None,
            source_uri: None,
            max_chunk_words: 512,
        }
    }
}

/// Result of document ingestion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestResult {
    /// ID of the :Document node created
    pub document_node_id: u64,
    /// Number of :Section nodes created
    pub section_count: u64,
    /// Number of :Content nodes created (leaf chunks)
    pub content_count: u64,
    /// Number of :REFERENCES edges created (cross-references)
    pub reference_count: u64,
    /// Whether text index was populated
    pub text_indexed: bool,
    /// Whether vector index was populated
    pub vector_indexed: bool,
}

/// Plain-data parsed document section. Produced by
/// [`parse_pdf_sections`], [`parse_markdown_sections`], and
/// [`parse_plaintext_sections`]; consumed by
/// `Database::ingest_document` (in `ogdb-core`).
#[derive(Debug, Clone)]
pub struct ParsedSection {
    pub title: String,
    pub level: u32,
    pub content: String,
    pub page_start: Option<u32>,
    pub page_end: Option<u32>,
}

#[cfg(feature = "document-ingest")]
pub fn parse_pdf_sections(data: &[u8]) -> Result<Vec<ParsedSection>, String> {
    use lopdf::Document as PdfDocument;

    let doc = PdfDocument::load_mem(data)
        .map_err(|e| format!("Failed to parse PDF: {e}"))?;

    let page_count = doc.get_pages().len();
    let mut sections: Vec<ParsedSection> = Vec::new();
    let mut current_text = String::new();
    let mut current_page_start = 1u32;
    let mut current_heading: Option<String> = None;

    for page_num in 1..=(page_count as u32) {
        let page_text = doc.extract_text(&[page_num]).unwrap_or_default();

        if page_text.trim().is_empty() {
            continue;
        }

        for line in page_text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                current_text.push('\n');
                continue;
            }

            // Heuristic: heading if short (<100 chars), not a sentence, and ALL CAPS or Title Case
            let is_heading = trimmed.len() < 100
                && !trimmed.ends_with('.')
                && (trimmed == trimmed.to_uppercase()
                    || trimmed.split_whitespace().all(|w| {
                        w.chars().next().map(|c| c.is_uppercase()).unwrap_or(false)
                            || w.len() <= 3
                    }));

            if is_heading && !current_text.trim().is_empty() {
                // Flush previous section
                let title = current_heading
                    .take()
                    .unwrap_or_else(|| "Introduction".to_string());
                sections.push(ParsedSection {
                    title,
                    level: 2,
                    content: std::mem::take(&mut current_text).trim().to_string(),
                    page_start: Some(current_page_start),
                    page_end: Some(page_num),
                });
                current_page_start = page_num;
                current_heading = Some(trimmed.to_string());
            } else if is_heading {
                current_heading = Some(trimmed.to_string());
            } else {
                current_text.push_str(trimmed);
                current_text.push('\n');
            }
        }
    }

    // Flush remaining
    if !current_text.trim().is_empty() {
        let title = current_heading
            .take()
            .unwrap_or_else(|| "Content".to_string());
        sections.push(ParsedSection {
            title,
            level: 2,
            content: current_text.trim().to_string(),
            page_start: Some(current_page_start),
            page_end: Some(page_count as u32),
        });
    }

    // Fallback: single section with all content
    if sections.is_empty() {
        let all_text = (1..=(page_count as u32))
            .filter_map(|p| doc.extract_text(&[p]).ok())
            .collect::<Vec<_>>()
            .join("\n");
        if !all_text.trim().is_empty() {
            sections.push(ParsedSection {
                title: "Document Content".to_string(),
                level: 1,
                content: all_text.trim().to_string(),
                page_start: Some(1),
                page_end: Some(page_count as u32),
            });
        }
    }

    sections.retain(|s| !s.content.trim().is_empty());
    Ok(sections)
}

#[cfg(feature = "document-ingest")]
pub fn parse_markdown_sections(text: &str) -> Result<Vec<ParsedSection>, String> {
    use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};

    let parser = Parser::new(text);
    let mut sections: Vec<ParsedSection> = Vec::new();
    let mut current_heading: Option<(String, u32)> = None;
    let mut current_content = String::new();
    let mut in_heading = false;
    let mut heading_text = String::new();
    let mut heading_level = 0u32;

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                // Flush previous section
                if !current_content.trim().is_empty() || current_heading.is_some() {
                    let (title, lvl) = current_heading
                        .take()
                        .unwrap_or_else(|| ("Introduction".to_string(), 1));
                    if !current_content.trim().is_empty() {
                        sections.push(ParsedSection {
                            title,
                            level: lvl,
                            content: current_content.trim().to_string(),
                            page_start: None,
                            page_end: None,
                        });
                    }
                    current_content.clear();
                }
                in_heading = true;
                heading_text.clear();
                heading_level = match level {
                    HeadingLevel::H1 => 1,
                    HeadingLevel::H2 => 2,
                    HeadingLevel::H3 => 3,
                    HeadingLevel::H4 => 4,
                    HeadingLevel::H5 => 5,
                    HeadingLevel::H6 => 6,
                };
            }
            Event::End(TagEnd::Heading(_)) => {
                in_heading = false;
                current_heading = Some((heading_text.clone(), heading_level));
            }
            Event::Text(t) | Event::Code(t) => {
                if in_heading {
                    heading_text.push_str(&t);
                } else {
                    current_content.push_str(&t);
                }
            }
            Event::SoftBreak | Event::HardBreak if !in_heading => {
                current_content.push('\n');
            }
            Event::End(TagEnd::Paragraph) => {
                current_content.push_str("\n\n");
            }
            _ => {}
        }
    }

    // Flush final section
    if !current_content.trim().is_empty() {
        let (title, lvl) = current_heading
            .take()
            .unwrap_or_else(|| ("Content".to_string(), 1));
        sections.push(ParsedSection {
            title,
            level: lvl,
            content: current_content.trim().to_string(),
            page_start: None,
            page_end: None,
        });
    }

    Ok(sections)
}

pub fn parse_plaintext_sections(text: &str, max_chunk_words: usize) -> Vec<ParsedSection> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }
    let chunk_size = if max_chunk_words == 0 { words.len() } else { max_chunk_words };
    words
        .chunks(chunk_size)
        .enumerate()
        .map(|(i, chunk)| ParsedSection {
            title: format!("Chunk {}", i + 1),
            level: 1,
            content: chunk.join(" "),
            page_start: None,
            page_end: None,
        })
        .collect()
}

pub fn chunk_content(content: &str, max_words: usize) -> Vec<String> {
    if max_words == 0 {
        return vec![content.to_string()];
    }
    let words: Vec<&str> = content.split_whitespace().collect();
    if words.len() <= max_words {
        return vec![content.to_string()];
    }
    words.chunks(max_words).map(|c| c.join(" ")).collect()
}

pub fn detect_cross_references(sections: &[ParsedSection]) -> Vec<(usize, usize)> {
    let mut refs = Vec::new();
    for (i, section) in sections.iter().enumerate() {
        let content_lower = section.content.to_lowercase();
        for (j, other) in sections.iter().enumerate() {
            if i == j {
                continue;
            }
            let title_words: Vec<&str> = other.title.split_whitespace().collect();
            if title_words.len() >= 3 {
                let title_lower = other.title.to_lowercase();
                if content_lower.contains(&title_lower) {
                    refs.push((i, j));
                }
            }
        }
    }
    refs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cross_reference_detection() {
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
                content: "As described in Graph Algorithms Overview, the results show improvement.".to_string(),
                page_start: None,
                page_end: None,
            },
        ];

        let refs = detect_cross_references(&sections);
        assert!(
            refs.contains(&(2, 1)),
            "Should detect cross-reference from Results to Graph Algorithms Overview, got: {refs:?}"
        );
    }
}
