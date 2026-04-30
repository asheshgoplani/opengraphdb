//! RED test for Slice S7 (frontend overhaul, .planning/frontend-overhaul/PLAN.md):
//! the `ogdb serve --http` transport must serve the embedded SPA on `GET /`,
//! return embedded assets on `GET /assets/*`, and SPA-fallback to `index.html`
//! on any other unknown non-API path.
//!
//! Today every one of these requests returns 404 from
//! `crates/ogdb-cli/src/lib.rs:4799` (`("GET", _) | ("POST", _) =>
//! http_error(404, "Not Found", ...)`). After Slice S7 lands, GETs that miss
//! the explicit API matchers must fall through to a static-asset handler that
//! reads from `frontend/dist-app/` via `include_dir!`.
//!
//! These tests follow the same TcpStream + threaded-`run` pattern as the
//! existing HTTP integration tests (e.g. `http_post_query_accepts_unwind.rs`)
//! to avoid pulling a new dev-dependency just to make a GET request.

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
        "ogdb-static-http-{tag}-{}-{ts}.ogdb",
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

fn read_full_response(stream: &mut TcpStream) -> (u16, String, String) {
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
    (status, head.to_string(), body.to_string())
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

fn header_value<'a>(head: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\n{}:", key.to_ascii_lowercase());
    let head_lc = head.to_ascii_lowercase();
    let pos = head_lc.find(needle.as_str())?;
    let line_start = pos + 1;
    let after_colon = head[line_start..].find(':')? + line_start + 1;
    let line_end = head[after_colon..]
        .find("\r\n")
        .map(|n| n + after_colon)
        .unwrap_or(head.len());
    Some(head[after_colon..line_end].trim())
}

#[test]
fn http_get_root_serves_embedded_index_html() {
    let (addr, handle, path) = spawn_http_server("root", 1);

    let mut stream = connect_with_retry(&addr);
    let request = format!("GET / HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .expect("write GET / request");
    stream.flush().expect("flush GET / request");

    let (status, head, body) = read_full_response(&mut stream);

    assert_eq!(
        status, 200,
        "GET / must serve the embedded SPA (200), got {status}; head={head:?}, body={body:.200}"
    );

    // Vite injects `<div id="root"></div>` into index-app.html — see
    // frontend/index-app.html. Pin that exact marker so we know the body is
    // the built SPA shell, not a generic 200 from some other handler.
    assert!(
        body.contains("<div id=\"root\">"),
        "GET / must return SPA index.html with <div id=\"root\"></div>; got {body:.400}"
    );

    // Sanity: the response must be served as HTML so browsers parse it.
    let ctype = header_value(&head, "content-type").unwrap_or("");
    assert!(
        ctype.starts_with("text/html"),
        "GET / must be served as text/html; got Content-Type={ctype:?}"
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero after one request: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

#[test]
fn http_get_unknown_path_falls_back_to_index_html() {
    // SPA routing: any unknown non-/api path returns the embedded index.html
    // so the React Router can pick up the route on the client.
    let (addr, handle, path) = spawn_http_server("fallback", 1);

    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "GET /playground/this/does/not/exist HTTP/1.1\r\n\
         Host: {addr}\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .expect("write SPA-fallback request");
    stream.flush().expect("flush SPA-fallback request");

    let (status, head, body) = read_full_response(&mut stream);

    assert_eq!(
        status, 200,
        "Unknown SPA route must SPA-fallback to index.html (200), got {status}; head={head:?}, body={body:.200}"
    );
    assert!(
        body.contains("<div id=\"root\">"),
        "SPA fallback must serve index.html with <div id=\"root\"></div>; got {body:.400}"
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero after one request: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

#[test]
fn http_get_health_still_returns_health_json_after_static_handler() {
    // Regression guard: the new static-asset branch must NOT shadow the
    // pre-existing GET endpoints. /health is the simplest of those.
    let (addr, handle, path) = spawn_http_server("health-shadow", 1);

    let mut stream = connect_with_retry(&addr);
    let request = format!("GET /health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .expect("write GET /health request");
    stream.flush().expect("flush GET /health request");

    let (status, head, body) = read_full_response(&mut stream);
    assert_eq!(status, 200, "GET /health must return 200; got {status}");
    let ctype = header_value(&head, "content-type").unwrap_or("");
    assert!(
        ctype.contains("application/json"),
        "GET /health must remain application/json after static handler is wired; \
         got Content-Type={ctype:?}, body={body:.200}"
    );
    assert!(
        body.contains("\"status\""),
        "GET /health body must remain the health JSON; got {body:.200}"
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero after one request: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
