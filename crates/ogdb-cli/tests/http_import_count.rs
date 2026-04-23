//! Regression tests for HIGH/MED findings from the 2026-04-23b real-UI audit
//! (see `.planning/real-audit-2026-04-23b.md`).
//!
//! Each test locks in one previously-broken behavior:
//!   * M3 — `POST /import {"nodes":[{"id":100,...}]}` must report
//!     `created_nodes: 1` (a COUNT of records applied), not `100` (the
//!     highest internal id the allocator touched). A dashboard reading
//!     `created_nodes` as a count on the old shape saw wildly wrong
//!     numbers for sparse-id imports.
//!   * M2 — `POST /query` with syntactically invalid Cypher must return
//!     `400 Bad Request`, not `500 Internal Server Error`. Bad client input
//!     is a 4xx. The pre-fix server used the generic CliError → 500 mapping
//!     and surfaced query-parse failures as "Internal Server Error".
//!
//! Keeping these green ensures the audit regressions don't silently re-land.

use ogdb_cli::run;
use std::env;
use std::io::{Read, Write};
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
    path.push(format!("ogdb-auditregress-{tag}-{}-{ts}.ogdb", process::id()));
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
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .expect("set read timeout");
                stream
                    .set_write_timeout(Some(Duration::from_secs(5)))
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

/// Drain the full HTTP response into `(status, body_as_string)`. Good enough
/// for these regression tests because our server always sets `Connection:
/// close` and doesn't chunk the responses that matter here.
fn read_full_response(stream: &mut TcpStream) -> (u16, String) {
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).expect("read response bytes");
    let text = String::from_utf8_lossy(&raw).into_owned();
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .expect("status code");
    (status, body.to_string())
}

fn spawn_http_server(tag: &str, max_requests: u64) -> (String, thread::JoinHandle<ogdb_cli::CliResult>, PathBuf) {
    let path = temp_db_path(tag);
    cleanup(&path);
    let init = run(&["init".to_string(), path.display().to_string()]);
    assert_eq!(init.exit_code, 0, "init failed: {}", init.stderr);

    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
    let bind_addr = probe.local_addr().expect("probe local addr").to_string();
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

// -- M3 ---------------------------------------------------------------------
// `POST /import {"nodes":[{"id":100,"labels":["Car"],"properties":{}}]}` on
// a fresh db used to reply:
//     {"created_nodes": 100, "imported_nodes": 1, ...}
// That `100` is the highest internal id the allocator touched (the importer
// fills gaps from id 0 up to the requested id), which a dashboard or CLI
// script treats as a count. A count of 100 for 1 imported node is a lie.
//
// Post-fix: `created_nodes` is the count of node records applied
// (= `imported_nodes`), and the former "highest id allocator saw" value
// moves to `highest_node_id` where its semantic is unambiguous.
#[test]
fn import_created_nodes_is_a_count_not_the_highest_id() {
    let (addr, handle, path) = spawn_http_server("import-count", 1);

    let body = serde_json::json!({
        "nodes": [{
            "id": 100,
            "labels": ["Car"],
            "properties": {}
        }],
        "edges": []
    })
    .to_string();

    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "POST /import HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(request.as_bytes())
        .expect("write /import request");
    stream.flush().expect("flush /import request");

    let (status, raw_body) = read_full_response(&mut stream);
    assert_eq!(status, 200, "expected 200 OK from /import; got status={status}, body={raw_body}");

    let json: serde_json::Value =
        serde_json::from_str(&raw_body).expect("import response must be json");

    // The audit regression: `created_nodes` used to be `100`. It must now be
    // a true count of applied node records (here: 1).
    let created_nodes = json
        .get("created_nodes")
        .and_then(|v| v.as_u64())
        .expect("created_nodes must be present");
    assert_eq!(
        created_nodes, 1,
        "created_nodes must be the count of node records applied (1), \
         not the highest internal id the allocator touched. \
         If this fails, the M3 regression is back."
    );

    // `imported_nodes` must agree with `created_nodes` for a flat import.
    let imported_nodes = json.get("imported_nodes").and_then(|v| v.as_u64());
    assert_eq!(imported_nodes, Some(1), "imported_nodes disagrees: {json}");

    // The old semantic — "the highest id the allocator touched" — is still
    // useful (e.g. diffing last-seen-id across imports), so it's preserved
    // under the new `highest_node_id` field with unambiguous naming.
    let highest = json
        .get("highest_node_id")
        .and_then(|v| v.as_u64())
        .expect("highest_node_id must be present");
    assert_eq!(highest, 100, "highest_node_id should expose the allocator ceiling: {json}");

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -- M2 ---------------------------------------------------------------------
// `POST /query {"query":"INVALID SYNTAX LOL"}` used to return
//     500 Internal Server Error  {"error":"invalid argument: query error: ..."}
// Cypher-parse failure is a caller mistake, not a server fault — must be 400.
#[test]
fn invalid_cypher_returns_400_not_500() {
    let (addr, handle, path) = spawn_http_server("bad-cypher", 1);

    let body = serde_json::json!({"query": "INVALID SYNTAX LOL"}).to_string();

    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "POST /query HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(request.as_bytes())
        .expect("write bad-cypher /query request");
    stream.flush().expect("flush bad-cypher /query request");

    let (status, raw_body) = read_full_response(&mut stream);
    assert_eq!(
        status, 400,
        "syntactically invalid Cypher must surface as 400 Bad Request, \
         not 500. got status={status}, body={raw_body}"
    );

    // Body should still carry an error message with detail — it's a 400 with
    // content, not an empty protocol-level error.
    assert!(
        raw_body.contains("query error")
            || raw_body.contains("invalid argument")
            || raw_body.contains("INVALID"),
        "400 body should include parse-error detail; got: {raw_body}"
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -- M2b --------------------------------------------------------------------
// Missing `query` field in the body is also a caller error (must be 400),
// not a server fault. Also a pre-fix 500.
#[test]
fn query_payload_missing_query_field_returns_400() {
    let (addr, handle, path) = spawn_http_server("bad-payload", 1);

    let body = serde_json::json!({"not_query": "anything"}).to_string();

    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "POST /query HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(request.as_bytes())
        .expect("write missing-query request");
    stream.flush().expect("flush missing-query request");

    let (status, raw_body) = read_full_response(&mut stream);
    assert_eq!(status, 400, "missing `query` field must be 400; got {status}, body={raw_body}");

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}
