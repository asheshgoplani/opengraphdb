//! RED test (cross-transport parity gate) for the bare-RETURN-literal
//! row-count bug surfaced by live-ui-smoke 2026-04-26.
//!
//! Reproducer:
//!
//! ```text
//! curl -X POST http://localhost:18080/query \
//!     -H 'Content-Type: application/json' \
//!     -d '{"query":"RETURN 1 AS x"}'
//!     -> row_count: 0   (BUG; must be 1 row with x=1)
//! ```
//!
//! The HTTP handler in `crates/ogdb-cli/src/lib.rs` hands the query
//! string straight to `Database::query` — so the bug is rooted in the
//! core executor, not the transport. This test pins the bug on the HTTP
//! side so any future regression that breaks bare RETURN over the wire
//! gets caught before shipping (the live-ui-smoke caught it because the
//! UI hits HTTP, not the in-process API).

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
    path.push(format!(
        "ogdb-bare-return-http-{tag}-{}-{ts}.ogdb",
        process::id()
    ));
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
fn http_post_query_accepts_bare_return_literal() {
    let (addr, handle, path) = spawn_http_server("bare-return-literal", 1);

    let body = serde_json::json!({ "query": "RETURN 1 AS x" }).to_string();

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

    assert_eq!(
        status, 200,
        "POST /query with bare RETURN must return 200 OK; got status={status}, body={raw_body}"
    );

    let payload: serde_json::Value = serde_json::from_str(&raw_body)
        .unwrap_or_else(|e| panic!("response body must be valid JSON, got {raw_body:?} ({e})"));

    assert_eq!(
        payload.get("row_count").and_then(serde_json::Value::as_u64),
        Some(1),
        "row_count must be 1 (single synthetic row for bare RETURN); \
         payload={payload}"
    );

    let rows = payload
        .get("rows")
        .and_then(serde_json::Value::as_array)
        .unwrap_or_else(|| panic!("payload.rows must be an array; payload={payload}"));
    assert_eq!(
        rows.len(),
        1,
        "rows array must have exactly 1 entry; got {rows:?}"
    );

    let x = rows[0]
        .get("x")
        .and_then(serde_json::Value::as_i64)
        .unwrap_or_else(|| panic!("row must bind column `x` to an integer; row={}", rows[0]));
    assert_eq!(
        x, 1,
        "the projected literal must round-trip as 1; got x={x} in row {}",
        rows[0]
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero after one request: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
