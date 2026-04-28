//! Integration tests for the GET /metrics Prometheus endpoint.
//!
//! Coverage:
//!   * Endpoint returns Prometheus text format (Content-Type text/plain).
//!   * All six required metric families are visible after a single scrape.
//!   * `ogdb_requests_total` counter increments after a real request to a
//!     working route (here: GET /schema, the closest equivalent to the spec's
//!     /api/schema — this server has no /api prefix).
//!   * Histograms appear with their TYPE line even when no observations have
//!     been recorded yet (the registry must not silently drop them).

use ogdb_cli::run;
use std::env;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const REQUIRED_FAMILIES: [&str; 7] = [
    "ogdb_requests_total",
    "ogdb_request_duration_seconds",
    "ogdb_wal_fsync_duration_seconds",
    "ogdb_txn_active",
    "ogdb_node_count",
    "ogdb_edge_count",
    "ogdb_meta_json_bytes",
];

fn temp_db_path(tag: &str) -> PathBuf {
    let mut path = env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-prom-{tag}-{}-{ts}.ogdb", process::id()));
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

/// Send a request and read the full response (status, content-type header, body).
fn send_request(addr: &str, method: &str, path: &str) -> (u16, String, String) {
    let mut stream = connect_with_retry(addr);
    let request = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n",);
    stream.write_all(request.as_bytes()).expect("write request");
    stream.flush().expect("flush request");

    let mut reader = BufReader::new(&mut stream);
    let mut status_line = String::new();
    reader.read_line(&mut status_line).expect("status line");
    let status: u16 = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let mut content_type = String::new();
    loop {
        let mut header = String::new();
        let bytes = reader.read_line(&mut header).expect("header line");
        if bytes == 0 || header == "\r\n" || header == "\n" {
            break;
        }
        if header.to_ascii_lowercase().starts_with("content-type:") {
            content_type = header
                .split_once(':')
                .map(|x| x.1)
                .map(|v| v.trim().to_string())
                .unwrap_or_default();
        }
    }
    let mut body = Vec::new();
    let _ = reader.read_to_end(&mut body);
    (
        status,
        content_type,
        String::from_utf8_lossy(&body).into_owned(),
    )
}

/// Count metric families by scanning unique `# TYPE <name> ...` lines. This is
/// the canonical way to enumerate families in Prometheus exposition format —
/// counting bare `ogdb_*` lines would double-count histogram bucket lines.
fn count_metric_families(body: &str) -> usize {
    let mut families = std::collections::HashSet::new();
    for line in body.lines() {
        if let Some(rest) = line.strip_prefix("# TYPE ") {
            if let Some(name) = rest.split_whitespace().next() {
                families.insert(name.to_string());
            }
        }
    }
    families.len()
}

/// Parse an `ogdb_requests_total{...} N` line and return N. Used to verify the
/// counter incremented after a real request — not just that the line exists.
fn requests_total_for_route(body: &str, route_substr: &str) -> u64 {
    for line in body.lines() {
        if line.starts_with("ogdb_requests_total{") && line.contains(route_substr) {
            if let Some(value) = line.split_whitespace().last() {
                if let Ok(n) = value.parse::<u64>() {
                    return n;
                }
            }
        }
    }
    0
}

#[test]
fn metrics_endpoint_exposes_prometheus_format() {
    // Budget: /schema (warm-up route) + /metrics (initial scrape) + /metrics
    // (post-counter scrape) = 3 requests. spawn_http_server caps the loop at
    // this count so `serve` returns cleanly.
    let (addr, handle, path) = spawn_http_server("metrics", 3);

    // 1. Hit a working route to populate the counter. The spec mentions
    //    /api/schema but this server exposes the catalog at /schema; same
    //    intent (read-only label/edge-type/property-key listing).
    let (schema_status, _, _) = send_request(&addr, "GET", "/schema");
    assert_eq!(schema_status, 200, "schema route should succeed");

    // 2. First scrape: confirm endpoint shape and that all required families
    //    appear in the registry output.
    let (status, content_type, body) = send_request(&addr, "GET", "/metrics");
    assert_eq!(status, 200, "metrics endpoint should return 200");
    assert!(
        content_type.starts_with("text/plain"),
        "expected text/plain Prometheus exposition; got `{content_type}`",
    );

    let family_count = count_metric_families(&body);
    assert!(
        family_count >= 6,
        "expected ≥6 metric families, got {family_count}; body:\n{body}",
    );

    for name in REQUIRED_FAMILIES {
        assert!(
            body.contains(&format!("# TYPE {name} ")),
            "required metric family `{name}` missing from /metrics output:\n{body}",
        );
    }

    // 3. Verify the request counter actually incremented for /schema. We did
    //    one /schema call (above) plus one /metrics call. The /metrics call
    //    has not yet been counted (its own counter increment happens AFTER
    //    the response is built), so /schema should be at exactly 1 here.
    let schema_count = requests_total_for_route(&body, "GET /schema");
    assert!(
        schema_count >= 1,
        "expected ogdb_requests_total for GET /schema to be >=1, got {schema_count}; body:\n{body}",
    );

    // 4. Second scrape — confirms the prior /metrics request itself was
    //    counted (proves the counter wraps the dispatch path uniformly).
    let (_, _, body2) = send_request(&addr, "GET", "/metrics");
    let metrics_count = requests_total_for_route(&body2, "GET /metrics");
    assert!(
        metrics_count >= 1,
        "expected ogdb_requests_total for GET /metrics to be >=1, got {metrics_count}; body:\n{body2}",
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed: {}",
        serve_result.stderr,
    );
    cleanup(&path);
}
