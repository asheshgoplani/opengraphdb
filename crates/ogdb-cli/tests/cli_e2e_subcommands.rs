//! End-to-end subprocess coverage for the 13 `ogdb` subcommands flagged HIGH
//! in `documentation/.research/coverage-audit-2026-05-05.md` §2 — they had no
//! integration test that actually spawned the `ogdb` binary, only in-process
//! `lib.rs::tests` calls into `run()` and a presence check in
//! `tests/readme_cli_listing.rs`.
//!
//! Each `#[test]` here:
//!   1. Creates a temp directory.
//!   2. Spawns `ogdb init <db>` to lay down a fresh database file.
//!   3. (For graph-traversal subcommands) seeds a 3-node graph via subsequent
//!      `ogdb create-node` / `ogdb add-edge` invocations.
//!   4. Invokes the subcommand under test as a subprocess.
//!   5. Asserts exit-code 0 + a meaningful stdout substring proving the
//!      command actually reached the storage layer.
//!
//! These tests run sequentially (`-- --test-threads=1` in the manifest) so
//! parallel `tempdir` allocations don't fight over WAL files.

use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

use tempfile::TempDir;

/// Run `ogdb <args>` and return the captured `Output`. Panics if the binary
/// fails to spawn (the test cannot proceed without it).
fn run_ogdb(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args(args)
        .output()
        .expect("spawn ogdb binary")
}

fn must_succeed(out: &Output, label: &str) {
    assert!(
        out.status.success(),
        "{label} failed: status={:?}\nstdout={}\nstderr={}",
        out.status,
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr),
    );
}

fn stdout_of(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).into_owned()
}

/// Lay down a fresh database at `<tmp>/db.ogdb` and return the path.
fn fresh_db(tmp: &TempDir) -> PathBuf {
    let db = tmp.path().join("db.ogdb");
    let init = run_ogdb(&["init", &db.display().to_string()]);
    must_succeed(&init, "ogdb init");
    db
}

/// Lay down a fresh DB and seed a 3-node graph: 0 -> 1, 0 -> 2.
/// Returns the db path so callers can drive traversal subcommands.
fn fresh_db_with_seed(tmp: &TempDir) -> PathBuf {
    let db = fresh_db(tmp);
    let path = db.display().to_string();
    for _ in 0..3 {
        let out = run_ogdb(&["create-node", &path]);
        must_succeed(&out, "ogdb create-node (seed)");
    }
    let e0 = run_ogdb(&["add-edge", &path, "0", "1"]);
    must_succeed(&e0, "ogdb add-edge 0 -> 1 (seed)");
    let e1 = run_ogdb(&["add-edge", &path, "0", "2"]);
    must_succeed(&e1, "ogdb add-edge 0 -> 2 (seed)");
    db
}

#[test]
fn info_subcommand_reports_node_and_edge_counts() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);

    let out = run_ogdb(&["info", &db.display().to_string()]);
    must_succeed(&out, "ogdb info");
    let s = stdout_of(&out);
    assert!(s.contains("node_count="), "info output missing node_count: {s}");
    assert!(s.contains("edge_count="), "info output missing edge_count: {s}");
    assert!(s.contains("page_count="), "info output missing page_count: {s}");
}

#[test]
fn stats_subcommand_reports_degree_metrics_on_empty_db() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);

    let out = run_ogdb(&["stats", &db.display().to_string()]);
    must_succeed(&out, "ogdb stats");
    let s = stdout_of(&out);
    assert!(s.contains("node_count=0"), "stats missing node_count=0: {s}");
    assert!(s.contains("edge_count=0"), "stats missing edge_count=0: {s}");
    assert!(
        s.contains("max_out_degree=") || s.contains("avg_out_degree="),
        "stats missing degree fields: {s}"
    );
}

#[test]
fn metrics_subcommand_reports_storage_counters() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);

    let out = run_ogdb(&["metrics", &db.display().to_string()]);
    must_succeed(&out, "ogdb metrics");
    let s = stdout_of(&out);
    assert!(
        s.contains("node_count=") && s.contains("edge_count="),
        "metrics missing node/edge counters: {s}"
    );
}

#[test]
fn checkpoint_subcommand_succeeds_on_fresh_db() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);

    let out = run_ogdb(&["checkpoint", &db.display().to_string()]);
    must_succeed(&out, "ogdb checkpoint");
    let s = stdout_of(&out);
    assert!(s.contains("checkpointed"), "checkpoint output missing 'checkpointed': {s}");
}

#[test]
fn backup_subcommand_writes_destination_file() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);
    let dst = tmp.path().join("backup.ogdb");

    let out = run_ogdb(&[
        "backup",
        &db.display().to_string(),
        &dst.display().to_string(),
    ]);
    must_succeed(&out, "ogdb backup");
    let s = stdout_of(&out);
    assert!(
        s.contains("backup_created"),
        "backup output missing 'backup_created': {s}"
    );
    assert!(
        Path::new(&dst).exists(),
        "backup destination file not created at {}",
        dst.display()
    );
}

#[test]
fn migrate_subcommand_applies_migration_script() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);
    let script = tmp.path().join("migrate.txt");
    std::fs::write(&script, "ADD LABEL Person\nADD EDGE_TYPE KNOWS\n")
        .expect("write migration script");

    let out = run_ogdb(&[
        "migrate",
        &db.display().to_string(),
        &script.display().to_string(),
    ]);
    must_succeed(&out, "ogdb migrate");
    let s = stdout_of(&out);
    assert!(s.contains("[APPLIED] ADD LABEL Person"), "migrate stdout missing apply line: {s}");
    assert!(s.contains("2 action(s) applied successfully"), "migrate stdout missing summary: {s}");
}

#[test]
fn create_node_subcommand_emits_node_id() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);

    let out = run_ogdb(&["create-node", &db.display().to_string()]);
    must_succeed(&out, "ogdb create-node");
    let s = stdout_of(&out);
    assert!(s.contains("node_id=0"), "first create-node should emit node_id=0: {s}");
}

#[test]
fn add_edge_subcommand_emits_edge_id_after_node_creation() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);
    let path = db.display().to_string();

    let n0 = run_ogdb(&["create-node", &path]);
    must_succeed(&n0, "ogdb create-node #0");
    let n1 = run_ogdb(&["create-node", &path]);
    must_succeed(&n1, "ogdb create-node #1");

    let out = run_ogdb(&["add-edge", &path, "0", "1"]);
    must_succeed(&out, "ogdb add-edge");
    let s = stdout_of(&out);
    assert!(s.contains("edge_id=0"), "first add-edge should emit edge_id=0: {s}");
}

#[test]
fn neighbors_subcommand_lists_outgoing_targets() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db_with_seed(&tmp);

    let out = run_ogdb(&["neighbors", &db.display().to_string(), "0"]);
    must_succeed(&out, "ogdb neighbors");
    let s = stdout_of(&out);
    assert!(s.contains("src=0"), "neighbors stdout missing src=0: {s}");
    assert!(s.contains("count=2"), "neighbors stdout missing count=2: {s}");
    assert!(
        s.contains("neighbors=1,2") || s.contains("neighbors=2,1"),
        "neighbors stdout missing neighbor ids 1,2: {s}"
    );
}

#[test]
fn incoming_subcommand_lists_incoming_sources() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db_with_seed(&tmp);

    let out = run_ogdb(&["incoming", &db.display().to_string(), "1"]);
    must_succeed(&out, "ogdb incoming");
    let s = stdout_of(&out);
    assert!(s.contains("dst=1"), "incoming stdout missing dst=1: {s}");
    assert!(s.contains("count=1"), "incoming stdout missing count=1: {s}");
    assert!(s.contains("incoming=0"), "incoming stdout missing incoming=0: {s}");
}

#[test]
fn hop_subcommand_traverses_outgoing_edges() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db_with_seed(&tmp);

    let out = run_ogdb(&["hop", &db.display().to_string(), "0", "1"]);
    must_succeed(&out, "ogdb hop");
    let s = stdout_of(&out);
    assert!(s.contains("src=0"), "hop stdout missing src=0: {s}");
    assert!(s.contains("hops=1"), "hop stdout missing hops=1: {s}");
    assert!(s.contains("reachable_count=2"), "hop stdout missing reachable_count=2: {s}");
}

#[test]
fn hop_in_subcommand_traverses_incoming_edges() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db_with_seed(&tmp);

    let out = run_ogdb(&["hop-in", &db.display().to_string(), "1", "1"]);
    must_succeed(&out, "ogdb hop-in");
    let s = stdout_of(&out);
    assert!(s.contains("dst=1"), "hop-in stdout missing dst=1: {s}");
    assert!(s.contains("hops=1"), "hop-in stdout missing hops=1: {s}");
    assert!(s.contains("reachable_count=1"), "hop-in stdout missing reachable_count=1: {s}");
}

#[test]
fn shell_subcommand_executes_commands_flag_non_interactively() {
    let tmp = TempDir::new().expect("tempdir");
    let db = fresh_db(&tmp);

    // `--commands` exits cleanly after running every semicolon-separated
    // query, so the subprocess shuts down without needing stdin closure
    // tricks. This proves the non-interactive shell path works end-to-end
    // through the spawned binary, not just in-process via `run()`.
    let out = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args([
            "shell",
            &db.display().to_string(),
            "--commands",
            "MATCH (n) RETURN count(n) AS c",
        ])
        .stdin(Stdio::null())
        .output()
        .expect("spawn ogdb shell --commands");
    must_succeed(&out, "ogdb shell --commands");
    let s = stdout_of(&out);
    assert!(
        s.contains("commands_executed=1"),
        "shell --commands stdout missing commands_executed=1: {s}"
    );
}
