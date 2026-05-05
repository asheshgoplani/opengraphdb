# Apples-to-apples Neo4j comparison plan

> **Scope.** Replace the ⚠️ DIRECTIONAL INDICATOR rows in
> [`documentation/BENCHMARKS.md`](../../BENCHMARKS.md) (rows 3 point-read,
> 4 2-hop, 5 IS-1) with verified ✅ WIN / ❌ LOSS / 🤝 TIE verdicts run on
> the same machine, same workload, same scale, against the obvious
> incumbent: **Neo4j Community 5.x only**. Cycle-17 explicitly tonded
> these rows down to "lower-bound feasibility signal, not verified WIN" —
> this plan is the path from "directional" to "verified".
>
> **Why Neo4j-only.** Doing one comparison *right* beats four superficial
> ones. Neo4j is the most-asked incumbent comparison, ships in Docker,
> speaks Cypher + Bolt (so the harness work transfers cleanly to our
> existing surface), and is the rightful headline test. Memgraph (in-memory
> analytics positioning), KuzuDB (embedded-analytics columnar), Stardog
> (RDF-only) are different positioning and live in a separate, later cycle
> — they are explicitly **out of scope** here.
>
> **Honesty contract.** Every cell we publish must be reproducible from this
> repository in one command. We will not import Neo4j blog numbers and call
> them comparable; "verified" means we ran the workload ourselves on our
> hardware against a Neo4j we can pin to a Docker digest.
>
> **Status:** PLAN. Tier 1 awaits the blocking decisions in §5.

## 1. Background and what we already have

### 1.1 What today's BENCHMARKS rows actually claim

Today's [`BENCHMARKS.md` § 2](../../BENCHMARKS.md) carries:

| Row | Metric | OpenGraphDB 0.4.0 (N=5 median) | Neo4j published | Scale gap |
|---|---|---|---|---|
| 3 | point read p95 | 6.8 μs @ 10 k nodes | ≈ 27.96 ms p99 on Pokec small (Memgraph blog citing Neo4j) | 160× scale + comparator at different shape |
| 4 | 2-hop p95 | 25.8 μs @ 10 k nodes | "5–20 ms p95 at SF1" (maxdemarzi blog) | unequal scale + workload |
| 5 | LDBC SNB IS-1 p95 | 163 μs @ LDBC mini (100 Person) | Neo4j has no LDBC audit (community-run only) | unequal scale + no comparable |

The cycle-17 tone-down explicitly flagged those three rows as "lower-bound
feasibility signal, not verified WIN". Every other row in the table either
already clears its bar at our scale (rows 7, 10, 13) or is an honest LOSS
(rows 1, 2, 6, 9). This plan only addresses the directional /
scale-mismatched rows — the verified-WIN and verified-LOSS rows do not need
re-running.

### 1.2 Harness we already have on the OpenGraphDB side

- [`crates/ogdb-eval/src/drivers/throughput.rs::ingest_bulk`](../../../crates/ogdb-eval/src/drivers/throughput.rs) — bulk ingest harness, single-tx, 10 k node default.
- [`crates/ogdb-eval/src/drivers/ldbc_snb.rs::run_is1`](../../../crates/ogdb-eval/src/drivers/ldbc_snb.rs) — LDBC SNB IS-1 driver, 1 000-query default, percentile + qps capture.
- [`crates/ogdb-eval/src/drivers/ldbc_mini.rs::build_ldbc_mini`](../../../crates/ogdb-eval/src/drivers/ldbc_mini.rs) — synthetic 100-Person fixture (deterministic xorshift64, seed `0x0123456789abcdef`).
- [`scripts/download-ldbc-sf0_1.sh`](../../../scripts/download-ldbc-sf0_1.sh) — already wired SF0.1 fetcher (~150 MB, surfsara CDN, CDN-rotation-aware via `LDBC_SF01_URL` env).
- [`crates/ogdb-eval/src/lib.rs::LdbcSubmission`](../../../crates/ogdb-eval/src/lib.rs) — submission-shape JSON exporter.
- [`crates/ogdb-eval/src/drivers/cli_runner.rs::RunAllConfig::full`](../../../crates/ogdb-eval/src/drivers/cli_runner.rs) — top-level driver-of-drivers; the published BENCHMARKS baselines run through it.

### 1.3 Fixed methodology contract (do not break)

- N=5 release-build iters, 1 warm-up iter discarded (lower-median across 5).
- p99.9 dropped (manifest gate; tail too noisy at N=5).
- CPU governor `performance` if writeable; warning logged otherwise.
- Per-`EvaluationRun` platform metadata (kernel, CPU, build profile, version).
- Cold-cache by default; warm-cache is a separate column (BENCHMARKS § 4 follow-up #10).

The Neo4j-side harness must hit the same bar (5 iters, lower-median,
p99.9 dropped, governor pinned, cold by default — drop OS page cache
between iters).

## 2. The Neo4j incumbent — what we're targeting

**Edition.** Neo4j Community 5.x. Pinned to a Docker digest so the run
is reproducible across months.

**License.** GPLv3. Free to download, free to benchmark, free to publish
results from. The Apache 2.0 vs GPLv3 license delta is the headline
positional argument anyway (see [`MIGRATION-FROM-NEO4J.md` § 1](../../MIGRATION-FROM-NEO4J.md)).

**Public Neo4j-published perf numbers we'll be matched against.**

| Workload | Neo4j published | Source | Apples-to-apples-able? |
|---|---|---|---|
| 2-hop traversal at SF1 | "5–20 ms p95" | [maxdemarzi 2023](https://maxdemarzi.com/2023/01/11/bullshit-graph-database-performance-benchmarks/) | **Yes — Tier 2.** Run SF1 on our hardware with same query shape. |
| Pokec point-read p99 | 27.96 ms (community-cited via Memgraph blog) | [Memgraph blog](https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison) | **Yes — Tier 2.** Pokec is free; we run it ourselves. |
| Bulk import (`neo4j-admin database import full`) | "≥ 500 M rels/hr" | [Neo4j docs / operations manual](https://neo4j.com/docs/operations-manual/current/performance/) | **Yes — Tier 2.** SF1 import wall-clock on our hardware. |
| LDBC SNB IS-1..IS-7 | none (Neo4j has no LDBC audit) | n/a | **Comparable, not citable.** Run our own at SF1 — the verdict is "OpenGraphDB X μs vs Neo4j Y μs at SF1 on our hardware", with no Neo4j-published anchor. |
| LDBC SNB IC-1..IC-7 | none | n/a | same — Tier 2. |

**Why we don't import Neo4j blog numbers as the "verified" cell.** All
of the above are run on Neo4j's own hardware (often a cluster with
SSDs we don't have). Importing them is the cycle-17 dishonesty we
already corrected. Apples-to-apples means **we run Neo4j on the
i9-10920X bench box ourselves**.

## 3. The three-tier proposal

### Tier 1 — minimum viable apples-to-apples (1–2 days)

**Goal.** Replace [BENCHMARKS row 3](../../BENCHMARKS.md) and row 4 ⚠️
DIRECTIONAL verdicts with verified WIN/LOSS/TIE against Neo4j Community 5.x
at the **exact 10 k-node tier** we already publish. Same hardware, same
query shape, same iteration count, same percentile methodology, cold cache.

**Scope.** Tier 1 *intentionally does not scale up*. The reason is honesty:
publishing at 10 k is the smallest non-toy scale where Neo4j's own numbers
are still valid (Neo4j works fine at 10 k; the gap to its published Pokec /
SF1 scale is then a separate follow-up in Tier 2, not a blocker for
"verified"). We get a real verdict in two days instead of two weeks.

#### 3.1.1 Workload spec

Identical to the current OpenGraphDB driver:

- **Dataset.** 10 k nodes + 9 999 edges (synthetic, single-tx ingest), same shape as `throughput::ingest_bulk(10_000)`.
- **Point-read query.** `MATCH (n) WHERE id(n) = $id RETURN n` on 1 000 random ids.
- **2-hop query.** `MATCH (n)-[*2]-(m) WHERE id(n) = $id RETURN m` on 1 000 random ids. Cap at 100 results per seed to bound tail noise.
- **Iterations.** N=5, 1 warm-up discarded, lower-median across 5. Cold cache: drop OS page cache (`echo 3 > /proc/sys/vm/drop_caches`) between iters.
- **Hardware.** i9-10920X / 12-core HEDT / Linux kernel 6.17.0-19-generic / `powersave` governor (writeable on this box per BENCHMARKS § 1).

#### 3.1.2 Per-engine harness wiring

| Engine | Wire-up | Effort |
|---|---|---|
| OpenGraphDB | already wired (`throughput::ingest_bulk` + a new `point_read::run` + `two_hop::run` driver, both modeled on existing `multi_iter` median scaffolding) | 0.5 day |
| Neo4j 5.x Community | `docker run --pull=always -p 7687:7687 -e NEO4J_AUTH=none -e NEO4J_dbms_memory_heap_max__size=8G -e NEO4J_dbms_memory_pagecache_size=4G neo4j:5-community@sha256:<pinned-digest>`; harness via `neo4j-driver` (Python) over Bolt v5; same N=5 protocol. | 0.5 day |

The Python harness lives at `scripts/competitor-bench/` (new directory).
Output is one JSON per `(engine, query, iter)` matching the
`EvaluationRun` schema, then the existing `crates/ogdb-eval` reducer
medianes across iters.

#### 3.1.3 Output

Add a new subsection to BENCHMARKS § 2:

```
### 2.2 Apples-to-apples vs Neo4j Community 5.x — 10 k tier (Tier 1, run YYYY-MM-DD)

| Metric | OpenGraphDB 0.4.0 | Neo4j 5.x Community | Verdict |
|---|---|---|---|
| Bulk ingest 10k+10k (nodes/s) | 254 | <verified> | ✅/❌/🤝 |
| Point-read p50 (μs) | 5.8 | <verified> | ✅/❌/🤝 |
| Point-read p95 (μs) | 6.8 | <verified> | ✅/❌/🤝 |
| Point-read p99 (μs) | 11.8 | <verified> | ✅/❌/🤝 |
| 2-hop p50 (μs) | 22.9 | <verified> | ✅/❌/🤝 |
| 2-hop p95 (μs) | 25.8 | <verified> | ✅/❌/🤝 |
| 2-hop p99 (μs) | 36.0 | <verified> | ✅/❌/🤝 |
```

Plus: rows 3 and 4 in the existing § 2 table flip from ⚠️ DIRECTIONAL to
the literal verdict from the new § 2.2 (✅ / ❌ / 🤝).

The row keeps a footnote: *"Verified at 10 k tier vs Neo4j Community 5.x;
the gap to Neo4j's published Pokec / SF1 numbers is tracked separately in
Tier 2."* So we are honest that 10 k is small, but the verdict **at 10 k**
is verified.

#### 3.1.4 What "verified at 10 k vs Neo4j" buys us

- Honest competitive claim: "at the 10 k embedded scale, OpenGraphDB beats / ties / loses to Neo4j on point-read by Xx" — runnable from this repo.
- Closes cycle-17's audit finding for rows 3 and 4.
- Doesn't require LDBC Datagen, doesn't require an EC2 budget, doesn't require Pokec download.
- Anyone can re-run on their hardware in ≤ 30 minutes.
- Sets up MIGRATION-FROM-NEO4J's "verified vs Neo4j" table (see §6) with its first real rows.

#### 3.1.5 Tier 1 deliverables

1. `scripts/competitor-bench/run-all.sh` — orchestrator (Docker for Neo4j, native for ogdb).
2. `scripts/competitor-bench/drivers/{neo4j,opengraphdb}.py` — per-engine adapters, identical metric output.
3. `scripts/competitor-bench/reduce.py` — N=5 lower-median, p50/p95/p99 percentile reducer, dumps the § 2.2 markdown table.
4. New BENCHMARKS § 2.2 subsection (autogenerated + hand-curated narrative).
5. Verdict updates on existing rows 3 + 4 (⚠️ → ✅/❌/🤝).
6. README + `skills/opengraphdb/references/benchmarks-snapshot.md` mirror updates.
7. First two rows populated in MIGRATION-FROM-NEO4J § 5.1 "Verified vs Neo4j" table (see §6).

**ETA: 1–2 days** of focused work, gated only by the §5 blocking decisions.

### Tier 2 — LDBC SNB SF1 + Pokec read workload, vs Neo4j (1–2 weeks)

**Goal.** Replace [BENCHMARKS row 5](../../BENCHMARKS.md) (LDBC IS-1 on
mini fixture) with verified IS-1..IS-7 + IC-1..IC-3 numbers at SF1 against
Neo4j Community 5.x. Add a **Pokec read-only column** so we have a direct
comparable to Neo4j's community-cited Pokec numbers — same dataset, same
machine, verified.

**SF1 vs SF10.** Recommend **SF1 first**. The i9-10920X has 64 GB RAM;
SF10 (~30 M nodes / 176 M edges) fits but Neo4j's page-cache contention
makes the apples-to-apples question noisier at the larger tier. SF1 is the
clean shot. SF10 graduates to Tier 3 after the Tier 2 SF1 numbers stabilise.

#### 3.2.1 Datasets

| Dataset | Source | Size | Why |
|---|---|---|---|
| LDBC SNB SF1 | extend [`scripts/download-ldbc-sf0_1.sh`](../../../scripts/download-ldbc-sf0_1.sh) into a `download-ldbc-sf1.sh` sister script (straightforward — same Surf CDN) | ~1.5 GB compressed / ~6 GB CSV | Canonical LDBC scale; matches BENCHMARKS § 4 follow-up #2. |
| Pokec | snap.stanford.edu (free, single tarball) | ~400 MB CSV (1.6 M users + 30.6 M edges) | Direct comparable to Neo4j's community-cited Pokec p99; we run on our hardware so the comparison is honest. |

#### 3.2.2 Workload spec

- LDBC SNB Interactive Short IS-1, IS-2, IS-3, IS-4, IS-5, IS-6, IS-7 — all 7 short queries.
- LDBC SNB Interactive Complex IC-1, IC-2, IC-3 — three complex (the rest involve `shortestPath` which OpenGraphDB does not yet implement, per [`MIGRATION-FROM-NEO4J.md`](../../MIGRATION-FROM-NEO4J.md) § 2).
- Pokec point-read + 1-hop + 2-hop on 1 000 random users.
- Same N=5 / lower-median / cold-cache / governor-pinned protocol.
- **Bulk-load wall-clock** also captured: OpenGraphDB single-tx ingest vs Neo4j `neo4j-admin database import full`.

#### 3.2.3 Implementation deltas vs Tier 1

| Engine | Delta |
|---|---|
| OpenGraphDB | needs an LDBC SF1 loader on top of `ogdb-import` (currently only handles document-ingest). Extend `crates/ogdb-import/src/lib.rs` with an LDBC CSV reader; estimate ~3 days for a clean implementation that respects the methodology contract (single-tx bulk loader, COPY-FROM-Parquet equivalent — also closes BENCHMARKS § 4 follow-up #1). |
| Neo4j 5.x | `neo4j-admin database import full` — well-trodden path. ~0.5 day. |
| `shortestPath` gap | OpenGraphDB does not implement `shortestPath()` (per migration guide § 2). **Recommendation: skip the affected IC queries with a footnote.** Implementing shortestPath belongs in a separate cycle. |

#### 3.2.4 Output

- Replace BENCHMARKS § 2 row 5 with verified SF1 IS-1..IS-7 percentiles + qps vs Neo4j.
- Add new SF1 IC-1..IC-3 rows (currently absent — net-new coverage).
- Add a "Pokec point-read 1.6 M vs Neo4j" row.
- The bulk-load wall-clock numbers replace BENCHMARKS row 1's "directional 670× gap to Kuzu" with a verified gap *to Neo4j* at the actual SF1 scale (likely still a loss for OpenGraphDB until follow-up #1 lands; that's fine — verified loss vs Neo4j is the goal).
- MIGRATION-FROM-NEO4J § 5.1 "Verified vs Neo4j" table grows from 2 rows (Tier 1) to ~10 rows.

#### 3.2.5 Why this is 1–2 weeks not 1–2 days

- LDBC SF1 download + decompression + import on each engine: ~2 hours wall-clock × 2 engines.
- The OpenGraphDB SF1 loader is a real implementation task (~3 days).
- Neo4j-admin import has its own gotchas (`--multiline-fields`, header-row formats).
- Pokec re-run on each engine ≈ 0.5 day.
- N=5 across both engines × all queries ≈ 1 day of harness time.
- Documentation pass + verdict updates ≈ 1 day.

**ETA: 8–10 working days.**

### Tier 3 — nightly Neo4j-comparison gauntlet on self-hosted CI (1–2 months)

**Goal.** Run Tier 1 (10 k) + Tier 2 (SF1 + Pokec) every night on a
self-hosted GitHub Actions runner, dump a daily verified competitive
leaderboard to `documentation/competitive-leaderboard/YYYY-MM-DD.md`, and
emit a regression-gate signal if the verdict flips. This is what closes
the "prove it stays true vs Neo4j" loop.

#### 3.3.1 Infrastructure

- Self-hosted GitHub Actions runner on the i9-10920X bench box (existing runner ID **3281165** if available — see §5 question 2).
- Docker daemon pre-pulled with `neo4j:5-community@sha256:<digest>`. ogdb via `cargo build --release`.
- Persistent dataset cache at `/var/cache/competitor-bench/{ldbc-sf1,pokec}`; downloaded once, reused nightly.
- Output: daily JSON to `documentation/competitive-leaderboard/`, mirrored to a public dashboard via a release-day push.
- Regression gate: if any verified verdict flips ✅ → ❌ for an OpenGraphDB row, block merge to main and open an issue with the diff.
- SF10 graduation: once SF1 verdicts are stable for a week, add SF10 as a second nightly tier.

#### 3.3.2 Cost model

- Self-hosted runner: $0 incremental (existing hardware).
- Datasets: ~5 GB on-disk for SF1 + Pokec across both engines × 2 caches = ~20 GB; comfortably fits.
- Wall-clock per nightly: ~3 hours (10 k tier) + ~6 hours (SF1) = ~9 hours; comfortable in an overnight window.
- Engineering: ~3 weeks to build the CI workflow + dashboard + regression gate; ~1 week to harden flake-recovery (Neo4j Docker pull-rate-limit retries, page-cache eviction timing).

**ETA: 4–6 weeks** of part-time work, sequenced after Tier 2.

#### 3.3.3 Tier-3-only deliverables

1. `.github/workflows/nightly-vs-neo4j.yml` — self-hosted runner workflow.
2. `scripts/competitor-bench/regression-gate.py` — reads yesterday's + today's leaderboard JSON; exits non-zero on verdict flip.
3. `documentation/competitive-leaderboard/index.md` — landing page with last-30-day chart.
4. Dashboard publisher (mkdocs static site if one already exists; otherwise wire up).

## 4. How each tier maps to the directional rows it eliminates

| BENCHMARKS row | Tier that flips it | Resulting verdict format |
|---|---|---|
| 3 — Point read p95 | Tier 1 (10 k) and re-verified at Tier 2 (Pokec 1.6 M) | "✅ verified WIN at 10 k vs Neo4j 5.x; <verdict> at Pokec 1.6 M vs Neo4j" |
| 4 — 2-hop p95 | Tier 1 (10 k) and re-verified at Tier 2 (SF1 + Pokec) | same shape |
| 5 — IS-1 p95 | Tier 2 (LDBC SF1) | "✅/❌ verified at SF1 vs Neo4j 5.x" |
| 11 — Graphalytics BFS | **NOT in any tier** — Datagen-9.0 is XL scale; falls outside the workstation envelope. Stays 🟡 NOVEL with a clear scope note. | unchanged |
| 12 — Graphalytics PageRank | **NOT in any tier** — same Datagen-9.0 reasoning. | unchanged |
| 1 — Bulk ingest | Re-verified at Tier 2 SF1 (after the SF1 loader implementation lands) | likely stays ❌ until follow-up #1 ships, but verified at SF1 vs Neo4j instead of derived from a Memgraph/Kuzu blog. |
| 2 — Streaming ingest | Re-verified at Tier 2 vs Neo4j only (Neo4j supports streaming via Bolt) | same shape |

## 5. Blocking decisions (the user must answer these before Tier 1 starts)

| # | Decision | Recommendation | Reasoning |
|---|---|---|---|
| 1 | **Neo4j edition.** Community 5.x (free, GPLv3) vs Enterprise (license needed; offers `apoc.periodic.iterate`, parallel runtime, etc). | **Community 5.x.** | Apples-to-apples means "what someone could `docker pull` and run". Enterprise also can't be redistributed in CI. Community gives the conservative number — if we win against Community, we have a real claim; if we lose, an Enterprise re-run can be a separate footnote. |
| 2 | **Machine.** Local i9-10920X bench box (existing) vs rented EC2 c5.4xlarge (~$0.68/hr × 10 hr = $7/run) vs self-hosted GitHub Actions runner ID **3281165** (if it exists; otherwise create one). | **Local i9-10920X for Tiers 1 + 2; self-hosted runner 3281165 for Tier 3.** | Tier 1+2 are one-shot measurements; running on the same box BENCHMARKS already publishes from is the cleanest comparison. Tier 3 needs an unattended box; the self-hosted runner is $0 incremental. **Confirm runner 3281165 is the i9-10920X box, not a different one.** |
| 3 | **JVM heap config (Neo4j fairness).** Equal-RSS rule: give Neo4j the same memory budget OpenGraphDB's binary actually uses on the workload. | **`-Xmx8G -Xms8G`, `dbms.memory.pagecache.size=4G`** for both Tier 1 (10 k) and Tier 2 (SF1). For Pokec specifically, raise to `-Xmx16G` with page-cache `8G`. | OpenGraphDB's working-set RSS at 10 k is 27 MB (BENCHMARKS row 13) — Neo4j needs more headroom for the JVM itself. The fair rule is "same total memory budget", not "same heap size"; we cap Neo4j at the smaller of (OpenGraphDB total RSS × 4) or (16 G), and document the choice in the run methodology. |
| 4 | **Cold vs warm runs.** Today's BENCHMARKS is cold-only. Methodology contract supports adding warm columns (BENCHMARKS § 4 follow-up #10). | **Cold for Tier 1 + 2 (matches existing baseline); warm as a separate column added in Tier 3.** | Adding warm to Tiers 1+2 doubles wall-clock and risks slipping the 1–2 day Tier 1 promise. Warm goes in Tier 3 where wall-clock isn't constrained. |
| 5 | **`shortestPath` IC queries (Tier 2).** Implement OpenGraphDB shortestPath first, or skip those IC queries with a footnote? | **Skip with a footnote.** | shortestPath is a separate work item; blocking Tier 2 on it pushes the verified-row-5 timeline by 2+ weeks. Footnote: "OpenGraphDB does not yet implement shortestPath(); IC-X / IC-Y / IC-Z deferred until v0.5." |
| 6 | **Run cadence after Tier 1 lands.** Manual re-run on each release? Or block on Tier 3 nightly CI? | **Manual on each release for now; promote to nightly when Tier 3 lands.** | Tier 1 numbers should not go stale across releases; a 5-minute re-run on each release tag is cheap. Nightly CI is the long-term answer but doesn't have to gate the first verified verdicts. |

**Until the user answers questions 1–4, Tier 1 cannot start.** Questions 5
and 6 have safe defaults; the user can override later.

## 6. Companion deliverable — "Verified vs Neo4j" table inside MIGRATION-FROM-NEO4J.md

Per the user's narrowed scope, we **do not** ship a new
`COMPETITIVE-COMPARISON.md`. Instead,
[`documentation/MIGRATION-FROM-NEO4J.md`](../../MIGRATION-FROM-NEO4J.md)
gets a new **§ 5.1 "Verified vs Neo4j Community 5.x"** subsection with a
two-column table (OpenGraphDB / Neo4j) that we fill row-by-row as each
apples-to-apples run lands.

**Structure shipped with this PR:**

```
### 5.1 Verified vs Neo4j Community 5.x

| Metric / Workload | OpenGraphDB 0.4.0 | Neo4j 5.x Community | Verdict | Tier | Last verified |
|---|---|---|---|---|---|
| _Tier 1 — 10 k tier (point read, 2-hop, bulk ingest)_ | (pending Tier 1) | (pending) | (pending) | 1 | — |
| _Tier 2 — LDBC SNB SF1 IS-1..IS-7 + IC-1..IC-3_ | (pending Tier 2) | (pending) | (pending) | 2 | — |
| _Tier 2 — Pokec point-read p99 (1.6 M users)_ | (pending Tier 2) | (pending) | (pending) | 2 | — |
| _Tier 2 — Bulk-load SF1 wall-clock_ | (pending Tier 2) | (pending) | (pending) | 2 | — |
```

**Honesty rule.** Cells stay `(pending)` until verified by a real run.
We will not pre-fill them with hopes or with imported Neo4j blog numbers.

This same plan-PR adds the placeholder table to MIGRATION-FROM-NEO4J.md so
the structure is in tree the moment Tier 1 starts.

## 7. Sequencing summary

```
Day 1–2     Tier 1 ─────────────┐
                                ├─→ verified BENCHMARKS rows 3 + 4 + 2.2 subsection vs Neo4j; 2 rows in MIGRATION § 5.1
Day 3       hand off to user ───┘
Day 4–14    Tier 2 ─────────────┐
                                ├─→ verified row 5; row 1/2 re-verified at SF1; Pokec column; ~10 rows in MIGRATION § 5.1
Day 15      hand off ───────────┘
Week 4–9    Tier 3 ─────────────┐
                                ├─→ nightly leaderboard vs Neo4j + regression gate
Week 10     hand off ───────────┘
```

Each tier is independently shippable. Tier 1 is the smallest unit that
delivers a real verified competitive claim against the headline incumbent.
Tier 2 makes that claim defensible at scale. Tier 3 keeps it defensible
over time.

## 8. Out of scope (explicitly)

- **Other graph engines.** Memgraph, KuzuDB, Stardog, GraphDB, TigerGraph — different positioning (in-memory / embedded-analytics / RDF-only / cluster-only). Tracked as a separate cycle, not bundled here.
- **Datagen-9.0 (Graphalytics XL).** 1 B+ nodes, requires multi-TB storage and a multi-node cluster. Not appropriate for this single-workstation comparison; rows 11 + 12 stay 🟡 NOVEL.
- **Neo4j Enterprise.** License-gated; not redistributable in CI. Could be added as a manual-run footnote post-Tier-3 if a customer requests it.
- **Cloud-managed Neo4j (AuraDB).** Pricing-gated and not reproducible from this repo.
- **`shortestPath`-bearing IC queries** (Tier 2 § 3.2.3). Skipped pending OpenGraphDB v0.5+ implementation.
- **Feature matrix beyond the migration guide.** The user explicitly said "drop COMPETITIVE-COMPARISON.md; just update MIGRATION-FROM-NEO4J.md". Per-feature parity claims live in that one document.

## 9. Definition of done — Tier 1 (the only one we're committing to today)

Tier 1 is "done" when:

1. `scripts/competitor-bench/run-all.sh` produces a JSON dump for both engines × 5 metrics × N=5 iters, on the i9-10920X box, in ≤ 30 minutes wall-clock.
2. The same dump renders a markdown table that can be pasted into BENCHMARKS § 2.2 and verified by `scripts/check-benchmarks-version.sh`.
3. Rows 3 + 4 in BENCHMARKS § 2 carry an explicit ✅/❌/🤝 verdict referencing the new § 2.2.
4. The migration guide [`MIGRATION-FROM-NEO4J.md`](../../MIGRATION-FROM-NEO4J.md) § 5 honesty footer drops the "directional only" caveat for rows 3 + 4 and replaces it with the verified verdict; § 5.1 grows its first 2 verified rows.
5. `skills/opengraphdb/references/benchmarks-snapshot.md` mirrors the new verdicts.
6. No regression on existing CI gates (`verify-claims.sh`, `check-benchmarks-version.sh`, the existing `cargo test --release` matrix).

Tier 2 + 3 DODs are scoped at hand-off after Tier 1.
