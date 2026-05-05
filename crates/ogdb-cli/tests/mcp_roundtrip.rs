//! Stdio MCP roundtrip test: spawns `ogdb mcp <db> --stdio` as a subprocess
//! and drives the JSON-RPC handshake an AI-agent client (Claude Code, Cursor,
//! Aider, Continue, Goose, Codex) actually performs.
//!
//! Closes the HIGH MCP-roundtrip finding from
//! `documentation/.research/coverage-audit-2026-05-05.md`: the six
//! `init_agent` agent-id branches were unit-tested only at the upsert-helper
//! level; nothing asserted that the MCP server an agent connects to actually
//! responds correctly end-to-end. This test runs the real `ogdb` binary,
//! sends real JSON-RPC frames over stdio, and asserts:
//!
//!   1. The `initialize` handshake returns a valid JSON-RPC envelope with
//!      `protocolVersion` + `serverInfo` (the shape every MCP client expects).
//!   2. `tools/list` returns the canonical 20-tool catalog including the five
//!      AI-first canonical names — silent drops break agent tool palettes.
//!   3. `tools/call` for `execute_cypher` against the live query engine
//!      returns a real result row (not a mock), proving the stdio transport
//!      reaches all the way through to the database.

use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};

fn init_db(dir: &Path) -> PathBuf {
    let db = dir.join("mcp-roundtrip.ogdb");
    let status = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args(["init", &db.display().to_string()])
        .status()
        .expect("spawn ogdb init");
    assert!(status.success(), "ogdb init failed: {status:?}");
    db
}

fn spawn_stdio_server(db: &Path, max_requests: u64) -> Child {
    Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args([
            "mcp",
            &db.display().to_string(),
            "--stdio",
            "--max-requests",
            &max_requests.to_string(),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn ogdb mcp --stdio")
}

fn send(stdin: &mut ChildStdin, line: &str) {
    stdin.write_all(line.as_bytes()).expect("write request");
    stdin.write_all(b"\n").expect("write request newline");
    stdin.flush().expect("flush request");
}

fn read_json_line(reader: &mut impl BufRead) -> Value {
    let mut line = String::new();
    let n = reader.read_line(&mut line).expect("read mcp stdio response");
    assert!(n > 0, "mcp stdio EOF before response");
    serde_json::from_str(line.trim()).unwrap_or_else(|e| {
        panic!(
            "mcp stdio response is not valid JSON: {e}; raw=`{}`",
            line.trim()
        )
    })
}

#[test]
fn mcp_stdio_initialize_handshake_and_tools_list_full_catalog() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db = init_db(dir.path());

    let mut child = spawn_stdio_server(&db, 2);
    let mut stdin = child.stdin.take().expect("child stdin piped");
    let stdout = child.stdout.take().expect("child stdout piped");
    let mut reader = BufReader::new(stdout);

    // 1) initialize — every MCP client sends this first.
    send(
        &mut stdin,
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
    );
    let init = read_json_line(&mut reader);
    assert_eq!(
        init.get("jsonrpc").and_then(Value::as_str),
        Some("2.0"),
        "initialize response missing jsonrpc=2.0: {init}"
    );
    assert_eq!(
        init.get("id"),
        Some(&Value::from(1)),
        "init id mismatch: {init}"
    );
    let result = init
        .get("result")
        .unwrap_or_else(|| panic!("init missing result: {init}"));
    assert!(
        result.get("protocolVersion").and_then(Value::as_str).is_some(),
        "init result missing protocolVersion: {result}"
    );
    let server_info = result
        .get("serverInfo")
        .unwrap_or_else(|| panic!("init missing serverInfo: {result}"));
    assert!(
        server_info.get("name").and_then(Value::as_str).is_some(),
        "init.serverInfo missing name: {server_info}"
    );
    assert!(
        server_info.get("version").and_then(Value::as_str).is_some(),
        "init.serverInfo missing version: {server_info}"
    );

    // 2) tools/list — agents discover the canonical 20-tool catalog here.
    send(
        &mut stdin,
        r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
    );
    let tools_response = read_json_line(&mut reader);
    let tools = tools_response
        .pointer("/result/tools")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("tools/list missing result.tools: {tools_response}"));
    assert_eq!(
        tools.len(),
        20,
        "expected 20 tools in MCP catalog (per crates/ogdb-cli/src/lib.rs tools/list arm); got {} — agents that depend on a stable surface will silently lose tools otherwise",
        tools.len(),
    );
    let names: Vec<&str> = tools
        .iter()
        .filter_map(|t| t.get("name").and_then(Value::as_str))
        .collect();
    for required in [
        "browse_schema",
        "execute_cypher",
        "get_node_neighborhood",
        "search_nodes",
        "list_datasets",
    ] {
        assert!(
            names.contains(&required),
            "missing canonical MCP tool `{required}` — got {names:?}"
        );
    }

    drop(stdin);
    let status = child.wait().expect("wait for ogdb mcp");
    assert!(status.success(), "ogdb mcp exited non-zero: {status:?}");
}

#[test]
fn mcp_stdio_tools_call_execute_cypher_returns_real_query_result() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db = init_db(dir.path());

    // initialize + tools/call = 2 requests.
    let mut child = spawn_stdio_server(&db, 2);
    let mut stdin = child.stdin.take().expect("child stdin piped");
    let stdout = child.stdout.take().expect("child stdout piped");
    let mut reader = BufReader::new(stdout);

    // initialize first — real MCP clients always do this before tools/call.
    send(
        &mut stdin,
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
    );
    let _ = read_json_line(&mut reader);

    // tools/call execute_cypher with a basic MATCH against the freshly-init'd
    // (empty) DB. The query engine encodes integer cells as the tagged string
    // "i64:<n>" — count(n) on an empty DB must return "i64:0".
    send(
        &mut stdin,
        r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute_cypher","arguments":{"query":"MATCH (n) RETURN count(n) AS c"}}}"#,
    );
    let response = read_json_line(&mut reader);

    assert_eq!(
        response.get("id"),
        Some(&Value::from(2)),
        "tools/call id mismatch: {response}"
    );
    let tool_result = response
        .get("result")
        .unwrap_or_else(|| panic!("tools/call missing result: {response}"));
    let output_str = tool_result
        .get("output")
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("tools/call result missing string `output`: {tool_result}"));
    let query_result: Value = serde_json::from_str(output_str)
        .unwrap_or_else(|e| panic!("`output` must parse as JSON: {e}; raw=`{output_str}`"));

    let columns = query_result
        .get("columns")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("query result missing `columns`: {query_result}"));
    assert_eq!(
        columns.first().and_then(Value::as_str),
        Some("c"),
        "expected column `c`; got {columns:?}"
    );

    let rows = query_result
        .get("rows")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("query result missing `rows`: {query_result}"));
    assert_eq!(rows.len(), 1, "expected exactly one row from count(n)");
    let cell = rows[0]
        .as_object()
        .and_then(|obj| obj.get("c"))
        .unwrap_or_else(|| panic!("row[0] must have key `c`: {:?}", rows[0]));
    let count_str = cell
        .as_str()
        .unwrap_or_else(|| panic!("count cell must be a tagged string: {cell:?}"));
    assert_eq!(
        count_str, "i64:0",
        "freshly init'd DB should return count(n)=0 (got `{count_str}`)"
    );

    drop(stdin);
    let status = child.wait().expect("wait for ogdb mcp");
    assert!(status.success(), "ogdb mcp exited non-zero: {status:?}");
}
