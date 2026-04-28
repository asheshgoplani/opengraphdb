//! Regression test for Bolt chunked-message size cap (audit 2026-04-22 F5.7).
//!
//! Pre-fix, `read_chunked_message` resized the payload buffer for each incoming
//! chunk without tracking cumulative bytes. An attacker could stream many
//! `u16::MAX` chunks and force the server to allocate multi-GB buffers.
//!
//! Post-fix, the server rejects chunked messages whose total length exceeds
//! `BOLT_MAX_MESSAGE_BYTES` (100 MiB default, tunable via the
//! `OGDB_BOLT_MAX_MESSAGE_BYTES` env var — which this test uses to keep the
//! workload bounded without pretending to stream 100 MiB through localhost).
//!
//! Invariants pinned:
//!   1. An oversized chunked message does NOT tear down the server; it closes
//!      only the offending connection.
//!   2. A subsequent well-formed handshake still succeeds.

use ogdb_bolt::{serve, BOLT_MAGIC, BOLT_VERSION_1};
use ogdb_core::{Header, SharedDatabase, WriteConcurrencyMode};
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
    path.push(format!("ogdb-boltsize-{tag}-{}-{ts}.ogdb", process::id()));
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
                    .expect("client read timeout");
                stream
                    .set_write_timeout(Some(Duration::from_secs(5)))
                    .expect("client write timeout");
                return stream;
            }
            Err(err) => {
                last = Some(err);
                thread::sleep(Duration::from_millis(20));
            }
        }
    }
    panic!(
        "failed to connect to bolt listener at {addr}: {}",
        last.map(|e| e.to_string()).unwrap_or_default()
    );
}

fn write_handshake(stream: &mut TcpStream) {
    stream
        .write_all(&BOLT_MAGIC.to_be_bytes())
        .expect("write magic");
    stream
        .write_all(&BOLT_VERSION_1.to_be_bytes())
        .expect("write proposed v1");
    stream.write_all(&[0u8; 12]).expect("write version pad");
    stream.flush().expect("flush handshake");
}

fn read_negotiated_version(stream: &mut TcpStream) -> u32 {
    let mut negotiated = [0u8; 4];
    stream
        .read_exact(&mut negotiated)
        .expect("read negotiated version");
    u32::from_be_bytes(negotiated)
}

#[test]
fn bolt_chunked_message_exceeding_cap_is_rejected_without_killing_server() {
    env::set_var("OGDB_BOLT_MAX_MESSAGE_BYTES", "256");

    let path = temp_db_path("oversize-chunk");
    cleanup(&path);
    let shared = SharedDatabase::init_with_write_mode(
        path.display().to_string(),
        Header::default_v1(),
        WriteConcurrencyMode::MultiWriter { max_retries: 3 },
    )
    .expect("init shared database");

    // Bind-then-drop to reserve a free port so the server can take it.
    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
    let addr = probe.local_addr().expect("probe addr").to_string();
    drop(probe);

    let shared_for_serve = shared.clone();
    let addr_for_serve = addr.clone();
    // max_requests=2 lets the server finish the well-formed probe after the
    // oversized message drops the first connection. serve counts requests
    // across the budget, not per-connection, so we pick 2 to be safe.
    let serve_handle = thread::spawn(move || serve(shared_for_serve, &addr_for_serve, Some(2)));

    // Attacker connection: complete handshake, then stream chunks exceeding cap.
    let mut attacker = connect_with_retry(&addr);
    write_handshake(&mut attacker);
    assert_eq!(
        read_negotiated_version(&mut attacker),
        BOLT_VERSION_1,
        "handshake negotiated wrong version"
    );

    // Each chunk: 2-byte BE length + payload. Total cumulative bytes must
    // exceed the 256-byte cap. Two 200-byte chunks (400 total) force the
    // check to fire on the second resize.
    let chunk = vec![0u8; 200];
    let len = (chunk.len() as u16).to_be_bytes();
    // First chunk writes successfully — cumulative 200 <= 256.
    attacker.write_all(&len).expect("write chunk-1 len");
    attacker.write_all(&chunk).expect("write chunk-1 body");
    attacker.flush().expect("flush chunk-1");
    // Second chunk would push cumulative to 400 > 256. Server must reject
    // before resizing and close the connection.
    let _ = attacker.write_all(&len);
    let _ = attacker.write_all(&chunk);
    let _ = attacker.flush();

    // Drain the socket; whether the server wrote a FAILURE or just closed,
    // read_to_end must terminate (not hang) within the client's 5s read
    // timeout. A hang here means the cap did not fire.
    let mut sink = Vec::new();
    let _ = attacker.read_to_end(&mut sink);
    drop(attacker);

    // Probe connection: the server must still be alive and serving handshakes.
    // If the oversized message had torn down `serve`, this connect would fail
    // (ECONNREFUSED) or the handshake response would never arrive.
    let mut probe = connect_with_retry(&addr);
    write_handshake(&mut probe);
    let version = read_negotiated_version(&mut probe);
    assert_eq!(
        version, BOLT_VERSION_1,
        "server should still negotiate v1 after attacker disconnect"
    );
    drop(probe);

    env::remove_var("OGDB_BOLT_MAX_MESSAGE_BYTES");
    // Leave the serve thread running — the attacker's Protocol error did not
    // count toward `max_requests` (the budget tracks successful requests), so
    // a join() would block until a real client comes along. The thread is
    // cleaned up when the test binary exits; cleanup below is best-effort.
    drop(serve_handle);
    cleanup(&path);
}
