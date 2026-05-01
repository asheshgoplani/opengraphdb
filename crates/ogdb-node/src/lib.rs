// EVAL-RUST-QUALITY-CYCLE2 H11: the workspace `unsafe_op_in_unsafe_fn` lint
// fires on napi-macro-generated code (`#[napi]` synthesises `unsafe extern "C"
// fn` bodies). The macro output is not editable; suppress here.
#![allow(unsafe_op_in_unsafe_fn)]

use ogdb_cli::run as run_cli;
use ogdb_core::{
    DbError, Header, PropertyMap, PropertyValue, SharedDatabase, VectorDistanceMetric,
};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[cfg(feature = "node")]
use napi::bindgen_prelude::{Error, Result};
#[cfg(feature = "node")]
use napi_derive::napi;

#[derive(Debug, Clone)]
pub struct NodeBindingDatabase {
    path: PathBuf,
    shared: Option<SharedDatabase>,
}

type BindingResult<T> = std::result::Result<T, String>;

fn parse_metric(metric: Option<&str>) -> BindingResult<VectorDistanceMetric> {
    match metric
        .unwrap_or("cosine")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "cosine" => Ok(VectorDistanceMetric::Cosine),
        "euclidean" | "l2" => Ok(VectorDistanceMetric::Euclidean),
        "dot" | "dotproduct" | "dot_product" => Ok(VectorDistanceMetric::DotProduct),
        other => Err(format!("unsupported vector distance metric: {other}")),
    }
}

fn map_query_error(error: impl std::fmt::Display) -> DbError {
    DbError::InvalidArgument(error.to_string())
}

fn run_import_export_cli(args: Vec<String>) -> BindingResult<()> {
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

fn parse_labels(labels: Vec<String>) -> Vec<String> {
    labels
        .into_iter()
        .map(|label| label.trim().to_string())
        .filter(|label| !label.is_empty())
        .collect()
}

fn json_number_to_property_value(value: &serde_json::Number) -> BindingResult<PropertyValue> {
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

fn json_array_to_property_value(values: &[Value]) -> BindingResult<PropertyValue> {
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
        .collect::<BindingResult<Vec<_>>>()
        .map(PropertyValue::List)
}

fn json_value_to_property_value(value: &Value) -> BindingResult<PropertyValue> {
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
            .collect::<BindingResult<BTreeMap<String, PropertyValue>>>()
            .map(PropertyValue::Map),
    }
}

fn json_object_to_property_map(value: Value) -> BindingResult<PropertyMap> {
    match value {
        Value::Null => Ok(PropertyMap::new()),
        Value::Object(values) => values
            .iter()
            .map(|(key, value)| {
                let property = json_value_to_property_value(value)?;
                Ok((key.clone(), property))
            })
            .collect::<BindingResult<BTreeMap<String, PropertyValue>>>(),
        _ => Err("properties must be a json object".to_string()),
    }
}

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

fn property_rows_to_json_rows(
    rows: Vec<BTreeMap<String, PropertyValue>>,
) -> Vec<Map<String, Value>> {
    rows.into_iter()
        .map(|row| {
            row.into_iter()
                .map(|(key, value)| (key, property_value_to_json(&value)))
                .collect()
        })
        .collect()
}

fn json_string_literal(value: &str) -> String {
    serde_json::to_string(value).expect("json encoding string should succeed")
}

impl NodeBindingDatabase {
    pub fn init(path: &str) -> BindingResult<Self> {
        let path = path.trim();
        if path.is_empty() {
            return Err("path cannot be empty".to_string());
        }
        let shared = SharedDatabase::init(path, Header::default_v1()).map_err(|e| e.to_string())?;
        Ok(Self {
            path: PathBuf::from(path),
            shared: Some(shared),
        })
    }

    pub fn open(path: &str) -> BindingResult<Self> {
        let path = path.trim();
        if path.is_empty() {
            return Err("path cannot be empty".to_string());
        }
        let shared = SharedDatabase::open(path).map_err(|e| e.to_string())?;
        Ok(Self {
            path: PathBuf::from(path),
            shared: Some(shared),
        })
    }

    pub fn close(&mut self) {
        self.shared = None;
    }

    fn shared(&self) -> BindingResult<&SharedDatabase> {
        self.shared
            .as_ref()
            .ok_or_else(|| "database is closed".to_string())
    }

    fn reopen_after_cli(&mut self) -> BindingResult<()> {
        self.shared = Some(SharedDatabase::open(&self.path).map_err(|e| e.to_string())?);
        Ok(())
    }

    pub fn create_node_raw(
        &mut self,
        labels: Vec<String>,
        properties: PropertyMap,
    ) -> BindingResult<u64> {
        let labels = parse_labels(labels);
        self.shared()?
            .with_write(|db| db.create_node_with(&labels, &properties))
            .map_err(|e| e.to_string())
    }

    pub fn create_node(&mut self, labels: Vec<String>, properties: Value) -> BindingResult<u64> {
        let properties = json_object_to_property_map(properties)?;
        self.create_node_raw(labels, properties)
    }

    pub fn add_edge_raw(
        &mut self,
        src: u64,
        dst: u64,
        edge_type: Option<String>,
        properties: PropertyMap,
    ) -> BindingResult<u64> {
        let edge_type = edge_type.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        self.shared()?
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
    }

    pub fn add_edge(
        &mut self,
        src: u64,
        dst: u64,
        edge_type: Option<String>,
        properties: Value,
    ) -> BindingResult<u64> {
        let properties = json_object_to_property_map(properties)?;
        self.add_edge_raw(src, dst, edge_type, properties)
    }

    pub fn query_raw(
        &mut self,
        cypher: &str,
    ) -> BindingResult<Vec<BTreeMap<String, PropertyValue>>> {
        let cypher = cypher.trim();
        if cypher.is_empty() {
            return Err("cypher query cannot be empty".to_string());
        }
        self.shared()?
            .with_write(|db| {
                db.query(cypher)
                    .map(|result| result.to_rows())
                    .map_err(map_query_error)
            })
            .map_err(|e| e.to_string())
    }

    pub fn query(&mut self, cypher: &str) -> BindingResult<Vec<Map<String, Value>>> {
        Ok(property_rows_to_json_rows(self.query_raw(cypher)?))
    }

    pub fn import_csv(&mut self, src_path: &str) -> BindingResult<()> {
        let args = vec![
            "--format".to_string(),
            "csv".to_string(),
            "import".to_string(),
            self.path.display().to_string(),
            src_path.to_string(),
        ];
        self.shared = None;
        let result = run_import_export_cli(args);
        self.reopen_after_cli()?;
        result
    }

    pub fn import_json(&mut self, src_path: &str) -> BindingResult<()> {
        let args = vec![
            "--format".to_string(),
            "json".to_string(),
            "import".to_string(),
            self.path.display().to_string(),
            src_path.to_string(),
        ];
        self.shared = None;
        let result = run_import_export_cli(args);
        self.reopen_after_cli()?;
        result
    }

    pub fn import_rdf(&mut self, src_path: &str) -> BindingResult<()> {
        let args = vec![
            "import-rdf".to_string(),
            self.path.display().to_string(),
            src_path.to_string(),
        ];
        self.shared = None;
        let result = run_import_export_cli(args);
        self.reopen_after_cli()?;
        result
    }

    pub fn export(&mut self, dst_path: &str, format: Option<String>) -> BindingResult<()> {
        let mut args = Vec::<String>::new();
        if let Some(format) = format
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty())
        {
            if format == "rdf" {
                args.push("export-rdf".to_string());
            } else {
                args.push("--format".to_string());
                args.push(format);
                args.push("export".to_string());
            }
        } else {
            args.push("export".to_string());
        }
        args.push(self.path.display().to_string());
        args.push(dst_path.to_string());
        run_import_export_cli(args)
    }

    pub fn create_vector_index(
        &mut self,
        name: &str,
        label: Option<&str>,
        property_key: &str,
        dimensions: usize,
        metric: Option<&str>,
    ) -> BindingResult<()> {
        let metric = parse_metric(metric)?;
        let label = label.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });
        self.shared()?
            .with_write(|db| db.create_vector_index(name, label, property_key, dimensions, metric))
            .map_err(|e| e.to_string())
    }

    pub fn create_fulltext_index(
        &mut self,
        name: &str,
        label: Option<&str>,
        property_keys: Vec<String>,
    ) -> BindingResult<()> {
        let label = label.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });
        self.shared()?
            .with_write(|db| db.create_fulltext_index(name, label, &property_keys))
            .map_err(|e| e.to_string())
    }

    pub fn vector_search_raw(
        &mut self,
        index_name: &str,
        query_vector: Vec<f32>,
        k: usize,
    ) -> BindingResult<Vec<BTreeMap<String, PropertyValue>>> {
        let vector = query_vector
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "CALL db.index.vector.queryNodes({}, [{}], {}) YIELD node, score RETURN node, score ORDER BY score ASC",
            json_string_literal(index_name),
            vector,
            k.max(1)
        );
        self.query_raw(&query)
    }

    pub fn vector_search(
        &mut self,
        index_name: &str,
        query_vector: Vec<f32>,
        k: usize,
    ) -> BindingResult<Vec<Map<String, Value>>> {
        Ok(property_rows_to_json_rows(self.vector_search_raw(
            index_name,
            query_vector,
            k,
        )?))
    }

    pub fn text_search_raw(
        &mut self,
        index_name: &str,
        query_text: &str,
        k: usize,
    ) -> BindingResult<Vec<BTreeMap<String, PropertyValue>>> {
        let query = format!(
            "CALL db.index.fulltext.queryNodes({}, {}, {}) YIELD node, score RETURN node, score ORDER BY score DESC",
            json_string_literal(index_name),
            json_string_literal(query_text),
            k.max(1)
        );
        self.query_raw(&query)
    }

    pub fn text_search(
        &mut self,
        index_name: &str,
        query_text: &str,
        k: usize,
    ) -> BindingResult<Vec<Map<String, Value>>> {
        Ok(property_rows_to_json_rows(
            self.text_search_raw(index_name, query_text, k)?,
        ))
    }

    pub fn backup(&mut self, dst_path: &str) -> BindingResult<()> {
        self.shared()?
            .with_write(|db| db.backup(dst_path))
            .map_err(|e| e.to_string())
    }

    pub fn checkpoint(&mut self) -> BindingResult<()> {
        self.shared()?
            .with_write(|db| db.checkpoint())
            .map_err(|e| e.to_string())
    }

    pub fn metrics(&mut self) -> BindingResult<Map<String, Value>> {
        let metrics = self
            .shared()?
            .with_write(|db| db.metrics())
            .map_err(|e| e.to_string())?;
        Ok(Map::from_iter([
            (
                "format_version".to_string(),
                Value::Number((metrics.format_version as u64).into()),
            ),
            (
                "page_size".to_string(),
                Value::Number((metrics.page_size as u64).into()),
            ),
            (
                "page_count".to_string(),
                Value::Number(metrics.page_count.into()),
            ),
            (
                "node_count".to_string(),
                Value::Number(metrics.node_count.into()),
            ),
            (
                "edge_count".to_string(),
                Value::Number(metrics.edge_count.into()),
            ),
            (
                "wal_size_bytes".to_string(),
                Value::Number(metrics.wal_size_bytes.into()),
            ),
            (
                "adjacency_base_edge_count".to_string(),
                Value::Number(metrics.adjacency_base_edge_count.into()),
            ),
            (
                "delta_buffer_edge_count".to_string(),
                Value::Number(metrics.delta_buffer_edge_count.into()),
            ),
            (
                "compaction_count".to_string(),
                Value::Number(metrics.compaction_count.into()),
            ),
            (
                "compaction_duration_us".to_string(),
                Value::Number(metrics.compaction_duration_us.into()),
            ),
            (
                "buffer_pool_hits".to_string(),
                Value::Number(metrics.buffer_pool_hits.into()),
            ),
            (
                "buffer_pool_misses".to_string(),
                Value::Number(metrics.buffer_pool_misses.into()),
            ),
        ]))
    }
}

#[cfg(feature = "node")]
fn to_napi_error(error: String) -> Error {
    Error::from_reason(error)
}

#[cfg(feature = "node")]
fn napi_i64_to_u64(name: &str, value: i64) -> Result<u64> {
    u64::try_from(value).map_err(|_| Error::from_reason(format!("{name} must be >= 0")))
}

#[cfg(feature = "node")]
fn napi_u64_to_i64(name: &str, value: u64) -> Result<i64> {
    i64::try_from(value)
        .map_err(|_| Error::from_reason(format!("{name} exceeds JS safe integer range")))
}

#[cfg(feature = "node")]
#[napi]
pub struct Database {
    inner: NodeBindingDatabase,
}

#[cfg(feature = "node")]
#[napi]
impl Database {
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self> {
        let path_ref = path.as_str();
        let inner = match NodeBindingDatabase::open(path_ref) {
            Ok(db) => db,
            Err(_) => NodeBindingDatabase::init(path_ref).map_err(to_napi_error)?,
        };
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn init(path: String) -> Result<Self> {
        Ok(Self {
            inner: NodeBindingDatabase::init(&path).map_err(to_napi_error)?,
        })
    }

    #[napi(factory)]
    pub fn open(path: String) -> Result<Self> {
        Ok(Self {
            inner: NodeBindingDatabase::open(&path).map_err(to_napi_error)?,
        })
    }

    #[napi]
    pub fn close(&mut self) {
        self.inner.close();
    }

    #[napi(js_name = "createNode")]
    pub fn create_node(&mut self, labels: Vec<String>, properties: Option<Value>) -> Result<i64> {
        let node_id = self
            .inner
            .create_node(labels, properties.unwrap_or(Value::Null))
            .map_err(to_napi_error)?;
        napi_u64_to_i64("node id", node_id)
    }

    #[napi(js_name = "addEdge")]
    pub fn add_edge(
        &mut self,
        src: i64,
        dst: i64,
        edge_type: Option<String>,
        properties: Option<Value>,
    ) -> Result<i64> {
        let src = napi_i64_to_u64("src", src)?;
        let dst = napi_i64_to_u64("dst", dst)?;
        let edge_id = self
            .inner
            .add_edge(src, dst, edge_type, properties.unwrap_or(Value::Null))
            .map_err(to_napi_error)?;
        napi_u64_to_i64("edge id", edge_id)
    }

    #[napi]
    pub fn query(&mut self, cypher: String) -> Result<Vec<Value>> {
        self.inner
            .query(&cypher)
            .map(|rows| rows.into_iter().map(Value::Object).collect())
            .map_err(to_napi_error)
    }

    #[napi(js_name = "importCsv")]
    pub fn import_csv(&mut self, path: String) -> Result<()> {
        self.inner.import_csv(&path).map_err(to_napi_error)
    }

    #[napi(js_name = "importJson")]
    pub fn import_json(&mut self, path: String) -> Result<()> {
        self.inner.import_json(&path).map_err(to_napi_error)
    }

    #[napi(js_name = "importRdf")]
    pub fn import_rdf(&mut self, path: String) -> Result<()> {
        self.inner.import_rdf(&path).map_err(to_napi_error)
    }

    #[napi]
    pub fn export(&mut self, path: String, format: Option<String>) -> Result<()> {
        self.inner.export(&path, format).map_err(to_napi_error)
    }

    #[napi(js_name = "createVectorIndex")]
    pub fn create_vector_index(
        &mut self,
        name: String,
        label: Option<String>,
        property_key: String,
        dimensions: u32,
        metric: Option<String>,
    ) -> Result<()> {
        self.inner
            .create_vector_index(
                &name,
                label.as_deref(),
                &property_key,
                dimensions as usize,
                metric.as_deref(),
            )
            .map_err(to_napi_error)
    }

    #[napi(js_name = "createFulltextIndex")]
    pub fn create_fulltext_index(
        &mut self,
        name: String,
        label: Option<String>,
        property_keys: Vec<String>,
    ) -> Result<()> {
        self.inner
            .create_fulltext_index(&name, label.as_deref(), property_keys)
            .map_err(to_napi_error)
    }

    #[napi(js_name = "vectorSearch")]
    pub fn vector_search(
        &mut self,
        index_name: String,
        query_vector: Vec<f64>,
        k: u32,
    ) -> Result<Vec<Value>> {
        let query_vector = query_vector.into_iter().map(|value| value as f32).collect();
        self.inner
            .vector_search(&index_name, query_vector, k as usize)
            .map(|rows| rows.into_iter().map(Value::Object).collect())
            .map_err(to_napi_error)
    }

    #[napi(js_name = "textSearch")]
    pub fn text_search(
        &mut self,
        index_name: String,
        query_text: String,
        k: u32,
    ) -> Result<Vec<Value>> {
        self.inner
            .text_search(&index_name, &query_text, k as usize)
            .map(|rows| rows.into_iter().map(Value::Object).collect())
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn backup(&mut self, dest_path: String) -> Result<()> {
        self.inner.backup(&dest_path).map_err(to_napi_error)
    }

    #[napi]
    pub fn checkpoint(&mut self) -> Result<()> {
        self.inner.checkpoint().map_err(to_napi_error)
    }

    #[napi]
    pub fn metrics(&mut self) -> Result<Value> {
        self.inner
            .metrics()
            .map(Value::Object)
            .map_err(to_napi_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metric_parser_accepts_supported_values() {
        assert!(parse_metric(Some("cosine")).is_ok());
        assert!(parse_metric(Some("euclidean")).is_ok());
        assert!(parse_metric(Some("dot")).is_ok());
        assert!(parse_metric(Some("dot_product")).is_ok());
        assert!(parse_metric(Some("bad")).is_err());
    }

    #[test]
    fn json_property_conversion_maps_vector_numbers() {
        let map = json_object_to_property_map(serde_json::json!({
            "flag": true,
            "age": 42,
            "score": 0.5,
            "name": "alice",
            "embedding": [1.0, 0.0, 0.0]
        }))
        .expect("property map");
        assert_eq!(map.get("flag"), Some(&PropertyValue::Bool(true)));
        assert_eq!(map.get("age"), Some(&PropertyValue::I64(42)));
        assert_eq!(map.get("score"), Some(&PropertyValue::F64(0.5)));
        assert_eq!(
            map.get("name"),
            Some(&PropertyValue::String("alice".to_string()))
        );
        assert_eq!(
            map.get("embedding"),
            Some(&PropertyValue::Vector(vec![1.0, 0.0, 0.0]))
        );
    }
}
