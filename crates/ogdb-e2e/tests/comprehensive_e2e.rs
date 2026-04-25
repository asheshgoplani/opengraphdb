use ogdb_bolt::{
    packstream_decode, packstream_encode, serve as serve_bolt, PackStructure, PackValue,
    BOLT_MAGIC, BOLT_VERSION_1,
};
use ogdb_core::{
    CompressionAlgorithm, CompressionConfig, CompressionSetting, Database, DbRole, Header,
    PropertyMap, PropertyValue, SharedDatabase, ShortestPathOptions, VectorDistanceMetric,
};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::error::Error;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug)]
struct TestWorkspace {
    root: PathBuf,
}

impl TestWorkspace {
    fn new(tag: &str) -> Self {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("ogdb-e2e-{tag}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&root).expect("create test workspace");
        Self { root }
    }

    fn db_path(&self, name: &str) -> PathBuf {
        self.root.join(format!("{name}.ogdb"))
    }

    fn path(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }
}

impl Drop for TestWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn cli(args: &[String]) -> ogdb_cli::CliResult {
    ogdb_cli::run(args)
}

fn cli_ok(args: Vec<String>, context: &str) -> ogdb_cli::CliResult {
    let out = cli(&args);
    assert_eq!(
        out.exit_code,
        0,
        "{context} failed: stderr={}",
        out.stderr.trim()
    );
    out
}

fn parse_kv_u64(text: &str, key: &str) -> Option<u64> {
    for token in text.split_whitespace() {
        if let Some((k, raw)) = token.split_once('=') {
            if k.trim() == key {
                if let Ok(value) = raw.trim().parse::<u64>() {
                    return Some(value);
                }
            }
        }
    }
    None
}

fn connect_with_retry(addr: &str, timeout: Duration) -> TcpStream {
    let deadline = Instant::now() + timeout;
    loop {
        match TcpStream::connect(addr) {
            Ok(stream) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
                return stream;
            }
            Err(_) => {
                assert!(Instant::now() < deadline, "timed out connecting to {addr}");
                thread::sleep(Duration::from_millis(10));
            }
        }
    }
}

fn send_http_request(
    addr: &str,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: &[u8],
) -> (u16, String, Vec<u8>) {
    let mut stream = connect_with_retry(addr, Duration::from_secs(3));
    let mut request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Length: {}\r\n",
        body.len()
    );
    for (key, value) in headers {
        request.push_str(&format!("{key}: {value}\r\n"));
    }
    request.push_str("\r\n");
    stream
        .write_all(request.as_bytes())
        .expect("write http request headers");
    stream.write_all(body).expect("write http request body");
    stream.flush().expect("flush http request");

    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .expect("read complete http response");
    let header_end = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("http response header terminator")
        + 4;
    let header_text = String::from_utf8(raw[..header_end].to_vec()).expect("utf8 response header");
    let mut lines = header_text.split("\r\n").filter(|line| !line.is_empty());
    let status_line = lines.next().expect("http status line");
    let status = status_line
        .split_whitespace()
        .nth(1)
        .expect("http status code")
        .parse::<u16>()
        .expect("parse http status code");
    let mut content_type = String::new();
    for line in lines {
        if let Some((key, value)) = line.split_once(':') {
            if key.eq_ignore_ascii_case("content-type") {
                content_type = value.trim().to_string();
            }
        }
    }
    let body = raw[header_end..].to_vec();
    (status, content_type, body)
}

fn bolt_structure(signature: u8, fields: Vec<PackValue>) -> PackValue {
    PackValue::Structure(PackStructure { signature, fields })
}

fn bolt_write_message(stream: &mut TcpStream, payload: &[u8]) {
    let len = u16::try_from(payload.len()).expect("bolt payload too large");
    stream
        .write_all(&len.to_be_bytes())
        .expect("write bolt chunk length");
    stream.write_all(payload).expect("write bolt payload");
    stream
        .write_all(&[0u8, 0u8])
        .expect("write bolt message terminator");
    stream.flush().expect("flush bolt message");
}

fn bolt_read_message(stream: &mut TcpStream) -> Vec<u8> {
    let mut payload = Vec::new();
    loop {
        let mut len_buf = [0u8; 2];
        stream
            .read_exact(&mut len_buf)
            .expect("read bolt chunk length");
        let len = u16::from_be_bytes(len_buf) as usize;
        if len == 0 {
            break;
        }
        let mut chunk = vec![0u8; len];
        stream.read_exact(&mut chunk).expect("read bolt chunk");
        payload.extend_from_slice(&chunk);
    }
    payload
}

fn bolt_message_signature(payload: &[u8]) -> u8 {
    let (value, _) = packstream_decode(payload).expect("decode bolt packstream response");
    match value {
        PackValue::Structure(structure) => structure.signature,
        other => panic!("expected bolt structure payload, got {other:?}"),
    }
}

fn mcp_request(db_path: &Path, request: Value) -> Value {
    let out = cli(&[
        "mcp".to_string(),
        db_path.display().to_string(),
        "--request".to_string(),
        request.to_string(),
    ]);
    assert_eq!(
        out.exit_code,
        0,
        "mcp request failed: stderr={}",
        out.stderr.trim()
    );
    serde_json::from_str(out.stdout.trim()).expect("valid mcp response json")
}

fn mcp_tools_call(db_path: &Path, name: &str, arguments: Value) -> Value {
    let response = mcp_request(
        db_path,
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments
            }
        }),
    );
    assert!(
        response.get("error").is_none(),
        "mcp tools/call {name} returned error: {response}"
    );
    response
        .get("result")
        .cloned()
        .expect("mcp tools/call result field")
}

fn physical_plan_debug(db: &Database, query: &str) -> Result<String, Box<dyn Error>> {
    let ast = db.parse_cypher(query)?;
    let semantic = db.analyze_cypher(&ast)?;
    let logical = db.plan_cypher(&semantic)?;
    let physical = db.physical_plan_cypher(&logical)?;
    Ok(format!("{physical:?}"))
}

#[test]
fn section_01_core_data_model_pipeline() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-01");
    let db_path = ws.db_path("core");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    let alice_props = PropertyMap::from([
        ("active".to_string(), PropertyValue::Bool(true)),
        ("age".to_string(), PropertyValue::I64(31)),
        ("score".to_string(), PropertyValue::F64(98.5)),
        (
            "name".to_string(),
            PropertyValue::String("Alice".to_string()),
        ),
        ("blob".to_string(), PropertyValue::Bytes(vec![1, 2, 3, 4])),
        (
            "embedding".to_string(),
            PropertyValue::Vector(vec![1.0, 0.0, 0.0]),
        ),
    ]);
    let alice = db.create_node_with(
        &["Person".to_string(), "Engineer".to_string()],
        &alice_props,
    )?;
    let bob = db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([("name".to_string(), PropertyValue::String("Bob".to_string()))]),
    )?;

    let knows_props = PropertyMap::from([
        ("since".to_string(), PropertyValue::I64(2020)),
        ("strength".to_string(), PropertyValue::F64(0.92)),
        (
            "valid_from".to_string(),
            PropertyValue::I64(1_700_000_000_000),
        ),
        (
            "valid_to".to_string(),
            PropertyValue::I64(1_800_000_000_000),
        ),
    ]);
    let edge = db.add_typed_edge(alice, bob, "KNOWS", &knows_props)?;

    assert_eq!(db.node_count(), 2);
    assert_eq!(db.edge_count(), 1);
    assert_eq!(db.node_properties(alice)?, alice_props);
    let labels: BTreeSet<_> = db.node_labels(alice)?.into_iter().collect();
    assert_eq!(
        labels,
        BTreeSet::from(["Engineer".to_string(), "Person".to_string()])
    );
    assert_eq!(db.edge_type(edge)?, Some("KNOWS".to_string()));
    assert_eq!(db.edge_properties(edge)?, knows_props);
    assert_eq!(
        db.edge_valid_window(edge)?,
        (Some(1_700_000_000_000), Some(1_800_000_000_000))
    );
    assert!(db.edge_transaction_time_millis(edge)? > 0);

    let all_nodes = db.query("MATCH (n) RETURN n")?;
    assert_eq!(all_nodes.row_count(), 2);
    let rel_rows = db
        .query("MATCH (a:Person)-[r:KNOWS]->(b:Person) RETURN a.name AS a, b.name AS b")?
        .to_rows();
    assert_eq!(rel_rows.len(), 1);
    assert_eq!(
        rel_rows[0].get("a"),
        Some(&PropertyValue::I64(alice as i64))
    );
    assert_eq!(rel_rows[0].get("b"), Some(&PropertyValue::I64(bob as i64)));

    Ok(())
}

#[test]
fn section_02_storage_engine() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-02");
    let db_path = ws.db_path("storage");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    let node_count = 1_200u64;
    let edge_count = 5_000u64;
    {
        let mut tx = db.begin_write();
        for i in 0..node_count {
            let _ = tx.create_node_with(
                vec!["Entity".to_string()],
                PropertyMap::from([("id".to_string(), PropertyValue::I64(i as i64))]),
            )?;
        }
        for i in 0..edge_count {
            let src = i % node_count;
            let dst = (i.saturating_mul(13).saturating_add(7)) % node_count;
            let _ = tx.add_typed_edge(src, dst, "REL".to_string(), PropertyMap::new())?;
        }
        let _ = tx.commit()?;
    }
    assert_eq!(db.node_count(), node_count);
    assert_eq!(db.edge_count(), edge_count);
    db.checkpoint()?;

    drop(db);
    let mut reopened = Database::open(&db_path)?;
    assert_eq!(reopened.node_count(), node_count);
    assert_eq!(reopened.edge_count(), edge_count);

    let backup_path = ws.db_path("storage-backup");
    reopened.backup(&backup_path)?;
    let restored = Database::open(&backup_path)?;
    assert_eq!(restored.node_count(), node_count);
    assert_eq!(restored.edge_count(), edge_count);

    let _p0 = reopened.allocate_page()?;
    let p1 = reopened.allocate_page()?;
    reopened.free_page(p1)?;
    let recycled = reopened.allocate_page()?;
    assert_eq!(recycled, p1);

    let bp_path = ws.db_path("buffer-pool");
    let mut bp_setup = Database::init_with_buffer_pool_capacity(&bp_path, Header::default_v1(), 2)?;
    for _ in 0..3 {
        let _ = bp_setup.allocate_page()?;
    }
    bp_setup.checkpoint()?;
    drop(bp_setup);

    let bp = Database::open_with_buffer_pool_capacity(&bp_path, 2)?;
    let before = bp.metrics()?;
    let page_size = bp.header().page_size as usize;
    let mut out = vec![0u8; page_size];
    bp.read_page(0, &mut out)?;
    bp.read_page(1, &mut out)?;
    bp.read_page(0, &mut out)?;
    bp.read_page(2, &mut out)?;
    bp.read_page(1, &mut out)?;
    let after = bp.metrics()?;
    assert!(after.buffer_pool_hits > before.buffer_pool_hits);
    assert!(after.buffer_pool_misses >= before.buffer_pool_misses + 4);

    reopened.set_compression_config(CompressionConfig {
        hot_warm: CompressionSetting {
            algorithm: CompressionAlgorithm::Lz4,
            level: 1,
        },
        cold: CompressionSetting {
            algorithm: CompressionAlgorithm::Zstd,
            level: 3,
        },
    })?;
    let hot_page_id = reopened.allocate_page()?;
    let page_size = reopened.header().page_size as usize;
    let hot_page = (0..page_size)
        .map(|idx| (idx % 251) as u8)
        .collect::<Vec<_>>();
    reopened.write_page(hot_page_id, &hot_page)?;
    let overflow_node = reopened.create_node()?;
    let big_payload = "z".repeat(40_000);
    reopened.set_node_properties(
        overflow_node,
        &PropertyMap::from([(
            "payload".to_string(),
            PropertyValue::String(big_payload.clone()),
        )]),
    )?;
    reopened.checkpoint()?;
    drop(reopened);

    let reopened_again = Database::open(&db_path)?;
    let mut restored_hot_page = vec![0u8; page_size];
    reopened_again.read_page(hot_page_id, &mut restored_hot_page)?;
    assert_eq!(restored_hot_page, hot_page);
    assert_eq!(
        reopened_again
            .node_properties(overflow_node)?
            .get("payload"),
        Some(&PropertyValue::String(big_payload))
    );

    Ok(())
}

#[test]
fn section_03_transactions_and_mvcc() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-03");
    let tx_db_path = ws.db_path("tx-db");
    let mut tx_db = Database::init(&tx_db_path, Header::default_v1())?;
    let committed = {
        let mut tx = tx_db.begin_write();
        let n0 = tx.create_node()?;
        let n1 = tx.create_node()?;
        let _ = tx.add_edge(n0, n1)?;
        tx.commit()?
    };
    assert_eq!(committed.created_nodes, 2);
    assert_eq!(committed.created_edges, 1);
    assert_eq!(tx_db.node_count(), 2);
    assert_eq!(tx_db.edge_count(), 1);

    {
        let mut tx = tx_db.begin_write();
        let _ = tx.create_node()?;
        let _ = tx.add_edge(0, 1)?;
        tx.rollback();
    }
    assert_eq!(tx_db.node_count(), 2);
    assert_eq!(tx_db.edge_count(), 1);

    tx_db.set_node_properties(
        0,
        &PropertyMap::from([("version".to_string(), PropertyValue::I64(1))]),
    )?;
    tx_db.set_node_properties(
        0,
        &PropertyMap::from([("version".to_string(), PropertyValue::I64(2))]),
    )?;
    tx_db.set_node_properties(
        0,
        &PropertyMap::from([("version".to_string(), PropertyValue::I64(3))]),
    )?;
    tx_db.checkpoint()?;
    assert_eq!(
        tx_db.node_properties(0)?.get("version"),
        Some(&PropertyValue::I64(3))
    );

    let shared_db_path = ws.db_path("shared-db");
    let shared = SharedDatabase::init(&shared_db_path, Header::default_v1())?;
    shared.with_write(|db| {
        let _ = db.create_node_with(
            &["Versioned".to_string()],
            &PropertyMap::from([("counter".to_string(), PropertyValue::I64(0))]),
        )?;
        Ok(())
    })?;

    let reader_shared = shared.clone();
    let reader = thread::spawn(move || -> Vec<i64> {
        let mut seen = Vec::new();
        for _ in 0..40 {
            if let Ok(snapshot) = reader_shared.read_snapshot() {
                if let Ok(props) = snapshot.node_properties(0) {
                    if let Some(PropertyValue::I64(value)) = props.get("counter") {
                        seen.push(*value);
                    }
                }
            }
            thread::sleep(Duration::from_millis(2));
        }
        seen
    });

    let writer_shared = shared.clone();
    let writer = thread::spawn(move || -> Result<(), ogdb_core::DbError> {
        for i in 1..=5 {
            writer_shared.with_write(|db| {
                db.set_node_properties(
                    0,
                    &PropertyMap::from([("counter".to_string(), PropertyValue::I64(i))]),
                )?;
                Ok(())
            })?;
            thread::sleep(Duration::from_millis(2));
        }
        Ok(())
    });

    writer.join().expect("join writer thread")?;
    let seen = reader.join().expect("join reader thread");
    assert!(!seen.is_empty());
    assert!(
        seen.windows(2).all(|window| window[0] <= window[1]),
        "reader snapshots should observe monotonic committed state: {seen:?}"
    );
    let latest = shared.read_snapshot()?;
    assert_eq!(
        latest.node_properties(0)?.get("counter"),
        Some(&PropertyValue::I64(5))
    );

    Ok(())
}

#[test]
fn section_04_cypher_query_engine_full_pipeline() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-04");
    let db_path = ws.db_path("cypher");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    let alice = db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([
            (
                "name".to_string(),
                PropertyValue::String("Alice".to_string()),
            ),
            ("age".to_string(), PropertyValue::I64(30)),
        ]),
    )?;
    let bob = db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([
            ("name".to_string(), PropertyValue::String("Bob".to_string())),
            ("age".to_string(), PropertyValue::I64(20)),
        ]),
    )?;
    let charlie = db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([
            (
                "name".to_string(),
                PropertyValue::String("Charlie".to_string()),
            ),
            ("age".to_string(), PropertyValue::I64(40)),
        ]),
    )?;
    let _ = db.add_typed_edge(
        alice,
        bob,
        "KNOWS",
        &PropertyMap::from([
            (
                "valid_from".to_string(),
                PropertyValue::I64(1_700_000_000_000),
            ),
            (
                "valid_to".to_string(),
                PropertyValue::I64(1_800_000_000_000),
            ),
        ]),
    )?;
    let _ = db.add_typed_edge(
        alice,
        charlie,
        "KNOWS",
        &PropertyMap::from([(
            "valid_from".to_string(),
            PropertyValue::I64(1_800_000_000_000),
        )]),
    )?;

    assert_eq!(db.query("MATCH (n) RETURN n")?.row_count(), 3);
    let filtered = db
        .query("MATCH (n:Person) WHERE n.age > 25 RETURN n.name AS name ORDER BY n.age LIMIT 10")?
        .to_rows();
    assert_eq!(filtered.len(), 2);
    assert_eq!(
        filtered[0].get("name"),
        Some(&PropertyValue::String("Alice".to_string()))
    );

    assert_eq!(
        db.query("CREATE (n:Person {name: 'Test', age: 30}) RETURN n")?
            .row_count(),
        1
    );
    assert!(
        db.query("MATCH (a)-[r:KNOWS]->(b) RETURN a.name AS a, r AS rel, b.name AS b")?
            .row_count()
            >= 2
    );

    let set_rows = db
        .query("MATCH (n:Person {name: 'Test'}) SET n.age = 31 RETURN n.age AS age")?
        .to_rows();
    assert_eq!(set_rows[0].get("age"), Some(&PropertyValue::I64(31)));

    let with_rows = db
        .query("MATCH (n:Person {name: 'Test'}) WITH n RETURN n.name AS name")?
        .to_rows();
    assert!(
        with_rows
            .iter()
            .any(|row| row.get("name") == Some(&PropertyValue::String("Test".to_string()))),
        "WITH projection should include the Test row"
    );
    let unwind_rows = db
        .query("UNWIND [1, 2] AS item RETURN item")?
        .to_rows();
    assert_eq!(unwind_rows.len(), 2);
    assert_eq!(unwind_rows[0].get("item"), Some(&PropertyValue::I64(1)));
    assert_eq!(unwind_rows[1].get("item"), Some(&PropertyValue::I64(2)));

    let merge_first = db
        .query(
            "MERGE (n:Metric {id: 1}) ON CREATE SET n.count = 1 ON MATCH SET n.count = n.count + 1 RETURN n.count AS count",
        )?
        .to_rows();
    let merge_second = db
        .query(
            "MERGE (n:Metric {id: 1}) ON CREATE SET n.count = 1 ON MATCH SET n.count = n.count + 1 RETURN n.count AS count",
        )?
        .to_rows();
    assert_eq!(merge_first[0].get("count"), Some(&PropertyValue::I64(1)));
    assert_eq!(merge_second[0].get("count"), Some(&PropertyValue::I64(2)));

    let optional_rows = db.query("OPTIONAL MATCH (n:Missing) RETURN n")?.to_rows();
    assert_eq!(optional_rows.len(), 1);
    let union_rows = db
        .query(
            "MATCH (n:Person) RETURN n.name AS name UNION MATCH (n:Person) RETURN n.name AS name",
        )?
        .to_rows();
    let union_all_rows = db
        .query(
            "MATCH (n:Person) RETURN n.name AS name UNION ALL MATCH (n:Person) RETURN n.name AS name",
        )?
        .to_rows();
    assert!(union_rows.len() <= union_all_rows.len());

    let exists_rows = db
        .query(
            "MATCH (n:Person) WHERE n.name = 'Alice' RETURN EXISTS { MATCH (n)-[:KNOWS]->(m) RETURN m } AS has_knows",
        )?
        .to_rows();
    assert_eq!(
        exists_rows[0].get("has_knows"),
        Some(&PropertyValue::Bool(true))
    );

    let case_rows = db
        .query(
            "MATCH (n:Person) RETURN n.name AS name, CASE n.name WHEN 'Alice' THEN 'A' ELSE 'X' END AS bucket ORDER BY n.name",
        )?
        .to_rows();
    assert_eq!(
        case_rows[0].get("bucket"),
        Some(&PropertyValue::String("A".to_string()))
    );

    let pattern_rows = db
        .query(
            "MATCH (n:Person) WHERE n.name = 'Alice' RETURN [(n)-[:KNOWS]->(m) | m.name] AS names",
        )?
        .to_rows();
    let names = pattern_rows[0]
        .get("names")
        .cloned()
        .expect("pattern comprehension result");
    assert!(matches!(names, PropertyValue::String(value) if value.contains("Bob")));

    let at_1750 = db
        .query("MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000 RETURN b ORDER BY b ASC")?
        .to_rows();
    let at_1850 = db
        .query("MATCH (a)-[:KNOWS]->(b) AT TIME 1850000000000 RETURN b ORDER BY b ASC")?
        .to_rows();
    assert_eq!(at_1750[0].get("b"), Some(&PropertyValue::I64(bob as i64)));
    assert_eq!(
        at_1850[0].get("b"),
        Some(&PropertyValue::I64(charlie as i64))
    );

    let delete_rows = db
        .query("MATCH (n:Person {name: 'Alice'}) DELETE n.age RETURN n.name AS name")?
        .row_count();
    assert!(
        delete_rows >= 1,
        "DELETE clause should execute and return rows"
    );

    Ok(())
}

#[test]
fn section_05_indexes() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-05");
    let db_path = ws.db_path("indexes");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    for age in [25i64, 30, 35, 40] {
        let _ = db.create_node_with(
            &["Person".to_string()],
            &PropertyMap::from([
                ("age".to_string(), PropertyValue::I64(age)),
                ("a".to_string(), PropertyValue::I64(1)),
                ("b".to_string(), PropertyValue::I64(age - 20)),
            ]),
        )?;
    }

    let baseline = physical_plan_debug(&db, "MATCH (n:Person) WHERE n.age = 30 RETURN n")?;
    assert!(
        !baseline.contains("PropertyIndexScan"),
        "baseline plan should not use a property index before index creation"
    );

    db.create_index("Person", "age")?;
    let with_property_index =
        physical_plan_debug(&db, "MATCH (n:Person) WHERE n.age = 30 RETURN n")?;
    assert!(
        with_property_index.contains("PropertyIndexScan"),
        "plan should use property index scan after create_index"
    );

    db.create_composite_index("Person", &["a".to_string(), "b".to_string()])?;
    let composite_plan = physical_plan_debug(&db, "MATCH (n:Person) WHERE n.a = 1 RETURN n")?;
    assert!(
        composite_plan.contains("CompositeIndexScan"),
        "composite index should support prefix matching on first key"
    );

    let indexed_rows = db
        .query("MATCH (n:Person) WHERE n.age = 30 RETURN n")?
        .row_count();
    db.drop_index("Person", "age")?;
    db.drop_composite_index("Person", &["a".to_string(), "b".to_string()])?;
    let fallback_rows = db
        .query("MATCH (n:Person) WHERE n.age = 30 RETURN n")?
        .row_count();
    let fallback_plan = physical_plan_debug(&db, "MATCH (n:Person) WHERE n.age = 30 RETURN n")?;
    assert_eq!(indexed_rows, fallback_rows);
    assert!(!fallback_plan.contains("PropertyIndexScan"));
    assert!(!fallback_plan.contains("CompositeIndexScan"));

    Ok(())
}

#[test]
fn section_06_import_export() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-06");

    let source_db_path = ws.db_path("export-source");
    let mut source_db = Database::init(&source_db_path, Header::default_v1())?;
    let n0 = source_db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([(
            "name".to_string(),
            PropertyValue::String("Alice".to_string()),
        )]),
    )?;
    let n1 = source_db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([("name".to_string(), PropertyValue::String("Bob".to_string()))]),
    )?;
    let _ = source_db.add_typed_edge(
        n0,
        n1,
        "KNOWS",
        &PropertyMap::from([("since".to_string(), PropertyValue::I64(2020))]),
    )?;

    let csv_base = ws.path("graph.csv");
    cli_ok(
        vec![
            "export".to_string(),
            source_db_path.display().to_string(),
            csv_base.display().to_string(),
        ],
        "csv export",
    );
    let csv_import_db = ws.db_path("import-csv");
    cli_ok(
        vec!["init".to_string(), csv_import_db.display().to_string()],
        "csv import init",
    );
    cli_ok(
        vec![
            "import".to_string(),
            csv_import_db.display().to_string(),
            csv_base.display().to_string(),
        ],
        "csv import",
    );
    let csv_imported = Database::open(&csv_import_db)?;
    assert_eq!(csv_imported.node_count(), source_db.node_count());
    assert_eq!(csv_imported.edge_count(), source_db.edge_count());

    let json_path = ws.path("graph.json");
    cli_ok(
        vec![
            "export".to_string(),
            source_db_path.display().to_string(),
            json_path.display().to_string(),
        ],
        "json export",
    );
    let json_import_db = ws.db_path("import-json");
    cli_ok(
        vec!["init".to_string(), json_import_db.display().to_string()],
        "json import init",
    );
    cli_ok(
        vec![
            "import".to_string(),
            json_import_db.display().to_string(),
            json_path.display().to_string(),
        ],
        "json import",
    );
    let json_imported = Database::open(&json_import_db)?;
    assert_eq!(json_imported.node_count(), source_db.node_count());
    assert_eq!(json_imported.edge_count(), source_db.edge_count());

    let jsonl_path = ws.path("graph.jsonl");
    cli_ok(
        vec![
            "export".to_string(),
            source_db_path.display().to_string(),
            jsonl_path.display().to_string(),
            "--format".to_string(),
            "jsonl".to_string(),
        ],
        "jsonl export",
    );
    let jsonl_import_db = ws.db_path("import-jsonl");
    cli_ok(
        vec!["init".to_string(), jsonl_import_db.display().to_string()],
        "jsonl import init",
    );
    cli_ok(
        vec![
            "import".to_string(),
            jsonl_import_db.display().to_string(),
            jsonl_path.display().to_string(),
        ],
        "jsonl import",
    );
    let jsonl_imported = Database::open(&jsonl_import_db)?;
    assert_eq!(jsonl_imported.node_count(), source_db.node_count());
    assert_eq!(jsonl_imported.edge_count(), source_db.edge_count());

    let streaming_input = ws.path("streaming.jsonl");
    let mut jsonl = String::new();
    for i in 0..120u64 {
        jsonl.push_str(&format!(
            "{{\"kind\":\"node\",\"id\":{i},\"labels\":[\"Person\"],\"properties\":{{\"name\":\"P{i}\"}}}}\n"
        ));
    }
    fs::write(&streaming_input, jsonl)?;
    let streaming_db = ws.db_path("import-streaming");
    cli_ok(
        vec!["init".to_string(), streaming_db.display().to_string()],
        "streaming init",
    );
    let streaming_out = cli_ok(
        vec![
            "import".to_string(),
            streaming_db.display().to_string(),
            streaming_input.display().to_string(),
            "--batch-size".to_string(),
            "25".to_string(),
        ],
        "streaming import",
    );
    let committed_batches = parse_kv_u64(&streaming_out.stdout, "committed_batches").unwrap_or(0);
    assert!(
        committed_batches > 1,
        "streaming import should commit multiple batches"
    );

    let rdf_input = ws.path("roundtrip.ttl");
    fs::write(
        &rdf_input,
        r#"@prefix ex: <http://example.com/> .
@prefix schema: <http://schema.org/> .
ex:john a schema:Person ;
  schema:name "John" ;
  schema:knows ex:jane .
ex:jane a schema:Person ;
  schema:name "Jane" .
"#,
    )?;
    let rdf_db = ws.db_path("rdf-source");
    let rdf_roundtrip_db = ws.db_path("rdf-roundtrip");
    let rdf_export = ws.path("roundtrip-export.ttl");
    cli_ok(
        vec!["init".to_string(), rdf_db.display().to_string()],
        "rdf init source",
    );
    cli_ok(
        vec![
            "import-rdf".to_string(),
            rdf_db.display().to_string(),
            rdf_input.display().to_string(),
        ],
        "rdf import source",
    );
    cli_ok(
        vec![
            "export-rdf".to_string(),
            rdf_db.display().to_string(),
            rdf_export.display().to_string(),
            "--format".to_string(),
            "ttl".to_string(),
        ],
        "rdf export",
    );
    cli_ok(
        vec!["init".to_string(), rdf_roundtrip_db.display().to_string()],
        "rdf roundtrip init",
    );
    cli_ok(
        vec![
            "import-rdf".to_string(),
            rdf_roundtrip_db.display().to_string(),
            rdf_export.display().to_string(),
        ],
        "rdf roundtrip import",
    );
    let roundtripped = Database::open(&rdf_roundtrip_db)?;
    let john = roundtripped.find_nodes_by_property(
        "_uri",
        &PropertyValue::String("http://example.com/john".to_string()),
    );
    assert_eq!(john.len(), 1);

    Ok(())
}

#[test]
fn section_07_vector_and_fulltext_search() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-07");
    let db_path = ws.db_path("search");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    let doc_alpha = db.create_node_with(
        &["Doc".to_string()],
        &PropertyMap::from([
            (
                "title".to_string(),
                PropertyValue::String("Alpha".to_string()),
            ),
            (
                "content".to_string(),
                PropertyValue::String("alpha graph database".to_string()),
            ),
            (
                "embedding".to_string(),
                PropertyValue::Vector(vec![1.0, 0.0]),
            ),
        ]),
    )?;
    let _doc_beta = db.create_node_with(
        &["Doc".to_string()],
        &PropertyMap::from([
            (
                "title".to_string(),
                PropertyValue::String("Beta".to_string()),
            ),
            (
                "content".to_string(),
                PropertyValue::String("beta retrieval".to_string()),
            ),
            (
                "embedding".to_string(),
                PropertyValue::Vector(vec![0.0, 1.0]),
            ),
        ]),
    )?;
    let other = db.create_node_with(
        &["Other".to_string()],
        &PropertyMap::from([
            (
                "title".to_string(),
                PropertyValue::String("Noise".to_string()),
            ),
            (
                "content".to_string(),
                PropertyValue::String("alpha graph database".to_string()),
            ),
            (
                "embedding".to_string(),
                PropertyValue::Vector(vec![1.0, 0.0]),
            ),
        ]),
    )?;

    db.create_vector_index(
        "embedding_idx",
        Some("Doc"),
        "embedding",
        2,
        VectorDistanceMetric::Cosine,
    )?;
    db.create_fulltext_index("content_idx", Some("Doc"), &["content".to_string()])?;

    let vector_rows = db.vector_search("embedding_idx", &[1.0, 0.0], 2, None)?;
    assert!(!vector_rows.is_empty());
    assert_eq!(vector_rows[0].0, doc_alpha);

    let text_rows = db.text_search("content_idx", "alpha", 3)?;
    assert!(!text_rows.is_empty());
    assert_eq!(text_rows[0].0, doc_alpha);

    let hybrid_rows = db
        .query(
            "CALL db.index.hybrid.queryNodes('embedding_idx', [1.0, 0.0], 'content_idx', 'alpha', 5, 0.7, 0.3) YIELD node, score RETURN node, score ORDER BY score DESC",
        )?
        .to_rows();
    assert!(!hybrid_rows.is_empty());
    assert_eq!(
        hybrid_rows[0].get("node"),
        Some(&PropertyValue::I64(doc_alpha as i64))
    );
    assert!(
        hybrid_rows
            .iter()
            .all(|row| row.get("node") != Some(&PropertyValue::I64(other as i64))),
        "bitmap prefilter should exclude non-Doc label nodes"
    );

    Ok(())
}

#[test]
fn section_08_algorithms() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-08");
    let db_path = ws.db_path("algorithms");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    let n0 = db.create_node()?;
    let n1 = db.create_node()?;
    let n2 = db.create_node()?;
    let n3 = db.create_node()?;
    let n4 = db.create_node()?;
    let n5 = db.create_node()?;

    let _ = db.add_typed_edge(
        n0,
        n1,
        "ROAD",
        &PropertyMap::from([("weight".to_string(), PropertyValue::I64(10))]),
    )?;
    let _ = db.add_typed_edge(
        n0,
        n2,
        "ROAD",
        &PropertyMap::from([("weight".to_string(), PropertyValue::I64(1))]),
    )?;
    let _ = db.add_typed_edge(
        n2,
        n1,
        "ROAD",
        &PropertyMap::from([("weight".to_string(), PropertyValue::I64(1))]),
    )?;
    let _ = db.add_typed_edge(
        n1,
        n3,
        "ROAD",
        &PropertyMap::from([("weight".to_string(), PropertyValue::I64(1))]),
    )?;
    let _ = db.add_typed_edge(n3, n4, "LINK", &PropertyMap::new())?;
    let _ = db.add_typed_edge(n4, n5, "LINK", &PropertyMap::new())?;

    let bfs_path = db.shortest_path(n0, n3)?.expect("bfs path");
    assert_eq!(bfs_path.first().copied(), Some(n0));
    assert_eq!(bfs_path.last().copied(), Some(n3));

    let weighted_path = db
        .shortest_path_with_options(
            n0,
            n1,
            &ShortestPathOptions {
                max_hops: None,
                edge_type: Some("ROAD".to_string()),
                weight_property: Some("weight".to_string()),
            },
        )?
        .expect("weighted path");
    assert_eq!(weighted_path.node_ids, vec![n0, n2, n1]);
    assert!((weighted_path.total_weight - 2.0).abs() < f64::EPSILON);

    let label_prop = db.community_label_propagation(None)?;
    let louvain = db.community_louvain(None)?;
    assert_eq!(label_prop.len() as u64, db.node_count());
    assert_eq!(louvain.len() as u64, db.node_count());

    let subgraph = db.extract_subgraph(n0, 2, None)?;
    assert!(subgraph.nodes.contains(&n0));
    assert!(subgraph.nodes.contains(&n1));
    assert!(subgraph.nodes.contains(&n2));
    assert!(subgraph
        .edges
        .iter()
        .any(|edge| edge.src == n0 && edge.dst == n1));

    Ok(())
}

#[test]
fn section_09_server_protocols() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-09");

    let bolt_db_path = ws.db_path("bolt");
    let bolt_shared = SharedDatabase::init(&bolt_db_path, Header::default_v1())?;
    bolt_shared.with_write(|db| {
        let _ = db.create_node_with(
            &["Person".to_string()],
            &PropertyMap::from([(
                "name".to_string(),
                PropertyValue::String("Alice".to_string()),
            )]),
        )?;
        Ok(())
    })?;

    let probe = TcpListener::bind("127.0.0.1:0")?;
    let bolt_addr = probe.local_addr()?;
    drop(probe);
    let bolt_shared_for_server = bolt_shared.clone();
    let bolt_server = thread::spawn(move || {
        serve_bolt(bolt_shared_for_server, &bolt_addr.to_string(), Some(1)).expect("serve bolt")
    });

    let mut bolt_client = connect_with_retry(&bolt_addr.to_string(), Duration::from_secs(3));
    let mut handshake = Vec::with_capacity(20);
    handshake.extend_from_slice(&BOLT_MAGIC.to_be_bytes());
    handshake.extend_from_slice(&BOLT_VERSION_1.to_be_bytes());
    handshake.extend_from_slice(&0u32.to_be_bytes());
    handshake.extend_from_slice(&0u32.to_be_bytes());
    handshake.extend_from_slice(&0u32.to_be_bytes());
    bolt_client.write_all(&handshake)?;
    bolt_client.flush()?;
    let mut negotiated = [0u8; 4];
    bolt_client.read_exact(&mut negotiated)?;
    assert_eq!(u32::from_be_bytes(negotiated), BOLT_VERSION_1);

    let init = packstream_encode(&bolt_structure(
        0x01,
        vec![
            PackValue::String("ogdb-e2e".to_string()),
            PackValue::String(String::new()),
        ],
    ))?;
    bolt_write_message(&mut bolt_client, &init);
    assert_eq!(
        bolt_message_signature(&bolt_read_message(&mut bolt_client)),
        0x70
    );

    let run = packstream_encode(&bolt_structure(
        0x10,
        vec![
            PackValue::String("MATCH (n:Person) RETURN n.name AS name".to_string()),
            PackValue::Map(Default::default()),
        ],
    ))?;
    bolt_write_message(&mut bolt_client, &run);
    assert_eq!(
        bolt_message_signature(&bolt_read_message(&mut bolt_client)),
        0x70
    );

    let pull_all = packstream_encode(&bolt_structure(0x3F, vec![]))?;
    bolt_write_message(&mut bolt_client, &pull_all);
    let record = bolt_read_message(&mut bolt_client);
    assert_eq!(bolt_message_signature(&record), 0x71);
    assert!(
        record
            .windows("Alice".len())
            .any(|window| window == b"Alice"),
        "bolt record should contain Alice"
    );
    assert_eq!(
        bolt_message_signature(&bolt_read_message(&mut bolt_client)),
        0x70
    );
    assert_eq!(bolt_server.join().expect("join bolt server"), 1);

    let http_db_path = ws.db_path("http");
    let mut http_db = Database::init(&http_db_path, Header::default_v1())?;
    let _ = http_db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([(
            "name".to_string(),
            PropertyValue::String("Alice".to_string()),
        )]),
    )?;

    let http_probe = TcpListener::bind("127.0.0.1:0")?;
    let http_addr = http_probe.local_addr()?;
    drop(http_probe);
    let http_args = vec![
        "serve".to_string(),
        http_db_path.display().to_string(),
        "--http".to_string(),
        "--bind".to_string(),
        http_addr.to_string(),
        "--max-requests".to_string(),
        "4".to_string(),
    ];
    let http_server = thread::spawn(move || cli(&http_args));
    let http_addr_text = http_addr.to_string();

    let (health_status, _, health_body) =
        send_http_request(&http_addr_text, "GET", "/health", &[], &[]);
    assert_eq!(health_status, 200);
    let health_json: Value = serde_json::from_slice(&health_body)?;
    assert_eq!(health_json["status"], "ok");

    let (metrics_status, _, metrics_body) =
        send_http_request(&http_addr_text, "GET", "/metrics/json", &[], &[]);
    assert_eq!(metrics_status, 200);
    let metrics_json: Value = serde_json::from_slice(&metrics_body)?;
    assert!(metrics_json["node_count"].as_u64().unwrap_or(0) >= 1);

    let (query_status, _, query_body) = send_http_request(
        &http_addr_text,
        "POST",
        "/query",
        &[("Content-Type", "application/json")],
        br#"{"query":"MATCH (n:Person) RETURN n.name AS name"}"#,
    );
    assert_eq!(query_status, 200);
    let query_json: Value = serde_json::from_slice(&query_body)?;
    assert_eq!(query_json["row_count"], 1);

    let (prom_status, prom_type, prom_body) =
        send_http_request(&http_addr_text, "GET", "/metrics/prometheus", &[], &[]);
    assert_eq!(prom_status, 200);
    assert!(prom_type.starts_with("text/plain"));
    let prom_text = String::from_utf8(prom_body)?;
    assert!(prom_text.contains("ogdb_node_count "));
    assert!(prom_text.contains("ogdb_query_count_total "));

    let http_result = http_server.join().expect("join http server");
    assert_eq!(http_result.exit_code, 0);

    let mcp_db_path = ws.db_path("mcp");
    let mut mcp_db = Database::init(&mcp_db_path, Header::default_v1())?;
    let m0 = mcp_db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([
            (
                "name".to_string(),
                PropertyValue::String("Alice".to_string()),
            ),
            (
                "embedding".to_string(),
                PropertyValue::Vector(vec![1.0, 0.0]),
            ),
            (
                "content".to_string(),
                PropertyValue::String("alpha entry".to_string()),
            ),
        ]),
    )?;
    let m1 = mcp_db.create_node_with(
        &["Person".to_string()],
        &PropertyMap::from([
            ("name".to_string(), PropertyValue::String("Bob".to_string())),
            (
                "embedding".to_string(),
                PropertyValue::Vector(vec![0.0, 1.0]),
            ),
            (
                "content".to_string(),
                PropertyValue::String("beta entry".to_string()),
            ),
        ]),
    )?;
    let _ = mcp_db.add_typed_edge(
        m0,
        m1,
        "KNOWS",
        &PropertyMap::from([
            (
                "valid_from".to_string(),
                PropertyValue::I64(1_700_000_000_000),
            ),
            (
                "valid_to".to_string(),
                PropertyValue::I64(1_900_000_000_000),
            ),
        ]),
    )?;
    mcp_db.create_vector_index(
        "embedding_idx",
        Some("Person"),
        "embedding",
        2,
        VectorDistanceMetric::Cosine,
    )?;
    mcp_db.create_fulltext_index("content_idx", Some("Person"), &["content".to_string()])?;

    let tools_list = mcp_request(
        &mcp_db_path,
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list"
        }),
    );
    let tool_names = tools_list["result"]["tools"]
        .as_array()
        .expect("mcp tools array")
        .iter()
        .filter_map(|tool| tool.get("name").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    for expected in [
        "query",
        "schema",
        "upsert_node",
        "upsert_edge",
        "subgraph",
        "shortest_path",
        "vector_search",
        "text_search",
        "temporal_diff",
        "import_rdf",
        "export_rdf",
        "agent_store_episode",
        "agent_recall",
        "rag_build_summaries",
        "rag_retrieve",
    ] {
        assert!(
            tool_names.contains(expected),
            "mcp tools/list missing tool {expected}"
        );
    }

    let _ = mcp_tools_call(
        &mcp_db_path,
        "query",
        json!({"query":"MATCH (n) RETURN count(n) AS count", "format":"json"}),
    );
    let _ = mcp_tools_call(&mcp_db_path, "schema", json!({}));
    let _ = mcp_tools_call(
        &mcp_db_path,
        "upsert_node",
        json!({"label":"Person","match_key":"name","match_value":"Carol","properties":{"age":29}}),
    );
    let _ = mcp_tools_call(
        &mcp_db_path,
        "upsert_edge",
        json!({"src":0,"dst":1,"edge_type":"KNOWS","properties":{"since":2021}}),
    );
    let _ = mcp_tools_call(&mcp_db_path, "subgraph", json!({"node_id":0,"hops":1}));
    let _ = mcp_tools_call(&mcp_db_path, "shortest_path", json!({"src":0,"dst":1}));
    let _ = mcp_tools_call(
        &mcp_db_path,
        "vector_search",
        json!({"index_name":"embedding_idx","query_vector":[1.0,0.0],"k":2}),
    );
    let _ = mcp_tools_call(
        &mcp_db_path,
        "text_search",
        json!({"index_name":"content_idx","query_text":"alpha","k":2}),
    );
    let _ = mcp_tools_call(
        &mcp_db_path,
        "temporal_diff",
        json!({"timestamp_a":1750000000000_i64,"timestamp_b":1850000000000_i64}),
    );

    let mcp_rdf_in = ws.path("mcp-import.ttl");
    let mcp_rdf_out = ws.path("mcp-export.ttl");
    fs::write(
        &mcp_rdf_in,
        r#"@prefix ex: <http://example.com/> .
@prefix schema: <http://schema.org/> .
ex:x a schema:Person .
"#,
    )?;
    let _ = mcp_tools_call(
        &mcp_db_path,
        "import_rdf",
        json!({"src_path": mcp_rdf_in.display().to_string(), "format":"ttl"}),
    );
    let _ = mcp_tools_call(
        &mcp_db_path,
        "export_rdf",
        json!({"dst_path": mcp_rdf_out.display().to_string(), "format":"ttl"}),
    );
    assert!(mcp_rdf_out.exists());

    let _ = mcp_tools_call(
        &mcp_db_path,
        "agent_store_episode",
        json!({
            "agent_id":"agent-a",
            "session_id":"s-1",
            "content":"alpha memory",
            "embedding":[1.0,0.0],
            "timestamp":100_i64,
            "metadata":{"source":"e2e"}
        }),
    );
    let _ = mcp_tools_call(
        &mcp_db_path,
        "agent_recall",
        json!({"agent_id":"agent-a","query_embedding":[1.0,0.0],"k":2}),
    );
    let _ = mcp_tools_call(
        &mcp_db_path,
        "rag_build_summaries",
        json!({"resolution":1.0}),
    );
    let _ = mcp_tools_call(
        &mcp_db_path,
        "rag_retrieve",
        json!({"query_embedding":[1.0,0.0],"query_text":"alpha","k":2,"alpha":0.5}),
    );

    Ok(())
}

#[test]
fn section_10_ai_agent_features() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-10");
    let db_path = ws.db_path("ai");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    let _ = db.create_node_with(
        &["Doc".to_string()],
        &PropertyMap::from([
            (
                "content".to_string(),
                PropertyValue::String("alpha graph".to_string()),
            ),
            (
                "embedding".to_string(),
                PropertyValue::Vector(vec![1.0, 0.0]),
            ),
        ]),
    )?;
    let _ = db.create_node_with(
        &["Doc".to_string()],
        &PropertyMap::from([
            (
                "content".to_string(),
                PropertyValue::String("beta retrieval".to_string()),
            ),
            (
                "embedding".to_string(),
                PropertyValue::Vector(vec![0.0, 1.0]),
            ),
        ]),
    )?;
    let _ = db.add_typed_edge(0, 1, "RELATED", &PropertyMap::new())?;
    db.create_vector_index(
        "doc_embedding_idx",
        Some("Doc"),
        "embedding",
        2,
        VectorDistanceMetric::Cosine,
    )?;
    db.create_fulltext_index("doc_text_idx", Some("Doc"), &["content".to_string()])?;

    let e1 = db.store_episode(
        "agent-a",
        "session-1",
        "alpha memory",
        &[1.0, 0.0],
        100,
        "{}",
    )?;
    let _e2 = db.store_episode(
        "agent-a",
        "session-1",
        "beta memory",
        &[0.0, 1.0],
        200,
        "{}",
    )?;
    let _e3 = db.store_episode(
        "agent-a",
        "session-2",
        "gamma memory",
        &[1.0, 0.0],
        300,
        "{}",
    )?;

    let recalled = db.recall_episode_scores("agent-a", &[1.0, 0.0], 2, None)?;
    assert!(!recalled.is_empty());
    assert_eq!(recalled[0].0.episode_id, e1);

    let session_rows = db.recall_by_session("agent-a", "session-1")?;
    assert_eq!(session_rows.len(), 2);
    assert!(session_rows[0].timestamp <= session_rows[1].timestamp);

    let summaries = db.build_community_summaries(1.0)?;
    assert!(!summaries.is_empty());
    let rag_rows = db.hybrid_rag_retrieve(&[1.0, 0.0], "alpha", 2, 0.5, None)?;
    assert!(!rag_rows.is_empty());

    Ok(())
}

#[test]
fn section_11_rbac_and_audit() -> Result<(), Box<dyn Error>> {
    let ws = TestWorkspace::new("section-11");
    let db_path = ws.db_path("rbac");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    db.create_user("alice", Some("token-alice"))?;
    let denied = db
        .query_as_user("alice", "CREATE (n)")
        .expect_err("read-only user should not write");
    assert!(
        denied.to_string().contains("permission denied"),
        "read-only user should not write"
    );

    db.grant_role("alice", DbRole::ReadWrite)?;
    let _ = db.query_as_user("alice", "CREATE (n:Person {name: 'Alice'})")?;
    assert!(db.node_count() >= 1);

    let audit = db.audit_log_since(0);
    assert!(
        audit
            .iter()
            .any(|entry| entry.user == "alice" && entry.operation == "CREATE"),
        "audit log should include write entries for alice"
    );

    Ok(())
}

#[test]
fn section_12_performance_assertions() -> Result<(), Box<dyn Error>> {
    const MIN_NODE_THROUGHPUT: f64 = 1.0;
    const MIN_EDGE_THROUGHPUT: f64 = 1.0;
    const MAX_QUERY_LATENCY_MS: f64 = 5_000.0;
    const MAX_VECTOR_LATENCY_MS: f64 = 5_000.0;
    const MIN_IMPORT_THROUGHPUT: f64 = 1.0;

    let ws = TestWorkspace::new("section-12");

    let node_db_path = ws.db_path("perf-nodes");
    let mut node_db = Database::init(&node_db_path, Header::default_v1())?;
    let node_target = 200u64;
    let node_start = Instant::now();
    {
        let mut tx = node_db.begin_write();
        for i in 0..node_target {
            let _ = tx.create_node_with(
                vec!["Perf".to_string()],
                PropertyMap::from([("id".to_string(), PropertyValue::I64(i as i64))]),
            )?;
        }
        let _ = tx.commit()?;
    }
    let node_throughput = node_target as f64 / node_start.elapsed().as_secs_f64().max(1e-6);
    assert!(
        node_throughput >= MIN_NODE_THROUGHPUT,
        "node throughput too low: {:.2} nodes/sec",
        node_throughput
    );

    let edge_db_path = ws.db_path("perf-edges");
    let mut edge_db = Database::init(&edge_db_path, Header::default_v1())?;
    let edge_node_count = 200u64;
    {
        let mut tx = edge_db.begin_write();
        for _ in 0..edge_node_count {
            let _ = tx.create_node()?;
        }
        let _ = tx.commit()?;
    }
    let edge_target = 500u64;
    let edge_start = Instant::now();
    {
        let mut tx = edge_db.begin_write();
        for i in 0..edge_target {
            let src = i % edge_node_count;
            let dst = (i + 1) % edge_node_count;
            let _ = tx.add_edge(src, dst)?;
        }
        let _ = tx.commit()?;
    }
    let edge_throughput = edge_target as f64 / edge_start.elapsed().as_secs_f64().max(1e-6);
    assert!(
        edge_throughput >= MIN_EDGE_THROUGHPUT,
        "edge throughput too low: {:.2} edges/sec",
        edge_throughput
    );

    node_db.create_index("Perf", "id")?;
    let query_start = Instant::now();
    let query_rows = node_db
        .query("MATCH (n:Perf) WHERE n.id = 42 RETURN n")?
        .row_count();
    let query_latency_ms = query_start.elapsed().as_secs_f64() * 1_000.0;
    assert_eq!(query_rows, 1);
    assert!(
        query_latency_ms <= MAX_QUERY_LATENCY_MS,
        "single-node cypher latency too high: {:.2} ms",
        query_latency_ms
    );

    let vector_db_path = ws.db_path("perf-vector");
    let mut vector_db = Database::init(&vector_db_path, Header::default_v1())?;
    let vector_nodes = 1_000u64;
    {
        let mut tx = vector_db.begin_write();
        for i in 0..vector_nodes {
            let x = (i % 10) as f32 / 10.0;
            let _ = tx.create_node_with(
                vec!["Doc".to_string()],
                PropertyMap::from([(
                    "embedding".to_string(),
                    PropertyValue::Vector(vec![1.0 - x, x]),
                )]),
            )?;
        }
        let _ = tx.commit()?;
    }
    vector_db.create_vector_index(
        "perf_vec_idx",
        Some("Doc"),
        "embedding",
        2,
        VectorDistanceMetric::Cosine,
    )?;
    let vector_start = Instant::now();
    let vector_rows = vector_db.vector_search("perf_vec_idx", &[1.0, 0.0], 10, None)?;
    let vector_latency_ms = vector_start.elapsed().as_secs_f64() * 1_000.0;
    assert!(!vector_rows.is_empty());
    assert!(
        vector_latency_ms <= MAX_VECTOR_LATENCY_MS,
        "vector search latency too high: {:.2} ms",
        vector_latency_ms
    );

    let import_db_path = ws.db_path("perf-import");
    cli_ok(
        vec!["init".to_string(), import_db_path.display().to_string()],
        "perf import init",
    );
    let csv_base = ws.path("perf-import.csv");
    let csv_stem = csv_base.with_extension("");
    let nodes_csv = PathBuf::from(format!("{}.nodes.csv", csv_stem.display()));
    let edges_csv = PathBuf::from(format!("{}.edges.csv", csv_stem.display()));
    let import_rows = 500u64;
    let mut nodes_body = String::from("id,labels,name\n");
    for i in 0..import_rows {
        nodes_body.push_str(&format!("{i},Perf,Node{i}\n"));
    }
    fs::write(&nodes_csv, nodes_body)?;
    fs::write(&edges_csv, "src,dst,type\n")?;

    let import_start = Instant::now();
    let import_out = cli_ok(
        vec![
            "import".to_string(),
            import_db_path.display().to_string(),
            csv_base.display().to_string(),
        ],
        "perf import",
    );
    let import_seconds = import_start.elapsed().as_secs_f64().max(1e-6);
    let import_throughput = import_rows as f64 / import_seconds;
    assert!(
        import_out.stdout.contains("imported_nodes"),
        "import output should report progress"
    );
    assert!(
        import_throughput >= MIN_IMPORT_THROUGHPUT,
        "import throughput too low: {:.2} records/sec",
        import_throughput
    );

    Ok(())
}
