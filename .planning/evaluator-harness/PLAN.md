# Evaluator Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a closed-loop evaluator that scores OpenGraphDB on three dimensions (graph-DB benchmarks, scaling, UI/UX), diffs each run against a frozen baseline, emits regression events with magnitudes, and feeds results back to the conductor so regressions auto-spawn a plan session.

**Architecture:** A new crate `ogdb-eval` owns the harness: a typed `EvaluationRun` record, pluggable suite drivers (LDBC-SNB, LDBC-Graphalytics, BEIR, scaling, UI/UX), a deterministic diff engine with per-metric thresholds, a history layer (JSONL primary, dogfooded `.ogdb` mirror), an LDBC-submission exporter, and a conductor hook that writes a `REGRESSION` envelope to a well-known path. UI/UX metrics are fed in from JSON artifacts produced by Lighthouse CI and a Playwright perf spec. The core TDD surface is the diff engine — all other subsystems plug into it.

**Tech Stack:** Rust (new `ogdb-eval` crate), `serde`/`serde_json`, `thiserror`, `tempfile`, Criterion (reused), Playwright + `@lhci/cli` + `pixelmatch` for the UX layer, Python for LDBC dataset prep (reuses the scripts/download-*.sh pattern).

---

## Scope — Three Evaluation Dimensions

### 1. Graph-DB Benchmarks
- **LDBC SNB Interactive** — short reads (IS-1..7) + complex reads (IC-1..14). SPEC.md §"Throughput (LDBC Interactive) > 100K QPS / single node" is the target. Measure QPS + p50/p95/p99.
- **LDBC Graphalytics** — BFS, PageRank, CDLP, WCC, SSSP, LCC on reference graphs (cit-Patents, datagen-7_5-fb, wiki-Talk at scale factors SF0.1 / SF1). Measure wall-clock + throughput (edges/s).
- **BEIR retrieval** — NDCG@10, Recall@5/100, MRR, Precision@10 across BM25 / Vector / Hybrid RRF / Graph-RRF. Already implemented at `crates/ogdb-bench/tests/rag_beir.rs`. Harness *reads* its output instead of re-running.
- **Budget gates** — memory < 500 MB, disk < 1 GB at (1M nodes, 5M edges). Already gated; harness *reads* the gate result file.
- **Criterion microbenchmarks** — kept as fine-grained signal; harness ingests the `target/criterion/**/estimates.json` files.

### 2. Scaling Probe
Insert throughput + read latency (p50/p95/p99) + file size + RSS memory at N ∈ {10K, 100K, 1M, 10M} nodes with edge-density 5× node count.
10M tier is deferred to a follow-up phase if 1M works first (see §Scope Boundaries).

### 3. UI/UX Evaluation
- **Lighthouse CI** per route (`/`, `/playground`, `/app`) → performance, accessibility, best-practices, SEO, TTI. JSON artifact.
- **Playwright user flows** — landing → playground → type Cypher → run → results → export. Measures click-to-paint p95, error rate.
- **Visual regression** — `pixelmatch` diff against `frontend/e2e/screenshots/goldens/*.png`.

---

## Decision Log

| # | Decision | Why | Rejected Alternative | Reversibility |
|---|----------|-----|----------------------|---------------|
| D1 | New crate `ogdb-eval` | Different consumer from ogdb-bench (closed-loop harness vs raw microbench signal); keeps diff engine / history / LDBC exporter isolated | Extend `ogdb-bench` — rejected because bench is already crowded with RAG + rag-benchmark + operations + perf_report; would bloat its test surface | HIGH — `git mv` + fold module back later if eval stays thin |
| D2 | History primary = JSONL; secondary = `.ogdb` mirror | JSONL is always readable even if core breaks; `.ogdb` mirror dogfoods the product (meta-test!) | Primary = `.ogdb` — rejected: chicken-and-egg; if the engine regresses, history writes may fail just when you need them | HIGH — mirror is additive; can swap primary later |
| D3 | Diff engine = pure function over two `EvaluationRun` values | Trivially unit-testable without I/O; deterministic; RED tests run in <1ms | Coupled to history layer — rejected: slower tests, harder to isolate regressions in the diff logic itself | HIGH — pure core, no users of internal state |
| D4 | LDBC datasets fetched at test-time via `scripts/download-ldbc-sf0_1.sh` | Repo-size neutral; follows existing `scripts/download-movielens.sh` pattern | Committing SF0.1 graph to repo (~200MB) — rejected per repo hygiene; fixtures dir in repo holds only a tiny synthetic subset | HIGH — script can be rewritten to fetch from a mirror |
| D5 | UI/UX metrics ingested from JSON artifacts (`lhci-report.json`, `playwright-perf.json`) | Keeps Rust harness toolchain-free w.r.t. node/browser; each layer owns its tools | Rust-native browser driver — rejected as heavy and duplicative of existing Playwright setup | HIGH — schema is the contract; producers can change |
| D6 | Regression threshold: 5% for throughput, 10% for latency p99, 3% for NDCG, 20% for TTI | Matches LDBC audit guidance + user's 10% example. Configurable per metric. | Single global threshold — rejected: latency vs QPS need different sensitivity | HIGH — thresholds live in config, not code |
| D7 | Conductor hook = file drop (`/tmp/ogdb-eval-regression-<ts>.json`) + exit code 2 | Simplest integration; conductor polls its inbox; no network dependency | Direct RPC to conductor — rejected: couples release path to bridge availability | HIGH — file-drop is additive; can add RPC later |
| D8 | CLI entry point lives in `ogdb-cli` as `ogdb eval` subcommand | Consistent with `ogdb import`/`ogdb export` idiom; one binary for operators | Separate `ogdb-eval` binary — rejected: one more tool to install/document | HIGH — can split binary out trivially |
| D9 | RED-phase failing tests commit to `crates/ogdb-eval/tests/` (new crate), NOT `crates/ogdb-bench/tests/` | Keeps test topology matched to the eventual module topology; no migration churn in phase 3 | Tests in ogdb-bench now, move later — rejected: churns git history | HIGH — tests are self-contained |

---

## Data-Flow Trace — Per Dimension

Each row maps: INPUT → MEASUREMENT → SERIALIZATION → HISTORY → DIFF → PROFILE HOOK → IMPROVEMENT TRIGGER.

### Graph-DB Benchmarks

| Stage | Path | Module |
|---|---|---|
| INPUT | `ogdb eval --suite ldbc-snb --dataset sf0_1` (CLI) or `scripts/download-ldbc-sf0_1.sh` | `ogdb_cli::eval::run_suite` |
| MEASUREMENT | LDBC driver reads the `.ogdb` file, runs IS-1..7 + IC-1..14, times each | `ogdb_eval::drivers::ldbc_snb::{IsDriver, IcDriver}` |
| SERIALIZATION | Produces `EvaluationRun` with `metrics: {"qps": ..., "p50": ..., "p95": ..., "p99": ...}` | `ogdb_eval::schema::EvaluationRun` → JSON via `serde_json` |
| HISTORY | Appends line to `.planning/evaluator-harness/history/graph-db.jsonl`; mirrors into `history.ogdb` | `ogdb_eval::history::{JsonlHistory, OgdbMirror}` |
| DIFF | Compares against pinned baseline at `.planning/evaluator-harness/baselines/ldbc-snb-sf0_1.json` | `ogdb_eval::diff::DiffEngine::diff(&baseline, &current)` |
| PROFILE HOOK | On regression, re-runs with `tracing-subscriber` env flag + writes flamegraph to `.planning/evaluator-harness/profiles/<run-id>/` | `ogdb_eval::profile::capture_on_regression` (wraps `tracing` already in core) |
| IMPROVEMENT TRIGGER | Writes `/tmp/ogdb-eval-regression-<ts>.json` + exit code 2; conductor watcher spawns a `gsd:plan-phase` session | `ogdb_eval::trigger::write_regression_envelope` |

### Graphalytics

| Stage | Path | Module |
|---|---|---|
| INPUT | `ogdb eval --suite graphalytics --algo pagerank --dataset cit-Patents` | `ogdb_cli::eval::run_suite` |
| MEASUREMENT | Runs BFS/PageRank/CDLP/WCC/SSSP/LCC via `ogdb_core` algorithms crate (if present) or via Cypher MATCH | `ogdb_eval::drivers::graphalytics` |
| SERIALIZATION | `EvaluationRun{suite:"graphalytics", subsuite:"pagerank", metrics:{"wall_clock_ms":..., "edges_per_sec":...}}` | same |
| HISTORY → DIFF → PROFILE → TRIGGER | Same pipeline as above | — |

### BEIR

| Stage | Path | Module |
|---|---|---|
| INPUT | Existing `cargo test -p ogdb-bench --release --test rag_beir -- --nocapture` produces stdout; harness wraps it to capture JSON | `ogdb_eval::drivers::beir::ingest_from_stdout` |
| MEASUREMENT | Already done by `rag_beir.rs` | reused as-is |
| SERIALIZATION | Ingester parses stdout → `EvaluationRun{suite:"beir", metrics:{"ndcg_10":..., "recall_5":..., "mrr":...}}` | `ogdb_eval::drivers::beir` |
| HISTORY → DIFF → PROFILE → TRIGGER | Same | — |

### Budget Gates + Criterion

| Stage | Path | Module |
|---|---|---|
| INPUT | `cargo bench -p ogdb-bench` produces `target/criterion/**/estimates.json` | file watcher |
| MEASUREMENT | Existing Criterion output (mean, p95) + `perf_report.rs` | reused |
| SERIALIZATION | Harness parses Criterion JSON → `EvaluationRun{suite:"criterion", metrics: flattened}`; budget-gate test produces explicit `{"rss_mb":..., "disk_mb":...}` | `ogdb_eval::drivers::criterion_ingest`, `ogdb_eval::drivers::budget` |
| HISTORY → DIFF → PROFILE → TRIGGER | Same | — |

### Scaling Probe

| Stage | Path | Module |
|---|---|---|
| INPUT | `ogdb eval --suite scaling --tier 10k,100k,1m` (10m deferred) | `ogdb_cli::eval::run_suite` |
| MEASUREMENT | Synthesizes N nodes + 5N edges, runs insert loop + 1000 read queries, captures RSS via `/proc/self/status` and `std::fs::metadata` for file size | `ogdb_eval::drivers::scaling` |
| SERIALIZATION | `EvaluationRun{suite:"scaling", subsuite:"<tier>", metrics:{"insert_qps":..., "read_p99_us":..., "file_bytes":..., "rss_mb":...}}` | same |
| HISTORY → DIFF → PROFILE → TRIGGER | Same; profile hook captures an `.ogdb.profile` trace on regression | — |

### UI/UX

| Stage | Path | Module |
|---|---|---|
| INPUT | `npm --prefix frontend run eval:ui` runs `lhci autorun` + `playwright test e2e/perf.spec.ts` | frontend/package.json script |
| MEASUREMENT | Lighthouse emits `frontend/.lighthouseci/lhr-*.json`; Playwright perf spec emits `frontend/e2e/.perf/perf.json`; pixelmatch emits `frontend/e2e/.visual/diff.json` | frontend tooling |
| SERIALIZATION | Rust ingester reads all three → `EvaluationRun{suite:"ui-ux", subsuite:"<route>", metrics:{"lcp_ms":..., "tti_ms":..., "a11y":..., "click_to_paint_p95":..., "visual_diff_pct":...}}` | `ogdb_eval::drivers::uiux` |
| HISTORY → DIFF → PROFILE → TRIGGER | Same; profile hook re-runs Playwright with tracing + saves `frontend/e2e/.perf/trace.zip` | — |

---

## JSON Output Schema

```json
{
  "schema_version": "1.0",
  "run_id": "2026-04-19T14-32-01Z_a1b2c3",
  "suite": "ldbc-snb-interactive",
  "subsuite": "ic-3",
  "dataset": "sf0_1",
  "timestamp_utc": "2026-04-19T14:32:01Z",
  "git_sha": "db67696...",
  "platform": { "os": "linux", "arch": "x86_64", "cpu_model": "...", "ram_gb": 32 },
  "binary": { "version": "0.2.0", "build_profile": "release" },
  "metrics": {
    "qps": { "value": 98750.4, "unit": "ops/sec", "higher_is_better": true },
    "p50_us": { "value": 820.0, "unit": "us", "higher_is_better": false },
    "p95_us": { "value": 3200.0, "unit": "us", "higher_is_better": false },
    "p99_us": { "value": 9100.0, "unit": "us", "higher_is_better": false }
  },
  "environment": { "dataset_sha256": "...", "query_mix_sha256": "..." },
  "notes": ""
}
```

---

## File Structure

**New:**
```
crates/ogdb-eval/
├── Cargo.toml
├── src/
│   ├── lib.rs               # re-exports
│   ├── schema.rs            # EvaluationRun, Metric, Platform
│   ├── diff.rs              # DiffEngine, RegressionEvent, Threshold
│   ├── history.rs           # JsonlHistory, OgdbMirror
│   ├── trigger.rs           # write_regression_envelope
│   ├── profile.rs           # capture_on_regression
│   ├── ldbc_submission.rs   # LdbcSubmission exporter
│   └── drivers/
│       ├── mod.rs
│       ├── ldbc_snb.rs
│       ├── graphalytics.rs
│       ├── beir.rs
│       ├── criterion_ingest.rs
│       ├── budget.rs
│       ├── scaling.rs
│       └── uiux.rs
├── tests/
│   ├── diff_engine.rs       # phase-2 failing tests (this plan)
│   ├── schema_roundtrip.rs  # phase-2 failing tests
│   ├── history_append.rs    # phase-2 failing tests
│   └── ldbc_submission.rs   # phase-2 failing tests
└── fixtures/
    ├── baseline_ldbc_snb_sf0_1.json    # frozen baseline (phase 3)
    ├── current_10pct_regression.json   # test fixture (phase 2)
    └── ldbc-mini/                      # tiny synthetic subset (phase 3)
        ├── person.csv
        └── knows.csv

.planning/evaluator-harness/
├── PLAN.md
├── baselines/               # pinned baselines per suite (phase 4+)
├── history/                 # JSONL history files (phase 4+)
└── profiles/                # flamegraphs on regression (phase 5+)

scripts/
└── download-ldbc-sf0_1.sh   # (phase 3)

frontend/
├── e2e/perf.spec.ts         # (phase 6)
├── lighthouserc.json        # (phase 6)
└── e2e/screenshots/goldens/ # (phase 6)

.claude/
└── release-tests.yaml       # (phase 8) — regression-tests hook
```

**Modified (phase 2 only):** root `Cargo.toml` to add `crates/ogdb-eval` to workspace members.

---

## Scope Boundaries

**In-scope for this plan:**
- New crate `ogdb-eval` with schema, diff engine, history, triggers, LDBC exporter.
- Driver stubs for all 7 suites; full implementation of `beir` ingester (reads existing output), `scaling` (smallest tier only), `budget` (reads existing gate output).
- `ogdb eval` CLI subcommand.
- UI/UX evaluation wiring (Lighthouse CI + Playwright perf spec + visual regression).
- Baseline files for the three dimensions at the smallest working tier.
- `.claude/release-tests.yaml` entry for eval regression tests.

**MUST NOT change:**
- `crates/ogdb-core/` — storage, WAL, MVCC. Not touching it under the eval scope. If a driver hits an API gap, the gap gets recorded as a separate phase in `.planning/phases/` — this plan does not modify core.
- Existing benchmark tests in `crates/ogdb-bench/` — the harness **reads** their output, does not rewrite them.
- Cypher parser/planner — drivers compose from the public `ogdb_core::Database` API.

**Deferred (follow-up phases, not this plan):**
- 10M-node scaling tier. Gated behind 1M succeeding on the target hardware.
- LDBC Graphalytics full algorithm suite — phase-2 ships BFS + PageRank; CDLP/WCC/SSSP/LCC deferred.
- Cross-vendor auto-submission to LDBC-council — the exporter emits the format; actual submission is manual.
- Real flamegraph integration — phase-2 ships `tracing`-based sampling; `pprof`/`inferno` integration later.
- Web dashboard for history — JSONL is the source of truth; dashboard is a follow-up.

---

## Cross-Vendor Comparison Layer

**Goal:** emit results in a format compatible with LDBC submission rules so we can later publish numbers vs Neo4j / Memgraph / Nebula.

**Format:** LDBC SNB Interactive uses an "audit report" JSON schema with:
- `sut_name`, `sut_version`, `sut_vendor`
- `scale_factor`, `run_date`, `duration_hours`
- Per-query statistics: `q_id`, `count`, `mean_latency`, `percentiles`
- `throughput_qps` headline
- `hardware` section (CPU, RAM, storage, OS)
- `certification_status` (self-reported vs audited)

**Module:** `ogdb_eval::ldbc_submission::LdbcSubmission::from_run(&EvaluationRun) -> serde_json::Value`.

**Test:** `ldbc_submission.rs` — given a synthetic `EvaluationRun`, the exported JSON must validate against the LDBC audit schema skeleton (keys present, types correct, percentiles strictly ordered). Full LDBC schema URL: https://ldbcouncil.org/benchmarks/snb-interactive/ (do not fetch at test time; the schema skeleton is a local copy).

**Vendor baselines:** Phase 4+ will add `.planning/evaluator-harness/baselines/vendors/{neo4j,memgraph,nebula}.json` so the diff engine can emit a "vs-vendor delta" side-report.

---

## Phase 2 (This Session): Failing Tests

> Only four test files below get committed in phase 2. All other tasks are for phase 3+ and serve as the execution roadmap.

### Task 2.1: Crate Skeleton

**Files:**
- Create: `crates/ogdb-eval/Cargo.toml`
- Create: `crates/ogdb-eval/src/lib.rs`
- Modify: `Cargo.toml` (root workspace members)

- [x] **Step 1: Write `crates/ogdb-eval/Cargo.toml`** (see phase-2 commit)

```toml
[package]
name = "ogdb-eval"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"

[dev-dependencies]
tempfile = "3"
```

- [x] **Step 2: Write `crates/ogdb-eval/src/lib.rs`**

Public API as `unimplemented!()` stubs. Tests compile, fail at runtime.

- [x] **Step 3: Add `crates/ogdb-eval` to root workspace `members`.**
- [x] **Step 4: `cargo check -p ogdb-eval`** — should succeed (crate builds; only test runs fail).

### Task 2.2: Diff-Engine Failing Tests

**Files:**
- Create: `crates/ogdb-eval/tests/diff_engine.rs`

- [x] **Step 1: Write failing tests** for the four canonical diff cases: 10% QPS regression emits `RegressionEvent`, improvement does not, per-metric threshold respected, latency p99 increase flagged.
- [x] **Step 2: Run `cargo test -p ogdb-eval --test diff_engine`** — Expected: 4 failures with `unimplemented!()` panics.

### Task 2.3: Schema Roundtrip Failing Tests

**Files:**
- Create: `crates/ogdb-eval/tests/schema_roundtrip.rs`

- [x] **Step 1: Write tests** — `EvaluationRun` round-trips through `serde_json` preserving all metric fields, rejects malformed JSON, version-field presence is enforced.
- [x] **Step 2: Run** — Expected: 3 failures.

### Task 2.4: History Append Failing Tests

**Files:**
- Create: `crates/ogdb-eval/tests/history_append.rs`

- [x] **Step 1: Write tests** — appending a run to a JSONL file yields valid newline-delimited JSON; appending twice yields two lines; reading back produces the same `EvaluationRun` values.
- [x] **Step 2: Run** — Expected: 3 failures.

### Task 2.5: LDBC Submission Format Failing Tests

**Files:**
- Create: `crates/ogdb-eval/tests/ldbc_submission.rs`

- [x] **Step 1: Write tests** — `LdbcSubmission::from_run` emits required fields (sut_name, scale_factor, hardware, throughput_qps); percentiles strictly ordered; vendor-name field defaults to `"OpenGraphDB"`.
- [x] **Step 2: Run** — Expected: 3 failures.

### Task 2.6: Commit

- [x] **Step 1:**
```bash
git add crates/ogdb-eval/Cargo.toml crates/ogdb-eval/src/lib.rs \
        crates/ogdb-eval/tests/ Cargo.toml \
        .planning/evaluator-harness/PLAN.md
git commit -m "$(cat <<'EOF'
plan(evaluator-harness): add PLAN.md + RED-phase failing tests

Phase 2 of the evaluator-harness task: PLAN.md covers three evaluation
dimensions (graph-DB benchmarks, scaling probe, UI/UX), data-flow trace
per dimension, JSON schema, decision log, scope boundaries, and
cross-vendor comparison layer.

Failing tests live in new crate crates/ogdb-eval and cover:
- diff_engine: 10% QPS regression detection, per-metric thresholds,
  latency p99 flagging, no-false-positive on improvement
- schema_roundtrip: serde round-trip, version enforcement
- history_append: JSONL append semantics
- ldbc_submission: LDBC audit-report field presence, percentile ordering

All tests panic with unimplemented!() — phase 3 replaces stubs with
real impls. Crate skeleton is additive; does not touch ogdb-core.

Committed by Ashesh Goplani
EOF
)"
```

---

## Phase 3: Schema + Diff Engine (GREEN)

### Task 3.1: Implement `EvaluationRun` schema
**Files:** `crates/ogdb-eval/src/schema.rs`
- [ ] Step 1: Replace stub with `EvaluationRun`, `Metric`, `Platform`, `Binary` structs (serde derive).
- [ ] Step 2: Add `schema_version: &'static str = "1.0"` constant.
- [ ] Step 3: Run `cargo test -p ogdb-eval --test schema_roundtrip` → all pass.
- [ ] Step 4: Commit.

### Task 3.2: Implement `DiffEngine`
**Files:** `crates/ogdb-eval/src/diff.rs`
- [ ] Step 1: Implement `Threshold { throughput_pct: 0.05, latency_pct: 0.10, quality_pct: 0.03, tti_pct: 0.20 }`.
- [ ] Step 2: Implement `DiffEngine::diff(&baseline, &current) -> Vec<RegressionEvent>` — pure function, no I/O.
- [ ] Step 3: `RegressionEvent::Regression { metric: String, magnitude: f64, severity: Severity, baseline_value: f64, current_value: f64 }`.
- [ ] Step 4: Honour `higher_is_better` — QPS dropping 10% is a regression; p99 rising 10% is a regression.
- [ ] Step 5: Run `cargo test -p ogdb-eval --test diff_engine` → all pass.
- [ ] Step 6: Commit.

### Task 3.3: Implement `JsonlHistory`
**Files:** `crates/ogdb-eval/src/history.rs`
- [ ] Step 1: `JsonlHistory::append(&EvaluationRun, &Path) -> io::Result<()>` — atomic via `fs::OpenOptions::append`.
- [ ] Step 2: `JsonlHistory::read_all(&Path) -> io::Result<Vec<EvaluationRun>>`.
- [ ] Step 3: Run `cargo test -p ogdb-eval --test history_append` → all pass.
- [ ] Step 4: Commit.

### Task 3.4: Implement `LdbcSubmission`
**Files:** `crates/ogdb-eval/src/ldbc_submission.rs`
- [ ] Step 1: Implement `from_run(&EvaluationRun) -> serde_json::Value` with required keys.
- [ ] Step 2: Enforce percentile ordering invariant.
- [ ] Step 3: Run `cargo test -p ogdb-eval --test ldbc_submission` → all pass.
- [ ] Step 4: Commit.

### Task 3.5: Dogfood `OgdbMirror`
**Files:** `crates/ogdb-eval/src/history.rs` (extend)
- [ ] Step 1: `OgdbMirror::new(path) -> Result<Self>` opens/creates `.ogdb` file using `ogdb_core::Database`.
- [ ] Step 2: Each `EvaluationRun` becomes a node labelled `:EvalRun`; metrics become properties.
- [ ] Step 3: Write an integration test that appends 100 runs, reopens, and counts.
- [ ] Step 4: Commit.

---

## Phase 4: Baselines + CLI

### Task 4.1: Freeze initial baselines
**Files:** `.planning/evaluator-harness/baselines/{criterion,budget,beir}.json`
- [ ] Step 1: Run each existing bench, capture output, pipe through a small converter into the `EvaluationRun` schema.
- [ ] Step 2: Commit baselines with a note recording git SHA + hardware.

### Task 4.2: `ogdb eval` CLI subcommand
**Files:** `crates/ogdb-cli/src/commands/eval.rs`, `crates/ogdb-cli/src/main.rs`
- [ ] Step 1: Add `clap` subcommand `eval` with `--suite <name>` `--baseline <path>` `--out <path>` `--fail-on-regression`.
- [ ] Step 2: Dispatch to `ogdb_eval::drivers::*::run`.
- [ ] Step 3: Exit code: `0` = pass, `2` = regression, `1` = error.
- [ ] Step 4: Integration test: `ogdb eval --suite beir-ingest --baseline fixtures/baseline_beir.json` exits 0.
- [ ] Step 5: Commit.

---

## Phase 5: Drivers

### Task 5.1: `beir` driver (ingest only — delegates to existing rag_beir.rs)
**Files:** `crates/ogdb-eval/src/drivers/beir.rs`
- [ ] Step 1: `ingest_from_stdout(s: &str) -> Vec<EvaluationRun>` — parses the `rag_beir.rs` table output.
- [ ] Step 2: Integration test against a captured fixture.
- [ ] Step 3: Commit.

### Task 5.2: `budget` driver
**Files:** `crates/ogdb-eval/src/drivers/budget.rs`
- [ ] Step 1: Re-runs budget gate (1M nodes, 5M edges), captures RSS + file size.
- [ ] Step 2: Produces `EvaluationRun` with `rss_mb` and `disk_mb` metrics.
- [ ] Step 3: Commit.

### Task 5.3: `scaling` driver (10K tier first)
**Files:** `crates/ogdb-eval/src/drivers/scaling.rs`
- [ ] Step 1: Parametrise over `tier ∈ {10k, 100k, 1m}`; 10m is feature-flagged.
- [ ] Step 2: For each tier: synthesize graph, time inserts, sample 1K reads, capture p50/p95/p99 via `hdrhistogram`.
- [ ] Step 3: Emit one `EvaluationRun` per tier.
- [ ] Step 4: Test against 10K tier only (runtime <5s).
- [ ] Step 5: Commit.

### Task 5.4: `criterion_ingest` driver
**Files:** `crates/ogdb-eval/src/drivers/criterion_ingest.rs`
- [ ] Step 1: Walks `target/criterion/**/estimates.json`, flattens, emits one `EvaluationRun` per benchmark.
- [ ] Step 2: Commit.

### Task 5.5: `ldbc_snb` driver (IS-1 only as smoke test)
**Files:** `crates/ogdb-eval/src/drivers/ldbc_snb.rs`, `scripts/download-ldbc-sf0_1.sh`, `crates/ogdb-eval/fixtures/ldbc-mini/`
- [ ] Step 1: Write `scripts/download-ldbc-sf0_1.sh` (wget from ldbcouncil.org CDN; checksum-verified).
- [ ] Step 2: Commit a tiny synthetic SF-mini dataset (100 persons, 500 knows) to `fixtures/ldbc-mini/`.
- [ ] Step 3: Implement IS-1 (profile of person) — runs 1000 queries, captures QPS + latency percentiles.
- [ ] Step 4: Test runs on `fixtures/ldbc-mini/` in <5s.
- [ ] Step 5: Commit.

### Task 5.6: `graphalytics` driver (BFS + PageRank only)
**Files:** `crates/ogdb-eval/src/drivers/graphalytics.rs`
- [ ] Step 1: BFS over `fixtures/ldbc-mini/`.
- [ ] Step 2: PageRank with 30 iterations.
- [ ] Step 3: Test asserts result node ordering matches a known-good oracle.
- [ ] Step 4: Commit.

---

## Phase 6: UI/UX Evaluation

### Task 6.1: Lighthouse CI wiring
**Files:** `frontend/lighthouserc.json`, `frontend/package.json` (script)
- [ ] Step 1: `npm install -D @lhci/cli`.
- [ ] Step 2: `lighthouserc.json` with three routes (`/`, `/playground`, `/app`) and assertion thresholds.
- [ ] Step 3: Script `"eval:lighthouse": "lhci autorun"`.
- [ ] Step 4: Verify JSON artifact lands at `frontend/.lighthouseci/lhr-*.json`.
- [ ] Step 5: Commit.

### Task 6.2: Playwright perf spec
**Files:** `frontend/e2e/perf.spec.ts`
- [ ] Step 1: Instrument the golden flow (landing → playground → run Cypher → export).
- [ ] Step 2: Capture `performance.now()` between steps; emit JSON to `frontend/e2e/.perf/perf.json`.
- [ ] Step 3: Assert click-to-paint p95 < 500ms.
- [ ] Step 4: Commit.

### Task 6.3: Visual regression
**Files:** `frontend/e2e/visual.spec.ts`, `frontend/e2e/screenshots/goldens/`
- [ ] Step 1: Install `pixelmatch` + `pngjs`.
- [ ] Step 2: Capture + diff each route; write `frontend/e2e/.visual/diff.json`.
- [ ] Step 3: Add 3 golden PNGs (`/`, `/playground`, `/app`).
- [ ] Step 4: Commit.

### Task 6.4: `uiux` Rust ingester
**Files:** `crates/ogdb-eval/src/drivers/uiux.rs`
- [ ] Step 1: Reads all three JSON artifacts; emits one `EvaluationRun` per route.
- [ ] Step 2: Integration test reads checked-in sample artifacts.
- [ ] Step 3: Commit.

---

## Phase 7: Profile Hook + Conductor Trigger

### Task 7.1: `capture_on_regression`
**Files:** `crates/ogdb-eval/src/profile.rs`
- [ ] Step 1: On regression detected by diff engine, re-run the regressing suite with `RUST_LOG=ogdb_core=trace`.
- [ ] Step 2: Save trace to `.planning/evaluator-harness/profiles/<run-id>/trace.log`.
- [ ] Step 3: Commit.

### Task 7.2: `write_regression_envelope`
**Files:** `crates/ogdb-eval/src/trigger.rs`
- [ ] Step 1: On regression, write `/tmp/ogdb-eval-regression-<ts>.json` with `{ "run_id", "suite", "events", "profile_path" }`.
- [ ] Step 2: Exit code 2.
- [ ] Step 3: Commit.

### Task 7.3: Conductor watcher contract
**Files:** `.planning/evaluator-harness/CONDUCTOR-CONTRACT.md`
- [ ] Step 1: Document the file-drop schema so the conductor's watcher can spawn `gsd:plan-phase` on regression.
- [ ] Step 2: Commit.

---

## Phase 8: Release-Test Integration

### Task 8.1: `.claude/release-tests.yaml`
**Files:** `.claude/release-tests.yaml` (create)
- [ ] Step 1: Create the file if missing with a `regression_tests:` key.
- [ ] Step 2: Append entries:
```yaml
regression_tests:
  - name: "evaluator-harness diff engine"
    cmd: "cargo test -p ogdb-eval"
  - name: "evaluator-harness scaling 10K tier"
    cmd: "cargo test -p ogdb-eval --test drivers_scaling -- --ignored scaling_10k"
  - name: "evaluator-harness UI perf"
    cmd: "npm --prefix frontend run eval:ui"
```
- [ ] Step 3: Commit.

### Task 8.2: CI wiring (informational, not this plan)
- Deferred: add a GitHub Action `.github/workflows/eval.yml` that runs `cargo test -p ogdb-eval` + `npm --prefix frontend run eval:ui` on every PR. Will live in a follow-up infra phase.

---

## Self-Review

- **Spec coverage:** All three dimensions covered (graph-DB benchmarks, scaling, UI/UX). Data-flow trace provided per dimension per user's request. Failing tests cover the user's explicit example (`given a frozen baseline JSON and a current JSON with a 10% regression in LDBC-SNB-QPS, the diff engine must emit a REGRESSION event naming the metric and magnitude`). Cross-vendor format via `LdbcSubmission`. CLI + history storage specified. Scope boundaries explicit. 10M-node tier deferred as the user permitted.
- **Placeholder scan:** All "TBD"/"TODO"/"fill in" absent. Every phase-2 file has exact contents committed or specified.
- **Type consistency:** `EvaluationRun` is the single record type referenced in all drivers, history, diff, submission. `RegressionEvent`, `Threshold`, `Severity` defined once in `diff.rs`. No rename drift.

---

## Execution Handoff

Phase 2 delivers only PLAN.md + failing tests. Phases 3–8 execute via superpowers:subagent-driven-development with fresh subagent per task, review between tasks.
