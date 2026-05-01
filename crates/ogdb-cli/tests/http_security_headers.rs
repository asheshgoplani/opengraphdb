//! EVAL-FRONTEND-QUALITY-CYCLE2.md BLOCKER-2 + H-6 regression suite.
//!
//! BLOCKER-2 — embedded HTTP server must serve precompressed `.br` / `.gz`
//! siblings from the SPA dist when the client advertises support, and emit
//! `Content-Encoding` + `Vary: Accept-Encoding` so caches and clients
//! agree on the body shape.
//!
//! H-6 — every response (whether SPA, API, or error) must carry the
//! baseline security headers: `Content-Security-Policy`, `X-Frame-Options`,
//! `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. The
//! playground accepts user-supplied RDF/Turtle, so an XSS attempt in a
//! literal value must be gated by CSP at minimum.

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
    path.push(format!("ogdb-c2-headers-{tag}-{}-{ts}.ogdb", process::id()));
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

fn read_full_response(stream: &mut TcpStream) -> (u16, String, Vec<u8>) {
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).expect("read response bytes");
    // Locate the header/body boundary on the raw bytes — body may be
    // gzip/brotli, which is not utf-8.
    let sep = b"\r\n\r\n";
    let head_end = (0..raw.len())
        .position(|i| raw[i..].starts_with(sep))
        .map(|i| i + sep.len())
        .unwrap_or(raw.len());
    let head = String::from_utf8_lossy(&raw[..head_end]).into_owned();
    let body = raw[head_end..].to_vec();
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .expect("status code");
    (status, head, body)
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

// ---- H-6 -------------------------------------------------------------------

#[test]
fn responses_include_baseline_security_headers() {
    let (addr, handle, path) = spawn_http_server("sec-baseline", 1);

    let mut stream = connect_with_retry(&addr);
    let request = format!("GET /health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .expect("write GET /health");
    stream.flush().expect("flush GET /health");

    let (status, head, _body) = read_full_response(&mut stream);
    assert_eq!(status, 200, "GET /health must succeed; head={head:?}");

    let csp = header_value(&head, "content-security-policy").unwrap_or("");
    assert!(
        csp.contains("default-src 'self'"),
        "Content-Security-Policy must default-src 'self'; got {csp:?}"
    );
    assert!(
        csp.contains("frame-ancestors 'none'"),
        "Content-Security-Policy must deny framing; got {csp:?}"
    );
    assert!(
        csp.contains("connect-src 'self' http://localhost:* http://127.0.0.1:*"),
        "Content-Security-Policy must allow embedded console → local sibling API; got {csp:?}"
    );
    assert!(
        csp.contains("worker-src 'self' blob:"),
        "Content-Security-Policy must allow blob workers (deck.gl); got {csp:?}"
    );

    let xfo = header_value(&head, "x-frame-options").unwrap_or("");
    assert_eq!(
        xfo, "DENY",
        "X-Frame-Options must be DENY (defense-in-depth with CSP frame-ancestors); got {xfo:?}"
    );

    let xcto = header_value(&head, "x-content-type-options").unwrap_or("");
    assert_eq!(
        xcto, "nosniff",
        "X-Content-Type-Options must be nosniff; got {xcto:?}"
    );

    let referrer = header_value(&head, "referrer-policy").unwrap_or("");
    assert!(
        referrer.contains("strict-origin"),
        "Referrer-Policy must be strict-origin-*; got {referrer:?}"
    );

    let permissions = header_value(&head, "permissions-policy").unwrap_or("");
    assert!(
        permissions.contains("geolocation=()")
            && permissions.contains("camera=()")
            && permissions.contains("microphone=()")
            && permissions.contains("payment=()"),
        "Permissions-Policy must deny geolocation + camera + microphone + payment by default; got {permissions:?}"
    );

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero: {}",
        serve_result.stderr
    );
    cleanup(&path);
}

// ---- BLOCKER-2 -------------------------------------------------------------

#[test]
fn responses_advertise_vary_when_serving_precompressed_asset() {
    // When the SPA is embedded with precompressed `.br` / `.gz` siblings
    // (production builds), the server must add both `Content-Encoding`
    // and `Vary: Accept-Encoding`. When the SPA dist is empty (the
    // default test build per build.rs), the server falls back to the
    // missing-SPA stub which is uncompressed; in that case neither
    // header should appear, but the request must still succeed and
    // carry the H-6 security headers.
    let (addr, handle, path) = spawn_http_server("encoding-negotiation", 1);

    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "GET / HTTP/1.1\r\n\
         Host: {addr}\r\n\
         Accept-Encoding: br, gzip\r\n\
         Connection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).expect("write GET /");
    stream.flush().expect("flush GET /");

    let (status, head, body) = read_full_response(&mut stream);
    assert_eq!(status, 200, "GET / must succeed; head={head:?}");

    // Security headers must appear on the SPA route too — same writer
    // emits all responses.
    assert!(
        head.to_ascii_lowercase()
            .contains("content-security-policy:"),
        "SPA root response must carry CSP; head={head:?}"
    );

    let encoding = header_value(&head, "content-encoding");
    let vary = header_value(&head, "vary");
    if let Some(enc) = encoding {
        assert!(
            enc == "br" || enc == "gzip",
            "Content-Encoding must be br or gzip when set; got {enc:?}"
        );
        let vary_lc = vary.unwrap_or("").to_ascii_lowercase();
        assert!(
            vary_lc.contains("accept-encoding"),
            "Vary must include Accept-Encoding when Content-Encoding is set; got Vary={vary:?}"
        );
        // Body should be compressed bytes; not parseable as utf-8 HTML.
        assert!(
            !body.starts_with(b"<!doctype html>"),
            "Body for {enc} response must be compressed, not raw HTML"
        );
    } else {
        // Default test build (no dist-app embedded). The serve path falls
        // through to the missing-SPA stub which is uncompressed. Verify
        // that path still works end-to-end.
        assert!(
            std::str::from_utf8(&body)
                .ok()
                .map(|s| s.contains("<!doctype html>"))
                .unwrap_or(false),
            "Without dist-app the missing-SPA stub must still be returned"
        );
    }

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve exit nonzero: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
