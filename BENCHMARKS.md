# OpenGraphDB Benchmarks

This file tracks pre-implementation benchmark policy and latest outcomes for storage-model decisions.

## Scope

- Harness: `crates/ogdb-bench`
- Purpose: compare `CSR+delta` vs `Hybrid-like` under the same synthetic operation traces
- Status: synthetic/in-memory only (guidance signal, not final engine proof)

## Decision Gates

These gates come from `ARCHITECTURE.md`:

- Keep `CSR+delta` when:
  - write share `<= 10%`
  - compaction stall p95 `<= 50ms`
  - mixed-load traversal p95 regression `<= 20%` from read-dominant baseline
- Reconsider hybrid when repeated write-heavy runs (`>= 30%` writes) show:
  - compaction stall p95 `> 200ms`, or
  - mixed-load traversal p95 regression `> 30%`

## How to Run

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-bench
```

Stress profile example:

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-bench -- \
  --nodes 1000000 \
  --edges-per-node 16 \
  --ops 600000 \
  --hot-node-share 0.01 \
  --hot-access-share 0.97 \
  --delta-threshold 0.01 \
  --mem-segment-edges 4096
```

## Latest Result (2026-02-18)

Decision:
- Keep `CSR+delta` as baseline.
- Keep hybrid as a benchmark-triggered fallback path.

Representative stress-run observations:
- `write-stress` (`30%` writes):
  - `CSR+delta` compaction stall p95: `54.33ms` (max `54.33ms`)
  - `Hybrid-like` compaction stall p95: `2.53ms` (max `4.08ms`)
- `high-write` (`50%` writes):
  - `CSR+delta` compaction stall p95: `47.13ms` (max `47.13ms`)
  - `Hybrid-like` compaction stall p95: `1.78ms` (max `1.86ms`)

Interpretation:
- No run crossed the hard pivot trigger (`>200ms` p95 compaction stall).
- Hybrid reduces stall spikes under write-heavy pressure, so it remains an active upgrade path.

## Next Validation Step

- Re-run the same gate logic once disk-backed `pread`/`pwrite` + WAL engine benchmarks exist.
