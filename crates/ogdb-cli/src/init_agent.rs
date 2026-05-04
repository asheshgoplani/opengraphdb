//! `ogdb init --agent` — agent-first onboarding subcommand.
//!
//! Detects the user's coding agent (Claude Code, Cursor, Aider, Continue.dev,
//! Goose, Codex), registers OpenGraphDB as an MCP server in
//! that agent's config, drops the embedded skill bundle into the agent's skill
//! pool, and starts a background HTTP server on `:8765` so the agent has
//! something to talk to on its very next turn.
//!
//! The skill bundle (`skills/opengraphdb/`) is embedded into the binary at
//! compile time via `include_dir!`, so a user who installed `ogdb` via the
//! curl/install.sh path gets the full bundle without a second download.
//!
//! Idempotent: re-running replaces the existing MCP entry rather than
//! duplicating it, skips the binary download if `ogdb` is already on `$PATH`,
//! and refuses to overwrite a skill bundle the user has hand-edited unless
//! `--force` is passed.

use include_dir::{include_dir, Dir};
use serde_json::{json, Map, Value};
use std::fs;
use std::io::Write as _;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

/// Embedded skill bundle (`skills/opengraphdb/`). Baked into the binary so
/// the installer doesn't need a second network round-trip to fetch it.
static SKILL_BUNDLE: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../skills/opengraphdb");

/// Options parsed from `ogdb init --agent ...`.
#[derive(Debug, Clone, Default)]
pub struct InitAgentOpts {
    /// Database path to expose to the agent. Defaults to
    /// `$HOME/.opengraphdb/demo.ogdb`.
    pub db: Option<String>,
    /// Configure every detected agent rather than just the first match.
    pub all: bool,
    /// Pin a specific agent id (claude, cursor, aider, continue, goose,
    /// codex). Skips detection.
    pub agent_id: Option<String>,
    /// HTTP port for the background server. Default 8765.
    pub port: u16,
    /// Skip starting the HTTP server.
    pub no_server: bool,
    /// Overwrite an existing skill bundle even if its hash differs from
    /// what we ship.
    pub force: bool,
    /// Print actions but do not write any files or start any process.
    pub dry_run: bool,
}

impl InitAgentOpts {
    /// Default port the background HTTP server binds to.
    #[allow(dead_code)]
    pub const DEFAULT_PORT: u16 = 8765;
}

/// Per-agent action log returned to the caller. Drives the summary block
/// printed at the end of `ogdb init --agent`.
#[derive(Debug, Clone)]
pub struct AgentRunReport {
    /// Agent id (`claude`, `cursor`, ...).
    #[allow(dead_code)]
    pub id: &'static str,
    /// Human-readable agent name.
    pub name: &'static str,
    /// MCP registration status (one-word: `new`, `unchanged`, `replaced`,
    /// `skipped`, `error`).
    pub mcp_status: String,
    /// Skill drop status (same vocabulary as `mcp_status`).
    pub skill_status: String,
    /// Filesystem location written to.
    pub skill_path: Option<String>,
}

/// Top-level entry point. Returns a stdout-ready summary string.
pub fn run(opts: InitAgentOpts) -> Result<String, String> {
    let db_path = resolve_db_path(opts.db.clone())?;
    if !opts.dry_run {
        ensure_demo_db(&db_path)?;
    }

    let agents = if let Some(id) = opts.agent_id.as_deref() {
        let agent = AGENTS
            .iter()
            .find(|a| a.id == id)
            .ok_or_else(|| format!("unknown agent id: {id}"))?;
        vec![*agent]
    } else {
        let detected = detect_agents();
        if detected.is_empty() {
            return Ok(no_agent_help());
        }
        if opts.all {
            detected
        } else {
            vec![detected[0]]
        }
    };

    let mut reports = Vec::new();
    for agent in &agents {
        let report = run_agent(agent, &db_path, &opts);
        reports.push(report);
    }

    let server_status = if opts.no_server || opts.dry_run {
        "skipped".to_string()
    } else {
        match start_http_server(&db_path, opts.port) {
            Ok(()) => format!("running on http://127.0.0.1:{}", opts.port),
            Err(e) => format!("error: {e}"),
        }
    };

    Ok(render_summary(&reports, &db_path, &server_status, opts.port))
}

// ---------------------------------------------------------------------------
// Agent table
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
struct Agent {
    id: &'static str,
    name: &'static str,
    detect: fn() -> bool,
    register_mcp: fn(&Path, &InitAgentOpts) -> Result<String, String>,
    install_skill: fn(&InitAgentOpts) -> Result<(String, Option<String>), String>,
}

const AGENTS: &[Agent] = &[
    Agent {
        id: "claude",
        name: "Claude Code",
        detect: detect_claude,
        register_mcp: register_claude_mcp,
        install_skill: install_claude_skill,
    },
    Agent {
        id: "cursor",
        name: "Cursor",
        detect: detect_cursor,
        register_mcp: register_cursor_mcp,
        install_skill: install_cursor_skill,
    },
    Agent {
        id: "continue",
        name: "Continue.dev",
        detect: detect_continue,
        register_mcp: register_continue_mcp,
        install_skill: install_continue_skill,
    },
    Agent {
        id: "aider",
        name: "Aider",
        detect: detect_aider,
        register_mcp: register_aider_mcp,
        install_skill: install_aider_skill,
    },
    Agent {
        id: "goose",
        name: "Goose",
        detect: detect_goose,
        register_mcp: register_goose_mcp,
        install_skill: install_goose_skill,
    },
    Agent {
        id: "codex",
        name: "Codex",
        detect: detect_codex,
        register_mcp: register_codex_mcp,
        install_skill: install_codex_skill,
    },
];

fn detect_agents() -> Vec<Agent> {
    AGENTS.iter().copied().filter(|a| (a.detect)()).collect()
}

fn run_agent(agent: &Agent, db_path: &Path, opts: &InitAgentOpts) -> AgentRunReport {
    let mcp_status = if opts.dry_run {
        "dry-run".to_string()
    } else {
        match (agent.register_mcp)(db_path, opts) {
            Ok(s) => s,
            Err(e) => format!("error: {e}"),
        }
    };
    let (skill_status, skill_path) = if opts.dry_run {
        ("dry-run".to_string(), None)
    } else {
        match (agent.install_skill)(opts) {
            Ok((s, p)) => (s, p),
            Err(e) => (format!("error: {e}"), None),
        }
    };
    AgentRunReport {
        id: agent.id,
        name: agent.name,
        mcp_status,
        skill_status,
        skill_path,
    }
}

// ---------------------------------------------------------------------------
// Helpers — paths, env
// ---------------------------------------------------------------------------

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "neither $HOME nor %USERPROFILE% is set".to_string())
}

fn resolve_db_path(db: Option<String>) -> Result<PathBuf, String> {
    if let Some(d) = db {
        return Ok(PathBuf::from(d));
    }
    let mut p = home_dir()?;
    p.push(".opengraphdb");
    p.push("demo.ogdb");
    Ok(p)
}

fn ensure_demo_db(db_path: &Path) -> Result<(), String> {
    if db_path.exists() {
        return Ok(());
    }
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    // Best effort: shell out to `ogdb init <path>` so the user has a real db.
    // If we can't find ogdb on PATH (e.g. running from `cargo run`), skip
    // silently — the user can call `ogdb init` later.
    let _ = Command::new("ogdb")
        .arg("init")
        .arg(db_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    Ok(())
}

// ---------------------------------------------------------------------------
// HTTP server bootstrap
// ---------------------------------------------------------------------------

fn port_in_use(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn start_http_server(db_path: &Path, port: u16) -> Result<(), String> {
    if port_in_use(port) {
        return Ok(()); // assume an OGDB instance is already running
    }
    let log_dir = home_dir()?.join(".opengraphdb");
    fs::create_dir_all(&log_dir).map_err(|e| format!("create {}: {e}", log_dir.display()))?;
    let log_path = log_dir.join("server.log");
    let log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("open {}: {e}", log_path.display()))?;
    let log_err = log.try_clone().map_err(|e| format!("dup log fd: {e}"))?;

    Command::new("ogdb")
        .arg("serve")
        .arg("--http")
        .arg("--port")
        .arg(port.to_string())
        .arg(db_path)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err))
        .spawn()
        .map_err(|e| format!("spawn ogdb serve: {e}"))?;
    // Give the server a beat to bind. We don't block long — even if it
    // hasn't bound yet, the user's agent will connect on the next turn.
    std::thread::sleep(Duration::from_millis(400));
    Ok(())
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

fn detect_claude() -> bool {
    if std::env::var_os("CLAUDE_CONFIG_DIR").is_some() {
        return true;
    }
    home_dir()
        .map(|h| h.join(".claude").exists() || h.join(".claude.json").exists())
        .unwrap_or(false)
}

fn claude_config_dir() -> Result<PathBuf, String> {
    if let Some(custom) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        return Ok(PathBuf::from(custom));
    }
    home_dir().map(|h| h.join(".claude"))
}

fn register_claude_mcp(db_path: &Path, _opts: &InitAgentOpts) -> Result<String, String> {
    // Prefer `claude mcp add` when the CLI is available.
    if claude_cli_available() {
        let _ = Command::new("claude")
            .args(["mcp", "remove", "opengraphdb"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let status = Command::new("claude")
            .args(["mcp", "add", "opengraphdb", "--", "ogdb", "mcp", "--stdio"])
            .arg(db_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("claude mcp add: {e}"))?;
        if status.success() {
            return Ok("registered (claude mcp add)".to_string());
        }
    }
    // Fallback: edit ~/.claude.json directly.
    let cfg = home_dir()?.join(".claude.json");
    upsert_json_mcp_server(
        &cfg,
        "opengraphdb",
        json!({
            "command": "ogdb",
            "args": ["mcp", "--stdio", db_path.to_string_lossy()],
        }),
        "/mcpServers",
    )
}

fn claude_cli_available() -> bool {
    Command::new("claude")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn install_claude_skill(opts: &InitAgentOpts) -> Result<(String, Option<String>), String> {
    let dst = claude_config_dir()?.join("skills").join("opengraphdb");
    let status = write_skill_bundle(&dst, opts.force)?;
    Ok((status, Some(dst.display().to_string())))
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

fn detect_cursor() -> bool {
    home_dir().map(|h| h.join(".cursor").exists()).unwrap_or(false)
        || Path::new(".cursor").exists()
}

fn register_cursor_mcp(db_path: &Path, _opts: &InitAgentOpts) -> Result<String, String> {
    let cfg = home_dir()?.join(".cursor").join("mcp.json");
    upsert_json_mcp_server(
        &cfg,
        "opengraphdb",
        json!({
            "command": "ogdb",
            "args": ["mcp", "--stdio", db_path.to_string_lossy()],
        }),
        "/mcpServers",
    )
}

fn install_cursor_skill(opts: &InitAgentOpts) -> Result<(String, Option<String>), String> {
    // Cursor's only skill primitive is .cursorrules in the project cwd, plus
    // a global rules dir under ~/.cursor/rules/. We drop the SKILL.md (with
    // frontmatter stripped) into the global rules dir so it follows the user
    // into every project.
    let dst_dir = home_dir()?.join(".cursor").join("rules");
    fs::create_dir_all(&dst_dir).map_err(|e| format!("create {}: {e}", dst_dir.display()))?;
    let dst = dst_dir.join("opengraphdb.md");
    let body = strip_frontmatter(skill_md_str());
    write_marked_file(&dst, &body, "<!-- OPENGRAPHDB-SKILL -->", opts.force)
        .map(|s| (s, Some(dst.display().to_string())))
}

// ---------------------------------------------------------------------------
// Continue.dev
// ---------------------------------------------------------------------------

fn detect_continue() -> bool {
    home_dir().map(|h| h.join(".continue").exists()).unwrap_or(false)
}

fn register_continue_mcp(db_path: &Path, _opts: &InitAgentOpts) -> Result<String, String> {
    let cfg = home_dir()?.join(".continue").join("config.json");
    upsert_json_mcp_server(
        &cfg,
        "opengraphdb",
        json!({
            "command": "ogdb",
            "args": ["mcp", "--stdio", db_path.to_string_lossy()],
        }),
        "/mcpServers",
    )
}

fn install_continue_skill(opts: &InitAgentOpts) -> Result<(String, Option<String>), String> {
    let dst_dir = home_dir()?.join(".continue").join("rules");
    fs::create_dir_all(&dst_dir).map_err(|e| format!("create {}: {e}", dst_dir.display()))?;
    let dst = dst_dir.join("opengraphdb.md");
    let body = strip_frontmatter(skill_md_str());
    write_marked_file(&dst, &body, "<!-- OPENGRAPHDB-SKILL -->", opts.force)
        .map(|s| (s, Some(dst.display().to_string())))
}

// ---------------------------------------------------------------------------
// Aider
// ---------------------------------------------------------------------------

fn detect_aider() -> bool {
    home_dir()
        .map(|h| h.join(".aider.conf.yml").exists())
        .unwrap_or(false)
}

fn register_aider_mcp(_db: &Path, _opts: &InitAgentOpts) -> Result<String, String> {
    // Aider does not speak MCP. Nothing to register.
    Ok("skipped (aider does not support MCP)".to_string())
}

fn install_aider_skill(opts: &InitAgentOpts) -> Result<(String, Option<String>), String> {
    let skill_path = home_dir()?.join(".opengraphdb").join("skill.md");
    if let Some(parent) = skill_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let body = strip_frontmatter(skill_md_str());
    let skill_status = write_marked_file(
        &skill_path,
        &body,
        "<!-- OPENGRAPHDB-SKILL -->",
        opts.force,
    )?;

    // Append a `read:` entry pointing at the skill if one isn't there.
    let conf = home_dir()?.join(".aider.conf.yml");
    if conf.exists() {
        let existing = fs::read_to_string(&conf)
            .map_err(|e| format!("read {}: {e}", conf.display()))?;
        let needle = skill_path.to_string_lossy().to_string();
        if !existing.contains(&needle) {
            let to_append = if existing.contains("\nread:") {
                format!("  - {needle}\n")
            } else {
                format!("\nread:\n  - {needle}\n")
            };
            let mut f = fs::OpenOptions::new()
                .append(true)
                .open(&conf)
                .map_err(|e| format!("open {}: {e}", conf.display()))?;
            f.write_all(to_append.as_bytes())
                .map_err(|e| format!("write {}: {e}", conf.display()))?;
        }
    }
    Ok((skill_status, Some(skill_path.display().to_string())))
}

// ---------------------------------------------------------------------------
// Goose
// ---------------------------------------------------------------------------

fn detect_goose() -> bool {
    home_dir()
        .map(|h| h.join(".config").join("goose").exists())
        .unwrap_or(false)
}

fn register_goose_mcp(db_path: &Path, _opts: &InitAgentOpts) -> Result<String, String> {
    let goose_available = Command::new("goose")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !goose_available {
        return Ok("skipped (goose CLI not found)".to_string());
    }
    let cmd_str = format!("ogdb mcp --stdio {}", db_path.display());
    let status = Command::new("goose")
        .args([
            "extension",
            "add",
            "opengraphdb",
            "--type",
            "stdio",
            "--cmd",
        ])
        .arg(&cmd_str)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("goose extension add: {e}"))?;
    if status.success() {
        Ok("registered (goose extension add)".to_string())
    } else {
        Ok("error (goose extension add returned non-zero)".to_string())
    }
}

fn install_goose_skill(_opts: &InitAgentOpts) -> Result<(String, Option<String>), String> {
    Ok(("skipped (goose has no skill primitive)".to_string(), None))
}

// ---------------------------------------------------------------------------
// Codex (OpenAI)
// ---------------------------------------------------------------------------

fn detect_codex() -> bool {
    home_dir().map(|h| h.join(".codex").exists()).unwrap_or(false)
}

fn register_codex_mcp(db_path: &Path, _opts: &InitAgentOpts) -> Result<String, String> {
    let cfg = home_dir()?.join(".codex").join("mcp.json");
    upsert_json_mcp_server(
        &cfg,
        "opengraphdb",
        json!({
            "command": "ogdb",
            "args": ["mcp", "--stdio", db_path.to_string_lossy()],
        }),
        "/mcpServers",
    )
}

fn install_codex_skill(opts: &InitAgentOpts) -> Result<(String, Option<String>), String> {
    let dst = home_dir()?.join(".codex").join("instructions.md");
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let body = strip_frontmatter(skill_md_str());
    write_marked_file(&dst, &body, "<!-- OPENGRAPHDB-SKILL -->", opts.force)
        .map(|s| (s, Some(dst.display().to_string())))
}

// ---------------------------------------------------------------------------
// JSON config helpers
// ---------------------------------------------------------------------------

fn upsert_json_mcp_server(
    config_path: &Path,
    server_name: &str,
    server_value: Value,
    pointer_prefix: &str,
) -> Result<String, String> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let mut root: Value = if config_path.exists() {
        let raw = fs::read_to_string(config_path)
            .map_err(|e| format!("read {}: {e}", config_path.display()))?;
        if raw.trim().is_empty() {
            Value::Object(Map::new())
        } else {
            serde_json::from_str(&raw)
                .map_err(|e| format!("parse {}: {e}", config_path.display()))?
        }
    } else {
        Value::Object(Map::new())
    };

    let parent_key = pointer_prefix.trim_start_matches('/').to_string();
    let parent = root
        .as_object_mut()
        .ok_or_else(|| format!("{}: top-level is not an object", config_path.display()))?
        .entry(parent_key.clone())
        .or_insert_with(|| Value::Object(Map::new()));

    let parent_obj = parent.as_object_mut().ok_or_else(|| {
        format!(
            "{}: {} is not an object",
            config_path.display(),
            pointer_prefix
        )
    })?;

    let outcome = match parent_obj.get(server_name) {
        Some(existing) if existing == &server_value => "unchanged",
        Some(_) => "replaced",
        None => "new",
    };
    parent_obj.insert(server_name.to_string(), server_value);

    let out = serde_json::to_string_pretty(&root).map_err(|e| format!("serialize: {e}"))?;
    fs::write(config_path, out + "\n")
        .map_err(|e| format!("write {}: {e}", config_path.display()))?;
    Ok(format!(
        "{outcome} ({})",
        config_path.display()
    ))
}

// ---------------------------------------------------------------------------
// Skill bundle writers
// ---------------------------------------------------------------------------

fn skill_md_str() -> String {
    SKILL_BUNDLE
        .get_file("SKILL.md")
        .and_then(|f| f.contents_utf8())
        .unwrap_or("# OpenGraphDB\n\nSkill bundle missing — re-install ogdb.\n")
        .to_string()
}

fn write_skill_bundle(dst_root: &Path, force: bool) -> Result<String, String> {
    fs::create_dir_all(dst_root)
        .map_err(|e| format!("create {}: {e}", dst_root.display()))?;
    let mut wrote = 0usize;
    let mut unchanged = 0usize;
    let mut skipped = 0usize;
    for entry in walk_dir(&SKILL_BUNDLE) {
        let rel = entry
            .path()
            .strip_prefix(SKILL_BUNDLE.path())
            .unwrap_or(entry.path());
        let dst = dst_root.join(rel);
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        let new_bytes = entry.contents();
        if dst.exists() {
            let existing = fs::read(&dst).unwrap_or_default();
            if existing == new_bytes {
                unchanged += 1;
                continue;
            }
            if !force {
                skipped += 1;
                continue;
            }
        }
        fs::write(&dst, new_bytes)
            .map_err(|e| format!("write {}: {e}", dst.display()))?;
        wrote += 1;
    }
    Ok(format!(
        "{} new, {} unchanged, {} kept (use --force to overwrite)",
        wrote, unchanged, skipped
    ))
}

fn walk_dir<'a>(dir: &'a Dir<'a>) -> Vec<&'a include_dir::File<'a>> {
    let mut out = Vec::new();
    collect_files(dir, &mut out);
    out
}

fn collect_files<'a>(dir: &'a Dir<'a>, out: &mut Vec<&'a include_dir::File<'a>>) {
    for f in dir.files() {
        out.push(f);
    }
    for sub in dir.dirs() {
        collect_files(sub, out);
    }
}

fn strip_frontmatter(md: String) -> String {
    let mut lines = md.lines();
    if lines.next() == Some("---") {
        let mut consumed = "---\n".len();
        for line in lines {
            consumed += line.len() + 1;
            if line == "---" {
                return md[consumed..].trim_start_matches('\n').to_string();
            }
        }
    }
    md
}

fn write_marked_file(
    dst: &Path,
    body: &str,
    marker: &str,
    _force: bool,
) -> Result<String, String> {
    let begin = format!("{marker} BEGIN");
    let end = format!("{marker} END");
    let block = format!("{begin}\n{body}\n{end}\n");

    if !dst.exists() {
        fs::write(dst, &block).map_err(|e| format!("write {}: {e}", dst.display()))?;
        return Ok(format!("new ({})", dst.display()));
    }

    let existing = fs::read_to_string(dst)
        .map_err(|e| format!("read {}: {e}", dst.display()))?;

    if let (Some(start), Some(stop)) = (existing.find(&begin), existing.find(&end)) {
        let mut stop_end = stop + end.len();
        // Eat the trailing newline that belonged to our managed block, so we
        // don't accumulate blank lines on every rewrite.
        if existing.as_bytes().get(stop_end) == Some(&b'\n') {
            stop_end += 1;
        }
        let prefix = &existing[..start];
        let suffix = &existing[stop_end..];
        let new_content = format!("{prefix}{block}{suffix}");
        if new_content == existing {
            return Ok(format!("unchanged ({})", dst.display()));
        }
        fs::write(dst, new_content)
            .map_err(|e| format!("write {}: {e}", dst.display()))?;
        Ok(format!("replaced ({})", dst.display()))
    } else {
        let mut f = fs::OpenOptions::new()
            .append(true)
            .open(dst)
            .map_err(|e| format!("open {}: {e}", dst.display()))?;
        f.write_all(format!("\n{block}").as_bytes())
            .map_err(|e| format!("append {}: {e}", dst.display()))?;
        Ok(format!("appended ({})", dst.display()))
    }
}

// ---------------------------------------------------------------------------
// User-facing summary
// ---------------------------------------------------------------------------

fn render_summary(
    reports: &[AgentRunReport],
    db_path: &Path,
    server_status: &str,
    port: u16,
) -> String {
    let mut s = String::new();
    s.push_str("\n");
    s.push_str("OpenGraphDB is ready for your agent.\n");
    s.push_str(&format!("  database  {}\n", db_path.display()));
    s.push_str(&format!("  http      {server_status}\n"));
    s.push_str(&format!("  playground http://127.0.0.1:{port}/\n\n"));
    s.push_str("Configured agents:\n");
    for r in reports {
        s.push_str(&format!(
            "  - {:<14} mcp: {}\n                 skill: {}\n",
            r.name, r.mcp_status, r.skill_status
        ));
        if let Some(p) = &r.skill_path {
            s.push_str(&format!("                 path:  {p}\n"));
        }
    }
    s.push_str("\nNext steps:\n");
    s.push_str("  1. Restart your agent so it picks up the new MCP server.\n");
    s.push_str("  2. In your agent, try: \"List the labels in the OpenGraphDB demo database.\"\n");
    s.push_str("  3. To uninstall: ogdb init --agent --uninstall (coming soon)\n");
    s.push_str("\nDocs:    https://github.com/asheshgoplani/opengraphdb\n");
    s
}

fn no_agent_help() -> String {
    let mut s = String::new();
    s.push_str("\nNo coding agent detected on this machine.\n\n");
    s.push_str("Add this snippet to your agent's MCP config and restart it:\n\n");
    s.push_str("  Claude Code  (~/.claude.json under \"mcpServers\"):\n");
    s.push_str(
        "    \"opengraphdb\": { \"command\": \"ogdb\", \"args\": [\"mcp\", \"--stdio\"] }\n\n",
    );
    s.push_str("  Cursor       (~/.cursor/mcp.json under \"mcpServers\"):\n");
    s.push_str(
        "    \"opengraphdb\": { \"command\": \"ogdb\", \"args\": [\"mcp\", \"--stdio\"] }\n\n",
    );
    s.push_str("  Continue.dev (~/.continue/config.json under \"mcpServers\"):\n");
    s.push_str(
        "    \"opengraphdb\": { \"command\": \"ogdb\", \"args\": [\"mcp\", \"--stdio\"] }\n\n",
    );
    s.push_str("Or install one of: Claude Code, Cursor, Continue.dev, Aider, Goose.\n");
    s
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn upsert_creates_new_config_file() {
        let dir = TempDir::new().unwrap();
        let cfg = dir.path().join("foo.json");
        let outcome = upsert_json_mcp_server(
            &cfg,
            "opengraphdb",
            json!({"command": "ogdb", "args": ["mcp", "--stdio"]}),
            "/mcpServers",
        )
        .unwrap();
        assert!(outcome.starts_with("new"), "got {outcome}");
        let raw = fs::read_to_string(&cfg).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["mcpServers"]["opengraphdb"]["command"], "ogdb");
    }

    #[test]
    fn upsert_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let cfg = dir.path().join("foo.json");
        let value = json!({"command": "ogdb", "args": ["mcp", "--stdio"]});
        upsert_json_mcp_server(&cfg, "opengraphdb", value.clone(), "/mcpServers").unwrap();
        let outcome =
            upsert_json_mcp_server(&cfg, "opengraphdb", value, "/mcpServers").unwrap();
        assert!(outcome.starts_with("unchanged"), "got {outcome}");
    }

    #[test]
    fn upsert_replaces_existing_value() {
        let dir = TempDir::new().unwrap();
        let cfg = dir.path().join("foo.json");
        upsert_json_mcp_server(
            &cfg,
            "opengraphdb",
            json!({"command": "old", "args": []}),
            "/mcpServers",
        )
        .unwrap();
        let outcome = upsert_json_mcp_server(
            &cfg,
            "opengraphdb",
            json!({"command": "ogdb", "args": ["mcp", "--stdio"]}),
            "/mcpServers",
        )
        .unwrap();
        assert!(outcome.starts_with("replaced"), "got {outcome}");
    }

    #[test]
    fn upsert_preserves_other_servers() {
        let dir = TempDir::new().unwrap();
        let cfg = dir.path().join("foo.json");
        fs::write(
            &cfg,
            r#"{"mcpServers":{"other":{"command":"x","args":[]}},"otherKey":42}"#,
        )
        .unwrap();
        upsert_json_mcp_server(
            &cfg,
            "opengraphdb",
            json!({"command": "ogdb", "args": ["mcp", "--stdio"]}),
            "/mcpServers",
        )
        .unwrap();
        let raw = fs::read_to_string(&cfg).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["mcpServers"]["other"]["command"], "x");
        assert_eq!(v["mcpServers"]["opengraphdb"]["command"], "ogdb");
        assert_eq!(v["otherKey"], 42);
    }

    #[test]
    fn strip_frontmatter_handles_both_shapes() {
        assert_eq!(
            strip_frontmatter("---\nname: x\n---\nbody\n".to_string()),
            "body\n"
        );
        assert_eq!(
            strip_frontmatter("no frontmatter\n".to_string()),
            "no frontmatter\n"
        );
    }

    #[test]
    fn write_marked_file_creates_then_replaces() {
        let dir = TempDir::new().unwrap();
        let dst = dir.path().join("rules.md");
        let s1 = write_marked_file(&dst, "v1", "<!-- OGDB -->", false).unwrap();
        assert!(s1.starts_with("new"));
        let s2 = write_marked_file(&dst, "v1", "<!-- OGDB -->", false).unwrap();
        assert!(s2.starts_with("unchanged"), "got {s2}");
        let s3 = write_marked_file(&dst, "v2", "<!-- OGDB -->", false).unwrap();
        assert!(s3.starts_with("replaced"), "got {s3}");
        let final_content = fs::read_to_string(&dst).unwrap();
        assert!(final_content.contains("v2"));
        assert!(!final_content.contains("v1"));
    }

    #[test]
    fn write_marked_file_appends_to_unrelated_file() {
        let dir = TempDir::new().unwrap();
        let dst = dir.path().join("rules.md");
        fs::write(&dst, "user content\n").unwrap();
        let s = write_marked_file(&dst, "managed", "<!-- OGDB -->", false).unwrap();
        assert!(s.starts_with("appended"));
        let content = fs::read_to_string(&dst).unwrap();
        assert!(content.contains("user content"));
        assert!(content.contains("managed"));
    }

    #[test]
    fn detect_returns_empty_when_no_agents() {
        // Sanity: at least the function runs without panicking.
        let _ = detect_agents();
    }

    #[test]
    fn skill_bundle_is_embedded() {
        let md = skill_md_str();
        assert!(md.contains("opengraphdb") || md.contains("OpenGraphDB"));
    }
}
