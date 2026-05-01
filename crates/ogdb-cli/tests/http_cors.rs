//! Regression test for CORS support on the HTTP server.
//!
//! Context: playground correctness audit 2026-04-22 found that `ogdb serve --http`
//! emitted no CORS headers, which caused Live Mode / Power Mode / BackendSchemaStrip
//! in the browser playground to fail with "Failed to fetch" whenever the page was
//! served from any origin other than the backend's own host:port.
//!
//! EVAL-FRONTEND-QUALITY-CYCLE3.md H-5: cycle-2 M-12 was diagnosed but never
//! shipped — the wildcard `Access-Control-Allow-Origin: *` exposed any LAN
//! caller to a malicious page on the same network. Cycle-3 narrows the
//! default: ACAO is reflected only when the request `Origin` is a localhost
//! variant (`http://localhost(:port)?` / `http://127.0.0.1(:port)?`); other
//! origins get no ACAO header and the browser blocks the response.
//!
//! This test pins three contracts:
//!
//!   1. A localhost cross-origin GET still gets a usable Access-Control-Allow-Origin
//!      reflecting that exact origin (and Methods / Headers).
//!   2. A non-localhost origin (`http://evil.example`) gets NO ACAO header.
//!   3. An OPTIONS preflight from a localhost origin returns 204 with the
//!      full preflight header triplet.
//!
//! Regressions here mean either the playground breaks silently in the browser
//! (Live Mode / Power Mode / BackendSchemaStrip fail with "Failed to fetch")
//! OR the server re-opens cross-origin exfiltration to LAN attackers.

use ogdb_cli::run;
use std::collections::HashMap;
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
    path.push(format!("ogdb-{tag}-{}-{ts}.ogdb", process::id()));
    path
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-meta.json", path.display()));
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
        "failed to connect to serve_http at {addr}: {}",
        last.map(|e| e.to_string()).unwrap_or_default()
    );
}

struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn send(addr: &str, method: &str, path: &str, extra_headers: &[(&str, &str)]) -> HttpResponse {
    let mut stream = connect_with_retry(addr);
    let mut request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Length: 0\r\n"
    );
    for (name, value) in extra_headers {
        request.push_str(name);
        request.push_str(": ");
        request.push_str(value);
        request.push_str("\r\n");
    }
    request.push_str("\r\n");
    stream
        .write_all(request.as_bytes())
        .expect("write http request");
    stream.flush().expect("flush request");

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .expect("read http status line");
    let status = status_line
        .split_whitespace()
        .nth(1)
        .expect("status code token")
        .parse::<u16>()
        .expect("numeric status");

    let mut headers: HashMap<String, String> = HashMap::new();
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).expect("read header line");
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim().to_string();
            if key == "content-length" {
                content_length = value.parse::<usize>().expect("content-length numeric");
            }
            headers.insert(key, value);
        }
    }
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).expect("read body");
    }
    HttpResponse {
        status,
        headers,
        body,
    }
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
fn http_response_reflects_cors_for_localhost_origin() {
    // Scenario: the playground served from `http://localhost:5173` (vite dev
    // server) issues `GET /schema` against the backend on `http://localhost:8080`.
    // Without ACAO the browser blocks the response. Cycle-3 H-5 reflects the
    // localhost origin back; we pin both ACAO == origin and Vary: Origin so
    // caches don't cross-pollinate.
    let (addr, handle, path) = spawn_http_server("cors-localhost-get", 1);

    let response = send(
        &addr,
        "GET",
        "/schema",
        &[("Origin", "http://localhost:5173")],
    );
    assert_eq!(response.status, 200, "expected 200 for /schema");

    let acao = response
        .headers
        .get("access-control-allow-origin")
        .unwrap_or_else(|| {
            panic!(
                "missing Access-Control-Allow-Origin for localhost origin; got headers: {:?}",
                response.headers
            )
        });
    assert_eq!(
        acao, "http://localhost:5173",
        "ACAO must reflect the request's localhost origin, not wildcard"
    );

    let vary = response
        .headers
        .get("vary")
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    assert!(
        vary.contains("origin"),
        "Vary must include Origin when ACAO is reflected; got Vary={vary:?}"
    );

    // The body must still be valid JSON — CORS headers must not displace the schema payload.
    let schema: serde_json::Value =
        serde_json::from_slice(&response.body).expect("schema body json");
    assert!(schema.get("labels").is_some(), "schema missing labels key");

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

#[test]
fn http_response_omits_acao_for_non_localhost_origin() {
    // EVAL-FRONTEND-QUALITY-CYCLE3 H-5: a malicious page at `http://evil.example`
    // asking `GET /schema` against `ogdb serve --http :8080` on a LAN-reachable
    // box must NOT get an `Access-Control-Allow-Origin` back. The browser then
    // blocks the response. Pre-fix the wildcard `*` allowed exfiltration of the
    // entire DB schema across origins.
    let (addr, handle, path) = spawn_http_server("cors-evil", 1);

    let response = send(
        &addr,
        "GET",
        "/schema",
        &[("Origin", "http://evil.example")],
    );
    assert_eq!(
        response.status, 200,
        "expected 200 for /schema (the request still completes server-side)"
    );

    // The server still answers, but no ACAO header — browser will refuse the
    // response back to the cross-origin caller.
    assert!(
        !response.headers.contains_key("access-control-allow-origin"),
        "non-localhost origin must get no Access-Control-Allow-Origin; got headers: {:?}",
        response.headers
    );

    // Methods + Headers may still appear; they are inert without ACAO.
    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

#[test]
fn http_options_preflight_returns_204_with_full_cors_headers() {
    // Scenario: the browser sends an OPTIONS preflight before a cross-origin
    // `POST /query` with `Content-Type: application/json`. Without proper
    // preflight handling the browser aborts the actual POST. We pin:
    //   - status 204 No Content
    //   - Access-Control-Allow-Origin present
    //   - Access-Control-Allow-Methods includes POST
    //   - Access-Control-Allow-Headers includes Content-Type
    let (addr, handle, path) = spawn_http_server("cors-preflight", 1);

    let response = send(
        &addr,
        "OPTIONS",
        "/query",
        &[
            ("Origin", "http://localhost:5173"),
            ("Access-Control-Request-Method", "POST"),
            ("Access-Control-Request-Headers", "Content-Type"),
        ],
    );

    assert_eq!(
        response.status,
        204,
        "expected 204 on OPTIONS preflight; got headers: {:?}, body: {}",
        response.headers,
        String::from_utf8_lossy(&response.body)
    );
    let acao = response
        .headers
        .get("access-control-allow-origin")
        .unwrap_or_else(|| panic!("preflight missing ACAO: {:?}", response.headers));
    assert_eq!(
        acao, "http://localhost:5173",
        "preflight ACAO must reflect the localhost origin"
    );
    let methods = response
        .headers
        .get("access-control-allow-methods")
        .expect("preflight missing Access-Control-Allow-Methods");
    assert!(
        methods.to_ascii_uppercase().contains("POST"),
        "preflight Access-Control-Allow-Methods must include POST, got: {methods}"
    );
    let allow_headers = response
        .headers
        .get("access-control-allow-headers")
        .expect("preflight missing Access-Control-Allow-Headers");
    assert!(
        allow_headers.to_ascii_lowercase().contains("content-type"),
        "preflight Access-Control-Allow-Headers must include Content-Type, got: {allow_headers}"
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
