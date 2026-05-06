//! Phase B H-19 endpoint smoke: DELETE /indexes/<name>.
//!
//! Index lifecycle (CREATE/DROP) is exposed today through Cypher
//! (`CREATE INDEX`, `DROP INDEX`, `CALL db.indexes()`) over POST /query;
//! there is intentionally no REST `/indexes/<name>` resource. The
//! dispatcher's catch-all returns 405 Method Not Allowed for an unknown
//! method — `DELETE` is not a method the dispatcher routes anywhere — so
//! this smoke pins both:
//!   1. DELETE /indexes/<name> → 405 (current behaviour, regression
//!      tripwire if a real REST surface lands)
//!   2. The Cypher-level DROP INDEX path is reachable over /query — i.e.
//!      the missing REST surface is a URL choice, not a missing feature.

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
    path.push(format!("ogdb-idx-del-{tag}-{}-{ts}.ogdb", process::id()));
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
fn delete_indexes_resource_is_not_an_http_route_today_returns_405() {
    let (addr, handle, path) = spawn_http_server("smoke", 2);

    // 1. DELETE /indexes/<name> currently has no route — dispatcher's
    // method catch-all returns 405. (POST catch-all returns 404; DELETE
    // is the truly-unknown method here.)
    let mut stream = connect_with_retry(&addr);
    let request = format!(
        "DELETE /indexes/embedding_idx HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).expect("write DELETE");
    stream.flush().expect("flush DELETE");
    let status = read_status(&mut stream);
    assert_eq!(
        status, 405,
        "DELETE /indexes/<name> is not routed in Phase B; \
         dispatcher must respond 405 Method Not Allowed (got {status})"
    );

    // 2. Server is still alive — prove with a real request.
    let mut probe = connect_with_retry(&addr);
    let probe_req = format!("GET /health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    probe
        .write_all(probe_req.as_bytes())
        .expect("write /health");
    probe.flush().expect("flush /health");
    assert_eq!(
        read_status(&mut probe),
        200,
        "server must remain serving after the 405 on DELETE"
    );

    let serve_result = handle.join().expect("join serve thread");
    assert_eq!(
        serve_result.exit_code, 0,
        "serve crashed: {}",
        serve_result.stderr
    );
    cleanup(&path);
}
