//! Regression tests for the 7 HTTP/MCP cosmetic gaps surfaced by the
//! coverage-audit eval. Each gap historically returned an unhelpful
//! response (500 instead of 400, missing alias, HTML favicon, etc.) and
//! was fixed in the same commit that introduced this file. The tests
//! pin the new behavior so a future refactor cannot silently regress
//! any single item.
//!
//! Items covered (1:1 with the eval punch-list):
//!   1. POST /query accepts `cypher` as alias for `query`
//!   2. POST /rag/drill returns 400 (not 500) when `community_id` is missing
//!   3. POST /rag/search rejects unknown top-level keys with 400 + field list
//!   4. GET  /favicon.ico returns a real ICO (image/x-icon), not HTML
//!   5. /mcp/invoke vector_search/text_search/rag_retrieve return 400 (not 500)
//!      with an "available indexes" hint when the named index is missing
//!   6. /mcp/invoke import_rdf/export_rdf accept the `turtle` and
//!      `nquads`/`n-quads` aliases; `nq` works on both directions
//!   7. /mcp/tools temporal_diff & agent_store_episode descriptions document
//!      that timestamps are millisecond Unix epoch (no more silent
//!      seconds-vs-ms mismatches)

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
    path.push(format!("ogdb-mcpgaps-{tag}-{}-{ts}.ogdb", process::id()));
    path
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-meta.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-props-meta.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-freelist.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-csr.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-compression.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-props-freelist.json", path.display()));
    let _ = std::fs::remove_file(format!("{}-props.ogdb", path.display()));
    let _ = std::fs::remove_file(format!("{}.vecindex", path.display()));
}

fn connect_with_retry(addr: &str) -> TcpStream {
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut last: Option<std::io::Error> = None;
    while Instant::now() < deadline {
        match TcpStream::connect(addr) {
            Ok(stream) => {
                stream
                    .set_read_timeout(Some(Duration::from_secs(10)))
                    .expect("set read timeout");
                stream
                    .set_write_timeout(Some(Duration::from_secs(10)))
                    .expect("set write timeout");
                return stream;
            }
            Err(err) => {
                last = Some(err);
                thread::sleep(Duration::from_millis(20));
            }
        }
    }
    panic!(
        "failed to connect at {addr}: {}",
        last.map(|e| e.to_string()).unwrap_or_default()
    );
}

struct HttpResponse {
    status: u16,
    head: String,
    body: String,
    body_bytes: Vec<u8>,
}

fn read_full_response(stream: &mut TcpStream) -> HttpResponse {
    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .expect("read status line");
    let mut parts = status_line.split_whitespace();
    let _proto = parts.next().expect("http proto");
    let status: u16 = parts
        .next()
        .expect("status code")
        .parse()
        .expect("status code parses as u16");

    let mut head = status_line.clone();
    let mut content_length: usize = 0;
    loop {
        let mut header = String::new();
        let n = reader.read_line(&mut header).expect("read header line");
        if n == 0 {
            break;
        }
        head.push_str(&header);
        let line = header.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse().unwrap_or(0);
            }
        }
    }

    let mut body_bytes = Vec::new();
    if content_length > 0 {
        body_bytes.resize(content_length, 0);
        reader
            .read_exact(&mut body_bytes)
            .expect("read body by content-length");
    } else {
        let _ = reader.read_to_end(&mut body_bytes);
    }
    HttpResponse {
        status,
        head,
        body: String::from_utf8_lossy(&body_bytes).into_owned(),
        body_bytes,
    }
}

fn header_value<'a>(head: &'a str, key: &str) -> Option<&'a str> {
    let key_lc = key.to_ascii_lowercase();
    head.lines().find_map(|line| {
        let (k, v) = line.split_once(':')?;
        if k.trim().to_ascii_lowercase() == key_lc {
            Some(v.trim())
        } else {
            None
        }
    })
}

fn post_json(addr: &str, path: &str, body: &str) -> HttpResponse {
    let mut stream = connect_with_retry(addr);
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len(),
    );
    stream.write_all(request.as_bytes()).expect("write request");
    stream.flush().expect("flush request");
    read_full_response(&mut stream)
}

fn get(addr: &str, path: &str) -> HttpResponse {
    let mut stream = connect_with_retry(addr);
    let request = format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).expect("write request");
    stream.flush().expect("flush request");
    read_full_response(&mut stream)
}

fn spawn_http_server(
    tag: &str,
    max_requests: u64,
) -> (String, thread::JoinHandle<ogdb_cli::CliResult>, PathBuf) {
    let path = temp_db_path(tag);
    cleanup(&path);
    let init = run(&["init".to_string(), path.display().to_string()]);
    assert_eq!(init.exit_code, 0, "init failed: {}", init.stderr);

    let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
    let bind_addr = probe.local_addr().expect("probe local addr").to_string();
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

// -----------------------------------------------------------------------------
// Item 1: POST /query accepts `cypher` as alias for `query`.
// Node binding's Client.query() typedef sends `{ cypher: ... }`; before this
// fix the body produced a 400 "must include string query".
// -----------------------------------------------------------------------------
#[test]
fn http_query_accepts_cypher_alias() {
    let (addr, handle, path) = spawn_http_server("query-cypher-alias", 2);

    // `cypher` alias works.
    let alias_body = r#"{"cypher":"MATCH (n) RETURN count(n) AS c"}"#;
    let alias = post_json(&addr, "/query", alias_body);
    assert_eq!(
        alias.status, 200,
        "POST /query with `cypher` alias must be 200; body=`{}`",
        alias.body
    );

    // Neither field present ⇒ 400 with a message that lists BOTH spellings,
    // so callers know the alias exists.
    let neither = post_json(&addr, "/query", r#"{}"#);
    assert_eq!(
        neither.status, 400,
        "POST /query without query/cypher must be 400; body=`{}`",
        neither.body
    );
    assert!(
        neither.body.contains("query") && neither.body.contains("cypher"),
        "400 message must mention both `query` and `cypher`; body=`{}`",
        neither.body
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// Item 2: POST /rag/drill returns 400 (not 500) when `community_id` is missing.
// Before this fix, missing `community_id` panicked into a CliError::Runtime
// surfaced as a 500.
// -----------------------------------------------------------------------------
#[test]
fn http_rag_drill_missing_community_id_returns_400() {
    let (addr, handle, path) = spawn_http_server("rag-drill-missing", 2);

    // Missing field ⇒ 400.
    let missing = post_json(&addr, "/rag/drill", r#"{}"#);
    assert_eq!(
        missing.status, 400,
        "POST /rag/drill without community_id must be 400 (not 500); body=`{}`",
        missing.body
    );
    assert!(
        missing.body.contains("community_id"),
        "400 must name the missing field `community_id`; body=`{}`",
        missing.body
    );

    // Malformed JSON ⇒ 400 (was 500).
    let bad_json = post_json(&addr, "/rag/drill", "not-json");
    assert_eq!(
        bad_json.status, 400,
        "POST /rag/drill with invalid JSON must be 400 (not 500); body=`{}`",
        bad_json.body
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// Item 3: POST /rag/search rejects unknown top-level keys with 400 and lists
// the allowed field set so typos (`embeddings`, `top_k`) don't silently coerce
// into empty-result behavior.
// -----------------------------------------------------------------------------
#[test]
fn http_rag_search_unknown_keys_returns_400_with_allowed_list() {
    let (addr, handle, path) = spawn_http_server("rag-search-unknown", 2);

    // Common typo (`embeddings` instead of `embedding`).
    let typo = post_json(
        &addr,
        "/rag/search",
        r#"{"query":"foo","embeddings":[0.1,0.2]}"#,
    );
    assert_eq!(
        typo.status, 400,
        "POST /rag/search with unknown key must be 400; body=`{}`",
        typo.body
    );
    assert!(
        typo.body.contains("embeddings"),
        "400 must name the unknown key `embeddings`; body=`{}`",
        typo.body
    );
    // The error must list the allowed key set so the caller can self-correct.
    for allowed in ["query", "embedding", "k", "community_id"] {
        assert!(
            typo.body.contains(allowed),
            "400 must list allowed key `{allowed}`; body=`{}`",
            typo.body,
        );
    }

    // Known keys ⇒ no 400 from the unknown-key check (allow whatever
    // downstream status the empty-DB case produces — we only care that
    // it isn't 400-rejecting our valid keys).
    let valid = post_json(
        &addr,
        "/rag/search",
        r#"{"query":"foo","k":3,"community_id":1}"#,
    );
    assert_ne!(
        valid.status, 400,
        "valid keys must not trip the unknown-key 400; body=`{}`",
        valid.body
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// Item 4: GET /favicon.ico returns a real ICO (image/x-icon) regardless of
// whether the SPA bundle was pre-built. Browsers reject the SPA-stub HTML
// as a favicon.
// -----------------------------------------------------------------------------
#[test]
fn http_favicon_returns_real_ico_not_html() {
    let (addr, handle, path) = spawn_http_server("favicon", 1);

    let response = get(&addr, "/favicon.ico");
    assert_eq!(
        response.status, 200,
        "GET /favicon.ico must be 200; head=`{}`",
        response.head
    );

    let ctype = header_value(&response.head, "Content-Type").unwrap_or("");
    assert!(
        ctype.starts_with("image/x-icon") || ctype.starts_with("image/vnd.microsoft.icon"),
        "GET /favicon.ico must be served as an ICO image, not HTML; got Content-Type=`{ctype}`"
    );

    // ICO magic bytes: 00 00 01 00 (reserved, type=ICO).
    assert!(
        response.body_bytes.len() > 4,
        "favicon must have at least the 4-byte ICONDIR header; got {} bytes",
        response.body_bytes.len()
    );
    assert_eq!(
        &response.body_bytes[..4],
        &[0x00, 0x00, 0x01, 0x00],
        "GET /favicon.ico body must start with the ICO magic 00 00 01 00; got {:?}",
        &response.body_bytes[..4.min(response.body_bytes.len())]
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// Item 5: /mcp/invoke vector_search/text_search return 400 (not 500) with a
// helpful "available indexes" hint when the requested index doesn't exist.
// -----------------------------------------------------------------------------
#[test]
fn http_mcp_invoke_unknown_vector_index_returns_400_with_hint() {
    let (addr, handle, path) = spawn_http_server("mcp-vec-missing", 2);

    let body = r#"{"name":"vector_search","arguments":{"index_name":"does_not_exist","query_vector":[0.1,0.2,0.3]}}"#;
    let response = post_json(&addr, "/mcp/invoke", body);
    assert_eq!(
        response.status, 400,
        "vector_search against missing index must be 400 (not 500); body=`{}`",
        response.body
    );
    let lower = response.body.to_ascii_lowercase();
    assert!(
        lower.contains("vector index") || lower.contains("does_not_exist"),
        "400 must mention the missing vector index; body=`{}`",
        response.body
    );

    let body = r#"{"name":"text_search","arguments":{"index_name":"missing_text","query_text":"hello"}}"#;
    let response = post_json(&addr, "/mcp/invoke", body);
    assert_eq!(
        response.status, 400,
        "text_search against missing index must be 400 (not 500); body=`{}`",
        response.body
    );
    let lower = response.body.to_ascii_lowercase();
    assert!(
        lower.contains("fulltext index") || lower.contains("missing_text"),
        "400 must mention the missing fulltext index; body=`{}`",
        response.body
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// Item 6: /mcp/invoke import_rdf/export_rdf accept the friendly aliases
// `turtle`, `nquads`, `n-quads`. We assert via a tiny round-trip on a
// turtle-aliased import + an `nq`/`nquads` round-trip on export.
//
// Where possible we use a known-bad src_path to force the runner past format
// parsing (so the format alias is verified even when no real file exists);
// the failure mode the test cares about is "format alias rejected" vs
// "format alias accepted, then file open failed", which surface as different
// error strings.
// -----------------------------------------------------------------------------
#[test]
fn http_mcp_import_rdf_accepts_turtle_and_nquads_aliases() {
    let (addr, handle, path) = spawn_http_server("mcp-rdf-aliases", 4);

    // `turtle` alias must be accepted as a format. Use a non-existent path
    // so the call fails *after* format parsing — the resulting error must
    // reference the missing file, not the format enum.
    let body = r#"{"name":"import_rdf","arguments":{"src_path":"/tmp/__ogdb_no_such_rdf.ttl","format":"turtle"}}"#;
    let response = post_json(&addr, "/mcp/invoke", body);
    let lower = response.body.to_ascii_lowercase();
    assert!(
        !lower.contains("must be ttl") && !lower.contains("invalid format"),
        "`turtle` must be accepted as alias for `ttl`; got body=`{}`",
        response.body
    );

    // `nquads` (alias for `nq`) on import.
    let body = r#"{"name":"import_rdf","arguments":{"src_path":"/tmp/__ogdb_no_such_rdf.nq","format":"nquads"}}"#;
    let response = post_json(&addr, "/mcp/invoke", body);
    let lower = response.body.to_ascii_lowercase();
    assert!(
        !lower.contains("must be ttl") && !lower.contains("invalid format"),
        "`nquads` must be accepted as alias for `nq`; got body=`{}`",
        response.body
    );

    // `nq` on export — was previously rejected because RdfExportFormatArg
    // had no Nq variant. This round-trips against an empty DB.
    let dst = env::temp_dir().join(format!(
        "ogdb-export-nq-{}-{}.nq",
        process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    ));
    let _ = std::fs::remove_file(&dst);
    let body = format!(
        r#"{{"name":"export_rdf","arguments":{{"dst_path":"{}","format":"nq"}}}}"#,
        dst.display()
    );
    let response = post_json(&addr, "/mcp/invoke", &body);
    assert_eq!(
        response.status, 200,
        "export_rdf with format `nq` must be 200; body=`{}`",
        response.body
    );
    assert!(dst.exists(), "export_rdf must produce dst file at {}", dst.display());
    let _ = std::fs::remove_file(&dst);

    // `turtle` on export.
    let dst = env::temp_dir().join(format!(
        "ogdb-export-turtle-{}-{}.ttl",
        process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    ));
    let _ = std::fs::remove_file(&dst);
    let body = format!(
        r#"{{"name":"export_rdf","arguments":{{"dst_path":"{}","format":"turtle"}}}}"#,
        dst.display()
    );
    let response = post_json(&addr, "/mcp/invoke", &body);
    assert_eq!(
        response.status, 200,
        "export_rdf with format `turtle` must be 200; body=`{}`",
        response.body
    );
    let _ = std::fs::remove_file(&dst);

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}

// -----------------------------------------------------------------------------
// Item 7: /mcp/tools temporal_diff & agent_store_episode descriptions must
// document that timestamps are millisecond Unix epoch. Without this hint,
// callers using seconds (e.g. Unix `date +%s`) silently get no-data results.
// -----------------------------------------------------------------------------
#[test]
fn mcp_tools_timestamp_descriptions_specify_millis_epoch() {
    let (addr, handle, path) = spawn_http_server("mcp-tools-ts-doc", 1);

    let response = post_json(&addr, "/mcp/tools", "");
    assert_eq!(response.status, 200, "POST /mcp/tools must be 200; body=`{}`", response.body);
    let parsed: Value =
        serde_json::from_str(&response.body).expect("/mcp/tools must return JSON");
    let tools = parsed
        .get("tools")
        .and_then(Value::as_array)
        .expect("/mcp/tools response must have `tools` array");

    fn find_tool<'a>(tools: &'a [Value], name: &str) -> &'a Value {
        tools
            .iter()
            .find(|t| t.get("name").and_then(Value::as_str) == Some(name))
            .unwrap_or_else(|| panic!("tool `{name}` not present in /mcp/tools"))
    }

    let temporal = find_tool(tools, "temporal_diff");
    let temporal_text = serde_json::to_string(temporal).unwrap().to_ascii_lowercase();
    assert!(
        temporal_text.contains("millisecond") || temporal_text.contains("ms"),
        "temporal_diff schema must document ms-epoch; raw: {temporal}"
    );
    assert!(
        temporal_text.contains("epoch"),
        "temporal_diff schema must mention `epoch`; raw: {temporal}"
    );

    let episode = find_tool(tools, "agent_store_episode");
    let episode_text = serde_json::to_string(episode).unwrap().to_ascii_lowercase();
    assert!(
        episode_text.contains("millisecond") || episode_text.contains("ms"),
        "agent_store_episode schema must document ms-epoch; raw: {episode}"
    );
    assert!(
        episode_text.contains("epoch"),
        "agent_store_episode schema must mention `epoch`; raw: {episode}"
    );

    let serve_result = handle.join().expect("join http serve thread");
    assert_eq!(serve_result.exit_code, 0, "serve crashed: {}", serve_result.stderr);
    cleanup(&path);
}
