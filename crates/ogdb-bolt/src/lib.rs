use ogdb_core::{DbError, PropertyValue, QueryResult, SharedDatabase, WriteConcurrencyMode};
use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};

pub const BOLT_MAGIC: u32 = 0x6060_B017;
pub const BOLT_VERSION_1: u32 = 1;

// Cumulative per-message byte cap for chunked reassembly (audit 2026-04-22
// F5.7). Pre-fix, `read_chunked_message` resized the payload buffer for every
// chunk it received without checking the running total — an attacker could
// stream `u16::MAX`-sized chunks and force the server to allocate multi-GB
// buffers. The env var exists for tests that want to prove the cap fires
// without streaming 100 MiB across localhost; production should leave it
// unset.
const BOLT_MAX_MESSAGE_BYTES_DEFAULT: usize = 100 * 1024 * 1024;

fn bolt_max_message_bytes() -> usize {
    std::env::var("OGDB_BOLT_MAX_MESSAGE_BYTES")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(BOLT_MAX_MESSAGE_BYTES_DEFAULT)
}

const MSG_INIT: u8 = 0x01;
const MSG_RUN: u8 = 0x10;
const MSG_PULL_ALL: u8 = 0x3F;
const MSG_ACK_FAILURE: u8 = 0x0E;
const MSG_RESET: u8 = 0x0F;
const MSG_GOODBYE: u8 = 0x02;
const MSG_AUTH: u8 = 0x6A;

const MSG_SUCCESS: u8 = 0x70;
const MSG_RECORD: u8 = 0x71;
const MSG_IGNORED: u8 = 0x7E;
const MSG_FAILURE: u8 = 0x7F;

/// Errors surfaced by the Bolt protocol server.
///
/// `#[non_exhaustive]` per eval/rust-quality §6.2.
#[derive(Debug)]
#[non_exhaustive]
pub enum BoltError {
    Io(std::io::Error),
    Db(DbError),
    Protocol(String),
}

impl Display for BoltError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "io error: {err}"),
            Self::Db(err) => write!(f, "{err}"),
            Self::Protocol(message) => write!(f, "bolt protocol error: {message}"),
        }
    }
}

impl Error for BoltError {}

impl From<std::io::Error> for BoltError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<DbError> for BoltError {
    fn from(value: DbError) -> Self {
        Self::Db(value)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PackStructure {
    pub signature: u8,
    pub fields: Vec<PackValue>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PackValue {
    Null,
    Bool(bool),
    Integer(i64),
    Float(f64),
    Bytes(Vec<u8>),
    String(String),
    List(Vec<PackValue>),
    Map(BTreeMap<String, PackValue>),
    Structure(PackStructure),
}

pub fn packstream_encode(value: &PackValue) -> Result<Vec<u8>, BoltError> {
    let mut out = Vec::<u8>::new();
    encode_value(value, &mut out)?;
    Ok(out)
}

pub fn packstream_decode(input: &[u8]) -> Result<(PackValue, usize), BoltError> {
    decode_value(input, 0)
}

pub fn perform_handshake(stream: &mut TcpStream) -> Result<Option<u32>, BoltError> {
    let mut handshake = [0u8; 20];
    stream.read_exact(&mut handshake)?;
    let magic = u32::from_be_bytes([handshake[0], handshake[1], handshake[2], handshake[3]]);
    if magic != BOLT_MAGIC {
        return Err(BoltError::Protocol(format!(
            "invalid handshake magic 0x{magic:08X}"
        )));
    }

    let mut versions = [0u32; 4];
    for (idx, slot) in versions.iter_mut().enumerate() {
        let start = 4 + (idx * 4);
        *slot = u32::from_be_bytes([
            handshake[start],
            handshake[start + 1],
            handshake[start + 2],
            handshake[start + 3],
        ]);
    }

    let negotiated = if versions.contains(&BOLT_VERSION_1) {
        BOLT_VERSION_1
    } else {
        0
    };
    stream.write_all(&negotiated.to_be_bytes())?;
    stream.flush()?;
    if negotiated == 0 {
        Ok(None)
    } else {
        Ok(Some(negotiated))
    }
}

pub fn serve(
    shared_db: SharedDatabase,
    bind_addr: &str,
    max_requests: Option<u64>,
) -> Result<u64, BoltError> {
    let listener = TcpListener::bind(bind_addr)?;
    let max_requests = max_requests.unwrap_or(u64::MAX);
    let mut requests_processed = 0u64;

    while requests_processed < max_requests {
        let (mut stream, _) = listener.accept()?;

        let handshake = perform_handshake(&mut stream);
        let negotiated = match handshake {
            Ok(value) => value,
            Err(BoltError::Protocol(_)) => continue,
            Err(other) => return Err(other),
        };
        if negotiated != Some(BOLT_VERSION_1) {
            continue;
        }

        let mut state = ConnectionState::default();
        loop {
            if requests_processed >= max_requests {
                break;
            }
            let payload = match read_chunked_message(&mut stream) {
                Ok(Some(payload)) => payload,
                Ok(None) => break,
                Err(BoltError::Protocol(message)) => {
                    // Malformed or oversized chunked message — reply with a
                    // FAILURE and close only this connection. Pre-fix this
                    // path `?`-bubbled up and killed the whole server loop,
                    // turning a single bad client into an availability bug.
                    let _ = send_failure(&mut stream, "OGDB.ProtocolError", message);
                    break;
                }
                Err(other) => return Err(other),
            };
            if payload.is_empty() {
                continue;
            }
            let message = match decode_message(&payload) {
                Ok(message) => message,
                Err(err) => {
                    state.failed = true;
                    state.pending_result = None;
                    let _ = send_failure(
                        &mut stream,
                        "OGDB.ProtocolError",
                        format!("failed to decode message: {err}"),
                    );
                    continue;
                }
            };
            let action = process_message(&shared_db, &mut stream, &mut state, message)?;
            requests_processed = requests_processed.saturating_add(action.requests_processed);
            if action.close_connection {
                break;
            }
        }
    }

    Ok(requests_processed)
}

#[derive(Debug)]
struct ConnectionState {
    failed: bool,
    pending_result: Option<QueryResult>,
    authenticated_user: String,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            failed: false,
            pending_result: None,
            authenticated_user: "anonymous".to_string(),
        }
    }
}

#[derive(Debug, Default)]
struct MessageAction {
    requests_processed: u64,
    close_connection: bool,
}

fn process_message(
    shared_db: &SharedDatabase,
    stream: &mut TcpStream,
    state: &mut ConnectionState,
    message: PackStructure,
) -> Result<MessageAction, BoltError> {
    match message.signature {
        MSG_INIT => {
            if message.fields.len() != 2 {
                send_failure(
                    stream,
                    "OGDB.ProtocolError",
                    "INIT expects [client_name, auth_token]".to_string(),
                )?;
                state.failed = true;
                return Ok(MessageAction::default());
            }
            let auth_token = match parse_auth_token_field(&message.fields[1]) {
                Ok(token) => token,
                Err(message) => {
                    send_failure(stream, "OGDB.ProtocolError", message)?;
                    state.failed = true;
                    return Ok(MessageAction::default());
                }
            };
            if auth_token.as_deref().is_some_and(|token| !token.is_empty()) {
                let auth_token = auth_token.unwrap_or_default();
                match shared_db.authenticate_token(&auth_token)? {
                    Some(user) => state.authenticated_user = user,
                    None => {
                        send_failure(stream, "OGDB.AuthError", "invalid auth token".to_string())?;
                        state.failed = true;
                        return Ok(MessageAction::default());
                    }
                }
            } else {
                state.authenticated_user = "anonymous".to_string();
            }
            let mut metadata = BTreeMap::<String, PackValue>::new();
            metadata.insert(
                "server".to_string(),
                PackValue::String(format!("OpenGraphDB/{}", env!("CARGO_PKG_VERSION"))),
            );
            send_success(stream, metadata)?;
            Ok(MessageAction::default())
        }
        MSG_AUTH => {
            if message.fields.len() != 1 {
                send_failure(
                    stream,
                    "OGDB.ProtocolError",
                    "AUTH expects [auth_token]".to_string(),
                )?;
                state.failed = true;
                return Ok(MessageAction::default());
            }
            let auth_token = match parse_auth_token_field(&message.fields[0]) {
                Ok(Some(token)) if !token.is_empty() => token,
                Ok(_) => {
                    send_failure(
                        stream,
                        "OGDB.AuthError",
                        "auth token cannot be empty".to_string(),
                    )?;
                    state.failed = true;
                    return Ok(MessageAction::default());
                }
                Err(message) => {
                    send_failure(stream, "OGDB.ProtocolError", message)?;
                    state.failed = true;
                    return Ok(MessageAction::default());
                }
            };
            match shared_db.authenticate_token(&auth_token)? {
                Some(user) => {
                    state.authenticated_user = user;
                    state.failed = false;
                    state.pending_result = None;
                    send_success(stream, BTreeMap::new())?;
                }
                None => {
                    send_failure(stream, "OGDB.AuthError", "invalid auth token".to_string())?;
                    state.failed = true;
                }
            }
            Ok(MessageAction::default())
        }
        MSG_RUN => {
            if state.failed {
                send_ignored(stream)?;
                return Ok(MessageAction::default());
            }
            if message.fields.len() != 2 {
                send_failure(
                    stream,
                    "OGDB.ProtocolError",
                    "RUN expects [query, params]".to_string(),
                )?;
                state.failed = true;
                return Ok(MessageAction::default());
            }
            let query = match &message.fields[0] {
                PackValue::String(value) => value.clone(),
                _ => {
                    send_failure(
                        stream,
                        "OGDB.ProtocolError",
                        "RUN query must be a string".to_string(),
                    )?;
                    state.failed = true;
                    return Ok(MessageAction::default());
                }
            };
            if !matches!(message.fields[1], PackValue::Map(_)) {
                send_failure(
                    stream,
                    "OGDB.ProtocolError",
                    "RUN params must be a map".to_string(),
                )?;
                state.failed = true;
                return Ok(MessageAction::default());
            }

            let retries = match shared_db.write_mode() {
                WriteConcurrencyMode::SingleWriter => 0,
                WriteConcurrencyMode::MultiWriter { max_retries } => max_retries,
            };
            let query_result = shared_db.query_cypher_as_user_with_retry(
                &state.authenticated_user,
                &query,
                retries,
            );

            match query_result {
                Ok(result) => {
                    let fields = result
                        .columns
                        .iter()
                        .cloned()
                        .map(PackValue::String)
                        .collect::<Vec<_>>();
                    let mut metadata = BTreeMap::<String, PackValue>::new();
                    metadata.insert("fields".to_string(), PackValue::List(fields));
                    send_success(stream, metadata)?;
                    state.pending_result = Some(result);
                }
                Err(err) => {
                    send_failure(stream, "OGDB.QueryError", err.to_string())?;
                    state.failed = true;
                    state.pending_result = None;
                }
            }
            Ok(MessageAction::default())
        }
        MSG_PULL_ALL => {
            if state.failed {
                send_ignored(stream)?;
                return Ok(MessageAction::default());
            }

            if let Some(result) = state.pending_result.take() {
                for row in result.to_rows() {
                    let values = result
                        .columns
                        .iter()
                        .map(|column| {
                            row.get(column)
                                .map(pack_value_from_property)
                                .unwrap_or(PackValue::Null)
                        })
                        .collect::<Vec<_>>();
                    send_record(stream, values)?;
                }
                let mut metadata = BTreeMap::<String, PackValue>::new();
                metadata.insert(
                    "row_count".to_string(),
                    PackValue::Integer(result.row_count() as i64),
                );
                metadata.insert("has_more".to_string(), PackValue::Bool(false));
                send_success(stream, metadata)?;
                return Ok(MessageAction {
                    requests_processed: 1,
                    close_connection: false,
                });
            }

            send_success(stream, BTreeMap::new())?;
            Ok(MessageAction::default())
        }
        MSG_ACK_FAILURE | MSG_RESET => {
            state.failed = false;
            state.pending_result = None;
            send_success(stream, BTreeMap::new())?;
            Ok(MessageAction::default())
        }
        MSG_GOODBYE => Ok(MessageAction {
            requests_processed: 0,
            close_connection: true,
        }),
        signature => {
            send_failure(
                stream,
                "OGDB.ProtocolError",
                format!("unsupported message signature 0x{signature:02X}"),
            )?;
            state.failed = true;
            state.pending_result = None;
            Ok(MessageAction::default())
        }
    }
}

fn parse_auth_token_field(value: &PackValue) -> Result<Option<String>, String> {
    match value {
        PackValue::String(token) => Ok(Some(token.trim().to_string())),
        PackValue::Map(entries) => {
            let token_value = entries.get("token").or_else(|| entries.get("credentials"));
            match token_value {
                Some(PackValue::String(token)) => Ok(Some(token.trim().to_string())),
                Some(_) => Err("auth token map field must be a string".to_string()),
                None => Ok(None),
            }
        }
        PackValue::Null => Ok(None),
        _ => Err("auth token must be a string or map".to_string()),
    }
}

fn send_success(
    stream: &mut TcpStream,
    metadata: BTreeMap<String, PackValue>,
) -> Result<(), BoltError> {
    send_struct(stream, MSG_SUCCESS, vec![PackValue::Map(metadata)])
}

fn send_record(stream: &mut TcpStream, values: Vec<PackValue>) -> Result<(), BoltError> {
    send_struct(stream, MSG_RECORD, vec![PackValue::List(values)])
}

fn send_ignored(stream: &mut TcpStream) -> Result<(), BoltError> {
    send_struct(stream, MSG_IGNORED, vec![PackValue::Map(BTreeMap::new())])
}

fn send_failure(stream: &mut TcpStream, code: &str, message: String) -> Result<(), BoltError> {
    let mut metadata = BTreeMap::<String, PackValue>::new();
    metadata.insert("code".to_string(), PackValue::String(code.to_string()));
    metadata.insert("message".to_string(), PackValue::String(message));
    send_struct(stream, MSG_FAILURE, vec![PackValue::Map(metadata)])
}

fn send_struct(
    stream: &mut TcpStream,
    signature: u8,
    fields: Vec<PackValue>,
) -> Result<(), BoltError> {
    let payload = packstream_encode(&PackValue::Structure(PackStructure { signature, fields }))?;
    write_chunked_message(stream, &payload)
}

fn pack_value_from_property(value: &PropertyValue) -> PackValue {
    match value {
        PropertyValue::Bool(value) => PackValue::Bool(*value),
        PropertyValue::I64(value) => PackValue::Integer(*value),
        PropertyValue::F64(value) => PackValue::Float(*value),
        PropertyValue::String(value) => PackValue::String(value.clone()),
        PropertyValue::Bytes(value) => PackValue::Bytes(value.clone()),
        PropertyValue::Vector(value) => PackValue::List(
            value
                .iter()
                .map(|entry| PackValue::Float(*entry as f64))
                .collect(),
        ),
        PropertyValue::Date(value) => PackValue::Integer(i64::from(*value)),
        PropertyValue::Duration {
            months,
            days,
            nanos,
        } => PackValue::Map(
            [
                ("months".to_string(), PackValue::Integer(*months)),
                ("days".to_string(), PackValue::Integer(*days)),
                ("nanos".to_string(), PackValue::Integer(*nanos)),
            ]
            .into_iter()
            .collect(),
        ),
        PropertyValue::DateTime {
            micros,
            tz_offset_minutes,
        } => PackValue::Map(
            [
                ("micros".to_string(), PackValue::Integer(*micros)),
                (
                    "tz_offset_minutes".to_string(),
                    PackValue::Integer(i64::from(*tz_offset_minutes)),
                ),
            ]
            .into_iter()
            .collect(),
        ),
        PropertyValue::List(values) => {
            PackValue::List(values.iter().map(pack_value_from_property).collect())
        }
        PropertyValue::Map(values) => PackValue::Map(
            values
                .iter()
                .map(|(key, value)| (key.clone(), pack_value_from_property(value)))
                .collect(),
        ),
    }
}

fn decode_message(payload: &[u8]) -> Result<PackStructure, BoltError> {
    let (value, read) = packstream_decode(payload)?;
    if read != payload.len() {
        return Err(BoltError::Protocol(
            "message payload contains trailing bytes".to_string(),
        ));
    }
    match value {
        PackValue::Structure(message) => Ok(message),
        _ => Err(BoltError::Protocol(
            "top-level message is not a structure".to_string(),
        )),
    }
}

fn read_chunked_message(stream: &mut TcpStream) -> Result<Option<Vec<u8>>, BoltError> {
    let max_bytes = bolt_max_message_bytes();
    let mut payload = Vec::<u8>::new();
    loop {
        let mut len_buf = [0u8; 2];
        match stream.read_exact(&mut len_buf) {
            Ok(()) => {}
            Err(err) if err.kind() == ErrorKind::UnexpectedEof => {
                if payload.is_empty() {
                    return Ok(None);
                }
                return Err(BoltError::Io(err));
            }
            Err(err) => return Err(BoltError::Io(err)),
        }
        let len = u16::from_be_bytes(len_buf) as usize;
        if len == 0 {
            if payload.is_empty() {
                continue;
            }
            return Ok(Some(payload));
        }
        // Enforce the cumulative byte cap BEFORE resize so an attacker cannot
        // force `Vec::resize` to allocate unbounded memory.
        let start = payload.len();
        let new_total = start.saturating_add(len);
        if new_total > max_bytes {
            return Err(BoltError::Protocol(format!(
                "chunked message exceeds cap: {new_total} bytes > {max_bytes}"
            )));
        }
        payload.resize(new_total, 0);
        stream.read_exact(&mut payload[start..])?;
    }
}

fn write_chunked_message(stream: &mut TcpStream, payload: &[u8]) -> Result<(), BoltError> {
    for chunk in payload.chunks(u16::MAX as usize) {
        let len = u16::try_from(chunk.len())
            .map_err(|_| BoltError::Protocol("chunk too large for bolt frame".to_string()))?;
        stream.write_all(&len.to_be_bytes())?;
        stream.write_all(chunk)?;
    }
    stream.write_all(&[0u8, 0u8])?;
    stream.flush()?;
    Ok(())
}

fn encode_value(value: &PackValue, out: &mut Vec<u8>) -> Result<(), BoltError> {
    match value {
        PackValue::Null => out.push(0xC0),
        PackValue::Bool(false) => out.push(0xC2),
        PackValue::Bool(true) => out.push(0xC3),
        PackValue::Integer(value) => encode_integer(*value, out),
        PackValue::Float(value) => {
            out.push(0xC1);
            out.extend_from_slice(&value.to_bits().to_be_bytes());
        }
        PackValue::Bytes(value) => {
            encode_len(value.len(), 0xCC, 0xCD, 0xCE, out)?;
            out.extend_from_slice(value);
        }
        PackValue::String(value) => {
            let bytes = value.as_bytes();
            encode_len_with_tiny(bytes.len(), 0x80, 0xD0, 0xD1, 0xD2, out)?;
            out.extend_from_slice(bytes);
        }
        PackValue::List(values) => {
            encode_len_with_tiny(values.len(), 0x90, 0xD4, 0xD5, 0xD6, out)?;
            for value in values {
                encode_value(value, out)?;
            }
        }
        PackValue::Map(entries) => {
            encode_len_with_tiny(entries.len(), 0xA0, 0xD8, 0xD9, 0xDA, out)?;
            for (key, value) in entries {
                encode_value(&PackValue::String(key.clone()), out)?;
                encode_value(value, out)?;
            }
        }
        PackValue::Structure(message) => {
            encode_len_with_tiny(message.fields.len(), 0xB0, 0xDC, 0xDD, 0x00, out)?;
            out.push(message.signature);
            for field in &message.fields {
                encode_value(field, out)?;
            }
        }
    }
    Ok(())
}

fn encode_integer(value: i64, out: &mut Vec<u8>) {
    if (-16..=127).contains(&value) {
        out.push(value as i8 as u8);
    } else if (i8::MIN as i64..=i8::MAX as i64).contains(&value) {
        out.push(0xC8);
        out.push(value as i8 as u8);
    } else if (i16::MIN as i64..=i16::MAX as i64).contains(&value) {
        out.push(0xC9);
        out.extend_from_slice(&(value as i16).to_be_bytes());
    } else if (i32::MIN as i64..=i32::MAX as i64).contains(&value) {
        out.push(0xCA);
        out.extend_from_slice(&(value as i32).to_be_bytes());
    } else {
        out.push(0xCB);
        out.extend_from_slice(&value.to_be_bytes());
    }
}

fn encode_len(
    len: usize,
    marker_u8: u8,
    marker_u16: u8,
    marker_u32: u8,
    out: &mut Vec<u8>,
) -> Result<(), BoltError> {
    if len <= u8::MAX as usize {
        out.push(marker_u8);
        out.push(len as u8);
    } else if len <= u16::MAX as usize {
        out.push(marker_u16);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        let len_u32 = u32::try_from(len)
            .map_err(|_| BoltError::Protocol("packstream value length overflow".to_string()))?;
        out.push(marker_u32);
        out.extend_from_slice(&len_u32.to_be_bytes());
    }
    Ok(())
}

fn encode_len_with_tiny(
    len: usize,
    tiny_marker_base: u8,
    marker_u8: u8,
    marker_u16: u8,
    marker_u32: u8,
    out: &mut Vec<u8>,
) -> Result<(), BoltError> {
    if len <= 15 {
        out.push(tiny_marker_base | (len as u8));
        return Ok(());
    }
    if marker_u32 == 0x00 {
        if len <= u8::MAX as usize {
            out.push(marker_u8);
            out.push(len as u8);
        } else {
            let len_u16 = u16::try_from(len).map_err(|_| {
                BoltError::Protocol("packstream structure field count overflow".to_string())
            })?;
            out.push(marker_u16);
            out.extend_from_slice(&len_u16.to_be_bytes());
        }
        return Ok(());
    }
    encode_len(len, marker_u8, marker_u16, marker_u32, out)
}

fn decode_value(input: &[u8], offset: usize) -> Result<(PackValue, usize), BoltError> {
    let marker = *input
        .get(offset)
        .ok_or_else(|| BoltError::Protocol("unexpected end of packstream input".to_string()))?;
    let mut cursor = offset + 1;

    if marker <= 0x7F || marker >= 0xF0 {
        return Ok((PackValue::Integer((marker as i8) as i64), cursor));
    }

    match marker {
        0xC0 => Ok((PackValue::Null, cursor)),
        0xC2 => Ok((PackValue::Bool(false), cursor)),
        0xC3 => Ok((PackValue::Bool(true), cursor)),
        0xC8 => {
            let value = read_i8(input, &mut cursor)? as i64;
            Ok((PackValue::Integer(value), cursor))
        }
        0xC9 => {
            let value = read_i16(input, &mut cursor)? as i64;
            Ok((PackValue::Integer(value), cursor))
        }
        0xCA => {
            let value = read_i32(input, &mut cursor)? as i64;
            Ok((PackValue::Integer(value), cursor))
        }
        0xCB => {
            let value = read_i64(input, &mut cursor)?;
            Ok((PackValue::Integer(value), cursor))
        }
        0xC1 => {
            let bits = read_u64(input, &mut cursor)?;
            Ok((PackValue::Float(f64::from_bits(bits)), cursor))
        }
        0xCC => {
            let len = read_u8(input, &mut cursor)? as usize;
            decode_bytes(input, &mut cursor, len)
        }
        0xCD => {
            let len = read_u16(input, &mut cursor)? as usize;
            decode_bytes(input, &mut cursor, len)
        }
        0xCE => {
            let len = read_u32(input, &mut cursor)?;
            decode_bytes(input, &mut cursor, len)
        }
        0xD0 => {
            let len = read_u8(input, &mut cursor)? as usize;
            decode_string(input, &mut cursor, len)
        }
        0xD1 => {
            let len = read_u16(input, &mut cursor)? as usize;
            decode_string(input, &mut cursor, len)
        }
        0xD2 => {
            let len = read_u32(input, &mut cursor)?;
            decode_string(input, &mut cursor, len)
        }
        0xD4 => {
            let len = read_u8(input, &mut cursor)? as usize;
            decode_list(input, &mut cursor, len)
        }
        0xD5 => {
            let len = read_u16(input, &mut cursor)? as usize;
            decode_list(input, &mut cursor, len)
        }
        0xD6 => {
            let len = read_u32(input, &mut cursor)?;
            decode_list(input, &mut cursor, len)
        }
        0xD8 => {
            let len = read_u8(input, &mut cursor)? as usize;
            decode_map(input, &mut cursor, len)
        }
        0xD9 => {
            let len = read_u16(input, &mut cursor)? as usize;
            decode_map(input, &mut cursor, len)
        }
        0xDA => {
            let len = read_u32(input, &mut cursor)?;
            decode_map(input, &mut cursor, len)
        }
        0xDC => {
            let len = read_u8(input, &mut cursor)? as usize;
            decode_structure(input, &mut cursor, len)
        }
        0xDD => {
            let len = read_u16(input, &mut cursor)? as usize;
            decode_structure(input, &mut cursor, len)
        }
        marker if (0x80..=0x8F).contains(&marker) => {
            decode_string(input, &mut cursor, (marker & 0x0F) as usize)
        }
        marker if (0x90..=0x9F).contains(&marker) => {
            decode_list(input, &mut cursor, (marker & 0x0F) as usize)
        }
        marker if (0xA0..=0xAF).contains(&marker) => {
            decode_map(input, &mut cursor, (marker & 0x0F) as usize)
        }
        marker if (0xB0..=0xBF).contains(&marker) => {
            decode_structure(input, &mut cursor, (marker & 0x0F) as usize)
        }
        other => Err(BoltError::Protocol(format!(
            "unsupported packstream marker 0x{other:02X}"
        ))),
    }
}

fn decode_bytes(
    input: &[u8],
    cursor: &mut usize,
    len: usize,
) -> Result<(PackValue, usize), BoltError> {
    let bytes = read_bytes(input, cursor, len)?.to_vec();
    Ok((PackValue::Bytes(bytes), *cursor))
}

fn decode_string(
    input: &[u8],
    cursor: &mut usize,
    len: usize,
) -> Result<(PackValue, usize), BoltError> {
    let bytes = read_bytes(input, cursor, len)?;
    let value = std::str::from_utf8(bytes)
        .map_err(|err| BoltError::Protocol(format!("invalid utf8 string: {err}")))?;
    Ok((PackValue::String(value.to_string()), *cursor))
}

fn decode_list(
    input: &[u8],
    cursor: &mut usize,
    len: usize,
) -> Result<(PackValue, usize), BoltError> {
    let mut values = Vec::<PackValue>::with_capacity(len);
    for _ in 0..len {
        let (value, next) = decode_value(input, *cursor)?;
        *cursor = next;
        values.push(value);
    }
    Ok((PackValue::List(values), *cursor))
}

fn decode_map(
    input: &[u8],
    cursor: &mut usize,
    len: usize,
) -> Result<(PackValue, usize), BoltError> {
    let mut entries = BTreeMap::<String, PackValue>::new();
    for _ in 0..len {
        let (key_value, key_next) = decode_value(input, *cursor)?;
        *cursor = key_next;
        let key = match key_value {
            PackValue::String(value) => value,
            _ => {
                return Err(BoltError::Protocol(
                    "packstream map key must be string".to_string(),
                ));
            }
        };
        let (value, value_next) = decode_value(input, *cursor)?;
        *cursor = value_next;
        entries.insert(key, value);
    }
    Ok((PackValue::Map(entries), *cursor))
}

fn decode_structure(
    input: &[u8],
    cursor: &mut usize,
    len: usize,
) -> Result<(PackValue, usize), BoltError> {
    let signature = read_u8(input, cursor)?;
    let mut fields = Vec::<PackValue>::with_capacity(len);
    for _ in 0..len {
        let (value, next) = decode_value(input, *cursor)?;
        *cursor = next;
        fields.push(value);
    }
    Ok((
        PackValue::Structure(PackStructure { signature, fields }),
        *cursor,
    ))
}

fn read_bytes<'a>(input: &'a [u8], cursor: &mut usize, len: usize) -> Result<&'a [u8], BoltError> {
    let start = *cursor;
    let end = start.saturating_add(len);
    if end > input.len() {
        return Err(BoltError::Protocol(
            "unexpected end of packstream input".to_string(),
        ));
    }
    *cursor = end;
    Ok(&input[start..end])
}

fn read_u8(input: &[u8], cursor: &mut usize) -> Result<u8, BoltError> {
    Ok(read_bytes(input, cursor, 1)?[0])
}

fn read_u16(input: &[u8], cursor: &mut usize) -> Result<u16, BoltError> {
    let bytes = read_bytes(input, cursor, 2)?;
    Ok(u16::from_be_bytes([bytes[0], bytes[1]]))
}

fn read_u32(input: &[u8], cursor: &mut usize) -> Result<usize, BoltError> {
    let bytes = read_bytes(input, cursor, 4)?;
    let len = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    usize::try_from(len)
        .map_err(|_| BoltError::Protocol("packstream length does not fit usize".to_string()))
}

fn read_u64(input: &[u8], cursor: &mut usize) -> Result<u64, BoltError> {
    let bytes = read_bytes(input, cursor, 8)?;
    Ok(u64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]))
}

fn read_i8(input: &[u8], cursor: &mut usize) -> Result<i8, BoltError> {
    Ok(read_u8(input, cursor)? as i8)
}

fn read_i16(input: &[u8], cursor: &mut usize) -> Result<i16, BoltError> {
    let bytes = read_bytes(input, cursor, 2)?;
    Ok(i16::from_be_bytes([bytes[0], bytes[1]]))
}

fn read_i32(input: &[u8], cursor: &mut usize) -> Result<i32, BoltError> {
    let bytes = read_bytes(input, cursor, 4)?;
    Ok(i32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn read_i64(input: &[u8], cursor: &mut usize) -> Result<i64, BoltError> {
    let bytes = read_bytes(input, cursor, 8)?;
    Ok(i64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ogdb_core::{Header, PropertyMap};
    use std::env;
    use std::fs;
    use std::process;
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn temp_db_path(tag: &str) -> std::path::PathBuf {
        let mut path = env::temp_dir();
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        path.push(format!("ogdb-core-bolt-{tag}-{}-{ts}.ogdb", process::id()));
        path
    }

    fn write_message(stream: &mut TcpStream, payload: &[u8]) {
        let len = u16::try_from(payload.len()).expect("payload too large");
        stream
            .write_all(&len.to_be_bytes())
            .expect("write chunk length");
        stream.write_all(payload).expect("write payload");
        stream.write_all(&[0u8, 0u8]).expect("write message end");
        stream.flush().expect("flush message");
    }

    fn read_message(stream: &mut TcpStream) -> Vec<u8> {
        let mut payload = Vec::<u8>::new();
        loop {
            let mut len_buf = [0u8; 2];
            stream.read_exact(&mut len_buf).expect("read chunk length");
            let len = u16::from_be_bytes(len_buf) as usize;
            if len == 0 {
                break;
            }
            let mut chunk = vec![0u8; len];
            stream.read_exact(&mut chunk).expect("read chunk");
            payload.extend_from_slice(&chunk);
        }
        payload
    }

    fn structure(signature: u8, fields: Vec<PackValue>) -> PackValue {
        PackValue::Structure(PackStructure { signature, fields })
    }

    fn message_signature(payload: &[u8]) -> u8 {
        assert!(payload.len() >= 2, "payload too short");
        payload[1]
    }

    fn cleanup(path: &std::path::Path) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(format!("{}-wal", path.display()));
        let _ = fs::remove_file(format!("{}-meta.json", path.display()));
        let _ = fs::remove_file(format!("{}-free-list.json", path.display()));
        let _ = fs::remove_file(format!("{}-csr-layout.json", path.display()));
        let _ = fs::remove_file(format!("{}-props.ogdb", path.display()));
        let _ = fs::remove_file(format!("{}-props-meta.json", path.display()));
        let _ = fs::remove_file(format!("{}-props-freelist.json", path.display()));
        let _ = fs::remove_file(format!("{}-compression.json", path.display()));
    }

    #[test]
    fn packstream_structure_round_trip() {
        let mut inner_map = BTreeMap::<String, PackValue>::new();
        inner_map.insert("k".to_string(), PackValue::Integer(7));
        let value = structure(
            MSG_RUN,
            vec![
                PackValue::String("RETURN 1".to_string()),
                PackValue::Map(inner_map),
            ],
        );
        let encoded = packstream_encode(&value).expect("encode");
        let (decoded, read) = packstream_decode(&encoded).expect("decode");
        assert_eq!(read, encoded.len());
        assert_eq!(decoded, value);
    }

    #[test]
    fn perform_handshake_negotiates_v1() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind listener");
        let addr = listener.local_addr().expect("listener addr");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let version = perform_handshake(&mut stream).expect("handshake");
            assert_eq!(version, Some(BOLT_VERSION_1));
        });

        let mut client = TcpStream::connect(addr).expect("connect");
        client
            .write_all(&[
                0x60, 0x60, 0xB0, 0x17, // magic
                0x00, 0x00, 0x00, 0x01, // v1
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
            ])
            .expect("write handshake");
        client.flush().expect("flush handshake");

        let mut negotiated = [0u8; 4];
        client
            .read_exact(&mut negotiated)
            .expect("read negotiated version");
        assert_eq!(u32::from_be_bytes(negotiated), BOLT_VERSION_1);

        server.join().expect("join handshake server");
    }

    #[test]
    fn serve_supports_run_pull_all_and_ack_failure_flow() {
        let path = temp_db_path("run-pull-and-failure");
        let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");
        shared
            .with_write(|db| {
                let _ = db.create_node_with(
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
        let bind_addr = probe.local_addr().expect("probe addr");
        drop(probe);

        let shared_for_server = shared.clone();
        let server = thread::spawn(move || {
            serve(shared_for_server, &bind_addr.to_string(), Some(1)).expect("serve bolt")
        });

        let mut client = loop {
            if let Ok(stream) = TcpStream::connect(bind_addr) {
                break stream;
            }
            thread::sleep(Duration::from_millis(10));
        };

        client
            .write_all(&[
                0x60, 0x60, 0xB0, 0x17, // magic
                0x00, 0x00, 0x00, 0x01, // v1
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
            ])
            .expect("write handshake");
        client.flush().expect("flush handshake");
        let mut negotiated = [0u8; 4];
        client
            .read_exact(&mut negotiated)
            .expect("read negotiated version");
        assert_eq!(u32::from_be_bytes(negotiated), BOLT_VERSION_1);

        let init = packstream_encode(&structure(
            MSG_INIT,
            vec![
                PackValue::String("ogdb-core-test".to_string()),
                PackValue::String(String::new()),
            ],
        ))
        .expect("encode init");
        write_message(&mut client, &init);
        let init_resp = read_message(&mut client);
        assert_eq!(message_signature(&init_resp), MSG_SUCCESS);

        let bad_run = packstream_encode(&structure(
            MSG_RUN,
            vec![
                PackValue::String("MATCH (n) RETURN m".to_string()),
                PackValue::Map(BTreeMap::new()),
            ],
        ))
        .expect("encode bad run");
        write_message(&mut client, &bad_run);
        let bad_resp = read_message(&mut client);
        assert_eq!(message_signature(&bad_resp), MSG_FAILURE);

        let pull = packstream_encode(&structure(MSG_PULL_ALL, vec![])).expect("encode pull");
        write_message(&mut client, &pull);
        let ignored = read_message(&mut client);
        assert_eq!(message_signature(&ignored), MSG_IGNORED);

        let ack = packstream_encode(&structure(MSG_ACK_FAILURE, vec![])).expect("encode ack");
        write_message(&mut client, &ack);
        let ack_resp = read_message(&mut client);
        assert_eq!(message_signature(&ack_resp), MSG_SUCCESS);

        let good_run = packstream_encode(&structure(
            MSG_RUN,
            vec![
                PackValue::String("MATCH (n:Person) RETURN n.name AS name".to_string()),
                PackValue::Map(BTreeMap::new()),
            ],
        ))
        .expect("encode good run");
        write_message(&mut client, &good_run);
        let run_resp = read_message(&mut client);
        assert_eq!(message_signature(&run_resp), MSG_SUCCESS);

        write_message(&mut client, &pull);
        let record = read_message(&mut client);
        assert_eq!(message_signature(&record), MSG_RECORD);
        assert!(
            record
                .windows("Alice".len())
                .any(|window| window == b"Alice"),
            "record should contain Alice"
        );
        let summary = read_message(&mut client);
        assert_eq!(message_signature(&summary), MSG_SUCCESS);

        let requests_processed = server.join().expect("join bolt server");
        assert_eq!(requests_processed, 1);

        cleanup(&path);
    }

    #[test]
    fn serve_supports_auth_message_token_for_rbac() {
        let path = temp_db_path("auth-token");
        let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");
        shared
            .with_write(|db| {
                db.create_user("readonly", Some("token-ro"))?;
                Ok(())
            })
            .expect("seed readonly user");

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe");
        let bind_addr = probe.local_addr().expect("probe addr");
        drop(probe);

        let shared_for_server = shared.clone();
        let server = thread::spawn(move || {
            serve(shared_for_server, &bind_addr.to_string(), Some(1)).expect("serve bolt")
        });

        let mut client = loop {
            if let Ok(stream) = TcpStream::connect(bind_addr) {
                break stream;
            }
            thread::sleep(Duration::from_millis(10));
        };

        client
            .write_all(&[
                0x60, 0x60, 0xB0, 0x17, // magic
                0x00, 0x00, 0x00, 0x01, // v1
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
            ])
            .expect("write handshake");
        client.flush().expect("flush handshake");
        let mut negotiated = [0u8; 4];
        client
            .read_exact(&mut negotiated)
            .expect("read negotiated version");
        assert_eq!(u32::from_be_bytes(negotiated), BOLT_VERSION_1);

        let init = packstream_encode(&structure(
            MSG_INIT,
            vec![
                PackValue::String("ogdb-auth-test".to_string()),
                PackValue::String(String::new()),
            ],
        ))
        .expect("encode init");
        write_message(&mut client, &init);
        let init_resp = read_message(&mut client);
        assert_eq!(message_signature(&init_resp), MSG_SUCCESS);

        let auth = packstream_encode(&structure(
            0x6A,
            vec![PackValue::String("token-ro".to_string())],
        ))
        .expect("encode auth");
        write_message(&mut client, &auth);
        let auth_resp = read_message(&mut client);
        assert_eq!(message_signature(&auth_resp), MSG_SUCCESS);

        let create_run = packstream_encode(&structure(
            MSG_RUN,
            vec![
                PackValue::String("CREATE (n:Person)".to_string()),
                PackValue::Map(BTreeMap::new()),
            ],
        ))
        .expect("encode create run");
        write_message(&mut client, &create_run);
        let create_resp = read_message(&mut client);
        assert_eq!(message_signature(&create_resp), MSG_FAILURE);

        let ack = packstream_encode(&structure(MSG_ACK_FAILURE, vec![])).expect("encode ack");
        write_message(&mut client, &ack);
        let ack_resp = read_message(&mut client);
        assert_eq!(message_signature(&ack_resp), MSG_SUCCESS);

        let read_run = packstream_encode(&structure(
            MSG_RUN,
            vec![
                PackValue::String("MATCH (n:Person) RETURN n".to_string()),
                PackValue::Map(BTreeMap::new()),
            ],
        ))
        .expect("encode read run");
        write_message(&mut client, &read_run);
        let read_run_resp = read_message(&mut client);
        assert_eq!(message_signature(&read_run_resp), MSG_SUCCESS);

        let pull = packstream_encode(&structure(MSG_PULL_ALL, vec![])).expect("encode pull");
        write_message(&mut client, &pull);
        let summary = read_message(&mut client);
        assert_eq!(message_signature(&summary), MSG_SUCCESS);

        let requests_processed = server.join().expect("join bolt server");
        assert_eq!(requests_processed, 1);

        cleanup(&path);
    }
}
