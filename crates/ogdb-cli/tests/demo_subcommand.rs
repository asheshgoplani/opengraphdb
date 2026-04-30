//! Slice S8: `ogdb demo` subcommand contract.
//!
//! `ogdb demo` is the one-shot zero-config entrypoint. It must:
//!   1. Boot a writable database at `--db` (creating it if absent).
//!   2. Seed the canonical movielens fixture so a fresh user sees real data.
//!   3. Start the HTTP server (the same one `ogdb serve --http` runs).
//!   4. Honor `--no-browser` for headless / CI use and `--max-requests` for tests.
//!
//! The test spawns `ogdb demo` as a subprocess, reads stderr until the
//! `listening on http://...` line surfaces (port=0 → OS assigns), then issues
//! `GET /schema` and asserts the catalog reports movielens labels (Movie/User).
//! Anything less would let a regression silently ship a demo that opens a
//! browser to an empty playground.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

fn read_listening_addr(stderr: &mut dyn BufRead, deadline: Instant) -> String {
    let mut line = String::new();
    while Instant::now() < deadline {
        line.clear();
        let n = stderr.read_line(&mut line).expect("read demo stderr");
        if n == 0 {
            thread::sleep(Duration::from_millis(20));
            continue;
        }
        if let Some(rest) = line.trim().strip_prefix("listening on http://") {
            return rest.to_string();
        }
    }
    panic!("demo subcommand never logged 'listening on http://...' within deadline");
}

fn http_get(addr: &str, path: &str) -> (u16, String) {
    let mut stream = TcpStream::connect(addr).expect("connect to demo http server");
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("set read timeout");
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .expect("set write timeout");
    let request = format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).expect("write request");
    stream.flush().expect("flush request");

    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).expect("read response");
    let text = String::from_utf8_lossy(&raw).into_owned();
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .expect("parse status");
    (status, body.to_string())
}

#[test]
fn demo_subcommand_starts_http_server_and_seeds_movielens() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path: PathBuf = dir.path().join("demo.ogdb");

    // --max-requests 1 covers the single GET /schema we send below; the
    // subprocess exits cleanly once that request is served.
    let mut child = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args([
            "demo",
            "--db",
            &db_path.display().to_string(),
            "--port",
            "0",
            "--no-browser",
            "--max-requests",
            "1",
        ])
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn ogdb demo");

    let stderr = child.stderr.take().expect("child stderr piped");
    let mut reader = BufReader::new(stderr);
    let deadline = Instant::now() + Duration::from_secs(30);
    let addr = read_listening_addr(&mut reader, deadline);

    let (status, body) = http_get(&addr, "/schema");
    assert_eq!(
        status, 200,
        "GET /schema must succeed against demo server; got {status} body={body}"
    );

    let json: serde_json::Value =
        serde_json::from_str(&body).expect("schema response must be JSON");
    let labels = json
        .get("labels")
        .and_then(|v| v.as_array())
        .expect("schema.labels must be an array");
    let label_names: Vec<&str> = labels.iter().filter_map(|v| v.as_str()).collect();
    // movielens.json carries Movie + Genre labels and IN_GENRE edges — both
    // must surface, otherwise the seed didn't run (or pointed at the wrong
    // fixture). User-presence isn't asserted: the canonical movielens.json
    // ships with movies and their genres, not user ratings, and the test
    // pins what the binary actually ships.
    assert!(
        label_names.contains(&"Movie"),
        "demo must seed movielens — expected `Movie` label in {label_names:?}"
    );
    assert!(
        label_names.contains(&"Genre"),
        "demo must seed movielens — expected `Genre` label in {label_names:?}"
    );
    let types = json
        .get("edge_types")
        .and_then(|v| v.as_array())
        .expect("schema.edge_types must be an array");
    let type_names: Vec<&str> = types.iter().filter_map(|v| v.as_str()).collect();
    assert!(
        type_names.contains(&"IN_GENRE"),
        "demo must seed movielens edges — expected `IN_GENRE` type in {type_names:?}"
    );

    // Drain the rest of stderr so the child can exit cleanly.
    let mut tail = String::new();
    let _ = reader.read_to_string(&mut tail);

    let status = child.wait().expect("wait for ogdb demo");
    assert!(
        status.success(),
        "ogdb demo exited with non-zero status: {status:?}"
    );
}
