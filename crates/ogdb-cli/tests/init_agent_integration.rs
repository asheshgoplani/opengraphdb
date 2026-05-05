//! End-to-end integration test for `ogdb init --agent`.
//!
//! Coverage gap (BLOCKER 1, `documentation/.research/coverage-audit-2026-05-05.md`):
//! `crates/ogdb-cli/src/init_agent.rs::run` was uncalled by any test — only the
//! private `upsert_json_mcp_server` and `write_marked_file` helpers were unit-
//! tested in `init_agent.rs::tests`. This file exercises the public CLI surface
//! (`ogdb init --agent --agent-id <id> --no-server`) for the four most-impactful
//! scenarios: claude path, cursor path, no-agent-detected fallback help, and
//! pre-existing-demo-db preservation.
//!
//! Hermetic env: `HOME` is pointed at a fresh tempdir and `PATH` is reduced to
//! an empty directory so `claude_cli_available()` (and friends) deterministically
//! return false, forcing the JSON-fallback registration path. `--no-server` is
//! always passed so the test does not race the user's own port 8765.

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use tempfile::TempDir;

/// Run `ogdb init --agent <args>` with `HOME=<home>` and a `PATH` that contains
/// no agent CLIs (so the JSON-config fallback is exercised, not `claude mcp add`
/// or `goose extension add`). `current_dir` is also set to a sibling temp dir so
/// `detect_cursor`'s `Path::new(".cursor").exists()` check sees nothing.
fn run_init_agent(home: &Path, args: &[&str]) -> Output {
    let empty_path = home.join("__nopath__");
    fs::create_dir_all(&empty_path).expect("create empty PATH dir");
    let cwd = home.join("__cwd__");
    fs::create_dir_all(&cwd).expect("create cwd dir");

    let mut cmd = Command::new(env!("CARGO_BIN_EXE_ogdb"));
    cmd.env_clear()
        .env("HOME", home)
        .env("PATH", &empty_path)
        .current_dir(&cwd)
        .arg("init")
        .arg("--agent")
        .args(args);
    cmd.output().expect("spawn ogdb init --agent")
}

fn must_succeed(out: &Output, label: &str) {
    assert!(
        out.status.success(),
        "{label} failed: status={:?}\nstdout={}\nstderr={}",
        out.status,
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}

fn read_json(path: &Path) -> Value {
    let raw = fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("read {} failed: {e}", path.display()));
    serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("parse {} as json failed: {e}\nraw:\n{raw}", path.display()))
}

/// Case (a): `--agent-id claude` writes an MCP server entry into `~/.claude.json`
/// containing the `ogdb mcp --stdio <db>` invocation. Verifies (1) the JSON file
/// is created at the expected path, (2) the `command` is `ogdb`, and (3) the
/// trailing arg is the database path we passed.
#[test]
fn init_agent_claude_writes_mcp_config_to_dot_claude_json() {
    let tmp = TempDir::new().expect("tempdir");
    let home = tmp.path();
    let db = home.join(".opengraphdb").join("demo.ogdb");

    let out = run_init_agent(
        home,
        &[
            "--agent-id",
            "claude",
            "--no-server",
            &db.display().to_string(),
        ],
    );
    must_succeed(&out, "ogdb init --agent --agent-id claude");

    let cfg = home.join(".claude.json");
    assert!(
        cfg.exists(),
        "expected ~/.claude.json to be created at {}",
        cfg.display()
    );

    let v = read_json(&cfg);
    let server = &v["mcpServers"]["opengraphdb"];
    assert!(
        server.is_object(),
        "mcpServers.opengraphdb must be a JSON object, got: {server}"
    );
    assert_eq!(
        server["command"], "ogdb",
        "expected ogdb command in mcp config, got: {server}"
    );
    let args = server["args"]
        .as_array()
        .unwrap_or_else(|| panic!("args must be an array; got {server}"));
    assert_eq!(args[0], "mcp", "first arg must be 'mcp'");
    assert_eq!(args[1], "--stdio", "second arg must be '--stdio'");
    assert_eq!(
        args[2],
        Value::String(db.to_string_lossy().into_owned()),
        "third arg must be the db path we passed"
    );

    // Skill bundle should also have been dropped under ~/.claude/skills/opengraphdb/.
    let skill_dir = home.join(".claude").join("skills").join("opengraphdb");
    assert!(
        skill_dir.exists(),
        "expected skill bundle at {}",
        skill_dir.display()
    );
    let skill_md = skill_dir.join("SKILL.md");
    assert!(
        skill_md.exists(),
        "expected SKILL.md at {}",
        skill_md.display()
    );
}

/// Case (b): `--agent-id cursor` writes to `~/.cursor/mcp.json` and drops a
/// global rules file at `~/.cursor/rules/opengraphdb.md`.
#[test]
fn init_agent_cursor_writes_mcp_config_to_dot_cursor_dir() {
    let tmp = TempDir::new().expect("tempdir");
    let home = tmp.path();
    let db = home.join("cursor.ogdb");

    let out = run_init_agent(
        home,
        &[
            "--agent-id",
            "cursor",
            "--no-server",
            &db.display().to_string(),
        ],
    );
    must_succeed(&out, "ogdb init --agent --agent-id cursor");

    let cfg = home.join(".cursor").join("mcp.json");
    assert!(
        cfg.exists(),
        "expected ~/.cursor/mcp.json at {}",
        cfg.display()
    );

    let v = read_json(&cfg);
    let server = &v["mcpServers"]["opengraphdb"];
    assert_eq!(server["command"], "ogdb");
    let args = server["args"]
        .as_array()
        .expect("cursor mcp config args is an array");
    assert_eq!(args[0], "mcp");
    assert_eq!(args[1], "--stdio");
    assert_eq!(
        args[2],
        Value::String(db.to_string_lossy().into_owned()),
        "cursor mcp config db path mismatch"
    );

    let rules = home.join(".cursor").join("rules").join("opengraphdb.md");
    assert!(
        rules.exists(),
        "expected cursor rules drop at {}",
        rules.display()
    );
}

/// Case (c): autodetect with no agents present must NOT crash; it must print
/// the no-agent help block and mention each supported agent so the user knows
/// what to install. The current `no_agent_help` lists 5 of the 6 agent backends
/// (Codex is not yet listed in the help block — see follow-up); this assertion
/// pins the regression contract for the 5 that ARE listed today and would catch
/// any silent removal.
#[test]
fn init_agent_autodetect_no_agents_emits_help_listing_supported_agents() {
    let tmp = TempDir::new().expect("tempdir");
    let home = tmp.path();

    // Empty home, empty PATH, empty cwd → no agent should be detected.
    let out = run_init_agent(home, &["--no-server"]);
    must_succeed(&out, "ogdb init --agent (no agents)");
    let stdout = String::from_utf8_lossy(&out.stdout);

    // Sanity: the help block must announce the no-agent state, not silently
    // proceed (e.g. with an empty "Configured agents:" section).
    assert!(
        stdout.contains("No coding agent detected"),
        "expected no-agent help banner, got:\n{stdout}"
    );

    // Each of the 5 currently-listed agents must appear by display name. If a
    // future change strips one of these, this assertion fires.
    for label in ["Claude Code", "Cursor", "Continue.dev", "Aider", "Goose"] {
        assert!(
            stdout.contains(label),
            "no-agent help should mention {label}: full output:\n{stdout}"
        );
    }

    // No partial config files should have been written for absent agents.
    assert!(
        !home.join(".claude.json").exists(),
        "should not write ~/.claude.json when no agent detected"
    );
    assert!(
        !home.join(".cursor").join("mcp.json").exists(),
        "should not write ~/.cursor/mcp.json when no agent detected"
    );
}

/// Case (d): a pre-existing `~/.opengraphdb/demo.ogdb` must NOT be overwritten
/// or otherwise corrupted by `ogdb init --agent --agent-id claude`. We seed the
/// db file with bytes from a real `ogdb init <db>` invocation (so it parses as
/// a valid OpenGraphDB file), capture the byte contents, run `init --agent`,
/// and re-read. Bytes must match exactly: `ensure_demo_db` is documented to
/// short-circuit when the file already exists.
#[test]
fn init_agent_does_not_corrupt_pre_existing_demo_db() {
    let tmp = TempDir::new().expect("tempdir");
    let home = tmp.path();
    let opengraphdb_dir = home.join(".opengraphdb");
    fs::create_dir_all(&opengraphdb_dir).expect("create .opengraphdb dir");
    let db = opengraphdb_dir.join("demo.ogdb");

    // Seed the pre-existing db using the real `ogdb init <db>` so the file
    // parses as an actual OpenGraphDB v1 database. Without this, a regression
    // that *opens* and *rewrites* the db (instead of short-circuiting on
    // existence) might be silently harmless on a sentinel file but destructive
    // on a real db.
    let seed_status = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args(["init"])
        .arg(&db)
        .status()
        .expect("ogdb init <db> to seed the test fixture");
    assert!(
        seed_status.success(),
        "ogdb init <seed-db> exited non-zero: {seed_status:?}"
    );
    assert!(db.exists(), "seed db not created at {}", db.display());

    let before_bytes = fs::read(&db).expect("read seed db");
    let before_len = before_bytes.len();
    assert!(before_len > 0, "seed db is empty — ogdb init wrote nothing");

    // Now run init --agent. The demo db should be preserved verbatim.
    let out = run_init_agent(home, &["--agent-id", "claude", "--no-server"]);
    must_succeed(&out, "ogdb init --agent --agent-id claude (with pre-existing db)");

    let after_bytes = fs::read(&db).expect("re-read demo db");
    assert_eq!(
        after_bytes.len(),
        before_len,
        "demo.ogdb byte-length changed after `ogdb init --agent` ({} → {})",
        before_len,
        after_bytes.len(),
    );
    assert_eq!(
        after_bytes, before_bytes,
        "demo.ogdb bytes were modified by `ogdb init --agent`; \
         ensure_demo_db must short-circuit when the file already exists"
    );

    // Sidecars (`.wal`, `.meta.json`, etc.) created by the seed `ogdb init`
    // must also still parse — the simplest proxy is: the db is still openable.
    // We verify by running `ogdb info <db>` and expecting a zero exit.
    let info = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args(["info"])
        .arg(&db)
        .output()
        .expect("ogdb info <db>");
    assert!(
        info.status.success(),
        "ogdb info on the post-init-agent db failed (db corrupted?): \
         status={:?}\nstdout={}\nstderr={}",
        info.status,
        String::from_utf8_lossy(&info.stdout),
        String::from_utf8_lossy(&info.stderr)
    );

    // And the MCP config must still have been written, proving init --agent
    // ran to completion without short-circuiting on the pre-existing-db check.
    let cfg = home.join(".claude.json");
    assert!(
        cfg.exists(),
        "init --agent must still write ~/.claude.json even when demo db pre-exists"
    );
    let v: Value = read_json(&cfg);
    assert_eq!(v["mcpServers"]["opengraphdb"]["command"], "ogdb");
}

/// Bonus case: `--dry-run` must not write any agent config files. Catches a
/// regression where a code path bypasses the dry-run gate (e.g. by writing
/// before checking `opts.dry_run`).
#[test]
fn init_agent_dry_run_writes_no_files() {
    let tmp = TempDir::new().expect("tempdir");
    let home = tmp.path();

    let out = run_init_agent(
        home,
        &["--agent-id", "claude", "--no-server", "--dry-run"],
    );
    must_succeed(&out, "ogdb init --agent --dry-run");

    assert!(
        !home.join(".claude.json").exists(),
        "--dry-run must not create ~/.claude.json"
    );
    assert!(
        !home.join(".claude").join("skills").exists(),
        "--dry-run must not create ~/.claude/skills/"
    );
}

// ---------------------------------------------------------------------------
// Compile-time fence: keep this test file pinned to the public CLI surface so
// a future module reorg can't silently delete its coverage.
// ---------------------------------------------------------------------------

#[allow(dead_code)]
fn _binary_under_test() -> &'static str {
    env!("CARGO_BIN_EXE_ogdb")
}

#[allow(dead_code)]
fn _path_buf_compiler_check() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_ogdb"))
}
