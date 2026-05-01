//! C3-H3 (HIGH): Criterion harness for the BENCHMARKS.md throughput rows.
//!
//! Cycle-3 audit demonstrated that a tested, merged perf fix (C2-A5,
//! the commit_txn HNSW gate) could be silently reverted by a bad merge
//! and stay invisible until the next manual `publish_baseline` run. The
//! cure is per-row regression coverage: every BENCHMARKS row should have
//! a Criterion bench that fails-loud on a > 25 % regression.
//!
//! This file wraps four throughput drivers from
//! `ogdb-eval::drivers::throughput` (`ingest_streaming`, `ingest_bulk`,
//! `read_point`, `read_traversal`, `mutation`). Each bench seeds a
//! fresh `tempfile` database so runs are self-contained.
//!
//! Sizes are deliberately small. Criterion needs sub-second iterations
//! to converge cheaply; the *production-scale* numbers stay in
//! `BENCHMARKS.md` and are produced by `cargo run -p ogdb-eval`. This
//! harness is the *delta detector*, not the headline reporter — the job
//! is to surface > 25 % drifts at PR time.
//!
//! Run locally:
//!   cargo bench -p ogdb-bench --bench throughput_benches
//!
//! In CI, pair with `criterion-compare-action` to surface deltas in PR
//! comments. The job belongs on a self-hosted perf runner; on
//! `ubuntu-latest` the noise floor is ~10 % so deltas under that
//! threshold are not actionable.

use std::time::Duration;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use ogdb_eval::drivers::throughput::{
    ingest_bulk, ingest_streaming, mutation, read_point, read_traversal,
};
use tempfile::TempDir;

/// Seed size — large enough for the read drivers to do real work,
/// small enough that Criterion's measurement loop completes in
/// seconds, not minutes.
const SEED_NODES: u32 = 1_000;

/// BENCHMARKS row 1: streaming ingest. 100 ms wall-clock budget per
/// iteration so Criterion's sample loop converges quickly.
fn bench_ingest_streaming(c: &mut Criterion) {
    let mut group = c.benchmark_group("throughput");
    group.sample_size(10);
    group.bench_function("ingest_streaming_100ms", |b| {
        b.iter_with_setup(
            || TempDir::new().expect("tempdir"),
            |dir| {
                ingest_streaming(dir.path(), Duration::from_millis(100)).expect("ingest_streaming")
            },
        );
    });
    group.finish();
}

/// BENCHMARKS row 2: bulk ingest at two N's. Both small enough to keep
/// Criterion iterations under one second on commodity hardware.
fn bench_ingest_bulk(c: &mut Criterion) {
    let mut group = c.benchmark_group("throughput");
    group.sample_size(10);
    for n_nodes in [100u32, 1_000u32] {
        group.bench_with_input(
            BenchmarkId::new("ingest_bulk", n_nodes),
            &n_nodes,
            |b, &n| {
                b.iter_with_setup(
                    || TempDir::new().expect("tempdir"),
                    |dir| ingest_bulk(dir.path(), n).expect("ingest_bulk"),
                );
            },
        );
    }
    group.finish();
}

/// BENCHMARKS rows 3+4: point + traversal reads. Seeded once per
/// bench (outside the iter loop) so the read latency dominates, not
/// the seed cost.
fn bench_reads(c: &mut Criterion) {
    let mut group = c.benchmark_group("throughput");
    group.sample_size(10);

    let dir_point = TempDir::new().expect("tempdir");
    ingest_bulk(dir_point.path(), SEED_NODES).expect("seed ingest_bulk for read_point");
    group.bench_function("read_point_100", |b| {
        b.iter(|| read_point(dir_point.path(), 100).expect("read_point"));
    });

    let dir_trav = TempDir::new().expect("tempdir");
    ingest_bulk(dir_trav.path(), SEED_NODES).expect("seed ingest_bulk for read_traversal");
    group.bench_function("read_traversal_50", |b| {
        b.iter(|| read_traversal(dir_trav.path(), 50).expect("read_traversal"));
    });

    group.finish();
}

/// BENCHMARKS row 6: mutation. Critical regression-detector for C3-B4
/// (commit_txn HNSW gate) — without this bench, the cycle-2 revert
/// would have stayed invisible.
fn bench_mutation(c: &mut Criterion) {
    let mut group = c.benchmark_group("throughput");
    group.sample_size(10);

    let dir = TempDir::new().expect("tempdir");
    ingest_bulk(dir.path(), SEED_NODES).expect("seed ingest_bulk for mutation");
    group.bench_function("mutation_50", |b| {
        b.iter(|| mutation(dir.path(), 50).expect("mutation"));
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_ingest_streaming,
    bench_ingest_bulk,
    bench_reads,
    bench_mutation,
);
criterion_main!(benches);
