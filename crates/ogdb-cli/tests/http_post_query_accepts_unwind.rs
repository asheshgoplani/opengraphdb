//! RED test for task `unwind-in-core`, gate (d)(7) in PLAN.md §4.
//!
//! This is the cross-transport parity gate. `POST /query` with
//! `{"query":"UNWIND [1,2,3] AS i RETURN i"}` must return `200 OK`
//! carrying a JSON body with `"row_count": 3` and three row objects
//! binding `i` to 1, 2, 3 respectively.
//!
//! Today this fails: the HTTP handler at
//! `crates/ogdb-cli/src/lib.rs:4552` hands the query string straight
//! to `Database::query` without touching the CLI string-desugar at
//! `:1880–1909`. The core planner hits
//! `physical planning for UNWIND is not implemented yet` at
//! `crates/ogdb-core/src/lib.rs:4934–4936` and the handler returns
//! `400 Bad Request` with that message in the body.
//!
//! After Phase 3 (core `PhysicalUnwind`), this test goes green with
//! no change on the HTTP side — the transport never needed UNWIND
//! handling of its own. Phase 5's removal of the CLI desugar does
//! not affect this test (HTTP never depended on it).

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
    path.push(format!("ogdb-unwind-http-{tag}-{}-{ts}.ogdb", process::id()));
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

fn spawn_http_server(
    tag: &str,
    max_requests: u64,
) -> (String, thread::JoinHandle<ogdb_cli::CliResult>, PathBuf) {
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

#[test]
fn http_post_query_accepts_unwind_literal_list() {
    let (addr, handle, path) = spawn_http_server("unwind-literal", 1);

    let body = serde_json::json!({
        "query": "UNWIND [1, 2, 3] AS i RETURN i",
    })
    .to_string();

    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "POST /query HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len(),
    );
    stream
        .write_all(request.as_bytes())
        .expect("write /query request");
    stream.flush().expect("flush /query request");

    let (status, raw_body) = read_full_response(&mut stream);

    // Two layers of contract we pin here:
    //   1. HTTP status is 200 — the same Cypher that works in CLI must
    //      not be rejected over HTTP. Today it is 400 with the core
    //      stub message "physical planning for UNWIND is not implemented yet".
    //   2. Response body is a well-formed query JSON with row_count = 3
    //      and each row binds `i` to a list element.
    assert_eq!(
        status, 200,
        "POST /query with UNWIND must return 200 OK; got status={status}, body={raw_body}"
    );

    let payload: serde_json::Value = serde_json::from_str(&raw_body)
        .unwrap_or_else(|e| panic!("response body must be valid JSON, got {raw_body:?} ({e})"));

    assert_eq!(
        payload.get("row_count").and_then(serde_json::Value::as_u64),
        Some(3),
        "row_count must be 3 (one row per list element); payload={payload}"
    );

    let rows = payload
        .get("rows")
        .and_then(serde_json::Value::as_array)
        .unwrap_or_else(|| panic!("payload.rows must be an array; payload={payload}"));
    assert_eq!(rows.len(), 3, "rows array must have 3 entries; got {rows:?}");

    let mut seen = Vec::<i64>::new();
    for row in rows {
        let i = row
            .get("i")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or_else(|| panic!("each row must bind column `i` to an integer; row={row}"));
        seen.push(i);
    }
    seen.sort();
    assert_eq!(
        seen,
        vec![1, 2, 3],
        "three rows must carry i=1,2,3 (order-agnostic here — list order is \
         pinned by crates/ogdb-core/tests/unwind_literal_list.rs); got {seen:?}"
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero after one request: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
