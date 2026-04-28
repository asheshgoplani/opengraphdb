//! Regression tests for HTTP security hardening (audit 2026-04-22, Area 5).
//!
//! Each test pins a specific finding from `.planning/core-technical-audit-2026-04-22.md`:
//!   * 5.1 — Content-Length above `MAX_REQUEST_BODY_BYTES` (10 MiB) → 413 Payload Too Large
//!   * 5.2 — `POST /export` with no bearer token when users are registered → 401
//!   * 5.3 — Slow-loris (accepted but never finishes request) → server-side timeout
//!   * 5.4 — More than `MAX_HEADER_COUNT` (100) headers → 431 Request Header Fields Too Large
//!   * 5.6 — Malformed `Content-Length` header → 400 Bad Request (never panics the server)
//!
//! Regressions here re-open the pre-fix attack surface; keep them green.

use ogdb_cli::run;
use ogdb_core::{Database, DbRole};
use std::env;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

fn temp_db_path(tag: &str) -> PathBuf {
    let mut path = env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-httpsec-{tag}-{}-{ts}.ogdb", process::id()));
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

fn read_status_line(stream: &mut TcpStream) -> Option<(u16, String)> {
    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    let bytes = reader.read_line(&mut status_line).ok()?;
    if bytes == 0 {
        return None;
    }
    let mut parts = status_line.split_whitespace();
    let _proto = parts.next()?;
    let status = parts.next()?.parse::<u16>().ok()?;
    // Drain remaining headers + body so the server can finish cleanly.
    let mut sink = Vec::new();
    let _ = reader.read_to_end(&mut sink);
    Some((status, status_line.trim().to_string()))
}

// Pre-init hook lets callers register users, seed data, etc. in the on-disk
// DB BEFORE the server opens it. The server caches its own in-memory Database
// handle, so writes made via a second `Database::open(path)` after the server
// starts are NOT visible to the server — run them here instead.
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

fn spawn_http_server(
    tag: &str,
    max_requests: u64,
) -> (String, thread::JoinHandle<ogdb_cli::CliResult>, PathBuf) {
    spawn_http_server_with_init(tag, max_requests, |_| {})
}

fn seed_user(path: &Path, username: &str, token: &str) {
    let mut db = Database::open(path.display().to_string()).expect("open db for user seed");
    db.create_user(username, Some(token)).expect("create user");
    db.grant_role(username, DbRole::ReadWrite)
        .expect("grant readwrite");
    drop(db);
}

// -- 5.1 -----------------------------------------------------------------------
// A single `Content-Length: 11000000` (11 MiB) request must not reach the body
// allocation. The server must reject with 413 Payload Too Large before ever
// attempting `vec![0u8; content_length]`.
#[test]
fn body_exceeds_max_request_bytes_returns_413() {
    let (addr, handle, path) = spawn_http_server("body-cap", 1);

    let mut stream = connect_with_retry(&addr);
    let oversize: usize = 11 * 1024 * 1024; // 11 MiB > 10 MiB cap
    let request = format!(
        "POST /import HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {oversize}\r\n\r\n",
    );
    stream
        .write_all(request.as_bytes())
        .expect("write oversize-body request");
    stream.flush().expect("flush oversize request");
    // Deliberately do NOT send the body bytes. If the server were to allocate
    // based on Content-Length before the cap check, it would OOM or block here.

    let (status, line) = read_status_line(&mut stream).expect("read 413 status line");
    assert_eq!(
        status, 413,
        "expected 413 Payload Too Large for oversize Content-Length; got `{line}`",
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed on oversize body: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

// -- 5.2 -----------------------------------------------------------------------
// When at least one user is registered, `POST /export` without a bearer token
// must return 401 Unauthorized — the graph must not be exfiltrable by any
// network-attached client.
#[test]
fn export_without_token_returns_401_when_users_are_registered() {
    let (addr, handle, path) = spawn_http_server_with_init("export-auth", 2, |db_path| {
        seed_user(db_path, "api", "token-api");
    });

    // Missing header case.
    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "POST /export HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: 0\r\n\r\n",
    );
    stream
        .write_all(request.as_bytes())
        .expect("write /export request");
    stream.flush().expect("flush /export request");
    let (status, line) = read_status_line(&mut stream).expect("status line");
    assert_eq!(
        status, 401,
        "expected 401 Unauthorized on /export without token; got `{line}`",
    );

    // Invalid token case.
    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "POST /export HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nAuthorization: Bearer not-the-token\r\nContent-Type: application/json\r\nContent-Length: 0\r\n\r\n",
    );
    stream
        .write_all(request.as_bytes())
        .expect("write bad-token request");
    stream.flush().expect("flush bad-token request");
    let (status, line) = read_status_line(&mut stream).expect("status line");
    assert_eq!(
        status, 401,
        "expected 401 Unauthorized on /export with invalid token; got `{line}`",
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed handling /export auth: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

// -- 5.3 -----------------------------------------------------------------------
// Slow-loris: connect, never finish the request. With per-stream timeouts the
// server must close the connection within the configured window; without a cap
// it would hold the connection forever. We use `OGDB_HTTP_STREAM_TIMEOUT_SECS=2`
// to keep the test bounded without changing the production default.
#[test]
fn slow_loris_connection_is_closed_by_server_timeout() {
    env::set_var("OGDB_HTTP_STREAM_TIMEOUT_SECS", "2");
    let (addr, handle, path) = spawn_http_server("slow-loris", 1);

    // Connect, write ONE byte that is not a line terminator, then sit idle.
    // BufReader::read_line will block on the server until the read timeout fires.
    let mut stream = connect_with_retry(&addr);
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .expect("client read timeout");
    stream.write_all(b"G").expect("write one byte");
    stream.flush().expect("flush partial");

    let start = Instant::now();
    let mut sink = [0u8; 64];
    let read_result = stream.read(&mut sink);
    let elapsed = start.elapsed();

    // Server must terminate the socket within ~timeout + epsilon. We allow up
    // to 8s to avoid flakes on slow CI — the key invariant is that it DOES
    // close, not that it closes in exactly 2s.
    assert!(
        elapsed < Duration::from_secs(8),
        "slow-loris: server did not close within 8s (elapsed {elapsed:?}, read_result={read_result:?})",
    );
    // read returns Ok(0) on EOF after server-side close.
    match read_result {
        Ok(0) => {} // expected: server closed cleanly
        Ok(n) => {
            // If the server produced an error response we still expect the
            // connection to close shortly after — acceptable as long as the
            // close happened within the deadline above.
            let _ = n;
        }
        Err(_) => {} // TCP RST or timeout is also acceptable for this test
    }

    env::remove_var("OGDB_HTTP_STREAM_TIMEOUT_SECS");
    // Server may still be running under max_requests budget; join best-effort
    // by making a final well-formed request to unblock it.
    let mut closer = connect_with_retry(&addr);
    let ok_request = format!("GET /health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n",);
    let _ = closer.write_all(ok_request.as_bytes());
    let _ = closer.flush();
    let _ = read_status_line(&mut closer);

    let _ = handle.join();
    cleanup(&path);
}

// -- 5.4 -----------------------------------------------------------------------
// 101 headers exceeds MAX_HEADER_COUNT=100 and must be rejected with 431
// Request Header Fields Too Large before the server ingests the hash map.
#[test]
fn too_many_headers_returns_431() {
    let (addr, handle, path) = spawn_http_server("header-count", 1);

    let mut stream = connect_with_retry(&addr);
    let mut request = format!("GET /health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n",);
    for i in 0..101 {
        request.push_str(&format!("X-Flood-{i}: y\r\n"));
    }
    request.push_str("\r\n");
    stream
        .write_all(request.as_bytes())
        .expect("write flood request");
    stream.flush().expect("flush flood request");

    let (status, line) = read_status_line(&mut stream).expect("flood status line");
    assert_eq!(
        status, 431,
        "expected 431 Request Header Fields Too Large; got `{line}`",
    );

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed on 101-header flood: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

// -- 5.6 -----------------------------------------------------------------------
// `Content-Length: notanumber` must produce 400 Bad Request and keep the
// server alive. Pre-fix the code path either killed the server or `.expect`ed
// on the parse and panicked.
#[test]
fn malformed_content_length_returns_400() {
    let (addr, handle, path) = spawn_http_server("malformed-cl", 2);

    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "POST /query HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: notanumber\r\n\r\n",
    );
    stream
        .write_all(request.as_bytes())
        .expect("write malformed-CL request");
    stream.flush().expect("flush malformed-CL request");
    let (status, line) = read_status_line(&mut stream).expect("malformed-CL status line");
    assert_eq!(
        status, 400,
        "expected 400 Bad Request for malformed Content-Length; got `{line}`",
    );

    // Server must still accept the next request — prove it by hitting /health.
    let mut stream = connect_with_retry(&addr);
    let request = format!("GET /health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n",);
    stream
        .write_all(request.as_bytes())
        .expect("write follow-up /health");
    stream.flush().expect("flush /health");
    let (status, _line) = read_status_line(&mut stream).expect("/health status line");
    assert_eq!(status, 200, "/health must still succeed after malformed CL");

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed after malformed Content-Length: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
