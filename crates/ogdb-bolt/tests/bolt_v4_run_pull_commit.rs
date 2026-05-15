//! Phase 1 (Bolt v3/v4/v5 upgrade plan, 2026-05-08): v4.4 handshake,
//! explicit-transaction BEGIN → RUN → PULL{n,qid} → COMMIT round trip.
//!
//! Phase 1 keeps `ogdb-core`'s auto-commit semantics on every RUN; BEGIN
//! and COMMIT are state-machine stubs that gate one or more RUNs into a
//! conceptual transaction. The wire shape matches what the official Neo4j
//! Python driver 5.x emits when it negotiates v4.4 against us.
//!
//! Also asserts that the handshake handles **v4 minor-range slots** — a
//! single slot like `0x00040404` ("any v4.0–v4.4") must pick v4.4.

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
const MSG_BEGIN: u8 = 0x11;
const MSG_COMMIT: u8 = 0x12;
const MSG_PULL: u8 = 0x3F;
const MSG_SUCCESS: u8 = 0x70;
const MSG_RECORD: u8 = 0x71;

fn temp_db_path(tag: &str) -> PathBuf {
    let mut path = env::temp_dir();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-boltv4-{tag}-{}-{ts}.ogdb", process::id()));
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
fn server_negotiates_v4_4_minor_range_and_round_trips_explicit_tx() {
    let path = temp_db_path("smoke");
    let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");

    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe");
    let bind_addr = probe.local_addr().expect("probe addr").to_string();
    drop(probe);

    let shared_for_serve = shared.clone();
    let addr_for_serve = bind_addr.clone();
    let server = thread::spawn(move || serve(shared_for_serve, &addr_for_serve, Some(1)));

    let mut client = connect_with_retry(&bind_addr);

    // Handshake: one v4 minor-range slot meaning "any v4.0 through v4.4."
    // This is exactly what `neo4j-python-driver>=5` emits as its first slot
    // when it has dropped v5 support (or is on an older 5.x).
    let mut handshake = Vec::with_capacity(20);
    handshake.extend_from_slice(&[0x60, 0x60, 0xB0, 0x17]);
    // 0x00040404 = major=4, minor=4, range=4 → "v4.0..=v4.4"
    handshake.extend_from_slice(&0x0004_0404u32.to_be_bytes());
    handshake.extend_from_slice(&3u32.to_be_bytes()); // fallback v3
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
        0x0000_0404,
        "v4 minor-range slot must negotiate to bare v4.4"
    );

    // HELLO with extra-dict
    let mut extra = BTreeMap::<String, PackValue>::new();
    extra.insert(
        "user_agent".to_string(),
        PackValue::String("ogdb-bolt-v4-smoke/0.1".to_string()),
    );
    let hello =
        encode(&structure(MSG_HELLO, vec![PackValue::Map(extra)])).expect("encode hello");
    write_message(&mut client, &hello);
    let hello_resp = read_message(&mut client);
    assert_eq!(message_signature(&hello_resp), MSG_SUCCESS, "HELLO -> SUCCESS");

    // BEGIN + COMMIT on an empty conceptual transaction first — the Bolt v3+
    // spec allows BEGIN → COMMIT without any RUN in between. We close this
    // empty tx before issuing the request-counted RUN+PULL, otherwise
    // `serve(... Some(1))` exits the moment PULL increments the counter and
    // any subsequent COMMIT write hits a closed socket.
    let begin = encode(&structure(MSG_BEGIN, vec![PackValue::Map(BTreeMap::new())]))
        .expect("encode begin");
    write_message(&mut client, &begin);
    let begin_resp = read_message(&mut client);
    assert_eq!(message_signature(&begin_resp), MSG_SUCCESS, "BEGIN -> SUCCESS");

    let commit = encode(&structure(MSG_COMMIT, vec![])).expect("encode commit");
    write_message(&mut client, &commit);
    let commit_resp = read_message(&mut client);
    assert_eq!(
        message_signature(&commit_resp),
        MSG_SUCCESS,
        "COMMIT after BEGIN -> SUCCESS"
    );

    // Second BEGIN, this time with RUN + PULL inside. PULL is the only
    // request-counted frame in `serve`; it terminates the loop.
    let begin2 = encode(&structure(MSG_BEGIN, vec![PackValue::Map(BTreeMap::new())]))
        .expect("encode begin2");
    write_message(&mut client, &begin2);
    let begin2_resp = read_message(&mut client);
    assert_eq!(
        message_signature(&begin2_resp),
        MSG_SUCCESS,
        "second BEGIN -> SUCCESS"
    );

    // RUN — single-statement, auto-commits inside the conceptual tx.
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
    assert_eq!(message_signature(&run_resp), MSG_SUCCESS, "RUN -> SUCCESS");

    // PULL with v4 extra-dict {n, qid}. Phase 1 accepts-and-ignores the dict
    // and drains the full stream; the wire shape matches what real v4 drivers
    // send.
    let mut pull_extra = BTreeMap::<String, PackValue>::new();
    pull_extra.insert("n".to_string(), PackValue::Integer(-1));
    pull_extra.insert("qid".to_string(), PackValue::Integer(-1));
    let pull = encode(&structure(MSG_PULL, vec![PackValue::Map(pull_extra)]))
        .expect("encode pull");
    write_message(&mut client, &pull);
    let record = read_message(&mut client);
    assert_eq!(
        message_signature(&record),
        MSG_RECORD,
        "PULL{{n,qid}} on v4 must stream RETURN 1 RECORD"
    );
    let pull_summary = read_message(&mut client);
    assert_eq!(message_signature(&pull_summary), MSG_SUCCESS);

    let processed = server.join().expect("join bolt server").expect("serve ok");
    assert_eq!(processed, 1, "PULL is the only request-counted frame");

    cleanup(&path);
}
