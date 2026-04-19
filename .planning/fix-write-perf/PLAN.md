# PLAN — fix/write-perf

Phase: 2 (PLAN) of 8-phase TDD workflow. Do not implement in this session.

Branch: `fix/write-perf`
Task id: `fix-write-perf`

---

## (0) Existing-work scan

Scanned on 2026-04-19.

- `gh pr list --search 'write OR perf OR throughput OR meta.json in:title' --state all --limit 10` → empty.
- `gh issue list --search 'write OR perf OR throughput in:title' --state all --limit 10` → empty.
- `git log --all --since='6 months ago' -S 'meta.json' --oneline` → 5 hits, all frontend/demo/RAG commits (no write-path/meta.json persistence work).
- `git log --all --since='6 months ago' -S 'write_throughput' --oneline` → empty.
- `.planning/phases/` → no existing `write-perf`, `fix-write-perf`, or equivalent directory.

No in-flight PR, issue, or plan addresses this bug. Proceeding.

---

## (1) Problem summary

Write throughput is ~32 elem/s (31 ms/op) for `create_node` — 3–5 orders of magnitude below baseline. A 1K-node insert takes ~170 s; a 10K insert is infeasible. Root-cause candidate from the eval FINAL REPORT: on every call to `WriteTransaction::create_node`, `apply_node_metadata` runs `sync_meta()`, which serializes the full `PersistedMetaStore` with `serde_json::to_string_pretty`, truncates `<db>-meta.json`, rewrites it, and calls `sync_data()`. Because `PersistedMetaStore::node_labels` is a `Vec<Vec<String>>` indexed by node id, meta.json grows O(N) in node count (~440 KB at 1K nodes), and each mid-transaction op pays a ~30 ms full-serialize + `fsync`. The bench file `crates/ogdb-bench/benches/operations.rs:61` literally comments "per-operation cost is dominated by WAL commit (~30 ms/op)" — the symptom is known, the cause (meta.json rewrite, not WAL) is not.

---

## (2) Exact reproducer (deterministic, <2 min on current main)

```bash
cd ~/opengraphdb
cargo test -p ogdb-core --release --test write_perf_1k_under_1s -- --nocapture --include-ignored
```

This test (see §4) begins a single write transaction, inserts 1,000 nodes, commits, and asserts wall-clock < 1 s. On current `fix/write-perf` HEAD (same write path as `main`), the assertion fires after ~170 s.

Secondary reproducer (criterion numbers):
```bash
cargo bench -p ogdb-bench --bench operations -- write_throughput/create_nodes
```
Reports ~32 elem/s (batch=100, sample_size=10, ≈3 s per sample). Matches the eval report.

---

## (3) DATA-FLOW TRACE — single `tx.create_node()` inside an open `WriteTransaction`

Every file:line below is in `crates/ogdb-core/src/lib.rs` unless noted. Monolithic 40,775-line crate; module boundaries are logical, not file-based.

| # | Hop | file:line | fsync? | Full-serialize of growing struct? |
|---|-----|-----------|--------|------------------------------------|
| 1 | CLI / bench / API call → `Database::begin_write` | `lib.rs:17031` | no | no — returns an MVCC `WriteTransaction` wrapping `&mut self` |
| 2 | `WriteTransaction::create_node` stages id, delegates | `lib.rs:8779` | no | no |
| 3 | `Database::create_node_with_in_txn` — wal append + apply + undo | `lib.rs:17399` | (see 4,5,6) | (see 6) |
| 4 | `append_wal_create_node` — 9-byte record, `sync_data` | `lib.rs:21462` (fsync at :21477) | **YES — one WAL fsync per op** | no (append-only record, 9 bytes) |
| 5 | `apply_create_node_with_id` — header bump + `sync_header` | `lib.rs:21399` → `sync_header` writes 4 KiB header page | **YES — one header fsync per op** | no (fixed-size header) |
| 6 | `apply_node_metadata` — labels registry, property store, `sync_meta` | `lib.rs:21148` (sync_meta at :21167) | **YES** (meta.json fsync) | **YES — full `PersistedMetaStore` pretty-printed and rewritten** |
| 6a | ↳ `replace_node_labels` → `rebuild_label_projections` | `lib.rs:21209` / :21247 | no | no (in-memory only) |
| 6b | ↳ `node_property_store.write_properties` → `ensure_row_count` → `sync_state` + `allocate_page` | `lib.rs:11258` / :11047 / :11189 | **YES — props-meta.json fsync + props.ogdb page fsync per new row** | **YES — `PersistedNodePropertyStoreState.row_pages` pretty-printed** (grows O(N)) |
| 6c | ↳ `sync_meta` serializes `MetaStore::to_persisted(&node_temporal_versions)` | `lib.rs:20826` (to_persisted at :8071) | **YES** (`sync_data` at :20838) | **YES** — `node_labels: Vec<Vec<String>>`, `edge_types`, `edge_properties`, `edge_valid_from/to`, `edge_transaction_time_millis`, `node_temporal_versions`, registries, index catalogs, users, audit log — all cloned and pretty-JSON-serialized every op |
| 7 | Record `VersionStamp` + `VersionedValue<BTreeSet<String>>` + `VersionedValue<PropertyMap>` in MVCC chains | `lib.rs:17419-17432` | no | no |
| 8 | Push `UndoLogEntry::CreateNode` | `lib.rs:17433` | no | no |
| 9 | Return `node_id` | — | — | — |

Then, **once per commit** (not per op):

| # | Hop | file:line | fsync? |
|---|-----|-----------|--------|
| C1 | `WriteTransaction::commit` → `has_write_conflicts` | `lib.rs:8930` / :17581 | no |
| C2 | `Database::commit_txn` — flips `committed` flags, rebuilds property/vector/fulltext indexes | `lib.rs:17643` | index rebuilds may fsync sidecars |
| C3 | Drop guard — returns `WriteCommitSummary` | — | no |

### Summary of per-op cost on current code

Per `create_node`, the write path does **≥3 fsyncs** on the hot path (WAL record, header page, meta.json) plus an additional props-meta.json fsync on every row-count growth (i.e., ~every new node with a row allocation), and **pretty-prints + rewrites the entire meta.json** which is O(node_count) in size. At N=1000, the meta.json scan/encode/write cycle is ~30 ms/op → 30 s for 1K / 3000 s projected for 10K. This is the bug.

---

## (4) Failing tests — committed to `fix/write-perf` in this commit

All four must compile and fail at run-time on current HEAD. They gate the fix.

### 4.1 `crates/ogdb-core/tests/write_perf_1k_under_1s.rs`

Insert 1,000 empty nodes in a single `begin_write → commit` and assert wall-clock < 1 s. Currently ~170 s. Release-only (debug build is legitimately slower; we don't want false green in debug). Uses `std::env::temp_dir` to match the existing `tests/temporal_versioning.rs` convention — no new dev-dependency required.

### 4.2 `crates/ogdb-core/tests/write_perf_single_op_under_2ms.rs`

100 iterations of `tx.create_node()` inside one transaction, record each op's latency; assert median (p50) < 2 ms. Currently ~31 ms. Guards against a fix that batches but still has an O(N)-per-op path. Release-only.

### 4.3 `crates/ogdb-core/tests/meta_json_no_growth_on_writes.rs`

Open db (which calls `sync_meta` once → meta.json mtime = `T1`). Sleep 50 ms (mtime resolution safety). Begin a write txn, call `create_node` 100 times **without committing**. Read meta.json mtime = `T2`. Assert `T2 == T1` — i.e., meta.json was not rewritten mid-transaction. Encodes the design invariant "meta.json persists on commit, not on every op". Currently `sync_meta` fires 100× inside the loop → assertion fails.

### 4.4 `crates/ogdb-bench/tests/write_throughput_regression.rs`

Throughput gate. Three 100-node batches in fresh databases; assert observed elements/sec > 10,000 for each batch. Currently ~32 elem/s → fails. Lives under `tests/` (not `benches/`) so it runs under `cargo test --workspace --release` without a new `[[bench]]` entry in `ogdb-bench/Cargo.toml` (the Cargo.toml currently has uncommitted changes for other reasons on this branch; keeping this commit surgical). Plan §6 marks Cargo.toml as out of scope for the PLAN commit. When the optimisation lands, the implementation session may (optionally) also add a criterion bench at `benches/write_throughput_regression.rs`.

---

## (5) Implementation sketch — shape only, do not build

Before picking, the implementation session **must** run the profiling plan (§7) and confirm or invalidate each suspect. Three candidate fixes, ranked by expected impact × risk:

### 5.a [HIGH impact / LOW-MED risk] Defer `sync_meta` and `NodePropertyStore::sync_state` to commit time

- Move every `self.sync_meta()?` inside the write-txn path out of the per-op apply/register functions (`apply_node_metadata`, `apply_edge_metadata`, `set_node_labels_in_txn`, `set_node_properties_in_txn`, `register_schema_*`, index def create/drop, undo handlers) and into a single call at the end of `Database::commit_txn`.
- Same treatment for `NodePropertyStore::sync_state` and `sync_free_list` — buffer the row_pages / free-list mutations in-memory during the txn, fsync once at commit.
- WAL already persists the op record per call (hop 4), so crash consistency is preserved: on recovery, `recover_from_wal` (:21504) replays uncommitted-since-last-checkpoint records. The meta.json + props-meta.json become pure checkpoint sidecars, which matches `ARCHITECTURE.md` (meta/props-meta are rebuildable).
- Undo-path in `rollback_txn` already bumps `sync_header` / truncates in-memory vectors; the deferred-meta rewrite at commit runs after rollback is a no-op (nothing committed), so no correctness regression.
- Expected: eliminates ~30 ms/op → drops per-op to WAL fsync + header fsync time (~50–200 µs on SSD). Gets `create_nodes` to ≫10K elem/s.
- Risk: crash-recovery invariant. Must verify `recover_from_wal` can rebuild `MetaStore` / `NodePropertyStore::row_pages` purely from WAL. If it cannot (e.g., label info not in WAL), extend the WAL record vocabulary (new `WAL_RECORD_CREATE_NODE_V2` carrying labels + properties length) before flipping the switch. Backwards-compatible via `format_version`.

### 5.b [MED impact / LOW risk] Batched WAL group commit + single header fsync per txn

- Today every `append_wal_create_node` / `append_wal_add_edge` opens the file, appends a record, calls `sync_data()`. Inside one `WriteTransaction`, batch all WAL bytes in memory, fsync once on commit.
- Similarly fold per-op `sync_header` into one at commit.
- Subsumed by 5.a in the happy path, but useful even without 5.a as an independent 2-3× speedup.

### 5.c [LOW-MED impact / MED risk] Shrink `PersistedMetaStore` by moving O(N) fields out

- `node_labels: Vec<Vec<String>>` and `edge_types/properties/valid_from/valid_to/transaction_time_millis` are the per-entity fields that make meta.json O(N). Move them into a separate append-only sidecar (or into the canonical node/edge stores) so meta.json stays small even if rewritten.
- Removes the constant factor — but without 5.a, still has N fsyncs. Only worth doing for durability semantics, not perf.

**Default recommendation for the implementation session:** lock in 5.a (deferred meta), verify via §7 flamegraph that 5.b yields marginal additional benefit, skip 5.c in this task (noted as future work).

---

## (6) Scope boundaries

**IN SCOPE (write-path modules in `crates/ogdb-core/src/lib.rs`):**
- `WriteTransaction::commit` (:8930) and `Database::commit_txn` (:17643)
- `Database::create_node_with_in_txn` (:17399), `add_edge_in_txn` (:17437), `set_node_labels_in_txn` (:17484), `set_node_properties_in_txn` (:17519)
- `apply_node_metadata` (:21148), `apply_edge_metadata` (:21272)
- `sync_meta` (:20826) and all sites that call it on the per-op path
- `NodePropertyStore::sync_state` (:11047), `sync_free_list` (:11068), `ensure_row_count` (:11258)
- WAL append functions `append_wal_create_node` (:21462), `append_wal_add_edge` (:21481) — only if §7 shows WAL fsync is a remaining hot path after 5.a
- `rollback_txn` (:17691) and all `undo_*` (sync_meta must still be correct on rollback)
- Test files: the four listed in §4, plus any new WAL-recovery tests that §5.a requires
- **Not** Cargo.toml of `ogdb-bench` (already dirty with unrelated changes)

**OUT OF SCOPE:**
- Query planner/executor/lexer/parser (Cypher layer) — no changes
- Vector index, full-text index, RDF import/export, temporal, algorithms, MCP, Bolt/HTTP server
- Frontend (`frontend/`)
- CLI argparse (`crates/ogdb-cli` or wherever)
- "While I'm here" refactors — no renames, no module splits of the 40K-line monolith, no clippy cleanup. Small-surface diff only.
- New dependencies (dev or prod). Tests use `std::env::temp_dir` + `std::time`.

---

## (7) Profiling plan — mandatory before coding in Phase 3

Before writing any optimisation, the implementation session runs one of:

**Option A — flamegraph (preferred if root perms available):**
```bash
sudo sysctl -w kernel.perf_event_paranoid=1
cargo install flamegraph  # once
cargo flamegraph --release -p ogdb-bench --bench operations -- \
    write_throughput/create_nodes --profile-time 10
```
Output: `flamegraph.svg`. Capture the top 5 frames by self-time.

**Option B — instrumented run (no root required; repo is already `tracing`-ready behind a feature flag):**
Build with `--features tracing`, wrap the 100-node create loop in a `tracing::info_span!`, and emit per-hop duration logs at the 5 hops marked "YES" in §3 (WAL append, sync_header, sync_meta, props-meta sync_state, props page allocate+fsync). Sum durations; report the three largest.

**Option C — `strace -c` fallback:**
```bash
cargo test -p ogdb-core --release --test write_perf_1k_under_1s --no-run 2>&1 | \
    awk '/Executable/{print $NF}' | xargs -I{} strace -c -e trace=write,fsync,fdatasync,openat {} --ignored 2>&1 | tail -20
```
Reports syscall counts/time. Expect `fdatasync` dominant.

**Mandatory output:** an entry appended to `docs/IMPLEMENTATION-LOG.md` under a new `## fix/write-perf` heading, naming the top 3 hot paths with % self-time and the profiler used. This gates entry into Phase 3 (RED→GREEN).

---

## (8) Decision log

| # | Choice | Why | Alternative rejected | Reversibility |
|---|--------|-----|----------------------|---------------|
| D1 | Write failing tests in `tests/` (not `benches/`) for the throughput gate | Auto-discovered by `cargo test --workspace`; no Cargo.toml edits (file is already dirty with unrelated work on this branch) | `benches/write_throughput_regression.rs` as criterion bench + `[[bench]]` entry | Easy — add criterion bench later |
| D2 | Release-mode assertion thresholds (1 s / 2 ms / 10 K eps) | Debug build is legitimately 3-5× slower; tests that fail in debug would block normal `cargo test` | Loosen thresholds to survive debug | Easy — flip via `cfg(debug_assertions)` |
| D3 | Test 3 uses mtime invariant, not byte-size growth | mtime cleanly encodes "meta.json persists on commit, not per-op"; survives future size-reduction refactors | Assert `size_delta_per_node < 50 bytes` | Easy — replace with byte-delta test |
| D4 | Keep bug fix inside `ogdb-core/src/lib.rs` monolith | CLAUDE.md notes "write-path modules are the only ones that may change"; splitting the 40K-line file is out of scope | Split `lib.rs` into modules as part of fix | Easy — file split is a pure refactor, do later |
| D5 | Default to fix 5.a (defer `sync_meta`), defer 5.c (shrink meta schema) | Expected 100-1000× speedup alone; 5.c is a schema-compat change and independent | Do 5.a + 5.c together | Medium — 5.c is a `format_version` bump |
| D6 | Require flamegraph/tracing evidence before locking in 5.a | Prior eval noted same "~30 ms WAL commit" in bench comment — symptom had been misattributed; profile before patching | Trust the hypothesis and skip profiling | Hard — fixing the wrong thing wastes a cycle |

---

## (9) Success criteria (binary)

The fix is accepted iff **all** pass:

- [ ] `cargo test -p ogdb-core --release --test write_perf_1k_under_1s` — green (currently: 170 s, red)
- [ ] `cargo test -p ogdb-core --release --test write_perf_single_op_under_2ms` — green (currently: ~31 ms p50, red)
- [ ] `cargo test -p ogdb-core --release --test meta_json_no_growth_on_writes` — green (currently: meta.json rewritten 100× mid-txn, red)
- [ ] `cargo test -p ogdb-bench --release --test write_throughput_regression` — green (currently: ~32 elem/s, red)
- [ ] `cargo test --workspace --release --no-fail-fast` — green (full regression; no other test degrades)
- [ ] Full TCK suite passes (`cargo test -p ogdb-tck` if wired, else explicit `cargo test -p ogdb-core --release --features tracing -- --ignored` coverage of crash/recovery + MVCC tests)
- [ ] `cargo bench -p ogdb-bench --bench operations -- write_throughput/create_nodes` reports > 10,000 elem/s
- [ ] A 1K-node ingest via CLI (`ogdb import` or equivalent) completes in < 1 s wall-clock
- [ ] `docs/IMPLEMENTATION-LOG.md` has a `## fix/write-perf` entry with flamegraph/tracing evidence for the fix

---

## Handoff

PLAN + 4 RED tests committed as one commit titled:
`plan(write-perf): PLAN.md + RED tests for 30ms/op write bug`

Phase 3 (GREEN) owner starts with §7 profiling, then §5.a. Do not skip §7.
