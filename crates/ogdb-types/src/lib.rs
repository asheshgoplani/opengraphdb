//! `ogdb-types` — foundational property data types for the
//! `ogdb-core` 7-crate split (the 6th seed crate after `ogdb-vector`,
//! `ogdb-algorithms`, `ogdb-text`, `ogdb-temporal`, and `ogdb-import`).
//!
//! This crate owns the workspace's foundational property data pair:
//!
//! * [`PropertyValue`] — the 11-variant enum used across node/edge
//!   properties and query results, with hand-rolled
//!   [`Serialize`]/[`Deserialize`] giving a single-key
//!   `{"Variant": payload}` JSON shape (the bolt-wire / WAL contract),
//!   plus a custom total order that bridges the I64↔F64 numeric
//!   family and delegates the `Vector` branch to
//!   [`ogdb_vector::compare_f32_vectors`].
//! * [`PropertyMap`] — the
//!   `BTreeMap<String, PropertyValue>` alias used by every embedder
//!   (cli/ffi/python/node/bolt/eval/e2e) and every property-bearing
//!   struct (`ExportNode`, `ExportEdge`, `TemporalNodeVersion`).
//!
//! Lifting these out of `ogdb-core` unblocks the last two facets of
//! the split (`ogdb-export`, the temporal-runtime tail of
//! `ogdb-temporal`). `ogdb-core` keeps the `Database`-coupled
//! property helpers (`property_value_to_json`, `format_property_value`,
//! `compare_property_values`, `runtime_to_property_value`, etc.) and
//! re-exports `PropertyValue` + `PropertyMap` via
//! `pub use ogdb_types::{PropertyMap, PropertyValue};` so all 558
//! downstream call sites continue to compile byte-for-byte unchanged.
//! See `.planning/ogdb-types-extraction/PLAN.md` for the full design.

#![warn(missing_docs)]

use ogdb_vector::compare_f32_vectors;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Typed property value used across node/edge properties and query results.
///
/// The 11 variants match the wire format pinned by the hand-rolled
/// [`Serialize`] / [`Deserialize`] impls (`{"Variant": payload}`) —
/// adding or renaming a variant is a breaking change for the bolt
/// wire / WAL contract. The Rust API itself is `#[non_exhaustive]` so
/// downstream consumers cannot write `match`-exhaustive arms over this
/// enum; the wire-format compatibility check lives in `ogdb-bolt`.
/// (EVAL-RUST-QUALITY-CYCLE3 B3.)
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum PropertyValue {
    /// Boolean value.
    Bool(bool),
    /// 64-bit signed integer.
    I64(i64),
    /// 64-bit IEEE-754 float.
    F64(f64),
    /// UTF-8 string.
    String(String),
    /// Raw byte buffer.
    Bytes(Vec<u8>),
    /// Embedding vector (sized at index-creation time).
    Vector(Vec<f32>),
    /// Calendar date as days since the Unix epoch.
    Date(i32),
    /// Instant on a specific timezone offset.
    DateTime {
        /// Microseconds since the Unix epoch in UTC.
        micros: i64,
        /// Timezone offset in minutes east of UTC.
        tz_offset_minutes: i16,
    },
    /// Calendar-aware duration broken into months / days / nanoseconds.
    Duration {
        /// Whole-month component.
        months: i64,
        /// Whole-day component (independent of months for calendar correctness).
        days: i64,
        /// Sub-day component in nanoseconds.
        nanos: i64,
    },
    /// Heterogeneous list of property values.
    List(Vec<PropertyValue>),
    /// String-keyed map of property values.
    Map(BTreeMap<String, PropertyValue>),
}

impl Serialize for PropertyValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;

        let mut map = serializer.serialize_map(Some(1))?;
        match self {
            PropertyValue::Bool(value) => map.serialize_entry("Bool", value)?,
            PropertyValue::I64(value) => map.serialize_entry("I64", value)?,
            PropertyValue::F64(value) => map.serialize_entry("F64", value)?,
            PropertyValue::String(value) => map.serialize_entry("String", value)?,
            PropertyValue::Bytes(value) => map.serialize_entry("Bytes", value)?,
            PropertyValue::Vector(value) => map.serialize_entry("Vector", value)?,
            PropertyValue::Date(value) => map.serialize_entry("Date", value)?,
            PropertyValue::DateTime {
                micros,
                tz_offset_minutes,
            } => {
                #[derive(Serialize)]
                struct DateTimeInner {
                    micros: i64,
                    tz_offset_minutes: i16,
                }
                map.serialize_entry(
                    "DateTime",
                    &DateTimeInner {
                        micros: *micros,
                        tz_offset_minutes: *tz_offset_minutes,
                    },
                )?;
            }
            PropertyValue::Duration {
                months,
                days,
                nanos,
            } => {
                #[derive(Serialize)]
                struct DurationInner {
                    months: i64,
                    days: i64,
                    nanos: i64,
                }
                map.serialize_entry(
                    "Duration",
                    &DurationInner {
                        months: *months,
                        days: *days,
                        nanos: *nanos,
                    },
                )?;
            }
            PropertyValue::List(value) => map.serialize_entry("List", value)?,
            PropertyValue::Map(value) => map.serialize_entry("Map", value)?,
        }
        map.end()
    }
}

impl<'de> Deserialize<'de> for PropertyValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        let object = value
            .as_object()
            .ok_or_else(|| serde::de::Error::custom("expected PropertyValue object"))?;
        if object.len() != 1 {
            return Err(serde::de::Error::custom(
                "expected single-key PropertyValue object",
            ));
        }
        let (variant, payload) = object
            .iter()
            .next()
            .ok_or_else(|| serde::de::Error::custom("missing PropertyValue variant"))?;
        match variant.as_str() {
            "Bool" => payload
                .as_bool()
                .map(PropertyValue::Bool)
                .ok_or_else(|| serde::de::Error::custom("Bool must be a boolean")),
            "I64" => payload
                .as_i64()
                .map(PropertyValue::I64)
                .ok_or_else(|| serde::de::Error::custom("I64 must be an integer")),
            "F64" => payload
                .as_f64()
                .map(PropertyValue::F64)
                .ok_or_else(|| serde::de::Error::custom("F64 must be a number")),
            "String" => payload
                .as_str()
                .map(|value| PropertyValue::String(value.to_string()))
                .ok_or_else(|| serde::de::Error::custom("String must be a string")),
            "Bytes" => {
                let items = payload
                    .as_array()
                    .ok_or_else(|| serde::de::Error::custom("Bytes must be an array"))?;
                let mut bytes = Vec::<u8>::with_capacity(items.len());
                for item in items {
                    let raw = item
                        .as_u64()
                        .ok_or_else(|| serde::de::Error::custom("byte entries must be u8"))?;
                    let byte = u8::try_from(raw)
                        .map_err(|_| serde::de::Error::custom("byte entries out of range"))?;
                    bytes.push(byte);
                }
                Ok(PropertyValue::Bytes(bytes))
            }
            "Vector" => {
                let items = payload
                    .as_array()
                    .ok_or_else(|| serde::de::Error::custom("Vector must be an array"))?;
                let mut vector = Vec::<f32>::with_capacity(items.len());
                for item in items {
                    let value = item.as_f64().ok_or_else(|| {
                        serde::de::Error::custom("vector entries must be numbers")
                    })?;
                    vector.push(value as f32);
                }
                Ok(PropertyValue::Vector(vector))
            }
            "Date" => {
                let days = payload
                    .as_i64()
                    .ok_or_else(|| serde::de::Error::custom("Date must be an integer"))?;
                let days = i32::try_from(days)
                    .map_err(|_| serde::de::Error::custom("Date out of i32 range"))?;
                Ok(PropertyValue::Date(days))
            }
            "DateTime" => {
                let payload = payload
                    .as_object()
                    .ok_or_else(|| serde::de::Error::custom("DateTime must be an object"))?;
                let micros = payload
                    .get("micros")
                    .and_then(|value| value.as_i64())
                    .ok_or_else(|| serde::de::Error::custom("DateTime.micros is required"))?;
                let tz_offset_minutes = payload
                    .get("tz_offset_minutes")
                    .and_then(|value| value.as_i64())
                    .ok_or_else(|| {
                        serde::de::Error::custom("DateTime.tz_offset_minutes is required")
                    })?;
                let tz_offset_minutes = i16::try_from(tz_offset_minutes).map_err(|_| {
                    serde::de::Error::custom("DateTime.tz_offset_minutes out of i16 range")
                })?;
                Ok(PropertyValue::DateTime {
                    micros,
                    tz_offset_minutes,
                })
            }
            "Duration" => {
                let payload = payload
                    .as_object()
                    .ok_or_else(|| serde::de::Error::custom("Duration must be an object"))?;
                let months = payload
                    .get("months")
                    .and_then(|value| value.as_i64())
                    .ok_or_else(|| serde::de::Error::custom("Duration.months is required"))?;
                let days = payload
                    .get("days")
                    .and_then(|value| value.as_i64())
                    .ok_or_else(|| serde::de::Error::custom("Duration.days is required"))?;
                let nanos = payload
                    .get("nanos")
                    .and_then(|value| value.as_i64())
                    .ok_or_else(|| serde::de::Error::custom("Duration.nanos is required"))?;
                Ok(PropertyValue::Duration {
                    months,
                    days,
                    nanos,
                })
            }
            "List" => {
                let items = payload
                    .as_array()
                    .ok_or_else(|| serde::de::Error::custom("List must be an array"))?;
                let mut values = Vec::<PropertyValue>::with_capacity(items.len());
                for item in items {
                    let value =
                        serde_json::from_value::<PropertyValue>(item.clone()).map_err(|error| {
                            serde::de::Error::custom(format!(
                                "invalid list element for PropertyValue::List: {error}"
                            ))
                        })?;
                    values.push(value);
                }
                Ok(PropertyValue::List(values))
            }
            "Map" => {
                let entries = payload
                    .as_object()
                    .ok_or_else(|| serde::de::Error::custom("Map must be an object"))?;
                let mut out = BTreeMap::<String, PropertyValue>::new();
                for (key, value) in entries {
                    let parsed = serde_json::from_value::<PropertyValue>(value.clone()).map_err(
                        |error| {
                            serde::de::Error::custom(format!(
                                "invalid map value for key '{key}': {error}"
                            ))
                        },
                    )?;
                    out.insert(key.clone(), parsed);
                }
                Ok(PropertyValue::Map(out))
            }
            other => Err(serde::de::Error::custom(format!(
                "unknown PropertyValue variant '{other}'"
            ))),
        }
    }
}

impl Eq for PropertyValue {}

impl PartialOrd for PropertyValue {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for PropertyValue {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        let numeric_cmp = match (self, other) {
            (Self::I64(left), Self::I64(right)) => Some(left.cmp(right)),
            (Self::F64(left), Self::F64(right)) => Some(left.total_cmp(right)),
            (Self::I64(left), Self::F64(right)) => Some((*left as f64).total_cmp(right)),
            (Self::F64(left), Self::I64(right)) => Some(left.total_cmp(&(*right as f64))),
            _ => None,
        };
        if let Some(ordering) = numeric_cmp {
            return ordering;
        }
        match (self, other) {
            (Self::Bool(left), Self::Bool(right)) => left.cmp(right),
            (Self::String(left), Self::String(right)) => left.cmp(right),
            (Self::Bytes(left), Self::Bytes(right)) => left.cmp(right),
            (Self::Vector(left), Self::Vector(right)) => compare_f32_vectors(left, right),
            (Self::Date(left), Self::Date(right)) => left.cmp(right),
            (Self::DateTime { micros: left, .. }, Self::DateTime { micros: right, .. }) => {
                left.cmp(right)
            }
            (
                Self::Duration {
                    months: lm,
                    days: ld,
                    nanos: ln,
                },
                Self::Duration {
                    months: rm,
                    days: rd,
                    nanos: rn,
                },
            ) => lm.cmp(rm).then_with(|| ld.cmp(rd)).then_with(|| ln.cmp(rn)),
            (Self::List(left), Self::List(right)) => left.cmp(right),
            (Self::Map(left), Self::Map(right)) => left.len().cmp(&right.len()).then_with(|| {
                left.iter()
                    .zip(right.iter())
                    .map(|((left_key, left_value), (right_key, right_value))| {
                        left_key
                            .cmp(right_key)
                            .then_with(|| left_value.cmp(right_value))
                    })
                    .find(|ord| *ord != std::cmp::Ordering::Equal)
                    .unwrap_or(std::cmp::Ordering::Equal)
            }),
            _ => property_value_variant_rank(self).cmp(&property_value_variant_rank(other)),
        }
    }
}

fn property_value_variant_rank(value: &PropertyValue) -> u8 {
    match value {
        PropertyValue::Bool(_) => 0,
        PropertyValue::I64(_) | PropertyValue::F64(_) => 1,
        PropertyValue::String(_) => 2,
        PropertyValue::Bytes(_) => 3,
        PropertyValue::Vector(_) => 4,
        PropertyValue::Date(_) => 5,
        PropertyValue::DateTime { .. } => 6,
        PropertyValue::Duration { .. } => 7,
        PropertyValue::List(_) => 8,
        PropertyValue::Map(_) => 9,
    }
}

/// Property key/value map used for nodes and edges.
pub type PropertyMap = BTreeMap<String, PropertyValue>;
