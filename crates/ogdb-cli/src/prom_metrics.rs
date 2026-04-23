//! Prometheus metrics registry for the HTTP server.
//!
//! Six families exported at GET /metrics in standard Prometheus text format.
//! Each metric is registered into a process-wide `Registry` accessed through
//! [`registry`], so values accumulate across all requests handled by the
//! current `serve` invocation.

use std::path::Path;
use std::sync::LazyLock;

use prometheus::{
    Encoder, Histogram, HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts, Registry,
    TextEncoder,
};

pub(crate) static REGISTRY: LazyLock<Registry> = LazyLock::new(Registry::new);

pub(crate) static REQUESTS_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    let m = IntCounterVec::new(
        Opts::new("ogdb_requests_total", "Total HTTP requests handled"),
        &["route", "status"],
    )
    .expect("valid IntCounterVec");
    REGISTRY
        .register(Box::new(m.clone()))
        .expect("register ogdb_requests_total");
    m
});

pub(crate) static REQUEST_DURATION_SECONDS: LazyLock<HistogramVec> = LazyLock::new(|| {
    // Buckets chosen to give meaningful p50/p95/p99 resolution for an
    // embedded graph DB: 100us is the floor of warm in-process reads,
    // 5s is the practical timeout ceiling for a sync HTTP handler.
    let buckets = vec![
        0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0,
    ];
    let m = HistogramVec::new(
        HistogramOpts::new(
            "ogdb_request_duration_seconds",
            "HTTP request duration in seconds",
        )
        .buckets(buckets),
        &["route"],
    )
    .expect("valid HistogramVec");
    REGISTRY
        .register(Box::new(m.clone()))
        .expect("register ogdb_request_duration_seconds");
    m
});

pub(crate) static WAL_FSYNC_DURATION_SECONDS: LazyLock<Histogram> = LazyLock::new(|| {
    let buckets = vec![
        0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25,
    ];
    let m = Histogram::with_opts(
        HistogramOpts::new(
            "ogdb_wal_fsync_duration_seconds",
            "WAL fsync (sync_data) duration in seconds",
        )
        .buckets(buckets),
    )
    .expect("valid Histogram");
    REGISTRY
        .register(Box::new(m.clone()))
        .expect("register ogdb_wal_fsync_duration_seconds");
    m
});

pub(crate) static TXN_ACTIVE: LazyLock<IntGauge> = LazyLock::new(|| {
    let m = IntGauge::with_opts(Opts::new(
        "ogdb_txn_active",
        "Currently executing write/query transactions",
    ))
    .expect("valid IntGauge");
    REGISTRY
        .register(Box::new(m.clone()))
        .expect("register ogdb_txn_active");
    m
});

pub(crate) static NODE_COUNT: LazyLock<IntGauge> = LazyLock::new(|| {
    let m = IntGauge::with_opts(Opts::new(
        "ogdb_node_count",
        "Total node count from latest snapshot",
    ))
    .expect("valid IntGauge");
    REGISTRY
        .register(Box::new(m.clone()))
        .expect("register ogdb_node_count");
    m
});

pub(crate) static EDGE_COUNT: LazyLock<IntGauge> = LazyLock::new(|| {
    let m = IntGauge::with_opts(Opts::new(
        "ogdb_edge_count",
        "Total edge count from latest snapshot",
    ))
    .expect("valid IntGauge");
    REGISTRY
        .register(Box::new(m.clone()))
        .expect("register ogdb_edge_count");
    m
});

pub(crate) static META_JSON_BYTES: LazyLock<IntGauge> = LazyLock::new(|| {
    let m = IntGauge::with_opts(Opts::new(
        "ogdb_meta_json_bytes",
        "Size of <db>-meta.json sidecar in bytes",
    ))
    .expect("valid IntGauge");
    REGISTRY
        .register(Box::new(m.clone()))
        .expect("register ogdb_meta_json_bytes");
    m
});

/// Force one-time registration of every metric family. Without this, a family
/// that is read but never written is also never registered, so `/metrics`
/// would silently omit it. Called once on serve startup.
pub(crate) fn ensure_registered() {
    LazyLock::force(&REQUESTS_TOTAL);
    LazyLock::force(&REQUEST_DURATION_SECONDS);
    LazyLock::force(&WAL_FSYNC_DURATION_SECONDS);
    LazyLock::force(&TXN_ACTIVE);
    LazyLock::force(&NODE_COUNT);
    LazyLock::force(&EDGE_COUNT);
    LazyLock::force(&META_JSON_BYTES);
}

/// Normalise the request path to a low-cardinality route label. Without this,
/// query strings and path parameters explode the label set and blow the
/// scrape-side cardinality budget.
pub(crate) fn route_label(method: &str, path: &str) -> String {
    let base = path.split('?').next().unwrap_or(path);
    format!("{method} {base}")
}

/// Refresh gauges that derive their value from on-disk state. Called on
/// each /metrics scrape so values track the underlying store without
/// requiring write-path instrumentation.
pub(crate) fn refresh_state_gauges(node_count: u64, edge_count: u64, db_path: &str) {
    NODE_COUNT.set(node_count as i64);
    EDGE_COUNT.set(edge_count as i64);

    let meta = meta_json_path(db_path);
    let bytes = std::fs::metadata(&meta).map(|m| m.len()).unwrap_or(0);
    META_JSON_BYTES.set(bytes as i64);
}

fn meta_json_path(db_path: &str) -> std::path::PathBuf {
    let p = Path::new(db_path);
    let mut name = p.file_name().unwrap_or_default().to_os_string();
    name.push("-meta.json");
    p.with_file_name(name)
}

/// Encode the registry into Prometheus text format (version 0.0.4).
pub(crate) fn encode() -> Result<String, prometheus::Error> {
    let encoder = TextEncoder::new();
    let mut buf = Vec::new();
    encoder.encode(&REGISTRY.gather(), &mut buf)?;
    String::from_utf8(buf).map_err(|e| prometheus::Error::Msg(e.to_string()))
}
