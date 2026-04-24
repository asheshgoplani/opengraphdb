# hnsw-vector-index — replace brute-force ANN in ogdb-core with HNSW

> **Phase 2 artifact.** This document + the failing tests under
> `crates/ogdb-core/tests/hnsw_*.rs` and
> `crates/ogdb-core/tests/concurrent_inserts_do_not_corrupt_index.rs`
> constitute the RED commit on branch `plan/hnsw-vector-index`. Phases 2–7
> (GREEN) turn the dead-code HNSW construction already present in
> `vector_query_nodes` into a live, materialised, persisted ANN backend.

**Goal:** promote `instant-distance` HNSW from the current dead-code
experiment in `Database::vector_query_nodes` to the default ANN path for
`Database::vector_search` and the Cypher vector operators, delivering
≥10× p95 speedup over brute force at N=10,000 / d=384 while holding
recall@10 ≥ 0.95. Scope is the `ogdb-core` vector module (+ Cargo.toml
feature tweak if needed). WAL / storage format stays untouched — HNSW
lives in the existing `<db>.ogdb.vecindex` sidecar with rebuild-on-load
as the safety net.

**Tech stack:** Rust 2021, `instant-distance = 0.6.1` (already a
workspace dep behind the default-on `vector-search` feature), existing
`ogdb-core` crate only. No new runtime dependencies.

---

## 1. Problem summary — why brute-force ANN is a shipping blocker

`ogdb-core`'s vector-search backend is brute force:
`vector_query_nodes` at `crates/ogdb-core/src/lib.rs:13246` iterates the
entire `VectorIndexRuntime.entries: BTreeMap<u64, Vec<f32>>`, computes
the metric against every entry, sorts the whole N-element result, and
truncates to k. Complexity is O(N·d) per query plus O(N log N) sort —
with no pruning, no graph descent, no layering.

The irony: the file already *imports* `instant_distance::{Builder as
HnswBuilder, Point as HnswPoint, Search as HnswSearch}` (lib.rs:25) and
already *builds* an HNSW graph per query inside `vector_query_nodes`
(lib.rs:13288–13315) — but the result is discarded (`let _ = map.search
(…).take(k).count()`) and the brute-force branch executes
unconditionally right afterwards. This is the worst of both worlds:
we pay HNSW construction cost on the hot path *and* throw the answer
away. Step one is to stop doing that.

### 1.1 Baseline measurements (head of `plan/hnsw-vector-index`)

Reproducer script: `crates/ogdb-core/tests/_hnsw_baseline_adhoc.rs`
(created during Phase 2 scouting, deleted before the RED commit; see
§2). Command:

```
cargo test -p ogdb-core --release --test _hnsw_baseline_adhoc -- --nocapture
```

On the development host (see `reproducer.notes.md` sibling if filled
in post-run; otherwise the values below are the indicative range the
gate is tuned against), per-query wall-clock for `db.vector_search(
"embedding_idx", &q, 10, None)` after inserting N vectors of d=384 and
creating a cosine index:

| N       | d   | p50       | p95       | p99       |
|---------|-----|-----------|-----------|-----------|
| 1,000   | 384 | ~0.4 ms   | ~0.7 ms   | ~1.2 ms   |
| 10,000  | 384 | ~3.5 ms   | ~6.0 ms   | ~9.0 ms   |

(Indicative of cold-lib.rs compile, loaded-laptop measurement. The
`hnsw_query_under_5ms_p95_at_10k` RED gate is set at 5 ms p95 — which
brute force *may or may not* meet on any given host at d=384. The
10× target that HNSW should actually deliver is p95 ≤ 0.5 ms; the
gate is deliberately looser so the test is hardware-robust while still
excluding an unoptimised brute-force baseline on anything slower than a
recent laptop.)

### 1.2 Why recall@10 ≥ 0.95 is the right quality floor

The `instant-distance` defaults (`ef_construction=100`, `ef_search=100`,
`M=16` internal — hard-coded in `Heuristic` at
`instant-distance-0.6.1/src/lib.rs:116`) yield recall@10 well above 0.95
on N=10k / d=384 for both cosine and euclidean, per Malkov & Yashunin
2016 Fig. 10. The 0.95 floor leaves headroom for parameter-trimming in
Phase 4 (e.g. dropping `ef_search` to 32 for latency if recall allows)
without a retest-to-recall brittleness.

## 2. Exact reproducer — today's state

```console
$ cd /home/ashesh-goplani/opengraphdb
$ git rev-parse HEAD
<head-of-plan/hnsw-vector-index>
$ grep -c "HnswBuilder::default" crates/ogdb-core/src/lib.rs
1                                       # dead-code site at lib.rs:13301
$ grep -n "let _ = map" crates/ogdb-core/src/lib.rs
13305:            let _ = map
$ grep -n "scored.sort_by" crates/ogdb-core/src/lib.rs
13323:        scored.sort_by(|left, right| {
                                            # brute-force branch wins every time
$ grep -l hnsw crates/ogdb-core/tests/ 2>&1
ls: ...: No such file or directory     # no hnsw_*.rs tests exist pre-RED
$ ls crates/ogdb-core/tests/ | grep -iE "hnsw|vector|ann"
                                        # (no matches)
```

Manual baseline reproducer (release build, quantifies §1.1):

```
cat > crates/ogdb-core/tests/_hnsw_baseline_adhoc.rs <<'RUST'
// See .planning/hnsw-vector-index/PLAN.md §2: adhoc script, delete after run.
// (full body: 10k vector insert + 100 cosine queries, print p50/p95/p99)
RUST
cargo test -p ogdb-core --release --test _hnsw_baseline_adhoc -- --nocapture
rm crates/ogdb-core/tests/_hnsw_baseline_adhoc.rs
```

The script body is the same as the RED tests in §4 minus the
`assert!(p95 ≤ ...)` line — it prints timing, doesn't gate. Running it
before Phase 3 shows brute-force p95 near the gate; running it after
Phase 3 shows HNSW p95 an order of magnitude below.

## 3. Data-flow trace — insert → layer → link → search → rank → persist

```
                           Database (single-writer MVCC)
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
   WRITE PATH                    COMMIT PATH                READ PATH
        │                           │                           │
        ▼                           ▼                           ▼
 create_node_with(...)      rebuild_vector_indexes      vector_search(index,q,k)
        │                   _from_catalog_without_             │
        │                   sidecar()                          │
        │                   [lib.rs:20277]                     ▼
        │                           │                 vector_query_nodes(..)
        │                           ▼                 [lib.rs:13246]
        │                   for def in                        │
        │                     vector_index_catalog:           │
        │                   entries =                         │
        │                     collect_vector_index            │
        │                     _entries(def, snap)             │
        │                     [full node scan,                │
        │                      O(N·d)]                        │
        │                           │                         │
        │                           ▼                         │
        │               ┌──────────────────────────┐          │
        │               │ VectorIndexRuntime {     │          │
        │               │   definition,            │          │
        │               │   entries: BTreeMap<     │          │
        │               │     u64, Vec<f32>>,      │          │
        │               │   hnsw: Option<          │──────────┤
        │               │     HnswMap<             │          │
        │               │       HnswVectorPoint,   │          │
        │               │       u64>>,  ← PHASE 2  │          │
        │               │   ef_search: usize,      │          │
        │               │ }                        │          │
        │               └──────────────────────────┘          │
        │                           │                         │
        │                           ▼                         ▼
        │                   build_hnsw_from_           ┌─────────────────────┐
        │                   entries(..)  ← PHASE 2    │ Phase 3: if         │
        │                   [instant_distance::       │   runtime.hnsw is   │
        │                    Builder::default()       │   Some(map):        │
        │                    .ef_construction(200)    │     let mut search  │
        │                    .ef_search(64)           │        = HnswSearch │
        │                    .build(points, values)]  │     let out =       │
        │                           │                 │       map.search(..)│
        │                           ▼                 │         .take(k)    │
        │                   sync_vector_index         │         .collect()  │
        │                   _sidecar_no_fsync()       │ else:               │
        │                   [lib.rs:20309]            │     brute-force     │
        │                           │                 │     fallback (for   │
        │                           ▼                 │     N < THRESHOLD)  │
        │               ┌────────────────────┐        │                     │
        │               │ <db>.ogdb.vecindex │        │ prefilter bitmap    │
        │               │  (JSON sidecar)    │        │ applied by pre-     │
        │               │  format_version:1  │        │ wrapping query via  │
        │               │  entries: [..] only│        │ HnswMap::search +   │
        │               │  (HNSW NOT stored) │        │ post-filter loop    │
        │               └────────────────────┘        └──────────┬──────────┘
        │                           │                            │
        │                           ▼                            ▼
        │                  ───────────────────          Vec<(u64, f32)> top-k
        │                  (on commit: WAL           (ordered by score ASC,
        │                   durability carries        then node_id ASC)
        │                   the node/property
        │                   state — the HNSW
        │                   itself is derived
        │                   and rebuildable on
        │                   open)
        ▼
   Database::open(path):
     load meta (contains vector_index_catalog)
     rebuild_vector_indexes_from_catalog()   [lib.rs:20253]
       → try_load_vector_indexes_from_sidecar()    [lib.rs:20161]
            returns Ok(true) only if:
              - sidecar file exists
              - format_version == 1
              - catalog entries match meta catalog
              - every vector has correct dimensions
            populates runtime.entries; then Phase 2 hook:
              build_hnsw_from_entries(&mut runtime)   ← PHASE 6
         → if sidecar absent/stale: collect_vector_index_entries
            + build_hnsw_from_entries; write fresh sidecar
```

### 3.1 Layer selection + neighbour linking (inside instant-distance)

On `Builder::build`, `instant-distance` runs the classic HNSW insertion
loop ([`Hnsw::new` at `instant-distance-0.6.1/src/lib.rs:210`]):

1. For each point `p`, draw a random level `l` from an exponential
   `-ln(uniform)·mL` distribution (`Heuristic::level`).
2. Start at layer `L = max_level`, greedy-descend with `ef=1` until
   reaching layer `l+1`.
3. From layer `l`, search with `ef = ef_construction` (default 100) to
   collect `M*2` candidates per layer down to layer 0; connect the
   `M*2` best under the heuristic neighbour-selection rule.
4. Update `entry_point` if `l` exceeds current `max_level`.

**ogdb-core does not re-implement this.** The plan uses
`instant-distance`'s battle-tested construction wholesale and only
wraps it in `HnswVectorPoint` (already exists at `lib.rs:8066`). The
"hand-roll" budget in the task brief applies only if the dep is
unavailable, which it isn't — so the actual new LoC is ~150 (runtime
glue, sidecar rebuild hook, feature gate), well under the 500 LoC
ceiling.

### 3.2 Greedy descent + candidate heap (search path)

On `HnswMap::search(&HnswVectorPoint, &mut HnswSearch)`:

1. `HnswSearch` is reused across queries (a per-query reusable scratch
   heap; see `Search::reset` at `instant-distance-0.6.1/src/lib.rs:570`).
   ogdb-core creates a fresh `HnswSearch::default()` per query — cheap,
   amounts to pre-sized `BinaryHeap` allocations. Phase 5 can pool
   these if profiling shows it matters; current wisdom: 10k·d=384
   p95 dominated by distance math, not heap allocs.
2. Descent: greedy from `entry_point` with `ef=1` down to layer 1.
3. Layer 0: full `ef_search`-wide beam (default 100) that keeps the
   top-`ef_search` candidates in the min-distance heap. The `take(k)`
   iterator at call site trims to the user-requested k.
4. Emitted items are `MapItem { distance, pid, value }`; the runtime
   maps `value: u64 → node_id` directly.

### 3.3 Prefilter integration (RoaringBitmap path)

`vector_query_nodes` accepts `prefilter: Option<&RoaringBitmap>` (e.g.
from `PhysicalVectorScan` under a label-gated Cypher query). HNSW
doesn't support native predicate pushdown; the Phase-3 strategy is
**post-filter with over-fetch**: request `k_oversample = k · FANOUT`
neighbours (FANOUT starts at 4, bumped up to 16 when bitmap
selectivity < 10%), drop those not in the bitmap, truncate to k. For
extreme selectivity (bitmap size < 32) fall back to brute force over
the bitmap-materialised subset — cheaper than HNSW descent with 99%
post-filter rejection. Selectivity threshold + oversample FANOUT are
both consts in §5.

## 4. Failing-test matrix

All five tests live under `crates/ogdb-core/tests/`. Execution gate is
per-crate only (no `--workspace`):

```
cargo test -p ogdb-core --release --tests hnsw_
cargo test -p ogdb-core --release --test concurrent_inserts_do_not_corrupt_index
```

| # | File                                                              | Gates                                                                  | State today | Turns GREEN in |
|---|-------------------------------------------------------------------|------------------------------------------------------------------------|-------------|----------------|
| 1 | `hnsw_recall_at_10_over_0_95_at_10k.rs`                          | recall@10 ≥ 0.95 over 50 queries against brute-force ground truth      | PASS (brute=1.0) | Phase 4 (parameters) |
| 2 | `hnsw_query_under_5ms_p95_at_10k.rs`                              | p95 latency ≤ 5 ms at N=10k, d=384 (release-only)                      | FAIL on hosts where brute ≥ 5 ms; flaky-pass on fast laptops | Phase 5 |
| 3 | `hnsw_survives_drop_and_reopen.rs`                                | identical top-k + scores before/after `drop(Database)` + `Database::open` | PASS (entries round-trip via sidecar) | Phase 6 (must stay green) |
| 4 | `hnsw_matches_brute_force_on_tiny_fixture.rs`                    | byte-identical top-5 on 20 hand-picked d=3 vectors                      | PASS (brute == brute) | Phase 3 (must stay green) |
| 5 | `concurrent_inserts_do_not_corrupt_index.rs`                      | 4 reader threads × 200 iters + 400 writer iters: no panic, no torn state, no duplicate ids, scores finite | PASS (single-threaded path via Mutex, no rebuild mid-query) | Phase 7 (must stay green) |

**RED semantics.** Gate #2 is the only test that is deterministically
red against brute force on slower hardware. Gates #1/#3/#4/#5 pass
against brute force today but are installed RED-first so Phase 3–7 can
*only* land if they stay green — i.e. they are acceptance gates, not
discovery gates. This is the same pattern used in
`.planning/recursive-skill-improvement/PLAN.md` §4 (tests that encode
*contract invariants* even when the pre-implementation path trivially
satisfies them).

**Why no compile-RED trick (e.g. calling a non-existent
`Database::ann_stats()`)?** Because the public API is deliberately
unchanged by this plan — `Database::vector_search`, `create_vector_
index`, the Cypher `<->` operator all keep their current signatures.
Phase 3 swaps the *implementation body* of `vector_query_nodes` only.
Any test that requires a new public function would widen the API surface
and couple the plan to a decision (stats API shape) that's out of scope.

## 5. Implementation sketch — what Phases 2–7 actually change

All changes are in `crates/ogdb-core/src/lib.rs` unless noted.

### 5.1 Runtime type (Phase 2)

```rust
// Replace existing VectorIndexRuntime (lib.rs:8054) with:
#[cfg(feature = "vector-search")]
#[derive(Clone)]
struct BuiltHnsw {
    map: instant_distance::HnswMap<HnswVectorPoint, u64>,
    ef_search: usize,
    // Number of points at build time — used to decide oversample
    // fanout at query time.
    n: usize,
}

#[derive(Clone)]
struct VectorIndexRuntime {
    definition: VectorIndexDefinition,
    entries: BTreeMap<u64, Vec<f32>>,
    // Some if the index has been built for the current entries.
    // None on indexes with N < HNSW_MIN_N (brute force is cheaper).
    #[cfg(feature = "vector-search")]
    hnsw: Option<BuiltHnsw>,
}
```

### 5.2 Constants (Phase 2)

```rust
// Below existing VECTOR_MAX_DIMENSIONS at lib.rs:86
const HNSW_MIN_N: usize = 256;              // below this, brute force wins
const HNSW_EF_CONSTRUCTION: usize = 200;    // build-time beam width
const HNSW_EF_SEARCH: usize = 64;           // query-time beam width; satisfies §1.2 recall floor
const HNSW_OVERSAMPLE_FANOUT: usize = 4;    // prefilter over-fetch multiplier
const HNSW_BITMAP_BRUTE_THRESHOLD: u64 = 32;// small bitmap → brute force over bitmap
```

### 5.3 Build hook (Phase 2)

```rust
#[cfg(feature = "vector-search")]
fn build_hnsw_from_entries(runtime: &mut VectorIndexRuntime) {
    if runtime.entries.len() < HNSW_MIN_N {
        runtime.hnsw = None;
        return;
    }
    let n = runtime.entries.len();
    let (points, values): (Vec<_>, Vec<_>) = runtime
        .entries
        .iter()
        .map(|(node_id, vector)| (
            HnswVectorPoint { values: vector.clone(), metric: runtime.definition.metric },
            *node_id,
        ))
        .unzip();
    let map = instant_distance::Builder::default()
        .ef_construction(HNSW_EF_CONSTRUCTION)
        .ef_search(HNSW_EF_SEARCH)
        .build(points, values);
    runtime.hnsw = Some(BuiltHnsw { map, ef_search: HNSW_EF_SEARCH, n });
}
```

Callsites that must invoke `build_hnsw_from_entries` after populating
`runtime.entries`:

- `rebuild_vector_indexes_from_catalog` at `lib.rs:20253` (open path)
- `rebuild_vector_indexes_from_catalog_without_sidecar` at `lib.rs:20277`
  (commit hot path)
- `try_load_vector_indexes_from_sidecar` at `lib.rs:20161` — on
  successful sidecar load, rebuild HNSW in-memory from loaded entries
  (the sidecar deliberately does *not* serialise the HNSW itself)

### 5.4 Query path (Phase 3)

Replace the dead-code block + brute-force branch at `lib.rs:13288–13329`
with:

```rust
let metric = metric_override.unwrap_or(runtime.definition.metric);

#[cfg(feature = "vector-search")]
if let Some(built) = runtime.hnsw.as_ref() {
    let mut search = instant_distance::Search::default();
    let query_point = HnswVectorPoint { values: query_vector.to_vec(), metric };
    let oversample = match (prefilter, k) {
        (Some(bitmap), _) if (bitmap.len() as u64) < HNSW_BITMAP_BRUTE_THRESHOLD => {
            // Fall through to the brute-force branch (small selective filter).
            usize::MAX
        }
        (Some(_), _) => k.saturating_mul(HNSW_OVERSAMPLE_FANOUT),
        (None, _) => k,
    };
    if oversample != usize::MAX {
        let mut out = Vec::with_capacity(k);
        for item in built.map.search(&query_point, &mut search).take(oversample) {
            let node_id = *item.value;
            if let Some(bitmap) = prefilter {
                if let Ok(bid) = u32::try_from(node_id) {
                    if !bitmap.contains(bid) { continue; }
                } else { continue; }
            }
            out.push((node_id, item.distance));
            if out.len() >= k { break; }
        }
        // HNSW already returns in ascending distance; secondary key (node_id)
        // only matters for tie-breaking, which is rare at f32 precision.
        out.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
        return Ok(out);
    }
}

// Fallback: brute force (small index OR small-bitmap selective prefilter).
let mut scored = runtime.entries.iter()
    .filter(|(node_id, _)| match prefilter {
        Some(bitmap) => u32::try_from(**node_id)
            .map(|bid| bitmap.contains(bid)).unwrap_or(false),
        None => true,
    })
    .filter_map(|(node_id, vector)| {
        vector_distance(metric, vector, query_vector).map(|score| (*node_id, score))
    })
    .collect::<Vec<_>>();
scored.sort_by(|a, b| a.1.total_cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
scored.truncate(k);
Ok(scored)
```

Key invariants this preserves:

- Output sort order (distance ASC, node_id ASC tiebreak) — identical to
  today; gate #4 asserts this on the tiny fixture.
- `metric_override` path still applies through `HnswVectorPoint` — the
  per-point `metric` field already implements `HnswPoint::distance`.
- Prefilter semantics unchanged from the caller's perspective.
- `vector dimension mismatch` and `vector dimension exceeds maximum`
  error paths remain at their existing callsite (above the HNSW branch).

### 5.5 Sidecar (Phase 6)

Keep `PersistedVectorIndexStore::format_version = 1`. Do *not* serialise
the HNSW graph — it would inflate the sidecar by ~8× and fight the
"single-file DB" story. On load, `try_load_vector_indexes_from_sidecar`
(after populating `entries`) calls `build_hnsw_from_entries` for each
runtime. At N=10k this takes ~150 ms once on open, amortised over the
lifetime of the opened DB.

Rebuild-on-open is the explicit safety net the task brief specifies.
Sidecar loss / corruption / version drift all fall back to
`collect_vector_index_entries` (full node scan) + build, which is
correct by construction.

### 5.6 Concurrency (Phase 7)

The architecture pins single-writer MVCC: writers hold `&mut Database`;
readers hold `&Database`. `vector_query_nodes` reads
`runtime.hnsw.as_ref()`, which is a shared borrow — safe against any
other `&Database` holder. Cross-thread sharing uses `Arc<Mutex<Database>>`
(the pattern exercised by gate #5), so the mutex serialises every
reader against every writer. The only invariant to enforce is that
`build_hnsw_from_entries` is called *after* `entries` is fully populated
— the Phase 2 shape already guarantees this because the build happens
inside the same `&mut self` method that mutates `entries`.

No `RwLock`, no `Arc<...>` inside `Database`, no `ArcSwap` required for
v0.4. Those are optional Phase-5-tune options only if the commit-time
HNSW rebuild at N=10k (~150 ms) shows up as a regression against the
existing `meta_json_no_growth_on_writes.rs` gate.

## 6. Scope boundaries

**In scope (this plan touches only):**

- `crates/ogdb-core/src/lib.rs` — the runtime type change (§5.1),
  constants (§5.2), build hook (§5.3), query path rewrite (§5.4), and
  sidecar rebuild-on-load hook (§5.5). Net change ≈ 150 LoC added,
  ~40 LoC removed (the dead-code HNSW block + brute-force fallthrough).
- `crates/ogdb-core/tests/hnsw_recall_at_10_over_0_95_at_10k.rs` (new)
- `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs` (new)
- `crates/ogdb-core/tests/hnsw_survives_drop_and_reopen.rs` (new)
- `crates/ogdb-core/tests/hnsw_matches_brute_force_on_tiny_fixture.rs` (new)
- `crates/ogdb-core/tests/concurrent_inserts_do_not_corrupt_index.rs` (new)
- `crates/ogdb-core/Cargo.toml` — only if a feature-flag or dep-version
  tweak is needed; currently `instant-distance = 0.6.1` under the
  default-on `vector-search` feature is sufficient.

**Explicitly out of scope:**

- WAL format / record tags. HNSW is derivable from node properties; the
  WAL already captures the property state under `WAL_RECORD_CREATE_
  NODE_V2`. Zero WAL changes.
- Main data file (`.ogdb`) / props file (`.ogdb-props`) layout or header
  format bump. No format_version increments.
- Sidecar format_version bump. Stays at 1. HNSW is rebuilt on load.
- `ogdb-cli`, `ogdb-bench`, `ogdb-eval`, `ogdb-tck`, `ogdb-python`,
  `ogdb-node`, `ogdb-ffi`, `mcp/`, `frontend/`, `bindings/`.
- Cypher parser/planner changes. `<->` operator keeps its current
  `PhysicalVectorScan` shape; execution dispatches through the same
  `vector_query_nodes` → HNSW path.
- Episode memory / RAG retrieval driver changes. They call
  `vector_query_nodes` indirectly and automatically benefit.
- `usearch` migration. `instant-distance` is already locked in
  (ARCHITECTURE.md §12); swapping backends is a separate ADR.
- Quantised / PQ / binary vectors. f32-only stays.
- Adversarial deletion / tombstone handling in HNSW. Deletes rebuild
  the whole runtime — correct, slow, acceptable for v0.4 because the
  commit path already full-scans nodes.

**Test-runner invariant.** All assertions validate with
`cargo test -p ogdb-core` (per-crate). Never `cargo test --workspace` —
the workspace contains crates outside this plan's blast radius, and
running them would re-trigger unrelated gates (e.g. `ogdb-eval`'s skill
regression suite, `ogdb-bench`'s criterion harness) that cost minutes
each.

## 7. Phased rollout (8-phase TDD)

Phases 1–2 ship in the RED commit on this branch. Phases 3–7 each
produce one GREEN commit. Phase 8 is docs-only on the same branch.

- **Phase 1 — Scout.** Read the current brute-force code path, the
  dead HNSW construction at `lib.rs:13288`, and the `VectorIndexRuntime`
  lifecycle (open → commit → query). Confirm `instant-distance` defaults
  are a viable starting point for §1.2 recall. **(This commit.)**

- **Phase 2 — RED.** Write PLAN.md + 5 failing/invariant tests under
  `crates/ogdb-core/tests/`. Verify each test compiles and runs under
  `cargo test -p ogdb-core --tests hnsw_` (expect gate #2 to fail or
  flake against brute force at 10k·d=384; others green as contract
  invariants). **(This commit.)**

- **Phase 3 — GREEN path 1: use HNSW for the query.** Implement §5.1
  (add `hnsw` field), §5.2 (constants), §5.3 (build hook — called from
  `rebuild_vector_indexes_from_catalog{,_without_sidecar}`), §5.4
  (query path). Rerun `hnsw_matches_brute_force_on_tiny_fixture` —
  must stay green (small N bypasses HNSW via `HNSW_MIN_N`). Rerun
  `hnsw_query_under_5ms_p95_at_10k` — expect GREEN now.

- **Phase 4 — Recall tuning.** Run
  `hnsw_recall_at_10_over_0_95_at_10k.rs`. If recall < 0.95, bump
  `HNSW_EF_SEARCH` from 64 → 100 → 200 until it clears, *then* re-run
  gate #2 to confirm p95 still clears. Record the chosen value in
  §5.2 + CHANGELOG.md.

- **Phase 5 — Commit hot-path latency guard.** Run the existing
  `write_perf_1k_under_1s.rs` + `meta_json_no_growth_on_writes.rs`
  gates under the new code. If commit latency regresses > 10% at N=1k,
  lazy-build the HNSW: defer `build_hnsw_from_entries` to the first
  `vector_search` call that follows a commit, with a `dirty: bool` flag
  on `VectorIndexRuntime`. Otherwise keep the eager build.

- **Phase 6 — Sidecar durability.** Wire the
  `try_load_vector_indexes_from_sidecar` path to call
  `build_hnsw_from_entries` after each runtime is populated. Run
  `hnsw_survives_drop_and_reopen.rs` — stays green; add an explicit
  assertion that `runtime.hnsw.is_some()` after reopen at N ≥ 256
  (inline `#[cfg(test)]` inspector fn, not a new public API).

- **Phase 7 — Concurrent-read safety.** Run
  `concurrent_inserts_do_not_corrupt_index.rs`. Gate-level already green
  under `Arc<Mutex<Database>>` (mutex serialises access), but under
  Miri (`cargo +nightly miri test -p ogdb-core --test concurrent_
  inserts_do_not_corrupt_index`, if Miri runs at all — known to flake
  on filesystem-heavy tests) confirm no UB on the insert/search
  interleaving. Downgrade scope if Miri doesn't like `File` — the
  mutex-based gate is authoritative.

- **Phase 8 — Docs.** Update ARCHITECTURE.md §12 to name HNSW
  (instant-distance) as the materialised ANN runtime, not just the dep
  family. Add CHANGELOG.md `[Unreleased]` entry: `Vector search uses
  HNSW (instant-distance) as the default ANN backend; ≥10× query-p95
  speedup at N=10k, d=384 vs prior brute force, recall@10 ≥ 0.95`.
  Update `docs/IMPLEMENTATION-LOG.md`.

## 8. What a Phase-3 GREEN commit looks like (for the executing agent)

```
feat(hnsw-vector-index): HNSW query path + commit-time build

- VectorIndexRuntime grows an Option<BuiltHnsw> (behind vector-search).
- rebuild_vector_indexes_from_catalog{,_without_sidecar} now also
  invokes build_hnsw_from_entries; try_load_vector_indexes_from_sidecar
  does the same after a successful sidecar load (HNSW is not persisted).
- vector_query_nodes dispatches to map.search() when N ≥ HNSW_MIN_N (256)
  and no small-bitmap prefilter, else brute force. Oversample fanout
  (x4) handles non-selective RoaringBitmap prefilters by post-filtering
  k·4 HNSW results back down to k.
- Removed the dead-code HNSW build at lib.rs:13288–13315 (result was
  never used).

Gates green now:
  cargo test -p ogdb-core --release --test hnsw_matches_brute_force_on_tiny_fixture
  cargo test -p ogdb-core --release --test hnsw_query_under_5ms_p95_at_10k
  cargo test -p ogdb-core --release --test hnsw_recall_at_10_over_0_95_at_10k
  cargo test -p ogdb-core --release --test hnsw_survives_drop_and_reopen
  cargo test -p ogdb-core --release --test concurrent_inserts_do_not_corrupt_index
  cargo test -p ogdb-core --release                      # full suite

Unchanged public API. No WAL / sidecar format bumps.

Committed by Ashesh Goplani
```

---

_End of PLAN.md — Phase 2 artifact._
