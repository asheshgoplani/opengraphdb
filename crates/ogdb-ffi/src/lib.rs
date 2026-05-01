use ogdb_cli::run as run_cli;
use ogdb_core::{DbError, Header, PropertyMap, PropertyValue, SharedDatabase};
use serde_json::Value;
use std::collections::BTreeMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::PathBuf;
use std::ptr;
use std::sync::{Mutex, OnceLock};

pub const OGDB_INVALID_ID: u64 = u64::MAX;
const OGDB_STATUS_OK: i32 = 0;
const OGDB_STATUS_ERR: i32 = 1;

#[repr(C)]
pub struct OgdbHandle {
    _private: u8,
}

struct OgdbHandleInner {
    path: PathBuf,
    shared: SharedDatabase,
}

static LAST_ERROR: OnceLock<Mutex<Option<CString>>> = OnceLock::new();

fn last_error_store() -> &'static Mutex<Option<CString>> {
    LAST_ERROR.get_or_init(|| Mutex::new(None))
}

fn sanitize_error_message(message: impl Into<String>) -> CString {
    let mut bytes = message.into().into_bytes();
    for byte in &mut bytes {
        if *byte == 0 {
            *byte = b'?';
        }
    }
    CString::new(bytes).expect("message was sanitized to be c-compatible")
}

fn set_last_error(message: impl Into<String>) {
    if let Ok(mut slot) = last_error_store().lock() {
        *slot = Some(sanitize_error_message(message));
    }
}

fn clear_last_error() {
    if let Ok(mut slot) = last_error_store().lock() {
        *slot = None;
    }
}

fn parse_cstr_required(raw: *const c_char, name: &str) -> Result<String, String> {
    if raw.is_null() {
        return Err(format!("{name} cannot be null"));
    }
    // SAFETY: every caller is one of the `pub unsafe extern "C" fn` items
    // below, each of which documents that all `*const c_char` parameters
    // must be non-null and point to a valid NUL-terminated UTF-8 string for
    // the duration of the call. Null was just rejected immediately above.
    let value = unsafe { CStr::from_ptr(raw) }
        .to_str()
        .map_err(|_| format!("{name} must be valid utf-8"))?;
    if value.trim().is_empty() {
        return Err(format!("{name} cannot be empty"));
    }
    Ok(value.to_string())
}

fn parse_cstr_optional(raw: *const c_char, name: &str) -> Result<Option<String>, String> {
    if raw.is_null() {
        return Ok(None);
    }
    // SAFETY: callers are `pub unsafe extern "C" fn` items below. Their docs
    // require optional `*const c_char` arguments to either be null (handled
    // immediately above) or point to a valid NUL-terminated UTF-8 string for
    // the duration of the call.
    let value = unsafe { CStr::from_ptr(raw) }
        .to_str()
        .map_err(|_| format!("{name} must be valid utf-8"))?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    Ok(Some(trimmed.to_string()))
}

fn parse_labels_json(raw: Option<&str>) -> Result<Vec<String>, String> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };
    let parsed: Value =
        serde_json::from_str(raw).map_err(|e| format!("invalid labels json: {e}"))?;
    match parsed {
        Value::Array(values) => values
            .into_iter()
            .map(|value| match value {
                Value::String(s) if !s.trim().is_empty() => Ok(s),
                _ => Err("labels must be a json array of non-empty strings".to_string()),
            })
            .collect(),
        _ => Err("labels must be a json array".to_string()),
    }
}

fn json_number_to_property_value(value: &serde_json::Number) -> Result<PropertyValue, String> {
    if let Some(i64_value) = value.as_i64() {
        return Ok(PropertyValue::I64(i64_value));
    }
    let Some(f64_value) = value.as_f64() else {
        return Err("unsupported numeric property value".to_string());
    };
    if !f64_value.is_finite() {
        return Err("non-finite numeric property values are not supported".to_string());
    }
    Ok(PropertyValue::F64(f64_value))
}

fn json_array_to_property_value(values: &[Value]) -> Result<PropertyValue, String> {
    if values.iter().all(|value| matches!(value, Value::Number(_))) {
        let mut out = Vec::<f32>::with_capacity(values.len());
        for value in values {
            let Value::Number(number) = value else {
                return Err("array property values must be numeric vectors".to_string());
            };
            let Some(f64_value) = number.as_f64() else {
                return Err("array property values must be numeric vectors".to_string());
            };
            let f32_value = f64_value as f32;
            if !f32_value.is_finite() {
                return Err("vector values must be finite".to_string());
            }
            out.push(f32_value);
        }
        return Ok(PropertyValue::Vector(out));
    }
    values
        .iter()
        .map(json_value_to_property_value)
        .collect::<Result<Vec<_>, _>>()
        .map(PropertyValue::List)
}

fn json_value_to_property_value(value: &Value) -> Result<PropertyValue, String> {
    match value {
        Value::Bool(v) => Ok(PropertyValue::Bool(*v)),
        Value::Number(v) => json_number_to_property_value(v),
        Value::String(v) => Ok(PropertyValue::String(v.clone())),
        Value::Array(values) => json_array_to_property_value(values),
        Value::Null => Err("null property values are not supported".to_string()),
        Value::Object(values) => values
            .iter()
            .map(|(key, value)| {
                let property = json_value_to_property_value(value)?;
                Ok((key.clone(), property))
            })
            .collect::<Result<BTreeMap<String, PropertyValue>, String>>()
            .map(PropertyValue::Map),
    }
}

fn parse_properties_json(raw: Option<&str>) -> Result<PropertyMap, String> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(PropertyMap::new());
    };
    let parsed: Value =
        serde_json::from_str(raw).map_err(|e| format!("invalid properties json: {e}"))?;
    let Value::Object(values) = parsed else {
        return Err("properties must be a json object".to_string());
    };
    values
        .iter()
        .map(|(key, value)| {
            let property = json_value_to_property_value(value)?;
            Ok((key.clone(), property))
        })
        .collect::<Result<BTreeMap<String, PropertyValue>, String>>()
}

#[cfg(test)]
fn property_value_to_json(value: &PropertyValue) -> Value {
    match value {
        PropertyValue::Bool(v) => Value::Bool(*v),
        PropertyValue::I64(v) => Value::Number((*v).into()),
        PropertyValue::F64(v) => serde_json::Number::from_f64(*v)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        PropertyValue::String(v) => Value::String(v.clone()),
        PropertyValue::Bytes(v) => Value::Array(
            v.iter()
                .map(|item| Value::Number((*item as u64).into()))
                .collect(),
        ),
        PropertyValue::Vector(v) => Value::Array(
            v.iter()
                .map(|item| {
                    serde_json::Number::from_f64(*item as f64)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                })
                .collect(),
        ),
        PropertyValue::Date(v) => Value::Number(i64::from(*v).into()),
        PropertyValue::DateTime {
            micros,
            tz_offset_minutes,
        } => Value::Object(
            [
                ("micros".to_string(), Value::Number((*micros).into())),
                (
                    "tz_offset_minutes".to_string(),
                    Value::Number(i64::from(*tz_offset_minutes).into()),
                ),
            ]
            .into_iter()
            .collect(),
        ),
        PropertyValue::Duration {
            months,
            days,
            nanos,
        } => Value::Object(
            [
                ("months".to_string(), Value::Number((*months).into())),
                ("days".to_string(), Value::Number((*days).into())),
                ("nanos".to_string(), Value::Number((*nanos).into())),
            ]
            .into_iter()
            .collect(),
        ),
        PropertyValue::List(values) => {
            Value::Array(values.iter().map(property_value_to_json).collect())
        }
        PropertyValue::Map(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (key.clone(), property_value_to_json(value)))
                .collect(),
        ),
    }
}

#[cfg(test)]
fn query_rows_to_json(rows: Vec<BTreeMap<String, PropertyValue>>) -> Vec<Value> {
    rows.into_iter()
        .map(|row| {
            let object = row
                .into_iter()
                .map(|(key, value)| (key, property_value_to_json(&value)))
                .collect();
            Value::Object(object)
        })
        .collect()
}

fn run_import_export_cli(args: Vec<String>) -> Result<(), String> {
    let result = run_cli(&args);
    if result.exit_code == 0 {
        return Ok(());
    }
    if !result.stderr.trim().is_empty() {
        return Err(result.stderr);
    }
    if !result.stdout.trim().is_empty() {
        return Err(result.stdout);
    }
    Err("command failed".to_string())
}

fn metric_to_json(handle: &OgdbHandleInner) -> Result<String, String> {
    let metrics = handle
        .shared
        .with_write(|db| db.metrics())
        .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "format_version": metrics.format_version,
        "page_size": metrics.page_size,
        "page_count": metrics.page_count,
        "node_count": metrics.node_count,
        "edge_count": metrics.edge_count,
        "wal_size_bytes": metrics.wal_size_bytes,
        "adjacency_base_edge_count": metrics.adjacency_base_edge_count,
        "delta_buffer_edge_count": metrics.delta_buffer_edge_count,
        "compaction_count": metrics.compaction_count,
        "compaction_duration_us": metrics.compaction_duration_us,
        "buffer_pool_hits": metrics.buffer_pool_hits,
        "buffer_pool_misses": metrics.buffer_pool_misses,
    });
    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

fn string_to_c_ptr(payload: String) -> *mut c_char {
    sanitize_error_message(payload).into_raw()
}

fn with_handle_mut<T, F>(handle: *mut OgdbHandle, op: F) -> Result<T, String>
where
    F: FnOnce(&mut OgdbHandleInner) -> Result<T, String>,
{
    if handle.is_null() {
        return Err("database handle is null".to_string());
    }
    // SAFETY: `handle` was returned by `ogdb_init` / `ogdb_open` (each
    // documents that requirement) and the caller is a `pub unsafe extern
    // "C" fn` whose own `# Safety` paragraph forwards that contract. Null
    // was just rejected; the C caller is responsible for not aliasing the
    // handle, exactly like a `&mut` would require.
    let handle_ref = unsafe { &mut *(handle as *mut OgdbHandleInner) };
    op(handle_ref)
}

fn map_query_error(error: impl std::fmt::Display) -> DbError {
    DbError::InvalidArgument(error.to_string())
}

#[cfg(test)]
fn parse_metric(raw: Option<&str>) -> Result<ogdb_core::VectorDistanceMetric, String> {
    match raw.unwrap_or("cosine").trim().to_ascii_lowercase().as_str() {
        "cosine" => Ok(ogdb_core::VectorDistanceMetric::Cosine),
        "euclidean" | "l2" => Ok(ogdb_core::VectorDistanceMetric::Euclidean),
        "dot" | "dotproduct" | "dot_product" => Ok(ogdb_core::VectorDistanceMetric::DotProduct),
        other => Err(format!("unsupported vector distance metric: {other}")),
    }
}

#[no_mangle]
pub extern "C" fn ogdb_last_error() -> *const c_char {
    let Ok(slot) = last_error_store().lock() else {
        return ptr::null();
    };
    slot.as_ref().map_or(ptr::null(), |value| value.as_ptr())
}

#[no_mangle]
/// # Safety
/// `path` must be a non-null pointer to a valid NUL-terminated UTF-8 string.
pub unsafe extern "C" fn ogdb_init(path: *const c_char) -> *mut OgdbHandle {
    clear_last_error();
    let result = (|| -> Result<OgdbHandleInner, String> {
        let path = parse_cstr_required(path, "path")?;
        let shared =
            SharedDatabase::init(&path, Header::default_v1()).map_err(|e| e.to_string())?;
        Ok(OgdbHandleInner {
            path: PathBuf::from(path),
            shared,
        })
    })();
    match result {
        Ok(handle) => Box::into_raw(Box::new(handle)) as *mut OgdbHandle,
        Err(error) => {
            set_last_error(error);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
/// # Safety
/// `path` must be a non-null pointer to a valid NUL-terminated UTF-8 string.
pub unsafe extern "C" fn ogdb_open(path: *const c_char) -> *mut OgdbHandle {
    clear_last_error();
    let result = (|| -> Result<OgdbHandleInner, String> {
        let path = parse_cstr_required(path, "path")?;
        let shared = SharedDatabase::open(&path).map_err(|e| e.to_string())?;
        Ok(OgdbHandleInner {
            path: PathBuf::from(path),
            shared,
        })
    })();
    match result {
        Ok(handle) => Box::into_raw(Box::new(handle)) as *mut OgdbHandle,
        Err(error) => {
            set_last_error(error);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a pointer returned by `ogdb_init` or `ogdb_open`, and it
/// must not be used again after this call.
pub unsafe extern "C" fn ogdb_close(handle: *mut OgdbHandle) {
    clear_last_error();
    if handle.is_null() {
        return;
    }
    // SAFETY: `handle` was produced by `Box::into_raw` inside
    // `ogdb_init`/`ogdb_open`. The function-level `# Safety` paragraph
    // requires the caller to drop the pointer here exactly once.
    drop(unsafe { Box::from_raw(handle as *mut OgdbHandleInner) });
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
/// `labels_json` and `properties_json` must be null or valid NUL-terminated
/// UTF-8 strings for the duration of this call.
pub unsafe extern "C" fn ogdb_create_node(
    handle: *mut OgdbHandle,
    labels_json: *const c_char,
    properties_json: *const c_char,
) -> u64 {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| {
        let labels_raw = parse_cstr_optional(labels_json, "labels_json")?;
        let labels = parse_labels_json(labels_raw.as_deref())?;
        let properties_raw = parse_cstr_optional(properties_json, "properties_json")?;
        let properties = parse_properties_json(properties_raw.as_deref())?;
        handle
            .shared
            .with_write(|db| db.create_node_with(&labels, &properties))
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(node_id) => node_id,
        Err(error) => {
            set_last_error(error);
            OGDB_INVALID_ID
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
/// `edge_type` and `properties_json` must be null or valid NUL-terminated
/// UTF-8 strings for the duration of this call.
pub unsafe extern "C" fn ogdb_add_edge(
    handle: *mut OgdbHandle,
    src: u64,
    dst: u64,
    edge_type: *const c_char,
    properties_json: *const c_char,
) -> u64 {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| {
        let edge_type = parse_cstr_optional(edge_type, "edge_type")?;
        let properties_raw = parse_cstr_optional(properties_json, "properties_json")?;
        let properties = parse_properties_json(properties_raw.as_deref())?;
        handle
            .shared
            .with_write(|db| {
                if let Some(edge_type) = edge_type {
                    db.add_typed_edge(src, dst, &edge_type, &properties)
                } else if properties.is_empty() {
                    db.add_edge(src, dst)
                } else {
                    db.add_edge_with_properties(src, dst, &properties)
                }
            })
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(edge_id) => edge_id,
        Err(error) => {
            set_last_error(error);
            OGDB_INVALID_ID
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
/// `cypher` must be a non-null pointer to a valid NUL-terminated UTF-8 string.
pub unsafe extern "C" fn ogdb_query(handle: *mut OgdbHandle, cypher: *const c_char) -> *mut c_char {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| {
        let query = parse_cstr_required(cypher, "cypher")?;
        let result = handle
            .shared
            .with_write(|db| db.query(&query).map_err(map_query_error))
            .map_err(|e| e.to_string())?;
        Ok(result.to_json())
    });
    match result {
        Ok(payload) => string_to_c_ptr(payload),
        Err(error) => {
            set_last_error(error);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
/// `format` and `src_path` must be non-null pointers to valid NUL-terminated
/// UTF-8 strings.
pub unsafe extern "C" fn ogdb_import(
    handle: *mut OgdbHandle,
    format: *const c_char,
    src_path: *const c_char,
) -> i32 {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| {
        let format = parse_cstr_required(format, "format")?.to_ascii_lowercase();
        let src_path = parse_cstr_required(src_path, "src_path")?;
        match format.as_str() {
            "csv" | "json" | "jsonl" => run_import_export_cli(vec![
                "--format".to_string(),
                format,
                "import".to_string(),
                handle.path.display().to_string(),
                src_path,
            ]),
            "rdf" => run_import_export_cli(vec![
                "import-rdf".to_string(),
                handle.path.display().to_string(),
                src_path,
            ]),
            other => Err(format!(
                "unsupported import format: {other} (expected csv|json|jsonl|rdf)"
            )),
        }
    });
    match result {
        Ok(()) => OGDB_STATUS_OK,
        Err(error) => {
            set_last_error(error);
            OGDB_STATUS_ERR
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
/// `dst_path` and `format` must be non-null pointers to valid NUL-terminated
/// UTF-8 strings.
pub unsafe extern "C" fn ogdb_export(
    handle: *mut OgdbHandle,
    dst_path: *const c_char,
    format: *const c_char,
) -> i32 {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| {
        let dst_path = parse_cstr_required(dst_path, "dst_path")?;
        let format = parse_cstr_required(format, "format")?.to_ascii_lowercase();
        match format.as_str() {
            "csv" | "json" | "jsonl" => run_import_export_cli(vec![
                "--format".to_string(),
                format,
                "export".to_string(),
                handle.path.display().to_string(),
                dst_path,
            ]),
            "rdf" => run_import_export_cli(vec![
                "export-rdf".to_string(),
                handle.path.display().to_string(),
                dst_path,
            ]),
            other => Err(format!(
                "unsupported export format: {other} (expected csv|json|jsonl|rdf)"
            )),
        }
    });
    match result {
        Ok(()) => OGDB_STATUS_OK,
        Err(error) => {
            set_last_error(error);
            OGDB_STATUS_ERR
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
/// `dst_path` must be a non-null pointer to a valid NUL-terminated UTF-8 string.
pub unsafe extern "C" fn ogdb_backup(handle: *mut OgdbHandle, dst_path: *const c_char) -> i32 {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| {
        let dst_path = parse_cstr_required(dst_path, "dst_path")?;
        handle
            .shared
            .with_write(|db| db.backup(dst_path))
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(()) => OGDB_STATUS_OK,
        Err(error) => {
            set_last_error(error);
            OGDB_STATUS_ERR
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
pub unsafe extern "C" fn ogdb_checkpoint(handle: *mut OgdbHandle) -> i32 {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| {
        handle
            .shared
            .with_write(|db| db.checkpoint())
            .map_err(|e| e.to_string())
    });
    match result {
        Ok(()) => OGDB_STATUS_OK,
        Err(error) => {
            set_last_error(error);
            OGDB_STATUS_ERR
        }
    }
}

#[no_mangle]
/// # Safety
/// `handle` must be a valid handle from `ogdb_init`/`ogdb_open`.
pub unsafe extern "C" fn ogdb_metrics(handle: *mut OgdbHandle) -> *mut c_char {
    clear_last_error();
    let result = with_handle_mut(handle, |handle| metric_to_json(handle));
    match result {
        Ok(payload) => string_to_c_ptr(payload),
        Err(error) => {
            set_last_error(error);
            ptr::null_mut()
        }
    }
}

#[no_mangle]
/// # Safety
/// `ptr` must be a pointer returned by this library (for example from
/// `ogdb_query` or `ogdb_metrics`) and must be freed at most once.
pub unsafe extern "C" fn ogdb_free(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    // SAFETY: `ptr` was produced by `CString::into_raw` (via
    // `string_to_c_ptr` / `sanitize_error_message`). The function-level
    // `# Safety` paragraph requires the caller to free the pointer here
    // exactly once and never use it again.
    drop(unsafe { CString::from_raw(ptr) });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn property_json_round_trip_maps_scalars_and_vectors() {
        let properties = parse_properties_json(Some(
            r#"{"flag":true,"count":42,"score":1.25,"name":"alice","vec":[1,2,3]}"#,
        ))
        .expect("properties");
        assert_eq!(properties.get("flag"), Some(&PropertyValue::Bool(true)));
        assert_eq!(properties.get("count"), Some(&PropertyValue::I64(42)));
        assert_eq!(properties.get("score"), Some(&PropertyValue::F64(1.25)));
        assert_eq!(
            properties.get("name"),
            Some(&PropertyValue::String("alice".to_string()))
        );
        assert_eq!(
            properties.get("vec"),
            Some(&PropertyValue::Vector(vec![1.0, 2.0, 3.0]))
        );
    }

    #[test]
    fn rows_to_json_maps_property_values() {
        let rows = vec![BTreeMap::from([
            ("flag".to_string(), PropertyValue::Bool(true)),
            ("count".to_string(), PropertyValue::I64(2)),
        ])];
        let out = query_rows_to_json(rows);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].get("flag"), Some(&Value::Bool(true)));
        assert_eq!(out[0].get("count"), Some(&Value::Number(2.into())));
    }

    #[test]
    fn metric_parser_supports_aliases() {
        assert!(parse_metric(Some("cosine")).is_ok());
        assert!(parse_metric(Some("euclidean")).is_ok());
        assert!(parse_metric(Some("dot")).is_ok());
        assert!(parse_metric(Some("dot_product")).is_ok());
        assert!(parse_metric(Some("bad")).is_err());
    }
}
