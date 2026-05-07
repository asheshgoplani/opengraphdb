//! RED test for the Cypher lexer block-comment panic surfaced by Phase B
//! H-17 nightly fuzz run 25479643932 (2026-05-07).
//!
//! Bug: in `lex_cypher`, the block-comment branch calls
//! `remaining.find("*/")` over the whole remaining slice. When the input
//! is `"/*/"` (or any string where `*/` overlaps the opening `/*`), the
//! returned index is `1` — i.e. the `*/` shares its leading `*` with the
//! `*` of the opening `/*`. The code then slices `remaining[2..end_idx]`
//! which becomes `remaining[2..1]`, panicking with
//! "byte range starts at 2 but ends at 1".
//!
//! The fix is to search for `*/` strictly AFTER the opening `/*`, i.e.
//! in `remaining[2..]`, which forces the closing delimiter to be a
//! non-overlapping pair.
//!
//! This test must currently PANIC on the listed inputs and must PASS once
//! the fix lands.

use ogdb_core::lex_cypher;

#[test]
fn lex_comment_overlap_does_not_panic() {
    // Inputs where the closing */ would overlap the opening /* under a
    // naive search. None of these should panic. They may legitimately
    // produce a parse error (e.g. unterminated block comment) — that's
    // fine; the contract is "no panic, return Result".
    let inputs = ["/*/", "/**", "/*/*", "/*/abc/*/"];

    for input in inputs {
        let result = std::panic::catch_unwind(|| lex_cypher(input));
        assert!(
            result.is_ok(),
            "lex_cypher panicked on input {:?} — expected Result (Ok or Err), not panic",
            input
        );
    }
}
