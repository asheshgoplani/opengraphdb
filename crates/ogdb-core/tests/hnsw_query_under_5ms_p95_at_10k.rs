//! RED test for task `hnsw-vector-index`, gate (2) in PLAN.md.
//!
//! At N=10,000 vectors of d=384, `Database::vector_search(...)` must sustain
//! p95 ≤ 5 ms per query (release build, warm cache). This is the headline
//! HNSW win: brute force is O(N·d) ≈ 3.84M FMAs per query plus an N-sort,
//! which on commodity hardware sits in the 3–10 ms band at d=384 — too
//! close to a 5 ms gate to trust today.
//!
//! Phase 5 is the gate that flips this RED → GREEN: the HNSW runtime
//! (built in Phase 2, used for queries in Phase 3) amortises construction
//! on the commit hot path so read p95 stays well below the gate. The
//! measured baseline at head-of-branch and the HNSW target numbers are
//! logged in `.planning/hnsw-vector-index/PLAN.md` §1.
//!
//! Release-only: debug builds of brute-force distance math run 5–10×
//! slower than release and would false-fail this gate without signal.
//!
//! Measurement methodology (per `docs/BENCHMARKS.md` "Methodology" and
//! mirroring `crates/ogdb-eval/src/drivers/multi_iter.rs`): one warm-up
//! iteration plus `MEASURED_ITERS = 5` measured iterations against the
//! same pre-warmed HNSW index. Each iteration computes its own p95 over
//! `QUERIES` searches; the gate then asserts the **median p95 across the
//! 5 measured iters** is ≤ `P95_BUDGET`. Single-shot p95 is too noisy to
//! gate on under sustained host load (background processes, CI shoulder,
//! neighbour VMs); the median of N=5 is the contract used elsewhere in
//! the project for tail metrics.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use ogdb_core::{Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric};

const N: usize = 10_000;
const D: usize = 384;
const QUERIES: usize = 100;
const WARMUP: usize = 10;
const MEASURED_ITERS: usize = 5;
const WARMUP_ITERS: usize = 1;
const P95_BUDGET: Duration = Duration::from_millis(5);

fn test_dir(tag: &str) -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ogdb-hnsw-{tag}-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create test dir");
    dir
}

fn rand_unit_vec(seed: u64, d: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(d);
    let mut s = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    for _ in 0..d {
        s = s
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let v = ((s >> 33) as u32) as f32 / u32::MAX as f32;
        out.push(v * 2.0 - 1.0);
    }
    let norm: f32 = out.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-8);
    for v in &mut out {
        *v /= norm;
    }
    out
}

fn percentile(mut samples: Vec<Duration>, pct: f64) -> Duration {
    samples.sort();
    let idx = ((samples.len() as f64 - 1.0) * pct / 100.0).round() as usize;
    samples[idx.min(samples.len() - 1)]
}

/// Lower-median across `samples`. Matches `lower_median` in
/// `crates/ogdb-eval/src/drivers/multi_iter.rs`: for even-count samples
/// returns the lower of the two middle values, so the reported number
/// always corresponds to a real iteration's measurement.
fn median_duration(samples: &[Duration]) -> Duration {
    debug_assert!(!samples.is_empty());
    let mut sorted = samples.to_vec();
    sorted.sort();
    sorted[(sorted.len() - 1) / 2]
}

#[test]
fn hnsw_query_under_5ms_p95_at_10k() {
    if cfg!(debug_assertions) {
        eprintln!(
            "skipping hnsw_query_under_5ms_p95_at_10k in debug build; \
             run with `cargo test -p ogdb-core --release --test hnsw_query_under_5ms_p95_at_10k`"
        );
        return;
    }

    let dir = test_dir("p95-10k");
    let db_path = dir.join("graph.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    for i in 0..N {
        let v = rand_unit_vec(i as u64, D);
        db.create_node_with(
            &["Doc".to_string()],
            &PropertyMap::from([(
                "embedding".to_string(),
                PropertyValue::Vector(v),
            )]),
        )
        .expect("create node");
    }

    db.create_vector_index(
        "embedding_idx",
        Some("Doc"),
        "embedding",
        D,
        VectorDistanceMetric::Cosine,
    )
    .expect("create vector index");

    // Warm up the runtime (first few searches may touch cold caches
    // or lazily materialise the HNSW graph).
    for qi in 0..WARMUP {
        let q = rand_unit_vec(900_000 + qi as u64, D);
        let _ = db
            .vector_search("embedding_idx", &q, 10, None)
            .expect("warmup search");
    }

    // Outer loop: WARMUP_ITERS throw-away iters + MEASURED_ITERS measured
    // iters. Each iter runs QUERIES distinct searches against the same
    // pre-built index and computes its own p95. Distinct query seeds per
    // iter so we exercise different graph paths each pass — matches what
    // a real workload sees and avoids accidentally medianing an already-
    // cached single query's latency.
    let mut iter_p95s: Vec<Duration> = Vec::with_capacity(MEASURED_ITERS);
    let total_iters = WARMUP_ITERS + MEASURED_ITERS;
    for iter in 0..total_iters {
        let mut samples = Vec::with_capacity(QUERIES);
        let seed_base = 1_000_000 + (iter as u64) * (QUERIES as u64);
        for qi in 0..QUERIES {
            let q = rand_unit_vec(seed_base + qi as u64, D);
            let t = Instant::now();
            let _ = db
                .vector_search("embedding_idx", &q, 10, None)
                .expect("search");
            samples.push(t.elapsed());
        }
        let p50 = percentile(samples.clone(), 50.0);
        let p95 = percentile(samples.clone(), 95.0);
        let p99 = percentile(samples, 99.0);
        if iter < WARMUP_ITERS {
            eprintln!(
                "hnsw_query_10k_d384 iter={iter} (warm-up, discarded) p50={p50:?} p95={p95:?} p99={p99:?}"
            );
        } else {
            eprintln!("hnsw_query_10k_d384 iter={iter} p50={p50:?} p95={p95:?} p99={p99:?}");
            iter_p95s.push(p95);
        }
    }

    let median_p95 = median_duration(&iter_p95s);
    eprintln!(
        "hnsw_query_10k_d384 median p95 across {MEASURED_ITERS} iters = {median_p95:?} \
         (budget ≤ {P95_BUDGET:?}); per-iter p95s = {iter_p95s:?}"
    );

    assert!(
        median_p95 <= P95_BUDGET,
        "median p95 query latency {median_p95:?} across {MEASURED_ITERS} iters \
         exceeds budget {P95_BUDGET:?} at N={N}, d={D}; per-iter p95s = {iter_p95s:?}; \
         HNSW backend not active or under-tuned (see Phase 5 in PLAN.md)"
    );

    let _ = fs::remove_dir_all(&dir);
}
