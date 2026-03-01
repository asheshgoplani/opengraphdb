# ogdb-bench

Synthetic pre-implementation benchmark for storage-decision gating.

## What it measures

- Read latency (`p95`, `p99`)
- Write latency (`p95`, `p99`)
- Maintenance/compaction stall latency (`p95`, `p99`, `max`)

Across profiles:
- `read-dominant` (`95/5` read/write)
- `mixed` (`80/20`)
- `write-stress` (`70/30`)
- `high-write` (`50/50`)

Storage models:
- `CSR+delta`
- `Hybrid-like` (segmented hot-write + leveled merge simulation)

## Run

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-bench
```

## Important limits

- This is an in-memory model benchmark.
- It does not include page cache behavior, disk I/O, or WAL costs.
- Use it to gate architecture decisions early, then re-validate with real engine benchmarks.

## Phase 9 Gate Harness

`ogdb-bench` also contains custom benchmark-gate tests for:
- single-hop traversal p95 latency
- 3-hop traversal p95 latency
- CSV import throughput (`edges/sec`)

Run smoke coverage (fast, CI-friendly):

```bash
source "$HOME/.cargo/env"
cargo test -p ogdb-bench benchmark_gate_harness_reports_non_zero_metrics
```

Run strict 100K-node threshold assertions on dedicated hardware:

```bash
source "$HOME/.cargo/env"
cargo test -p ogdb-bench benchmark_gate_thresholds_for_100k_graph -- --ignored
```
