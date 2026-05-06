//! Phase B H-19 endpoint smoke: POST /backup.
//!
//! As of Phase B, backup is exposed as a CLI subcommand (`ogdb backup`) but
//! NOT as a first-class HTTP route — the catch-all `("POST", _)` arm in
//! `crates/ogdb-cli/src/lib.rs` returns 404 with body `unknown endpoint:
//! /backup`. This smoke test pins that contract: the server must respond
//! 404 (not crash, not 500, not silently succeed) for an unknown POST and
//! must remain serving afterward. If a future change actually wires
//! POST /backup, this test will fail loudly and be the right place to
//! retarget the assertion.

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
    path.push(format!("ogdb-http-backup-{tag}-{}-{ts}.ogdb", process::id()));
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

fn read_status_line(stream: &mut TcpStream) -> Option<u16> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    let bytes = reader.read_line(&mut line).ok()?;
    if bytes == 0 {
        return None;
    }
    let status = line.split_whitespace().nth(1)?.parse::<u16>().ok()?;
    let mut sink = Vec::new();
    let _ = reader.read_to_end(&mut sink);
    Some(status)
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
fn post_backup_is_not_an_http_route_today_returns_404() {
    let (addr, handle, path) = spawn_http_server("smoke", 2);

    let mut stream = connect_with_retry(&addr);
    let body = b"{}";
    let request = format!(
        "POST /backup HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .expect("write POST /backup head");
    stream.write_all(body).expect("write POST /backup body");
    stream.flush().expect("flush request");

    let status = read_status_line(&mut stream).expect("read status line");
    assert_eq!(
        status, 404,
        "POST /backup is intentionally not an HTTP route in Phase B; \
         the catch-all must return 404 unknown endpoint"
    );

    // Server must still be serving — prove it with /health.
    let mut probe = connect_with_retry(&addr);
    let probe_req = format!("GET /health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    probe
        .write_all(probe_req.as_bytes())
        .expect("write /health");
    probe.flush().expect("flush /health");
    let probe_status = read_status_line(&mut probe).expect("read /health status");
    assert_eq!(
        probe_status, 200,
        "server must remain alive after 404 on unknown route"
    );

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
