# competitor-bench — Tier-1 Neo4j-comparison harness

Apples-to-apples benchmark vs Neo4j Community 5.x at the 10 k-node tier.
Spec: [`documentation/.planning/neo4j-comparison/PLAN.md`](../../documentation/.planning/neo4j-comparison/PLAN.md) §3.1.

## Prerequisites

- Built OpenGraphDB release binary: `cargo build --release -p ogdb-cli`.
- Docker daemon (Neo4j runs in `docker run --rm`).
- Python venv with `neo4j` (Bolt driver) installed:

  ```bash
  python3 -m venv .venv
  .venv/bin/pip install neo4j
  ```

- Passwordless sudo for `vm.drop_caches=3` (cold-cache between iters). The
  harness emits a one-line warning and proceeds without dropping if sudo is
  not available — note this caveat in any reported numbers.

## Run

```bash
scripts/competitor-bench/run-all.sh                 # ogdb + neo4j, default knobs
ONLY=ogdb  scripts/competitor-bench/run-all.sh      # only OpenGraphDB
ONLY=neo4j scripts/competitor-bench/run-all.sh      # only Neo4j
N_ITERS=5 N_WARMUP=1 scripts/competitor-bench/run-all.sh
```

Default knobs match the §3.1 spec: 10 000 nodes + 9 999 edges single-tx
ingest; 1 000 random-id point-reads; 1 000 random-seed 2-hops capped at 100
results. JVM heap = 8 G, page cache = 4 G (per blocking-decision #3 in the
plan). Neo4j image is `neo4j:5-community`.

Wall-clock: ~15-30 min for 1 warm-up + 5 measured iters across both engines.

## Output

`run-all.sh` writes per-iter JSONs and the reduced summary into a sibling
`results/` directory (gitignored — see [`.gitignore`](.gitignore)):

```
scripts/competitor-bench/results/
  opengraphdb-iter0.json  opengraphdb-iter1.json  ... opengraphdb-iter5.json
  neo4j-iter0.json        neo4j-iter1.json        ... neo4j-iter5.json
  summary.json            summary.md
```

`summary.md` is the markdown table that drops into [`documentation/BENCHMARKS.md`](../../documentation/BENCHMARKS.md) §2.2.

The frozen evidence for the published §2.2 verdict lives at
[`results-2026-05-05/`](results-2026-05-05/) (12 iter JSONs + `summary.json`
+ `summary.md`). Re-running the harness writes a new live `results/` dir
side-by-side without overwriting the frozen evidence.

## Workload shape

Identical Cypher on both engines:

```
ingest:    POST /import (ogdb) / UNWIND $rows CREATE (...) (neo4j) — single tx, batch=1000
point-read: MATCH (n:Bench {id: $id}) RETURN n.id
2-hop:      MATCH (n:Bench)-[:LINK]->(x)-[:LINK]->(m) WHERE n.id = $id RETURN m.id LIMIT 100
```

The chained 2-hop is used in place of `MATCH (n)-[*2]-(m)` because
OpenGraphDB 0.5.1's variable-length matcher does not yet expand `*2` to two
edges; chaining is identical in result-shape and runs the same code path on
Neo4j. Documented as a deviation in BENCHMARKS §2.2.

## Methodology fidelity

- N=5 measured + 1 discarded warm-up (matches BENCHMARKS §1).
- Lower-median across iters; per-iter percentiles use nearest-rank
  (`statistics.median_low`, `ceil(q·N) - 1`) — identical to
  `crates/ogdb-eval/src/drivers/{multi_iter,common}.rs`.
- p99.9 dropped (too noisy at N=5; matches the existing harness).
- Cold cache: `sudo sysctl vm.drop_caches=3` between iters; container is
  recreated per-iter for Neo4j and the database file is wiped+re-init'd for
  OpenGraphDB to guarantee engine-internal cache cold too.
- Reproducibility: seed = `0x0123456789abcdef` for the random-id sampler
  (matches `ldbc_mini.rs`).
