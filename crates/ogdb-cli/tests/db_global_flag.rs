//! Regression coverage for the documented `--db <path>` global flag.
//!
//! `Cli` declares `--db` as a `global = true` arg meant to replace the
//! positional `<path>` on every database-touching subcommand:
//!
//!     ogdb --db /tmp/x.ogdb info
//!     ogdb --db /tmp/x.ogdb checkpoint
//!     ogdb --db /tmp/x.ogdb create-node --labels Person
//!
//! Prior to the fix, only a subset of subcommands honored the flag — the
//! "no-extra-positionals" group (`init`, `info`, `checkpoint`, `schema`,
//! `stats`, `metrics`, `shell`, `create-node`) bailed out with
//! `error: required arguments not provided: <path>` before the runtime had a
//! chance to splice the global value in. Each test below spawns the real
//! `ogdb` binary so we exercise the full clap parse path, not just an
//! in-process `run()` call.
//!
//! The third assertion locks in the friendly diagnostic when neither form
//! is supplied (rc=2 + a message that names both `<path>` and `--db`).

use std::process::{Command, Output};

use tempfile::TempDir;

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

#[test]
fn global_db_flag_initializes_database() {
    let tmp = TempDir::new().expect("tempdir");
    let db = tmp.path().join("init.ogdb");
    let db_str = db.display().to_string();

    let out = run_ogdb(&["--db", &db_str, "init"]);
    must_succeed(&out, "ogdb --db <path> init");
    assert!(db.exists(), "database file not created at {db_str}");
}

#[test]
fn global_db_flag_runs_info_after_init() {
    let tmp = TempDir::new().expect("tempdir");
    let db = tmp.path().join("info.ogdb");
    let db_str = db.display().to_string();

    must_succeed(&run_ogdb(&["--db", &db_str, "init"]), "init via --db");

    let out = run_ogdb(&["--db", &db_str, "info"]);
    must_succeed(&out, "ogdb --db <path> info");

    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        stdout.contains("path") || stdout.contains(&db_str),
        "info output didn't reference the database\nstdout={stdout}",
    );
}

#[test]
fn global_db_flag_supports_metadata_subcommands() {
    let tmp = TempDir::new().expect("tempdir");
    let db = tmp.path().join("meta.ogdb");
    let db_str = db.display().to_string();

    must_succeed(&run_ogdb(&["--db", &db_str, "init"]), "init via --db");

    for sub in ["checkpoint", "schema", "stats", "metrics"] {
        let out = run_ogdb(&["--db", &db_str, sub]);
        must_succeed(&out, &format!("ogdb --db <path> {sub}"));
    }
}

#[test]
fn global_db_flag_supports_create_node() {
    let tmp = TempDir::new().expect("tempdir");
    let db = tmp.path().join("create.ogdb");
    let db_str = db.display().to_string();

    must_succeed(&run_ogdb(&["--db", &db_str, "init"]), "init via --db");

    let out = run_ogdb(&["--db", &db_str, "create-node", "--labels", "Person"]);
    must_succeed(&out, "ogdb --db <path> create-node --labels Person");
}

#[test]
fn missing_db_path_fails_with_clear_error() {
    let out = run_ogdb(&["info"]);
    assert!(
        !out.status.success(),
        "expected `ogdb info` to fail without a path"
    );
    assert_eq!(
        out.status.code(),
        Some(2),
        "expected usage error rc=2, got {:?}\nstderr={}",
        out.status.code(),
        String::from_utf8_lossy(&out.stderr),
    );

    let stderr = String::from_utf8_lossy(&out.stderr);
    let combined = format!("{}{}", String::from_utf8_lossy(&out.stdout), stderr,);
    assert!(
        combined.contains("<path>") && combined.contains("--db"),
        "diagnostic should mention both <path> and --db; got: {combined}",
    );
}
