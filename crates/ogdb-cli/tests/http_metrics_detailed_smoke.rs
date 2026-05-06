//! Phase B H-19 endpoint smoke: detailed `/metrics` surface.
//!
//! The Phase B HTTP server actually exposes THREE metric routes:
//!   * `GET /metrics`              — Prometheus text exposition (canonical
//!     `text/plain; version=0.0.4`)
//!   * `GET /metrics/json`         — explicit JSON detail for scripted
//!     scrapers; lists `node_count`, `edge_count`, `wal_size_bytes`,
//!     `compaction_count`, etc.
//!   * `GET /metrics/prometheus`   — alternate Prometheus rendering used by
//!     downstream dashboards
//!
//! The pre-Phase-B test surface only pinned the first; this smoke test
//! pins the JSON detail and the alt-Prometheus route so a regression that
//! drops or renames either surface fails before it ships.

use ogdb_cli::run;
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
    path.push(format!("ogdb-metrics-det-{tag}-{}-{ts}.ogdb", process::id()));
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
    while Instant::now() < deadline {
        if let Ok(stream) = TcpStream::connect(addr) {
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .expect("read timeout");
            stream
                .set_write_timeout(Some(Duration::from_secs(5)))
                .expect("write timeout");
            return stream;
        }
        thread::sleep(Duration::from_millis(20));
    }
    panic!("could not connect at {addr}");
}

fn send_get(addr: &str, path: &str) -> (u16, String, String) {
    let mut stream = connect_with_retry(addr);
    let request = format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
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
        let bytes = reader.read_line(&mut header).expect("header");
        if bytes == 0 || header == "\r\n" || header == "\n" {
            break;
        }
        if header.to_ascii_lowercase().starts_with("content-type:") {
            content_type = header
                .split_once(':')
                .map(|x| x.1.trim().to_string())
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

fn spawn_http_server(
    tag: &str,
    max_requests: u64,
) -> (String, thread::JoinHandle<ogdb_cli::CliResult>, PathBuf) {
    let path = temp_db_path(tag);
    cleanup(&path);
    let init = run(&["init".to_string(), path.display().to_string()]);
    assert_eq!(init.exit_code, 0, "init failed: {}", init.stderr);

    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe");
    let bind_addr = probe.local_addr().expect("probe addr").to_string();
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
fn metrics_json_endpoint_exposes_detailed_storage_counters() {
    let (addr, handle, path) = spawn_http_server("json", 2);

    let (status, ct, body) = send_get(&addr, "/metrics/json");
    assert_eq!(status, 200, "GET /metrics/json must succeed");
    assert!(
        ct.starts_with("application/json"),
        "Content-Type must be application/json; got `{ct}`"
    );
    let payload: Value = serde_json::from_str(&body).expect("body must be valid JSON");
    let object = payload
        .as_object()
        .expect("/metrics/json body must be a JSON object");

    // The detailed view must surface all the storage-level counters that
    // the simple Prometheus endpoint flattens — these names are the
    // contract the JSON scraper relies on.
    for required in [
        "format_version",
        "page_size",
        "page_count",
        "node_count",
        "edge_count",
        "wal_size_bytes",
        "adjacency_base_edge_count",
        "delta_buffer_edge_count",
        "compaction_count",
        "compaction_duration_us",
        "buffer_pool_hits",
        "buffer_pool_misses",
    ] {
        assert!(
            object.contains_key(required),
            "/metrics/json must expose `{required}`; got keys {:?}",
            object.keys().collect::<Vec<_>>()
        );
    }

    let (alt_status, alt_ct, alt_body) = send_get(&addr, "/metrics/prometheus");
    assert_eq!(alt_status, 200, "GET /metrics/prometheus must succeed");
    assert!(
        alt_ct.starts_with("text/plain"),
        "alt-prom Content-Type must be text/plain; got `{alt_ct}`"
    );
    assert!(
        !alt_body.trim().is_empty(),
        "alt-prom rendering must produce non-empty body"
    );

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
