//! # ogdb-python
//!
//! Python (`pyo3`-based) bindings for OpenGraphDB. Exposes a `Database` class
//! that wraps [`ogdb_core::Database`] with `init` / `open` / `close` /
//! `create_node` / `add_edge` / `query` / `import_csv` / `import_json` /
//! `import_rdf` / `export` / vector + text index helpers / `vector_search`.
//! Status: **experimental**.
//!
//! See <https://github.com/asheshgoplani/opengraphdb> for the parent project
//! and `bindings/python/` (planned) for usage examples; runnable Python
//! integration recipes (LLM → Cypher, hybrid retrieval) live in
//! [`documentation/COOKBOOK.md`](https://github.com/asheshgoplani/opengraphdb/blob/main/documentation/COOKBOOK.md).

// pyo3 0.21 deprecation warnings (`OptionGilRefs`, `GilRefs`) trip
// `-D warnings` under `--all-features`. The pyo3 0.21 → 0.24
// migration is deferred per documentation/SECURITY-FOLLOWUPS.md
// (RUSTSEC-2025-0020); tracked as a separate post-v0.5 task. Allow
// the deprecations only when the python feature is enabled so the
// rest of the crate (re-exports, CLI runner) keeps the strict gate.
#![cfg_attr(feature = "python", allow(deprecated))]

use ogdb_cli::run as run_cli;
use ogdb_core::{
    DbError, Header, PropertyMap, PropertyValue, SharedDatabase, VectorDistanceMetric,
};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[cfg(feature = "python")]
use pyo3::exceptions::{PyRuntimeError, PyValueError};
#[cfg(feature = "python")]
use pyo3::prelude::*;
#[cfg(feature = "python")]
use pyo3::types::{PyAny, PyBytes, PyDict, PyList};

#[derive(Debug, Clone)]
pub struct BindingDatabase {
    path: PathBuf,
    shared: Option<SharedDatabase>,
}

fn parse_metric(metric: Option<&str>) -> Result<VectorDistanceMetric, String> {
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

fn parse_labels(labels: Vec<String>) -> Vec<String> {
    labels
        .into_iter()
        .map(|label| label.trim().to_string())
        .filter(|label| !label.is_empty())
        .collect()
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

fn json_object_to_property_map(value: Value) -> Result<PropertyMap, String> {
    match value {
        Value::Null => Ok(PropertyMap::new()),
        Value::Object(values) => values
            .iter()
            .map(|(key, value)| {
                let property = json_value_to_property_value(value)?;
                Ok((key.clone(), property))
            })
            .collect::<Result<BTreeMap<String, PropertyValue>, String>>(),
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

impl BindingDatabase {
    pub fn init(path: &str) -> Result<Self, String> {
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

    pub fn open(path: &str) -> Result<Self, String> {
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

    fn shared(&self) -> Result<&SharedDatabase, String> {
        self.shared
            .as_ref()
            .ok_or_else(|| "database is closed".to_string())
    }

    fn reopen_after_cli(&mut self) -> Result<(), String> {
        self.shared = Some(SharedDatabase::open(&self.path).map_err(|e| e.to_string())?);
        Ok(())
    }

    pub fn create_node_raw(
        &mut self,
        labels: Vec<String>,
        properties: PropertyMap,
    ) -> Result<u64, String> {
        let labels = parse_labels(labels);
        self.shared()?
            .with_write(|db| db.create_node_with(&labels, &properties))
            .map_err(|e| e.to_string())
    }

    pub fn create_node(&mut self, labels: Vec<String>, properties: Value) -> Result<u64, String> {
        let properties = json_object_to_property_map(properties)?;
        self.create_node_raw(labels, properties)
    }

    pub fn add_edge_raw(
        &mut self,
        src: u64,
        dst: u64,
        edge_type: Option<String>,
        properties: PropertyMap,
    ) -> Result<u64, String> {
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
    ) -> Result<u64, String> {
        let properties = json_object_to_property_map(properties)?;
        self.add_edge_raw(src, dst, edge_type, properties)
    }

    pub fn query_raw(
        &mut self,
        cypher: &str,
    ) -> Result<Vec<BTreeMap<String, PropertyValue>>, String> {
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

    pub fn query(&mut self, cypher: &str) -> Result<Vec<Map<String, Value>>, String> {
        Ok(property_rows_to_json_rows(self.query_raw(cypher)?))
    }

    pub fn import_csv(&mut self, src_path: &str) -> Result<(), String> {
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

    pub fn import_json(&mut self, src_path: &str) -> Result<(), String> {
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

    pub fn import_rdf(&mut self, src_path: &str) -> Result<(), String> {
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

    pub fn export(&mut self, dst_path: &str, format: Option<String>) -> Result<(), String> {
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
    ) -> Result<(), String> {
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
    ) -> Result<(), String> {
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
    ) -> Result<Vec<BTreeMap<String, PropertyValue>>, String> {
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
    ) -> Result<Vec<Map<String, Value>>, String> {
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
    ) -> Result<Vec<BTreeMap<String, PropertyValue>>, String> {
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
    ) -> Result<Vec<Map<String, Value>>, String> {
        Ok(property_rows_to_json_rows(
            self.text_search_raw(index_name, query_text, k)?,
        ))
    }

    pub fn backup(&mut self, dst_path: &str) -> Result<(), String> {
        self.shared()?
            .with_write(|db| db.backup(dst_path))
            .map_err(|e| e.to_string())
    }

    pub fn checkpoint(&mut self) -> Result<(), String> {
        self.shared()?
            .with_write(|db| db.checkpoint())
            .map_err(|e| e.to_string())
    }

    pub fn metrics(&mut self) -> Result<Map<String, Value>, String> {
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

#[cfg(feature = "python")]
fn py_value_to_property_value(value: &PyAny) -> PyResult<PropertyValue> {
    if let Ok(v) = value.extract::<bool>() {
        return Ok(PropertyValue::Bool(v));
    }
    if let Ok(v) = value.extract::<i64>() {
        return Ok(PropertyValue::I64(v));
    }
    if let Ok(v) = value.extract::<f64>() {
        if !v.is_finite() {
            return Err(PyValueError::new_err(
                "non-finite float property values are not supported",
            ));
        }
        return Ok(PropertyValue::F64(v));
    }
    if let Ok(v) = value.extract::<String>() {
        return Ok(PropertyValue::String(v));
    }
    if let Ok(v) = value.downcast::<PyBytes>() {
        return Ok(PropertyValue::Bytes(v.as_bytes().to_vec()));
    }
    if let Ok(v) = value.extract::<Vec<f32>>() {
        if v.iter().any(|item| !item.is_finite()) {
            return Err(PyValueError::new_err(
                "vector property values must be finite",
            ));
        }
        return Ok(PropertyValue::Vector(v));
    }
    if let Ok(dict) = value.downcast::<PyDict>() {
        let mut out = BTreeMap::<String, PropertyValue>::new();
        for (key, value) in dict {
            let key = key
                .extract::<String>()
                .map_err(|_| PyValueError::new_err("property keys must be strings"))?;
            out.insert(key, py_value_to_property_value(value)?);
        }
        return Ok(PropertyValue::Map(out));
    }
    Err(PyValueError::new_err(
        "unsupported property value type; expected bool/int/float/str/bytes/list[float]/dict",
    ))
}

#[cfg(feature = "python")]
fn py_dict_to_property_map(properties: Option<&PyDict>) -> PyResult<PropertyMap> {
    let mut map = PropertyMap::new();
    let Some(properties) = properties else {
        return Ok(map);
    };
    for (key, value) in properties {
        let key = key
            .extract::<String>()
            .map_err(|_| PyValueError::new_err("property keys must be strings"))?;
        map.insert(key, py_value_to_property_value(value)?);
    }
    Ok(map)
}

#[cfg(feature = "python")]
fn property_value_to_py_object(py: Python<'_>, value: &PropertyValue) -> PyObject {
    match value {
        PropertyValue::Bool(v) => v.into_py(py),
        PropertyValue::I64(v) => v.into_py(py),
        PropertyValue::F64(v) => v.into_py(py),
        PropertyValue::String(v) => v.into_py(py),
        PropertyValue::Bytes(v) => PyBytes::new_bound(py, v).into_py(py),
        PropertyValue::Vector(v) => v.clone().into_py(py),
        PropertyValue::Date(v) => i64::from(*v).into_py(py),
        PropertyValue::DateTime {
            micros,
            tz_offset_minutes,
        } => {
            let dict = PyDict::new_bound(py);
            dict.set_item("micros", *micros)
                .expect("python dict set should succeed");
            dict.set_item("tz_offset_minutes", i64::from(*tz_offset_minutes))
                .expect("python dict set should succeed");
            dict.into_py(py)
        }
        PropertyValue::Duration {
            months,
            days,
            nanos,
        } => {
            let dict = PyDict::new_bound(py);
            dict.set_item("months", *months)
                .expect("python dict set should succeed");
            dict.set_item("days", *days)
                .expect("python dict set should succeed");
            dict.set_item("nanos", *nanos)
                .expect("python dict set should succeed");
            dict.into_py(py)
        }
        PropertyValue::List(values) => {
            let list = PyList::empty_bound(py);
            for value in values {
                list.append(property_value_to_py_object(py, value))
                    .expect("python list append should succeed");
            }
            list.into_py(py)
        }
        PropertyValue::Map(values) => {
            let dict = PyDict::new_bound(py);
            for (key, value) in values {
                dict.set_item(key, property_value_to_py_object(py, value))
                    .expect("python dict set should succeed");
            }
            dict.into_py(py)
        }
    }
}

#[cfg(feature = "python")]
fn json_to_py_object(py: Python<'_>, value: &Value) -> PyObject {
    match value {
        Value::Null => py.None(),
        Value::Bool(v) => v.into_py(py),
        Value::Number(v) => {
            if let Some(i) = v.as_i64() {
                i.into_py(py)
            } else if let Some(u) = v.as_u64() {
                u.into_py(py)
            } else if let Some(f) = v.as_f64() {
                f.into_py(py)
            } else {
                py.None()
            }
        }
        Value::String(v) => v.into_py(py),
        Value::Array(values) => {
            let list = PyList::empty_bound(py);
            for value in values {
                list.append(json_to_py_object(py, value))
                    .expect("python list append should succeed");
            }
            list.into_py(py)
        }
        Value::Object(values) => {
            let dict = PyDict::new_bound(py);
            for (key, value) in values {
                dict.set_item(key, json_to_py_object(py, value))
                    .expect("python dict set item should succeed");
            }
            dict.into_py(py)
        }
    }
}

#[cfg(feature = "python")]
#[pyclass(name = "Database")]
pub struct PythonDatabase {
    inner: BindingDatabase,
}

#[cfg(feature = "python")]
fn to_py_runtime_error(error: String) -> PyErr {
    PyRuntimeError::new_err(error)
}

#[cfg(feature = "python")]
#[pymethods]
impl PythonDatabase {
    #[new]
    fn new(path: String) -> PyResult<Self> {
        Self::open(path)
    }

    #[staticmethod]
    fn init(path: String) -> PyResult<Self> {
        Ok(Self {
            inner: BindingDatabase::init(&path).map_err(to_py_runtime_error)?,
        })
    }

    #[staticmethod]
    fn open(path: String) -> PyResult<Self> {
        Ok(Self {
            inner: BindingDatabase::open(&path).map_err(to_py_runtime_error)?,
        })
    }

    fn close(&mut self) {
        self.inner.close();
    }

    #[pyo3(signature = (labels, properties=None))]
    fn create_node(&mut self, labels: Vec<String>, properties: Option<&PyDict>) -> PyResult<u64> {
        let properties = py_dict_to_property_map(properties)?;
        self.inner
            .create_node_raw(labels, properties)
            .map_err(to_py_runtime_error)
    }

    #[pyo3(signature = (src, dst, edge_type=None, properties=None))]
    fn add_edge(
        &mut self,
        src: u64,
        dst: u64,
        edge_type: Option<String>,
        properties: Option<&PyDict>,
    ) -> PyResult<u64> {
        let properties = py_dict_to_property_map(properties)?;
        self.inner
            .add_edge_raw(src, dst, edge_type, properties)
            .map_err(to_py_runtime_error)
    }

    fn query(&mut self, py: Python<'_>, cypher_string: &str) -> PyResult<PyObject> {
        let rows = self
            .inner
            .query_raw(cypher_string)
            .map_err(to_py_runtime_error)?;
        let list = PyList::empty_bound(py);
        for row in rows {
            let dict = PyDict::new_bound(py);
            for (key, value) in row {
                dict.set_item(key, property_value_to_py_object(py, &value))?;
            }
            list.append(dict)?;
        }
        Ok(list.into_py(py))
    }

    fn import_csv(&mut self, path: &str) -> PyResult<()> {
        self.inner.import_csv(path).map_err(to_py_runtime_error)
    }

    fn import_json(&mut self, path: &str) -> PyResult<()> {
        self.inner.import_json(path).map_err(to_py_runtime_error)
    }

    fn import_rdf(&mut self, path: &str) -> PyResult<()> {
        self.inner.import_rdf(path).map_err(to_py_runtime_error)
    }

    #[pyo3(signature = (path, format=None))]
    fn export(&mut self, path: &str, format: Option<String>) -> PyResult<()> {
        self.inner.export(path, format).map_err(to_py_runtime_error)
    }

    #[pyo3(signature = (name, label, property_key, dimensions, metric=None))]
    fn create_vector_index(
        &mut self,
        name: &str,
        label: Option<String>,
        property_key: &str,
        dimensions: usize,
        metric: Option<String>,
    ) -> PyResult<()> {
        self.inner
            .create_vector_index(
                name,
                label.as_deref(),
                property_key,
                dimensions,
                metric.as_deref(),
            )
            .map_err(to_py_runtime_error)
    }

    #[pyo3(signature = (name, property_keys, label=None))]
    fn create_fulltext_index(
        &mut self,
        name: &str,
        property_keys: Vec<String>,
        label: Option<String>,
    ) -> PyResult<()> {
        self.inner
            .create_fulltext_index(name, label.as_deref(), property_keys)
            .map_err(to_py_runtime_error)
    }

    fn vector_search(
        &mut self,
        py: Python<'_>,
        index_name: &str,
        query_vector: Vec<f32>,
        k: usize,
    ) -> PyResult<PyObject> {
        let rows = self
            .inner
            .vector_search_raw(index_name, query_vector, k)
            .map_err(to_py_runtime_error)?;
        let list = PyList::empty_bound(py);
        for row in rows {
            let dict = PyDict::new_bound(py);
            for (key, value) in row {
                dict.set_item(key, property_value_to_py_object(py, &value))?;
            }
            list.append(dict)?;
        }
        Ok(list.into_py(py))
    }

    fn text_search(
        &mut self,
        py: Python<'_>,
        index_name: &str,
        query_text: &str,
        k: usize,
    ) -> PyResult<PyObject> {
        let rows = self
            .inner
            .text_search_raw(index_name, query_text, k)
            .map_err(to_py_runtime_error)?;
        let list = PyList::empty_bound(py);
        for row in rows {
            let dict = PyDict::new_bound(py);
            for (key, value) in row {
                dict.set_item(key, property_value_to_py_object(py, &value))?;
            }
            list.append(dict)?;
        }
        Ok(list.into_py(py))
    }

    fn backup(&mut self, dest_path: &str) -> PyResult<()> {
        self.inner.backup(dest_path).map_err(to_py_runtime_error)
    }

    fn checkpoint(&mut self) -> PyResult<()> {
        self.inner.checkpoint().map_err(to_py_runtime_error)
    }

    fn metrics(&mut self, py: Python<'_>) -> PyResult<PyObject> {
        let metrics = self.inner.metrics().map_err(to_py_runtime_error)?;
        Ok(json_to_py_object(py, &Value::Object(metrics)))
    }
}

#[cfg(feature = "python")]
#[pymodule]
fn opengraphdb(_py: Python<'_>, module: &PyModule) -> PyResult<()> {
    module.add_class::<PythonDatabase>()?;
    Ok(())
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
