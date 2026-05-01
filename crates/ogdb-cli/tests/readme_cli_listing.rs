//! C3-H3 regression gate: every `ogdb` subcommand defined in
//! `crates/ogdb-cli/src/lib.rs` must be mentioned in the workspace `README.md`.
//!
//! Cycle 1 / cycle 2 logged the gap (`migrate` was missing); cycle 2 deferred;
//! cycle 3 added `demo` to the missing set. This test pins the listing so the
//! README stays in sync with the actual CLI surface.

use std::path::PathBuf;

/// Every subcommand the CLI exposes today (matches the `Command` enum in
/// `crates/ogdb-cli/src/lib.rs::Command`). Add to this list when a new
/// subcommand ships AND mention the new subcommand in `README.md`.
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

#[test]
fn readme_cli_listing_covers_all_subcommands() {
    let readme_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("README.md");
    let readme = std::fs::read_to_string(&readme_path)
        .unwrap_or_else(|e| panic!("read {}: {e}", readme_path.display()));

    let mut missing = Vec::new();
    for cmd in CLI_SUBCOMMANDS {
        // Subcommands appear in the README either inline (` ogdb demo `) or
        // backtick-wrapped (`` `demo` ``). A bare substring match covers both.
        if !readme.contains(cmd) {
            missing.push(*cmd);
        }
    }
    assert!(
        missing.is_empty(),
        "README.md is missing CLI subcommand(s): {missing:?}\n\
         Add them to the `## CLI` listing or — if they should not surface — \
         update the const in {}/tests/readme_cli_listing.rs.",
        env!("CARGO_MANIFEST_DIR")
    );
}
