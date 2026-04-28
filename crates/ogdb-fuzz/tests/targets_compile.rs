//! RED-phase compile-safety checks for the libFuzzer targets under
//! `crates/ogdb-fuzz/fuzz/`. These tests do NOT invoke `cargo +nightly
//! fuzz build` — that would require the nightly toolchain and
//! cargo-fuzz on every CI node. They are source-level existence +
//! shape checks, which is what the PLAN at
//! `.planning/fuzzing-harness/PLAN.md` §4 calls for.
//!
//! RED state (this commit): all 5 tests FAIL because the
//! `crates/ogdb-fuzz/fuzz/` subtree does not exist yet.
//! GREEN state (Phases 3–5): all 5 tests pass.

use std::path::{Path, PathBuf};

/// Resolve a path relative to this crate's manifest directory
/// (`crates/ogdb-fuzz/`). Using CARGO_MANIFEST_DIR keeps these tests
/// runnable from anywhere (IDE test runner, workspace root, etc.).
fn crate_path(rel: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn read_to_string(rel: &str) -> String {
    let p = crate_path(rel);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("reading {}: {e}", p.display()))
}

#[test]
fn fuzz_subdir_exists() {
    let fuzz_dir = crate_path("fuzz");
    assert!(
        fuzz_dir.is_dir(),
        "expected nested cargo-fuzz workspace at {} — see PLAN §5.1",
        fuzz_dir.display(),
    );
    let manifest = crate_path("fuzz/Cargo.toml");
    assert!(
        manifest.is_file(),
        "expected nested cargo-fuzz manifest at {}",
        manifest.display(),
    );
}

#[test]
fn cypher_parser_target_source_exists() {
    let target = crate_path("fuzz/fuzz_targets/fuzz_cypher_parser.rs");
    assert!(
        target.is_file(),
        "expected fuzz target source at {} — see PLAN §5.2",
        target.display(),
    );
    let src = read_to_string("fuzz/fuzz_targets/fuzz_cypher_parser.rs");
    assert!(
        src.contains("fuzz_target!"),
        "fuzz_cypher_parser.rs must invoke the fuzz_target! macro",
    );
    assert!(
        src.contains("ogdb_core::parse_cypher("),
        "fuzz_cypher_parser.rs must call ogdb_core::parse_cypher — \
         that's the whole point of the target",
    );
}

#[test]
fn wal_reader_target_source_exists() {
    let target = crate_path("fuzz/fuzz_targets/fuzz_wal_record_reader.rs");
    assert!(
        target.is_file(),
        "expected fuzz target source at {} — see PLAN §5.3",
        target.display(),
    );
    let src = read_to_string("fuzz/fuzz_targets/fuzz_wal_record_reader.rs");
    assert!(
        src.contains("fuzz_target!"),
        "fuzz_wal_record_reader.rs must invoke the fuzz_target! macro",
    );
    for needle in [
        "ogdb_core::Database::init(",
        "ogdb_core::Database::open(",
        "tempfile::",
    ] {
        assert!(
            src.contains(needle),
            "fuzz_wal_record_reader.rs must contain `{needle}` — see PLAN §3.2 \
             for why each piece is load-bearing",
        );
    }
}

#[test]
fn fuzz_cargo_toml_registers_both_bins() {
    let manifest_text = read_to_string("fuzz/Cargo.toml");
    let parsed: toml::Value = manifest_text
        .parse()
        .expect("fuzz/Cargo.toml must be valid TOML");

    let bins = parsed
        .get("bin")
        .and_then(|v| v.as_array())
        .expect("fuzz/Cargo.toml must declare [[bin]] entries");

    let names: Vec<&str> = bins
        .iter()
        .filter_map(|b| b.get("name"))
        .filter_map(|n| n.as_str())
        .collect();

    for expected in ["fuzz_cypher_parser", "fuzz_wal_record_reader"] {
        assert!(
            names.contains(&expected),
            "fuzz/Cargo.toml missing [[bin]] name = \"{expected}\" — \
             cargo-fuzz discovers targets from this manifest. Found: {names:?}",
        );
    }
}

#[test]
fn readme_documents_invocation() {
    let readme = crate_path("README.md");
    assert!(
        readme.is_file(),
        "expected README at {} documenting the fuzz invocation — \
         see PLAN §5.4",
        readme.display(),
    );
    let text = read_to_string("README.md");
    for needle in [
        "cargo +nightly fuzz run fuzz_cypher_parser",
        "cargo +nightly fuzz run fuzz_wal_record_reader",
    ] {
        assert!(
            text.contains(needle),
            "README.md must contain `{needle}` so engineers can copy-paste \
             the run command",
        );
    }
}
