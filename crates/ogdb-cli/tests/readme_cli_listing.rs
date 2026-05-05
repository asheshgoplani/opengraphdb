//! C3-H3 regression gate: every `ogdb` subcommand defined in
//! `crates/ogdb-cli/src/lib.rs` must be mentioned in the user-facing docs.
//!
//! Cycle 1 / cycle 2 logged the gap (`migrate` was missing); cycle 2 deferred;
//! cycle 3 added `demo` to the missing set. Cycle 17 simplified the README and
//! moved the full CLI listing into `documentation/CLI.md`. The test now scans
//! README + the top-level docs in `documentation/` so the contract "every
//! subcommand is documented somewhere" survives README pruning.

use std::path::PathBuf;

/// Every subcommand the CLI exposes today (matches the `Command` enum in
/// `crates/ogdb-cli/src/lib.rs::Command`). Add to this list when a new
/// subcommand ships AND mention the new subcommand in `documentation/CLI.md`.
const CLI_SUBCOMMANDS: &[&str] = &[
    "init",
    "info",
    "query",
    "shell",
    "import",
    "export",
    "migrate",
    "import-rdf",
    "export-rdf",
    "validate-shacl",
    "backup",
    "checkpoint",
    "schema",
    "stats",
    "metrics",
    "mcp",
    "serve",
    "demo",
    "create-node",
    "add-edge",
    "neighbors",
    "incoming",
    "hop",
    "hop-in",
];

/// Files whose union must mention every subcommand. `documentation/CLI.md` is
/// the canonical reference; the rest are scanned so common subcommands stay
/// discoverable in their natural homes (quickstart, cookbook, migration).
const DOC_FILES: &[&str] = &[
    "README.md",
    "documentation/CLI.md",
    "documentation/QUICKSTART.md",
    "documentation/COOKBOOK.md",
    "documentation/MIGRATION-FROM-NEO4J.md",
];

#[test]
fn readme_cli_listing_covers_all_subcommands() {
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut combined = String::new();
    for rel in DOC_FILES {
        let path = workspace_root.join(rel);
        // Optional files (e.g. a doc that may not exist yet) are silently
        // skipped; the canonical reference file is required.
        match std::fs::read_to_string(&path) {
            Ok(contents) => {
                combined.push_str(&contents);
                combined.push('\n');
            }
            Err(e) if *rel == "documentation/CLI.md" || *rel == "README.md" => {
                panic!("read required doc {}: {e}", path.display());
            }
            Err(_) => {}
        }
    }

    let mut missing = Vec::new();
    for cmd in CLI_SUBCOMMANDS {
        // Subcommands appear in docs either inline (` ogdb demo `) or
        // backtick-wrapped (`` `demo` ``). A bare substring match covers both.
        if !combined.contains(cmd) {
            missing.push(*cmd);
        }
    }
    assert!(
        missing.is_empty(),
        "documentation is missing CLI subcommand(s): {missing:?}\n\
         Add them to `documentation/CLI.md` (the canonical CLI reference) or — \
         if they should not surface — update CLI_SUBCOMMANDS in {}/tests/readme_cli_listing.rs.",
        env!("CARGO_MANIFEST_DIR")
    );
}
