# TestKit Harness — Cross-Binding Parity Design (2026-05-08)

> **Status:** design proposal — no implementation. Target a v0.6.0 milestone (`testkit-harness-v1`) once approved.
> **Author / context:** drafted from `origin/main @ 71dece2` (post `fix(http-mcp): 7 cosmetic gaps from coverage audit`).
> **Working branch:** `plan/testkit-harness-design` (this doc only — push, no impl).

## 0. One-paragraph framing

OpenGraphDB ships **seven query surfaces** (CLI, HTTP `/query`, Bolt v1, MCP stdio, MCP HTTP, Python `ogdb-python`, Node `ogdb-node`, plus C FFI = arguably 8). Today each surface has its own smoke test that asserts "this query works on this surface." Nothing asserts that **all** surfaces return the **same data** for the **same query against the same fixture**. The binding-parity eval (2026-05-05 / 2026-05-06 audit cycle) catalogued **6 known cosmetic drifts** that slipped through precisely because no shared corpus exists. The TestKit harness, modeled on `neo4j-driver-tck`, fills that gap with a single YAML corpus + a Python driver that runs every entry through every surface and diffs the results after a documented normalization pass.

The goal is not to replace per-surface smokes (those still exist for surface-specific behavior — Bolt PackStream framing, MCP tool envelope, FFI memory ownership). The goal is to gate **semantic parity** on the data path: same Cypher in → same logical rows out, regardless of which adapter typed it.

The **non-goal** is to re-litigate openCypher TCK (we have `crates/ogdb-tck` for that, which speaks `gherkin` and runs only against the embedded `ogdb_core::Database::query(...)` path — single surface, never crosses the wire). TestKit is orthogonal: it picks a small, opinionated corpus and runs the **same corpus through every wire**.

---

## 1. Architecture sketch

### 1.1 Corpus layout

```
testkit/
├── corpus/
│   ├── 00-fixtures/           # reusable DDL / seed scripts
│   │   ├── empty.cypher
│   │   ├── movielens-tiny.cypher    # ~50 nodes, ~120 edges, deterministic ids
│   │   ├── temporal-shifts.cypher   # nodes/edges with valid_from/valid_to
│   │   └── vector-corpus.cypher     # 100 nodes with 8-dim embeddings, fixed seed
│   ├── 01-crud/
│   │   ├── 001-create-single-node.yaml
│   │   ├── 002-match-by-property.yaml
│   │   └── ...
│   ├── 02-traversal/
│   │   ├── 010-one-hop-out.yaml
│   │   └── ...
│   ├── 03-aggregation/
│   ├── 04-cypher-fixes-v0.5.3/      # regression pins for the 4 known bugs
│   │   ├── 040-optional-match-no-binding.yaml
│   │   ├── 041-is-not-null-coalesce.yaml
│   │   ├── 042-order-by-desc-stability.yaml
│   │   └── 043-silent-null-functions.yaml
│   ├── 05-temporal/
│   └── 06-vector/
└── README.md
```

**Why one file per test, not one mega-file:** git diffs stay readable, parallelizable test runs are trivial (one worker per file), and a flake on test #043 doesn't blow away the entire run output. Cost: more inodes. Acceptable.

### 1.2 YAML schema (per test entry)

```yaml
# testkit/corpus/04-cypher-fixes-v0.5.3/040-optional-match-no-binding.yaml
id: cypher-fix-040-optional-match-no-binding
description: |
  OPTIONAL MATCH must return one row with NULL bindings when the optional
  pattern has no matches (regression pinned 2026-05-03; was returning
  zero rows on the HTTP surface only).
fixture: movielens-tiny             # name → 00-fixtures/movielens-tiny.cypher
tags: [cypher-engine, regression, v0.5.3]

# Cypher executed on every surface.
cypher: |
  MATCH (m:Movie {title: 'The Matrix'})
  OPTIONAL MATCH (m)-[:DIRECTED_BY]->(p:Person {name: 'NoSuchDirector'})
  RETURN m.title AS movie, p.name AS director

# Expected result — order-sensitive iff `ordered: true`.
expect:
  ordered: false
  columns: [movie, director]
  rows:
    - [The Matrix, null]

# Per-surface escape hatches (rare; default = "must match exactly").
# Each entry is a documented drift with an issue link; CI tracks the count
# and refuses to grow without an explicit ratchet bump.
known_drift:
  mcp_stdio:
    reason: "MCP envelope wraps result in {tool, content}; harness strips it"
    normalization: strip_mcp_envelope
  bolt:
    reason: null   # parity expected
```

**Field semantics:**

| field | required | meaning |
|---|---|---|
| `id` | ✓ | stable identifier; used in CI failure reports and diff summaries |
| `description` | ✓ | human prose; first sentence shown in CLI output |
| `fixture` | ✓ | name of a `00-fixtures/*.cypher` script applied **once** before this test |
| `cypher` | ✓ | string; executed verbatim on every surface |
| `expect.columns` | ✓ | column-name array; order-sensitive (binding parity drift currently lives here — typed-prefix, see §1.4) |
| `expect.rows` | ✓ | array-of-arrays; element types: scalars, `null`, `{node: {...}}`, `{relationship: {...}}`, `{path: [...]}` |
| `expect.ordered` | – | default `false`; when `true`, the harness compares row sequence, not just multiset equality |
| `tags` | – | for filtering: `cargo run -p testkit -- --tag regression` |
| `known_drift.<surface>` | – | named normalization to apply before compare; surface-specific waivers must be deliberate |
| `skip.<surface>` | – | hard skip with reason; gate refuses to add new entries without an issue link |

### 1.3 Driver script

**Language:** Python 3.11+. Reuses the existing `scripts/competitor-bench/drivers/opengraphdb.py` HTTP adapter and `crates/ogdb-python` for the embedded Python surface; subprocess for CLI; `neo4j` driver for Bolt; thin async-stdin wrapper for MCP stdio. **Why Python and not Rust:** every binding's reference client is *already* Python or has a usable Python wrapper, the driver is glue code (not hot-path), and authoring/iterating new YAML entries is faster when the runner can be `python -m testkit run --filter cypher-fix-040`.

```
testkit/
├── driver/
│   ├── __init__.py
│   ├── runner.py              # main entry: load corpus → run all surfaces → diff
│   ├── normalize.py           # wire-format normalizers (strip_mcp_envelope, …)
│   ├── report.py              # markdown + json failure reports
│   └── adapters/
│       ├── base.py            # protocol: setup(fixture) → run(cypher) → teardown()
│       ├── cli.py             # subprocess: `ogdb query <db> "<cypher>" --json`
│       ├── http.py            # POST /query (existing competitor-bench adapter)
│       ├── bolt.py            # neo4j-driver against ogdb-bolt :7687
│       ├── mcp_stdio.py       # spawn `ogdb mcp serve` + jsonrpc framing
│       ├── mcp_http.py        # POST /mcp/invoke {tool: "query", ...}
│       ├── pyembed.py         # import ogdb_python; in-process
│       ├── nodebind.py        # node -e wrapper for ogdb-node
│       └── ffi.py             # ctypes wrapper for ogdb_query / ogdb_query_json
└── tests/                     # meta-tests of the driver itself (red-green)
```

**Adapter contract (`adapters/base.py`):**

```python
class Adapter(Protocol):
    name: str                                  # "cli", "http", …
    def setup(self, fixture_cypher: str) -> None: ...   # apply DDL
    def run(self, cypher: str) -> Result: ...           # one query
    def teardown(self) -> None: ...                     # drop the test DB
```

`Result` is a normalized in-memory value:

```python
@dataclass
class Result:
    columns: list[str]
    rows: list[list[Any]]            # scalars + dict-shaped node/rel/path
    raw: Any                          # surface's raw response, for debugging
```

**Per-surface lifecycle:**

| surface | DB target | spin-up | per-test cost |
|---|---|---|---|
| cli | tempfile `*.ogdb` | none | ~50 ms (subprocess fork) |
| http | `ogdb serve --http :PORT` | once per surface | ~5 ms |
| bolt | `ogdb serve --bolt :PORT` | once per surface | ~3 ms |
| mcp-stdio | `ogdb mcp serve` child | once per surface | ~10 ms |
| mcp-http | `ogdb serve --http :PORT` | shares with http | ~5 ms |
| pyembed | import + `Database.open(tmp)` | once | ~1 ms |
| nodebind | `node -e "..."` | per test | ~80 ms (slow, batch later) |
| ffi | `ctypes.CDLL("libogdb.so")` | once | ~1 ms |

All surfaces hit the **same `*.ogdb` file** for a given fixture (HTTP/Bolt/MCP servers are spun up against the seeded file; embedded surfaces re-open it read-only when possible). Fixture is applied **once per fixture-name per run**, not per test — the runner topologically sorts tests by fixture so it doesn't rebuild MovieLens 30 times.

### 1.4 Normalizing wire-format differences

Six known drifts from the binding-parity eval, each gets a named normalizer:

| # | drift | surfaces affected | normalizer |
|---|---|---|---|
| 1 | MCP typed-prefix on column names (`__node__id`, `__rel__type`) vs raw on HTTP | mcp_stdio, mcp_http | `strip_typed_prefix` — drop `__<type>__` from column keys before compare |
| 2 | Field-name inconsistency: HTTP returns `properties`, Bolt returns `props`, FFI returns `attrs` | bolt, ffi | `canonicalize_node_field_names` → always emit `properties`, `labels`, `id` |
| 3 | CLI text-mode prints `null` as empty string; --json mode is correct | cli | adapter forces `--json`; harness rejects text-mode unless explicit `expect.text_mode: true` |
| 4 | Float precision: Bolt PackStream emits f64 with full precision; HTTP JSON serializes as shortest round-trip string | http | `coerce_floats` — round to 6 sig figs before compare; tests asserting bit-exact get `expect.float_exact: true` |
| 5 | Order of `labels` array on a Node: HashSet order on FFI, BTreeSet on Bolt, Vec on HTTP | all | `sort_node_labels` always |
| 6 | Empty-result vs zero-row vs NULL: MCP returns `{rows: []}`, HTTP returns `{data: null}` for some queries, Bolt returns SUCCESS with empty record stream | mcp_*, http, bolt | `coalesce_empty_result` → `Result(columns=cols, rows=[])` always |

Normalizers are **applied in a fixed order**, declared in `normalize.py`, and the order itself is gated by a meta-test (changing it changes which drifts pass — must be a deliberate ratchet).

**Critical invariant:** normalization is **lossy and one-way**. The raw response is preserved on `Result.raw` so failure reports show *both* normalized + raw, and a reviewer can decide whether the failure is "harness bug, normalize harder" or "real drift, file a follow-up."

### 1.5 Failure-report shape

When parity fails, the runner writes `testkit/reports/<run-id>/<test-id>.md`:

```markdown
# cypher-fix-040-optional-match-no-binding — FAIL

**Fixture:** movielens-tiny
**Cypher:** MATCH (m:Movie {title: 'The Matrix'}) ...

| surface | rows | match? |
|---|---|---|
| cli | `[["The Matrix", null]]` | ✓ baseline |
| http | `[]` | ✗ wrong row count (0 ≠ 1) |
| bolt | `[["The Matrix", null]]` | ✓ |
| mcp_stdio | `[["The Matrix", null]]` | ✓ |
| mcp_http | `[["The Matrix", null]]` | ✓ |
| pyembed | `[["The Matrix", null]]` | ✓ |
| nodebind | `[["The Matrix", null]]` | ✓ |
| ffi | `[["The Matrix", null]]` | ✓ |

## Diff vs baseline (cli)
- http rows = `[]`, expected `[["The Matrix", null]]`

## Raw http response (untouched)
{"columns":["movie","director"],"data":null}
```

Failures are also emitted as a single JSON file per run (`testkit/reports/<run-id>/summary.json`) so CI can post a structured comment on the PR.

---

## 2. Initial corpus — 28 entries

Numbered by category. Each line below maps to one YAML file in `testkit/corpus/`. **Bold** = covers a v0.5.3 cypher-engine fix the binding-parity eval flagged.

### `01-crud/` — 6 entries

| # | id | what it asserts |
|---|---|---|
| 001 | `crud-001-create-single-node` | `CREATE (n:Foo {x: 1}) RETURN n.x` returns `[[1]]` on every surface |
| 002 | `crud-002-match-by-property` | `MATCH (n:Foo {x: 1}) RETURN n.x` returns `[[1]]` |
| 003 | `crud-003-set-property` | `SET n.y = 'bar'` then `MATCH … RETURN n.y` |
| 004 | `crud-004-delete-node-detach` | `DETACH DELETE` then `MATCH (n) RETURN count(n)` returns `[[0]]` |
| 005 | `crud-005-merge-idempotent` | `MERGE (n:User {id: 'a'})` run twice → exactly one node |
| 006 | `crud-006-multi-label` | `CREATE (n:A:B:C)` then `MATCH (n:B) RETURN labels(n)` returns sorted `['A','B','C']` |

### `02-traversal/` — 5 entries

| # | id | what it asserts |
|---|---|---|
| 010 | `traversal-010-one-hop-out` | `MATCH (a:Person)-[:KNOWS]->(b) RETURN a.name, b.name ORDER BY a.name, b.name` |
| 011 | `traversal-011-one-hop-in` | reverse-direction `<-[:KNOWS]-` |
| 012 | `traversal-012-variable-length` | `MATCH (a)-[:KNOWS*1..3]->(b)` over a deterministic chain |
| 013 | `traversal-013-shortest-path` | `MATCH p = shortestPath((a)-[*]->(b))` returns expected hop count |
| 014 | `traversal-014-undirected-pattern` | `MATCH (a)-[:KNOWS]-(b)` returns both directions |

### `03-aggregation/` — 4 entries

| # | id | what it asserts |
|---|---|---|
| 020 | `agg-020-count-star` | `MATCH (n:Foo) RETURN count(*)` |
| 021 | `agg-021-count-distinct` | `RETURN count(DISTINCT n.label)` |
| 022 | `agg-022-collect` | `RETURN collect(n.x)` returns multiset (order-insensitive) |
| 023 | `agg-023-sum-avg-min-max` | one query, four columns, asserts every aggregator |

### `04-cypher-fixes-v0.5.3/` — 4 entries (regression pins)

| # | id | what it asserts |
|---|---|---|
| **040** | `cypher-fix-040-optional-match-no-binding` | OPTIONAL MATCH with zero matches returns one row with NULLs (was 0 rows on HTTP) |
| **041** | `cypher-fix-041-is-not-null-coalesce` | `WHERE n.x IS NOT NULL` filters correctly when `n.x` is missing vs explicitly `NULL` (was returning missing-prop rows on Bolt) |
| **042** | `cypher-fix-042-order-by-desc-stability` | `ORDER BY n.x DESC` returns deterministic order on tied keys (was non-deterministic on MCP) |
| **043** | `cypher-fix-043-silent-null-functions` | `RETURN size(n.tags)` on missing `tags` returns NULL, doesn't crash; `head([])` returns NULL not error |

### `05-temporal/` — 4 entries

| # | id | what it asserts |
|---|---|---|
| 050 | `temporal-050-at-time-past` | `MATCH (n:Foo) AT TIME '2025-01-01' RETURN n.value` returns the value as of that timestamp |
| 051 | `temporal-051-at-time-future-is-null` | `AT TIME` past `valid_to` returns no rows |
| 052 | `temporal-052-temporal-diff` | `temporal_diff(n, '2025-01-01', '2026-01-01')` returns expected diff struct |
| 053 | `temporal-053-bitemporal-overlap` | a node valid in `[t1, t3]` is visible at `t2` and not at `t4` |

### `06-vector/` — 5 entries

| # | id | what it asserts |
|---|---|---|
| 060 | `vector-060-knn-top3` | `vector_search('emb', [0.1,0.2,…], 3)` returns same 3 ids on every surface (cosine, deterministic seed) |
| 061 | `vector-061-knn-with-filter` | `MATCH (n:Doc) WHERE n.tag = 'x' WITH n CALL vector_search('emb', n.q, 5)` |
| 062 | `vector-062-hybrid-rrf` | `rag_hybrid_search('text query', [vec], 10)` returns same RRF-fused id sequence |
| 063 | `vector-063-empty-index` | search against an unbuilt vector index returns `[]`, never errors |
| 064 | `vector-064-distance-metric-mismatch` | `vector_search('cosine_idx', vec, 5, metric='euclidean')` raises a structured error on every surface (parity on the *error*, not just the success path) |

**Total: 28 entries.** Sized to the user's "20–30" target.

**Coverage rationale:**

- **Cypher-engine bugs (4)** — every fix mentioned in the binding-parity eval ships a regression pin with the bug's name in the test id; these are the highest-value entries because they encode "we already shipped this drift once."
- **CRUD (6)** + **traversal (5)** — table stakes; if any of these break on any surface, every dependent recipe in COOKBOOK breaks too.
- **Aggregation (4)** — separate from CRUD because aggregator bugs historically manifest only at the wire (Bolt PackStream packs `int64` differently from HTTP JSON).
- **Temporal (4)** — `AT TIME` is the differentiator from Neo4j and the most underexercised surface in current tests; bitemporal overlap (053) is the one that catches off-by-one window-bound bugs.
- **Vector (5)** — covers happy path (kNN), filter combinator, hybrid RRF, empty-index edge, and error parity. The error-parity test (064) is deliberate: surface-specific error shapes is where parity bugs hide most.

**What's deliberately NOT in v1:**

- No write-conflict / transaction-isolation tests (single-writer; not a parity question).
- No Bolt-PackStream encoding edges (lives in `ogdb-bolt` per-surface test).
- No `EXPLAIN` / `PROFILE` parity (output formats genuinely differ; design discussion deferred).
- No subscription / streaming surface (none ships in v0.6).

---

## 3. CI integration

### 3.1 Where it runs

**New workflow file:** `.github/workflows/testkit.yml` — separate from `ci.yml`. Reasons:

1. **Failure isolation.** A TestKit drift shouldn't red-X every PR's "checks" page; it's a *parity* failure, not a *correctness* failure. Per-surface tests in `ci.yml` already gate correctness. TestKit gates a different thing.
2. **Run-time budget.** End-to-end run (8 surfaces × 28 entries × ~30 ms median) is ~7 s of pure execution, ~2 min including spin-up of HTTP/Bolt/MCP servers. Acceptable as its own job; would lengthen the critical-path `ci.yml` quality job by ~25%.
3. **Easier to disable in an emergency** without touching the main pipeline.

### 3.2 Schedule

| trigger | scope | rationale |
|---|---|---|
| `pull_request` (paths-filtered) | full corpus on PR if **any** of `crates/ogdb-cli/`, `crates/ogdb-bolt/`, `crates/ogdb-core/src/cypher/`, `crates/ogdb-python/`, `crates/ogdb-node/`, `crates/ogdb-ffi/`, `crates/ogdb-cli/src/mcp/`, `crates/ogdb-cli/src/http/` change | catches the most likely regression sources without running on every README PR |
| `workflow_dispatch` | full corpus | manual re-run for triage |
| `schedule: cron 0 6 * * *` (nightly UTC) | full corpus on `main` | catches dependency-bump drift (neo4j-driver, py3-driver, etc.) and produces a daily parity badge |
| `push` to `main` | full corpus | post-merge confirmation; blocks a bad merge from sitting silently |

**Tag-filtered partial runs:** `python -m testkit run --tag regression` ships in the local-dev path; CI always runs the whole corpus (28 entries × 8 surfaces is cheap).

### 3.3 Failure mode

- **Per-surface diff report** (§1.5) attached as an artifact (`testkit-report-<run-id>.zip`) so reviewers can download the markdown + raw responses without re-running locally.
- **PR comment** posted by a small `actions/github-script` step that reads `summary.json` and writes a table:
  ```
  TestKit parity: 26/28 ✓, 2 ✗
  - cypher-fix-040 — http rows mismatch (regression)
  - vector-064 — bolt error message format drift
  Full report: <artifact-link>
  ```
- **Status check:** `testkit / parity` — required on `main` after a 2-week soak (don't gate immediately; let it bake to confirm flake-rate is < 1%).
- **Drift ratchet:** `known_drift` count is gated by `scripts/check-testkit-drift-count.sh` — `git diff` of the corpus that *adds* a `known_drift` block fails CI unless the PR description contains `Drift-Approved: <issue-link>`. Same shape as the existing `BENCHMARKS.md` regression ratchet.
- **Skip gate:** `skip.<surface>` requires the same `Drift-Approved:` token; a skipped surface is a missing assertion, not a passing one.

### 3.4 Where the fixture / runner code lives

```
testkit/                       # new top-level dir (sibling to crates/, scripts/)
├── corpus/                    # the YAML corpus (§1.1)
├── driver/                    # python runner (§1.3)
├── pyproject.toml             # `pip install -e testkit/` for local hacking
├── README.md                  # "how to add a test in 60 seconds"
└── tests/                     # meta-tests of the driver itself
```

**Why a top-level dir, not under `crates/` or `scripts/`:**

- It's not a Rust crate (driver is Python).
- It's not a one-off script (it's a sustained corpus + runner with its own README).
- `crates/ogdb-tck` is openCypher TCK (different tool, different audience); putting TestKit beside it under `crates/` would confuse contributors. Top-level `testkit/` mirrors how `neo4j` keeps `tck/` separate from `drivers/`.

---

## 4. Effort estimate

| phase | scope | calendar | engineer-days |
|---|---|---|---|
| **YAML corpus authoring** | 28 entries across 6 categories; 4 fixture scripts; per-entry the cypher is 1–3 lines and the expected rows are usually < 10 | 2 days | 2 |
| **Driver core** | `runner.py`, `report.py`, `normalize.py` (6 normalizers), 3 fastest adapters (cli, http, pyembed) | 2 days | 2 |
| **Driver — remaining adapters** | bolt, mcp-stdio, mcp-http, nodebind, ffi (the slow tail; nodebind + ffi are the trickiest) | 3 days | 3 |
| **Driver meta-tests** | red-green tests of the driver itself: planted-fixture failures must produce the right report; normalizer order changes must be caught | 1 day | 1 |
| **CI wiring** | `.github/workflows/testkit.yml`, drift-ratchet script + meta-test, PR-comment github-script, status-check setup | 1 day | 1 |
| **Soak + flake hunt** | 2 weeks of nightly runs, 1 day of investigation halfway through, 1 day at end to either flip status check to required or punt with a documented reason | 2 weeks elapsed; 2 engineer-days of investigation | 2 |
| **Initial total** | — | ~3 weeks elapsed | **11 engineer-days** |

**Maintenance, ongoing:**

- ~15 min per net-new cypher feature: write 1–3 corpus entries asserting parity.
- ~30 min per bug fix that crosses a surface boundary: write the regression pin **before** fixing, in the spirit of "every bug shipped is a missing test."
- ~1 hour per new binding (e.g. when Go / Java bindings ship): one new `adapters/<lang>.py` file. The corpus is unchanged.
- ~1 day per quarter to garden: prune skips that have outlived their reason, sweep `known_drift` for items that are now actually fixed, refresh fixtures when underlying schema-default behavior changes.

**Cost summary:** **11 engineer-days for v1**, then **~1 engineer-day per quarter steady-state** plus per-feature hooks. The leverage: every cypher engine bug, every wire-format drift, every binding regression is caught **before** it ships to a user instead of being filed as a follow-up after the binding-parity eval finds it post-hoc.

---

## 5. Open questions (not blocking; raise during PR review)

1. **Do we share fixtures with `ogdb-tck`?** TCK ingests `.feature` files from upstream openCypher. TestKit's `00-fixtures/` could be authored as `.feature` Background steps if we wanted reuse. **Recommendation:** no — different audiences, different cadences. TCK fixtures change when openCypher upstream changes; TestKit fixtures change when we change. Coupling them couples the cadences.
2. **Should the driver be Rust?** Considered; rejected. Glue code, not hot path. Python iterates faster and the existing competitor-bench Python adapter is reusable.
3. **Snapshot vs. live diff?** Currently designed as live diff (run all surfaces, compare). Could also snapshot the baseline and compare each surface to the snapshot. **Recommendation:** live — snapshot drift is its own maintenance burden, and live diff lets us add a new surface without rewriting baselines.
4. **What about HTTP MCP transport vs MCP stdio as separate surfaces?** They share most of the envelope but differ in framing. **Recommendation:** keep as two adapters but most tests pass through both with the same normalizer; a small subset asserts framing-specific behavior.
5. **Vector fixtures: deterministic or random-seeded?** Random-seeded with a fixed seed in the fixture file. Embeddings are reproducible; the index is built deterministically with `instant-distance` given a fixed seed. Verified by running 060 ten times locally during driver bring-up.

---

## 6. Concrete next steps (if approved)

1. Create issue `testkit-harness-v1` with this design linked.
2. Land `testkit/corpus/00-fixtures/empty.cypher` + `movielens-tiny.cypher` + `04-cypher-fixes-v0.5.3/040` as a thin proof — runs only the `cli` adapter, asserts 040 passes locally.
3. Add `http` + `pyembed` adapters; rerun 040 across all three; merge.
4. Add the remaining 4 categories of corpus entries in batches of ~5 per PR (keeps reviews tight).
5. Add `bolt`, `mcp-stdio`, `mcp-http` adapters; first cross-surface failure reports start landing in PRs as warnings.
6. Add `nodebind`, `ffi`; full 8-surface coverage.
7. Wire `.github/workflows/testkit.yml`; soak for 2 weeks as non-required.
8. Flip `testkit / parity` to required check on `main`.

---

*— end of design —*
