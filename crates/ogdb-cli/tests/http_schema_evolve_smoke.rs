//! Phase B H-19 endpoint smoke: POST /schema/evolve.
//!
//! Schema evolution is exposed today only through the Cypher surface (DDL
//! statements via `POST /query`); there is intentionally no dedicated
//! `/schema/evolve` HTTP route. The catch-all `("POST", _)` arm in the
//! dispatcher returns 404 with body `unknown endpoint: /schema/evolve`.
//! This smoke pins that contract and proves the equivalent flow over
//! `/query` succeeds — schema mutation IS reachable, just at a different
//! URL. If a future change adds POST /schema/evolve, retarget the
//! 404-assertion at that point.

use ogdb_cli::run;
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
    path.push(format!(
        "ogdb-schema-evolve-{tag}-{}-{ts}.ogdb",
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

fn read_status(stream: &mut TcpStream) -> u16 {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).expect("status line");
    let status = line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .expect("parse status");
    let mut sink = Vec::new();
    let _ = reader.read_to_end(&mut sink);
    status
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
fn post_schema_evolve_is_not_an_http_route_today_returns_404() {
    let (addr, handle, path) = spawn_http_server("smoke", 3);

    // 1. POST /schema/evolve currently 404s — pin the catch-all behaviour.
    let mut stream = connect_with_retry(&addr);
    let body = b"{\"add_label\":\"NewLabel\"}";
    let request = format!(
        "POST /schema/evolve HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .expect("write evolve head");
    stream.write_all(body).expect("write evolve body");
    stream.flush().expect("flush request");
    let status = read_status(&mut stream);
    assert_eq!(
        status, 404,
        "POST /schema/evolve must currently return 404; route is not implemented"
    );

    // 2. The schema reading surface IS available — GET /schema returns 200
    // with a JSON catalog. This proves the schema endpoints aren't broken
    // wholesale; only /schema/evolve specifically is unrouted.
    let mut peek = connect_with_retry(&addr);
    let peek_req = format!("GET /schema HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    peek.write_all(peek_req.as_bytes())
        .expect("write GET /schema");
    peek.flush().expect("flush GET /schema");
    let peek_status = read_status(&mut peek);
    assert_eq!(peek_status, 200, "GET /schema must succeed");

    // 3. Schema mutation IS reachable via POST /query (the canonical path).
    // This proves we're not shipping a dead-end — the missing /schema/evolve
    // route is a URL choice, not a missing feature.
    let mut q = connect_with_retry(&addr);
    let q_body = b"{\"query\":\"CREATE (n:SmokeLabel) RETURN n\"}";
    let q_req = format!(
        "POST /query HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        q_body.len()
    );
    q.write_all(q_req.as_bytes()).expect("write query head");
    q.write_all(q_body).expect("write query body");
    q.flush().expect("flush query");
    let q_status = read_status(&mut q);
    assert_eq!(
        q_status, 200,
        "POST /query with schema-mutating Cypher must succeed (canonical evolution surface)"
    );

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
