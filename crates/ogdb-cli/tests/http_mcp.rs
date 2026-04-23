//! Integration tests for the HTTP MCP transport: `POST /mcp/tools` and
//! `POST /mcp/invoke`. These endpoints expose the same tool surface as
//! `ogdb mcp --stdio`, but over HTTP so remote AI agents can invoke tools
//! without spawning a child process.
//!
//! Auth mirrors the 5.2 CRIT fix: when any user is registered, a valid
//! bearer token is required; otherwise anonymous access is allowed.

use ogdb_cli::run;
use ogdb_core::{Database, DbRole};
use serde_json::Value;
use std::env;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

fn temp_db_path(tag: &str) -> PathBuf {
    let mut path = env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-httpmcp-{tag}-{}-{ts}.ogdb", process::id()));
    path
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-meta.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-props-meta.json", path.display()));
}

fn connect_with_retry(addr: &str) -> TcpStream {
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut last: Option<std::io::Error> = None;
    while Instant::now() < deadline {
        match TcpStream::connect(addr) {
            Ok(stream) => {
                stream
                    .set_read_timeout(Some(Duration::from_secs(10)))
                    .expect("set read timeout");
                stream
                    .set_write_timeout(Some(Duration::from_secs(10)))
                    .expect("set write timeout");
                return stream;
            }
            Err(err) => {
                last = Some(err);
                thread::sleep(Duration::from_millis(20));
            }
        }
    }
    panic!(
        "failed to connect at {addr}: {}",
        last.map(|e| e.to_string()).unwrap_or_default()
    );
}

struct HttpResponse {
    status: u16,
    body: String,
}

fn read_full_response(stream: &mut TcpStream) -> HttpResponse {
    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .expect("read status line");
    let mut parts = status_line.split_whitespace();
    let _proto = parts.next().expect("http proto");
    let status: u16 = parts
        .next()
        .expect("status code")
        .parse()
        .expect("status code parses as u16");

    // Headers: consume until blank line.
    let mut content_length: usize = 0;
    loop {
        let mut header = String::new();
        let n = reader.read_line(&mut header).expect("read header line");
        if n == 0 {
            break;
        }
        let line = header.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse().unwrap_or(0);
            }
        }
    }

    // Body: read exactly content_length bytes if declared, else until EOF.
    let mut body_bytes = Vec::new();
    if content_length > 0 {
        body_bytes.resize(content_length, 0);
        reader
            .read_exact(&mut body_bytes)
            .expect("read body by content-length");
    } else {
        let _ = reader.read_to_end(&mut body_bytes);
    }
    HttpResponse {
        status,
        body: String::from_utf8_lossy(&body_bytes).into_owned(),
    }
}

fn post_json(addr: &str, path: &str, bearer: Option<&str>, body: &str) -> HttpResponse {
    let mut stream = connect_with_retry(addr);
    let auth_header = match bearer {
        Some(token) => format!("Authorization: Bearer {token}\r\n"),
        None => String::new(),
    };
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\n{auth_header}Content-Length: {}\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(request.as_bytes())
        .expect("write request");
    stream.flush().expect("flush request");
    read_full_response(&mut stream)
}

fn spawn_http_server_with_init<F>(
    tag: &str,
    max_requests: u64,
    pre_init: F,
) -> (String, thread::JoinHandle<ogdb_cli::CliResult>, PathBuf)
where
    F: FnOnce(&PathBuf),
{
    let path = temp_db_path(tag);
    cleanup(&path);
    let init = run(&["init".to_string(), path.display().to_string()]);
    assert_eq!(init.exit_code, 0, "init failed: {}", init.stderr);

    pre_init(&path);

    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
    let bind_addr = probe
        .local_addr()
        .expect("probe local addr")
        .to_string();
    drop(probe);

    let serve_args = vec![
        "serve".to_string(),
        path.display().to_string(),
        "--http".to_string(),
        "--bind".to_string(),
        bind_addr.clone(),
        "--max-requests".to_string(),
        max_requests.to_string(),
    ];
    let handle = thread::spawn(move || run(&serve_args));
    (bind_addr, handle, path)
}

fn spawn_http_server(
    tag: &str,
    max_requests: u64,
) -> (String, thread::JoinHandle<ogdb_cli::CliResult>, PathBuf) {
    spawn_http_server_with_init(tag, max_requests, |_| {})
}

fn seed_user(path: &PathBuf, username: &str, token: &str) {
    let mut db = Database::open(path.display().to_string()).expect("open db for user seed");
    db.create_user(username, Some(token)).expect("create user");
    db.grant_role(username, DbRole::ReadWrite)
        .expect("grant readwrite");
    drop(db);
}

// -----------------------------------------------------------------------------
// /mcp/tools — list available MCP tools with JSON Schema descriptors.
// Anonymous access is permitted when no users are registered (matches existing
// /schema + /query policy).
// -----------------------------------------------------------------------------
#[test]
fn http_mcp_tools_returns_tool_descriptors() {
    let (addr, handle, path) = spawn_http_server("tools-list", 1);

    let response = post_json(&addr, "/mcp/tools", None, "");
    assert_eq!(
        response.status, 200,
        "POST /mcp/tools should return 200; body=`{}`",
        response.body,
    );
    let parsed: Value = serde_json::from_str(&response.body).unwrap_or_else(|e| {
        panic!(
            "POST /mcp/tools must return valid JSON: {e}; body=`{}`",
            response.body
        )
    });
    let tools = parsed
        .get("tools")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("response must have `tools` array: {}", response.body));

    assert!(
        tools.len() >= 5,
        "expected at least 5 tools, got {} — body=`{}`",
        tools.len(),
        response.body
    );

    // Every tool must have `name`, `description`, `inputSchema`.
    for tool in tools {
        let name = tool
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("tool missing string `name`: {tool}"));
        assert!(!name.is_empty(), "tool name must be non-empty");
        assert!(
            tool.get("description")
                .and_then(Value::as_str)
                .is_some(),
            "tool `{name}` missing string `description`",
        );
        assert!(
            tool.get("inputSchema").is_some(),
            "tool `{name}` missing `inputSchema`",
        );
    }

    // The canonical AI-agent-facing tools must all be present.
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
            "missing canonical tool `{required}` — got {names:?}",
        );
    }

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed on /mcp/tools: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// /mcp/invoke — invoke a named tool against the real database. We use
// execute_cypher with `MATCH (n) RETURN count(n) AS c` so the test exercises
// the actual query engine, not just a mock.
// -----------------------------------------------------------------------------
#[test]
fn http_mcp_invoke_executes_cypher_against_real_db() {
    let (addr, handle, path) = spawn_http_server("invoke-cypher", 1);

    let body = r#"{"name":"execute_cypher","arguments":{"query":"MATCH (n) RETURN count(n) AS c"}}"#;
    let response = post_json(&addr, "/mcp/invoke", None, body);
    assert_eq!(
        response.status, 200,
        "POST /mcp/invoke should return 200; body=`{}`",
        response.body,
    );
    let parsed: Value = serde_json::from_str(&response.body).unwrap_or_else(|e| {
        panic!(
            "POST /mcp/invoke must return valid JSON: {e}; body=`{}`",
            response.body
        )
    });

    // The stdio MCP `execute_cypher` tool returns `{format, output}` where
    // `output` is a JSON string containing `{columns, row_count, rows}`; rows
    // are keyed objects (not arrays) and integers are tagged as "i64:<n>".
    // Accept both the direct-payload shape and the `content: [{text: ...}]`
    // wrapper for forward compatibility.
    let tool_payload = if let Some(content) = parsed.get("content").and_then(Value::as_array) {
        let first = content.first().expect("content array has entries");
        let text = first
            .get("text")
            .and_then(Value::as_str)
            .expect("content[0].text string");
        serde_json::from_str::<Value>(text).expect("content[0].text parses as JSON")
    } else {
        parsed.clone()
    };

    let output_str = tool_payload
        .get("output")
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("tool result missing string `output`: {tool_payload}"));
    let query_result: Value = serde_json::from_str(output_str)
        .unwrap_or_else(|e| panic!("tool `output` must parse as JSON: {e}; raw=`{output_str}`"));

    let columns = query_result
        .get("columns")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("query result missing `columns`: {query_result}"));
    assert_eq!(
        columns.first().and_then(Value::as_str),
        Some("c"),
        "expected column `c`; got {columns:?}",
    );

    let rows = query_result
        .get("rows")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("query result missing `rows`: {query_result}"));
    assert_eq!(rows.len(), 1, "expected exactly one row from count(n)");

    // Empty database ⇒ count is 0 (encoded as tagged string "i64:0").
    let count_cell = rows[0]
        .as_object()
        .and_then(|obj| obj.get("c"))
        .unwrap_or_else(|| panic!("row[0] must have key `c`: {:?}", rows[0]));
    let count_str = count_cell
        .as_str()
        .unwrap_or_else(|| panic!("count cell must be a tagged string: {count_cell:?}"));
    assert_eq!(
        count_str, "i64:0",
        "empty database should return count(n) = 0 (got `{count_str}`)",
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed on /mcp/invoke: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// Auth: when a user is registered, /mcp/invoke must require a bearer token
// (matches the 5.2 CRIT fix for /export + /rag/*). /mcp/tools is read-only
// schema information, but we gate it the same way — MCP tool descriptors can
// leak the DB's RAG / vector / RDF surface to unauthenticated scanners.
// -----------------------------------------------------------------------------
#[test]
fn http_mcp_invoke_requires_bearer_when_users_registered() {
    let (addr, handle, path) = spawn_http_server_with_init("invoke-auth", 3, |db_path| {
        seed_user(db_path, "api", "token-api");
    });

    // Missing bearer ⇒ 401.
    let body = r#"{"name":"execute_cypher","arguments":{"query":"MATCH (n) RETURN count(n)"}}"#;
    let no_auth = post_json(&addr, "/mcp/invoke", None, body);
    assert_eq!(
        no_auth.status, 401,
        "/mcp/invoke without token must be 401; body=`{}`",
        no_auth.body
    );

    // Bad bearer ⇒ 401.
    let bad_auth = post_json(&addr, "/mcp/invoke", Some("not-the-token"), body);
    assert_eq!(
        bad_auth.status, 401,
        "/mcp/invoke with invalid token must be 401; body=`{}`",
        bad_auth.body
    );

    // Valid bearer ⇒ 200.
    let good_auth = post_json(&addr, "/mcp/invoke", Some("token-api"), body);
    assert_eq!(
        good_auth.status, 200,
        "/mcp/invoke with valid token must be 200; body=`{}`",
        good_auth.body
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed on /mcp/invoke auth: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// /mcp/invoke must return a 4xx (not 500) when asked to run an unknown tool —
// errors are the tool's responsibility, not a server crash.
// -----------------------------------------------------------------------------
#[test]
fn http_mcp_invoke_unknown_tool_returns_4xx() {
    let (addr, handle, path) = spawn_http_server("unknown-tool", 1);

    let body = r#"{"name":"this_tool_does_not_exist","arguments":{}}"#;
    let response = post_json(&addr, "/mcp/invoke", None, body);
    assert!(
        response.status >= 400 && response.status < 500,
        "unknown tool must produce 4xx; got {} body=`{}`",
        response.status,
        response.body
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed on unknown-tool invoke: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
