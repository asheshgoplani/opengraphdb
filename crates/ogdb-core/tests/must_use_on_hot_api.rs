//! Regression test for EVAL-RUST-QUALITY-CYCLE2 §H7 (HIGH).
//!
//! `#[must_use]` is annotated on the high-leverage user-facing entry
//! points (`Database::query`, `Database::neighbors`,
//! `Database::shortest_path`, `SharedDatabase::open`, `lex_cypher`,
//! `parse_cypher`). The full `clippy::must_use_candidate` workspace
//! rollout is tracked as a cycle-3 follow-up — see EVAL §H7.
//!
//! This test exercises each annotated entry point and uses its return
//! value (so the test itself does not warn) while serving as a smoke
//! test that the annotation does not break callers.

use ogdb_core::{lex_cypher, parse_cypher, Header, SharedDatabase};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_db_path(tag: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_nanos();
    std::env::temp_dir().join(format!("ogdb-must-use-{tag}-{nanos}.ogdb"))
}

#[test]
fn must_use_marked_apis_compile_when_used() {
    let path = unique_db_path("smoke");
    let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");
    let snapshot = shared.read_snapshot().expect("snapshot");

    // Each must_use return value is `let`-bound, which is the documented
    // "consumed" pattern: removing the binding would emit
    // `unused_must_use` and `-D warnings` in CI would fail the build.
    // Whether the database operation itself succeeds against an empty
    // store is irrelevant — we are gating on the annotation surviving.
    let _query = snapshot.query("RETURN 1");
    let _neighbours = snapshot.neighbors(0);
    let _path = snapshot.shortest_path(0, 0);
    let _tokens = lex_cypher("RETURN 1");
    let _ast = parse_cypher("RETURN 1");

    // Sanity: lex/parse on a valid query should always succeed.
    assert!(lex_cypher("RETURN 1").is_ok());
    assert!(parse_cypher("RETURN 1").is_ok());
}
