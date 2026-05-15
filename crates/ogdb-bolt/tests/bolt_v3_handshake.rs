//! Phase 1 (Bolt v3/v4/v5 upgrade plan, 2026-05-08): v3 handshake + HELLO.
//!
//! Asserts that:
//! 1. A client offering Bolt v3 in its preferred slot gets `0x00000003`
//!    back from the server (today's `lib.rs:187` only matches `0x00000001`
//!    and would return `0x00000000`, dropping the connection).
//! 2. The server accepts a v3 `HELLO` (tag `0x01`) carrying an `extra`
//!    Dictionary with arbitrary unknown keys (real drivers send
//!    `user_agent`, `bolt_agent`, `routing`, `notifications_*`, etc.) and
//!    replies with `SUCCESS{server, connection_id}`.
//! 3. Subsequent `RUN`/`PULL_ALL` against the v3 connection round-trips.

use ogdb_bolt::{packstream_encode, serve, BoltError, PackStructure, PackValue};
use ogdb_core::{Header, SharedDatabase};
use std::collections::BTreeMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MSG_HELLO: u8 = 0x01;
const MSG_RUN: u8 = 0x10;
const MSG_PULL_ALL: u8 = 0x3F;
const MSG_SUCCESS: u8 = 0x70;
const MSG_RECORD: u8 = 0x71;

fn temp_db_path(tag: &str) -> PathBuf {
    let mut path = env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-boltv3-{tag}-{}-{ts}.ogdb", process::id()));
    path
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    for suffix in [
        "-wal",
        "-meta.json",
        "-props-meta.json",
        "-free-list.json",
        "-csr-layout.json",
        "-props.ogdb",
        "-props-freelist.json",
        "-compression.json",
    ] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
}

fn structure(signature: u8, fields: Vec<PackValue>) -> PackValue {
    PackValue::Structure(PackStructure { signature, fields })
}

fn encode(value: &PackValue) -> Result<Vec<u8>, BoltError> {
    packstream_encode(value)
}

fn write_message(stream: &mut TcpStream, payload: &[u8]) {
    let len = (payload.len() as u16).to_be_bytes();
    stream.write_all(&len).expect("write chunk len");
    stream.write_all(payload).expect("write chunk body");
    stream.write_all(&[0u8, 0u8]).expect("write end-of-msg");
    stream.flush().expect("flush message");
}

fn read_message(stream: &mut TcpStream) -> Vec<u8> {
    let mut payload = Vec::new();
    loop {
        let mut len_buf = [0u8; 2];
        stream.read_exact(&mut len_buf).expect("read chunk len");
        let len = u16::from_be_bytes(len_buf);
        if len == 0 {
            return payload;
        }
        let mut chunk = vec![0u8; len as usize];
        stream.read_exact(&mut chunk).expect("read chunk body");
        payload.extend_from_slice(&chunk);
    }
}

fn message_signature(payload: &[u8]) -> u8 {
    assert!(payload.len() >= 2, "message payload too short");
    payload[1]
}

fn connect_with_retry(addr: &str) -> TcpStream {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if let Ok(stream) = TcpStream::connect(addr) {
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .expect("set read timeout");
            stream
                .set_write_timeout(Some(Duration::from_secs(5)))
                .expect("set write timeout");
            return stream;
        }
        thread::sleep(Duration::from_millis(20));
    }
    panic!("could not connect to bolt at {addr}");
}

#[test]
fn server_negotiates_v3_and_accepts_hello_with_extra_dict() {
    let path = temp_db_path("smoke");
    let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");

    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe");
    let bind_addr = probe.local_addr().expect("probe addr").to_string();
    drop(probe);

    let shared_for_serve = shared.clone();
    let addr_for_serve = bind_addr.clone();
    let server = thread::spawn(move || serve(shared_for_serve, &addr_for_serve, Some(1)));

    let mut client = connect_with_retry(&bind_addr);

    // Handshake: prefer v3, then v1 (real Neo4j 5 drivers offer the same
    // shape: 4 slots, big-endian, preferred first).
    let mut handshake = Vec::with_capacity(20);
    handshake.extend_from_slice(&[0x60, 0x60, 0xB0, 0x17]);
    handshake.extend_from_slice(&3u32.to_be_bytes()); // v3
    handshake.extend_from_slice(&1u32.to_be_bytes()); // v1 fallback
    handshake.extend_from_slice(&0u32.to_be_bytes());
    handshake.extend_from_slice(&0u32.to_be_bytes());
    client.write_all(&handshake).expect("write handshake");
    client.flush().expect("flush handshake");

    let mut negotiated = [0u8; 4];
    client
        .read_exact(&mut negotiated)
        .expect("read negotiated version");
    assert_eq!(
        u32::from_be_bytes(negotiated),
        3,
        "server must negotiate v3 when client prefers it (was v1-only before phase 1)"
    );

    // HELLO with extra-dict including keys the server does not know — real
    // drivers send all of these unconditionally and the server must
    // accept-and-ignore unknown entries per Bolt v3+ spec.
    let mut extra = BTreeMap::<String, PackValue>::new();
    extra.insert(
        "user_agent".to_string(),
        PackValue::String("ogdb-bolt-v3-smoke/0.1".to_string()),
    );
    extra.insert("scheme".to_string(), PackValue::String("none".to_string()));
    extra.insert(
        "routing".to_string(),
        PackValue::Map(BTreeMap::new()),
    );
    extra.insert(
        "notifications_minimum_severity".to_string(),
        PackValue::String("WARNING".to_string()),
    );
    let hello = encode(&structure(MSG_HELLO, vec![PackValue::Map(extra)]))
        .expect("encode hello");
    write_message(&mut client, &hello);
    let hello_resp = read_message(&mut client);
    assert_eq!(
        message_signature(&hello_resp),
        MSG_SUCCESS,
        "HELLO with extra dict (incl. unknown keys) must respond SUCCESS"
    );

    // RUN + PULL_ALL — proves the v3 connection routes to the same auto-commit
    // path as v1 once HELLO has authenticated.
    let run = encode(&structure(
        MSG_RUN,
        vec![
            PackValue::String("RETURN 1 AS one".to_string()),
            PackValue::Map(BTreeMap::new()),
        ],
    ))
    .expect("encode run");
    write_message(&mut client, &run);
    let run_resp = read_message(&mut client);
    assert_eq!(
        message_signature(&run_resp),
        MSG_SUCCESS,
        "RUN on v3 connection must succeed"
    );

    let pull = encode(&structure(MSG_PULL_ALL, vec![])).expect("encode pull_all");
    write_message(&mut client, &pull);
    let record = read_message(&mut client);
    assert_eq!(
        message_signature(&record),
        MSG_RECORD,
        "PULL_ALL on v3 must stream RETURN 1 RECORD"
    );
    let pull_summary = read_message(&mut client);
    assert_eq!(message_signature(&pull_summary), MSG_SUCCESS);

    let processed = server.join().expect("join bolt server").expect("serve ok");
    assert_eq!(processed, 1);

    cleanup(&path);
}
