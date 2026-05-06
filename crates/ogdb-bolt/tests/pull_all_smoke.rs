//! Phase B H-19 endpoint smoke: Bolt MSG_PULL_ALL (0x3F) — drives a single
//! RUN → PULL_ALL exchange against a live `serve` and verifies the protocol
//! emits at least one RECORD plus a SUCCESS summary frame for a non-empty
//! result set. Pre-Phase-B, the in-source unit test at `serve_supports_run_
//! pull_all_and_ack_failure_flow` exercised this in-tree but no external
//! integration test pinned the public-API path.

use ogdb_bolt::{packstream_encode, serve, BoltError, PackStructure, PackValue, BOLT_VERSION_1};
use ogdb_core::{Header, PropertyMap, PropertyValue, SharedDatabase};
use std::collections::BTreeMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MSG_INIT: u8 = 0x01;
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
    path.push(format!("ogdb-pull-all-{tag}-{}-{ts}.ogdb", process::id()));
    path
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-meta.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-props-meta.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-free-list.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-csr-layout.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-props.ogdb", path.display()));
    let _ = std::fs::remove_file(format!("{}-props-freelist.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-compression.json", path.display()));
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
fn pull_all_emits_records_and_success_summary() {
    let path = temp_db_path("smoke");
    let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");
    shared
        .with_write(|db| {
            db.create_node_with(
                &["Person".to_string()],
                &PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("Alice".to_string()),
                )]),
            )?;
            Ok(())
        })
        .expect("seed graph");

    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe");
    let bind_addr = probe.local_addr().expect("probe addr").to_string();
    drop(probe);

    let shared_for_serve = shared.clone();
    let addr_for_serve = bind_addr.clone();
    let server = thread::spawn(move || serve(shared_for_serve, &addr_for_serve, Some(1)));

    let mut client = connect_with_retry(&bind_addr);

    client
        .write_all(&[
            0x60, 0x60, 0xB0, 0x17, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ])
        .expect("write handshake");
    client.flush().expect("flush handshake");
    let mut negotiated = [0u8; 4];
    client
        .read_exact(&mut negotiated)
        .expect("read negotiated version");
    assert_eq!(u32::from_be_bytes(negotiated), BOLT_VERSION_1);

    let init = encode(&structure(
        MSG_INIT,
        vec![
            PackValue::String("ogdb-pull-all-smoke".to_string()),
            PackValue::String(String::new()),
        ],
    ))
    .expect("encode init");
    write_message(&mut client, &init);
    let init_resp = read_message(&mut client);
    assert_eq!(message_signature(&init_resp), MSG_SUCCESS);

    let run = encode(&structure(
        MSG_RUN,
        vec![
            PackValue::String("MATCH (n:Person) RETURN n.name AS name".to_string()),
            PackValue::Map(BTreeMap::new()),
        ],
    ))
    .expect("encode run");
    write_message(&mut client, &run);
    let run_resp = read_message(&mut client);
    assert_eq!(
        message_signature(&run_resp),
        MSG_SUCCESS,
        "RUN should succeed before PULL_ALL"
    );

    let pull = encode(&structure(MSG_PULL_ALL, vec![])).expect("encode pull_all");
    write_message(&mut client, &pull);

    let record = read_message(&mut client);
    assert_eq!(
        message_signature(&record),
        MSG_RECORD,
        "PULL_ALL must stream at least one RECORD frame for a non-empty result"
    );
    assert!(
        record.windows(b"Alice".len()).any(|w| w == b"Alice"),
        "RECORD frame should carry the seeded name `Alice`"
    );

    let summary = read_message(&mut client);
    assert_eq!(
        message_signature(&summary),
        MSG_SUCCESS,
        "PULL_ALL must finish with a SUCCESS summary frame"
    );

    let processed = server.join().expect("join bolt server").expect("serve ok");
    assert_eq!(processed, 1, "serve should count exactly one request");

    cleanup(&path);
}
