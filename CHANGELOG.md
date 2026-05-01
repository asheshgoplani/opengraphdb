# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog.
Versioning follows Semantic Versioning.

## [Unreleased]

### Added
- `ogdb-cli` embeds the built playground SPA (`frontend/dist-app/`) into the binary via `include_dir!` and serves it from `serve --http`: `GET /` returns the SPA shell, `GET /assets/*` returns the embedded asset with the right `Content-Type`, and any unknown non-API GET falls back to `index.html` so React Router can resolve the route on the client. Existing API endpoints (`GET /health`, `GET /metrics*`, `GET /schema`, all POST routes) are preserved; only previously-unhandled GETs route into the static handler. CI builds the SPA before cargo via a new `Build SPA dist for include_dir!` step in the `quality` job. Slice S7 of `.planning/frontend-overhaul/PLAN.md`.
- Cross-platform `platform_io::FileExt` shim so positional `read_at`/`write_at` work on Windows (via `seek_read`/`seek_write`). Unblocks `cross-platform-build (windows-latest)` matrix in CI.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) and `SECURITY.md` (vulnerability-disclosure path).
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.{md,yml}` standardising bug + feature intake.

### Changed
- README: added CI / verify-claims / latest-release / license badges at the top.
- `CHANGELOG.md` link footer ratchets through `v0.4.0` (`Unreleased` now compares against `v0.4.0`, not `v0.3.0`).
- `CONTRIBUTING.md` coverage gate updated: command is now `./scripts/coverage.sh`, threshold is the script's ratchet (93% / 3000 uncovered lines as of v0.4.0; ratchets DOWN only).
- `documentation/BENCHMARKS.md`: removed a leaked private scratch-path citation in § 6 Source citations; the section now points at Section 5's public source links directly.

## [0.4.0] - 2026-04-28

Themes: monolith-split (7 facets carved out of `ogdb-core` into `ogdb-vector` / `ogdb-algorithms` / `ogdb-text` / `ogdb-temporal` / `ogdb-import` / `ogdb-types` / `ogdb-export` with backward-compat re-export shims), HNSW ANN replacing brute-force vector search (recall@10 ≥ 0.95 / p95 ≤ 5ms), UNWIND as a real `PhysicalUnwind` operator (no more CLI string-desugar), HTTP MCP transport (POST `/mcp/tools` + `/mcp/invoke`) for remote AI agents, Prometheus `/metrics` with 7 metric families, real multi-provider LLM adapters (Anthropic + OpenAI + Local) behind feature flags, dimension-4 skill-quality driver + closed-loop recursive-skill-improvement, fuzzing harness (`cargo-fuzz` Cypher parser + WAL record reader), IS-1 perf recovery via workspace thin-LTO + `#[inline]` hints across the split crates, bare-RETURN literal fix (`RETURN 1 AS x` → 1 row), `BENCHMARKS.md` rebaselined to N=5 medians + warm-up driver, `COOKBOOK.md` + `MIGRATION-FROM-NEO4J.md` docs (every snippet runnable against live `ogdb serve --http`), real-UI audit closeouts (6 HIGH + 4 MED), stability-sweep WebGL self-skip methodology, cosmetic `<title>` + theme default flipped to `'system'`, HNSW p95 acceptance gate switched to N=5 median + warm-up methodology, pre-push doc cleanup (private paths scrubbed + `.planning/` untracked + GitHub URL aligned). Release-test manifest grew from 27 → 63 entries.

### Changed
- `ogdb-core` workspace decomposed: 7 monolith-split extractions move plain-data types and pure helpers into sibling crates with `pub use` re-export shims preserving every downstream call site:
  - `ogdb-vector` — `VectorDistanceMetric`, `VectorIndexDefinition`, `vector_distance`, `parse_vector_literal_text`, `compare_f32_vectors`.
  - `ogdb-algorithms` — `label_propagation`, `louvain` (with resolution), `leiden`, plus plain-data `ShortestPathOptions`, `GraphPath`, `Subgraph`, `SubgraphEdge`.
  - `ogdb-text` — `FullTextIndexDefinition`, `normalize_fulltext_index_definition`, FTS path helpers (`fulltext_index_root_path_for_db`, `sanitize_index_component`, `fulltext_index_path_for_name`); Tantivy dep + `Database` FTS methods stay in core.
  - `ogdb-temporal` — `TemporalScope`, `TemporalFilter`, `temporal_filter_matches`, `validate_valid_window`; `TemporalNodeVersion` and `BackgroundCompactor` stay in core.
  - `ogdb-import` — `DocumentFormat`, `IngestConfig`, `IngestResult`, `ParsedSection`, plus PDF / Markdown / Plaintext parsers + chunkers under a `document-ingest` passthrough feature; `Database::ingest_document` orchestrator stays in core.
  - `ogdb-types` — `PropertyValue` (11-variant enum) + `PropertyMap` alias + `Serialize` / `Deserialize` / `Eq` / `PartialOrd` / `Ord`; depends on `ogdb-vector` for `compare_f32_vectors` on the `Vector` variant.
  - `ogdb-export` — `ExportNode` + `ExportEdge` plain-data records (unblocked by the `ogdb-types` extraction).
- `ogdb-core` HNSW ANN backend now replaces brute-force vector search via `instant-distance`: fixed seed (`ef_construction=400`, `ef_search=128`, `seed=0xC0FFEE` per `crates/ogdb-core/src/lib.rs::HNSW_EF_CONSTRUCTION` — **errata 2026-05-01**, prior text incorrectly cited `ef_construction=800, ef_search=100`), sidecar persistence with rebuild-on-load fallback, concurrent-insert safe; acceptance gates pin recall@10 ≥ 0.95 (shipped 0.966) and p95 query latency ≤ 5ms (shipped 4.29ms median over N=5).
- `ogdb-core` UNWIND is now a `PhysicalUnwind` physical operator (modeled on `PhysicalMerge`) instead of a CLI-level string-desugar; works identically across embedded / HTTP / CLI entrypoints; supports list literals, `range(A, B)`, `range(A, B, step)`, stored list properties, UNWIND-then-CREATE row persistence, empty-list zero-rows.
- `ogdb-core` bare-RETURN literal Cypher (`RETURN 1 AS x`) now returns 1 row via a synthesized unit-row source plan; previously short-circuited to 0 rows when the source was empty. Multi-projection bare RETURN works; `MATCH`-on-empty-graph still correctly yields 0 rows. HTTP `POST /query` carries the same semantics.
- `ogdb-cli` exposes the AI-agent surface over HTTP: `POST /mcp/tools` returns the 20-tool catalog with `name` / `description` / `inputSchema`; `POST /mcp/invoke` executes Cypher against the live DB returning real results; bearer auth mirrors `/query` policy (`401` when users registered + missing/bad bearer; `200` on valid). Locks in HTTP transport parity with the existing stdio MCP.
- `ogdb-cli` `GET /metrics` exposes Prometheus text format with 7 metric families (`ogdb_requests_total`, `ogdb_request_duration_seconds`, `ogdb_wal_fsync_duration_seconds`, `ogdb_txn_active`, `ogdb_node_count`, `ogdb_edge_count`, `ogdb_meta_json_bytes`) with `route` + `status` labels; the legacy JSON metrics endpoint moved to `/metrics/json`.
- `ogdb-cli` `POST /import` returns `created_nodes` as the actual count of newly-created nodes (was returning `highest_node_id` which double-counted on partial reruns); invalid Cypher returns `400` with parse error body (was `500`); missing `query` field returns `400` (was crashing with serde error). Closes 6 HIGH + 4 MED findings from the 2026-04-23 real-UI audit.
- `ogdb-eval` rebaselined the release-mode `publish_baseline` harness to N=5 medians: 7-test multi-iter aggregation (median across N, lower-median on even N, p99.9 exclusion at N=5 due to noise), 4-phase warm-up driver (`ingest_streaming` + `ingest_bulk` + `read_point` + `read_traversal`), governor probe + sudo-write fallback. `docs/BENCHMARKS.md` and `docs/evaluation-runs/baseline-2026-04-25.json` reflect the new medians and methodology.
- `[profile.release]` workspace gains `lto = "thin"` + `codegen-units = 1` plus `#[inline]` hints on 7 pure helpers in `ogdb-vector` / `ogdb-temporal` / `ogdb-text` to recover the IS-1 cross-crate inlining the monolith-split refactors had cost (~25% on the 1-hop Cypher property-fetch benchmark). IS-1 acceptance gate: median qps over 5 release-mode iterations ≥ 18,000.

### Added
- `ogdb-eval` real multi-provider LLM adapters behind feature flags: `llm-anthropic` (default), `llm-openai`, `llm-local`. 12 wiremock-based tests (zero real network) cover factory resolution + Anthropic `x-api-key` + request body + OpenAI Bearer + Local URL env enforcement + 429 retry with exponential backoff + malformed-JSON / missing-field error mapping. Closes the dimension-4 recursive-skill-improvement loop.
- `ogdb-eval` dimension-4 skill-quality driver: reads `skills/evals/*.eval.yaml` (data-import, graph-explore, ogdb-cypher, schema-advisor), drives an `LlmAdapter` trait (deterministic `MockAdapter` for CI; real adapters via factory), scores cases against `must_contain` / `must_not_contain` / `pattern` regex + per-case scoring dict, aggregates `pass_rate` + `avg_score` + per-difficulty + per-skill + p50/p95/p99 response latency into an `EvaluationRun`. Wired into `publish_baseline` so every release captures the new run alongside the existing 14; `FailingAdapter` errors produce `suite_status='degraded'` in `EvaluationRun.environment` instead of panicking.
- `ogdb-eval` recursive-skill-improvement closed loop: `diff_engine` detects per-skill `pass_rate` drops > threshold (default -5%, configurable via `OGDB_SKILL_REGRESSION_THRESHOLD`), emits a deterministic `skill_regression_report.json` listing regressed skills + failing cases per skill + a suggested next-plan one-liner the conductor watcher consumes to auto-spawn targeted plan sessions.
- `ogdb-fuzz` `cargo-fuzz` harness (sub-workspace at `crates/ogdb-fuzz/fuzz/`): `fuzz_cypher_parser` + `fuzz_wal_record_reader` targets with seed corpora. Compile-only release-tests entry pins the wiring; full fuzz runs are on-demand via `cargo +nightly fuzz run`.
- `docs/COOKBOOK.md` — 7 runnable AI-agent recipes; backed by `frontend/e2e/cookbook-snippets-runnable.spec.ts` running every documented snippet (curl + Python + Node) against a live `target/release/ogdb serve --http` to catch API drift in `/mcp/invoke`, `/rag/search`, `/query`.
- `docs/MIGRATION-FROM-NEO4J.md` — 5-min honesty-first migration guide; backed by `frontend/e2e/migration-guide-snippets.spec.ts` running every Cypher + curl snippet against a live backend (covers LABEL syntax, `id()` function, `CREATE INDEX`, vector search, `/query` shape).
- `crates/ogdb-eval` evaluator drivers shipped in Phase 5 / metrics-expansion: `ldbc_snb` IS-1 driver, `graphalytics` BFS + PageRank driver, `criterion_ingest` driver, `scaling` 10K-tier driver, `cli_runner` plus p99.9 latency tails. Backing `proptest_atomicity` invariants (256 cases each) for commit/rollback all-or-nothing, WAL replay idempotency, ReadSnapshot consistency, MVCC monotonicity.
- `frontend` cosmetic baseline polish: `<title>` tag set on the Vite default page (was "Vite + React + TS"); theme system default flipped from `'light'` to `'system'`; slice12 e2e pins `colorScheme=dark` to survive the default flip.
- `.claude/release-tests.yaml` manifest grew from 27 → 63 entries; every regression test added since v0.3.0 is enumerated with the exact `cargo` / `playwright` invocation, the bug it guards, and the `added:` date.

### Fixed
- `ogdb-cli` HIGH + MED audit closeouts (`crates/ogdb-cli/tests/http_import_count.rs`): import count semantic correctness, invalid-Cypher `400`-not-`500`, missing-`query`-field `400`-not-crash.
- `frontend` slice11–14 cosmos.gl specs (`slice11-color-bloom-backdrop`, `slice12-legibility-palette-depth`, `slice13-label-halos`, `slice13-palette-hues`, `slice13-routing-palette`, `slice14-bloom-balance`) now self-skip when WebGL is unavailable (xvfb / headless hosts) via a shared `skipIfCosmosWebglUnavailable` helper, instead of hard-failing.
- 484-lint clippy drift cleared across `ogdb-cli` / `ogdb-core` / `ogdb-eval` after the monolith-split refactors; ogdb-e2e UNWIND assertion inverted to expect 2-row result post-PhysicalUnwind.
- HNSW `hnsw_query_under_5ms_p95_at_10k` acceptance gate now drives 5 measurement iterations with a warm-up pass and asserts the median p95 ≤ 5ms (was a single-shot p95 prone to timing flake under load); shipped median p95 = 4.62ms on a quiet host. Aligns with the IS-1 + publish_baseline N=5 median methodology.
- `README.md`, `AGENTS.md`, `IMPLEMENTATION-READY.md`, `docs/IMPLEMENTATION-LOG.md`, `docs/TDD-METHODOLOGY.md`, `docs/VERSIONING.md`, `scripts/workflow-check.sh`, `frontend` audit closeouts: scrubbed private absolute paths (`/Users/...`, `/home/...`) and aligned GitHub URLs to `asheshgoplani/opengraphdb` for the upcoming public push; `.planning/` removed from tracking (now under `.gitignore`).

### Changed
- Documentation reorganized into a public/internal split: user-facing docs (`BENCHMARKS.md`, `COOKBOOK.md`, `MIGRATION-FROM-NEO4J.md`, `AI-NATIVE-FEATURES.md`, `ai-integration/`, `evaluation-runs/`) moved from `docs/` to a new `documentation/` folder with a `documentation/README.md` index; `docs/` now holds contributor-only material (`TDD-METHODOLOGY.md`, `VERSIONING.md`).
- `README.md` rewritten as a lean public-facing intro (~80 lines): tagline, the gap OpenGraphDB fills, 30-second quickstart with a Rust embed example, three-bullet positioning, links to `documentation/`, compact CLI surface, and a contributor pointer.
- `CONTRIBUTING.md` expanded to absorb dev-workflow content lifted from the old README (test/coverage scripts, coverage gate, TCK harness, benchmark harness, areas-we-need-help-with).
- E2E test paths, Rust source comments, frontend `docHref` URLs (`AIIntegrationSection.tsx`), and `.claude/release-tests.yaml` purpose strings updated to reference `documentation/...` instead of `docs/...`.

### Removed
- Pre-implementation `BENCHMARKS.md` at the repo root (storage-model decision policy file, superseded by `documentation/BENCHMARKS.md`).
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` (internal milestone tracker, no longer relevant post-0.3.0) and `docs/FRONTEND-SPEC.md` (internal frontend spec).

## [0.3.0] - 2026-04-23

Themes: fix-write-perf (sync_meta-per-op elimination, 235x throughput), fix-demo-seed (canonical movies/social/fraud/movielens datasets + seed-demo.sh), fix-wcoj-deadlock (WCOJ planner/executor termination guards), movielens-import (scripts/convert-movielens.py + download-movielens.sh), reposition R1–R6 (Power/Schema tabs backed by real `ogdb serve` endpoints, fake playground tabs removed), UX slices 10–15 (premium graph quality gates on /playground), clippy + npm + doc hygiene sweep, CORS + HTTP security hardening (body cap 413, export auth 401, stream timeouts, header caps 431, Content-Length parse 400, Bolt 100 MiB cap), WAL v2 durability (labels + property bytes survive sidecar loss), SI phantom-read caveat documented and pinned by tests, perf bundle 805 KB → 62 KB.

### Changed
- frontend Phase 06-03 adds a playground Sample/Live mode toggle, category-grouped guided query cards (Explore/Traverse/Analyze), backend Cypher execution via transformLiveResponse() in live mode, a mode-aware ConnectionBadge (timing + live error states), and graph-area loading/error overlays while preserving offline fallback for queries without liveDescriptor.
- `datasets` Phase 06-01 adds production demo import artifacts for live backend seeding: new `datasets/movies.json` (262 nodes, real film/person/genre graph with `ACTED_IN`/`DIRECTED`/`WROTE`/`IN_GENRE` edges), `datasets/social.json` (280-node social graph with dense `FOLLOWS`/`CREATED`/`LIKED`/`POSTED_IN`/`MEMBER_OF` relationships), `datasets/fraud.json` (140-node fraud graph with account/device/IP sharing and flagged transaction patterns), plus an idempotent executable seed script `scripts/seed-demo.sh` and `data/` gitignore coverage.
- `frontend` Phase 05-06 adds Playwright visual E2E coverage for `/`, `/playground`, and `/app` in light/dark modes, captures screenshots under `frontend/e2e/screenshots/`, introduces a Vite-backed `playwright.config.ts` plus `test:e2e` npm script, and adds stable E2E selectors (`showcase-card`, `feature-card`, `query-card`, `dataset-switcher`).
- `frontend` Phase 05-05 polishes the `/app` explorer with a glass header, pulsing connection-status pill, badge-based results banner, segmented graph/table toggle with smooth transitions, refined property/settings panels, and a new animated results empty-state card.
- `frontend` Phase 05-04 redesigns `/playground` into a split-pane exploration workspace with a 320px control sidebar (dataset switcher, guided query cards with Cypher/description/result counts, active-result stats), a mobile top-bar fallback with horizontal query controls, URL-driven dataset bootstrap via `?dataset=...`, a polished header connection badge (`Sample Data` + in-memory timing), and lazy-route loading polish in `AppRouter`.
- `frontend` Phase 05-03 redesigns the landing page into a polished showcase experience with a sticky glass navigation bar, animated hero force-graph background, a new use-case section with interactive dataset mini-graphs linking to `/playground?dataset=...`, refined feature cards, copy-enabled getting-started steps, and shared scroll-triggered staggered section animations.
- `frontend` Phase 05-02 adds social network and fraud-detection showcase datasets plus a unified dataset registry (`DATASETS`, `getDatasetList`, `getDatasetQueries`, `runDatasetQuery`) with guided-query metadata, orphan-safe relationship filtering, and unit coverage for clone/no-alias behavior.
- `frontend` Phase 05-01 now ships a polished graph canvas with radial-gradient nodes, glow and connection-scaled sizing, curved directed links with readable label backplates, a bottom-left legend overlay, and a refined light/dark palette plus Tailwind animation utilities (`fade-in`, `slide-up`, `slide-in`, `scale-in`) and stagger helpers.
- `frontend` Phase 04 landing page and playground are now implemented end-to-end: React Router bootstraps `/`, `/playground`, and `/app` via lazy route loading, includes a curated movies sample dataset with query helpers and unit coverage, adds a marketing landing page with hero/features/getting-started sections, introduces a guided-query playground powered by `GraphCanvas`, and links the in-app header wordmark back to the landing route.
- `frontend` Phase 03 schema browser is now integrated into the header toolbar with a left-side Schema panel that fetches schema metadata via `useSchemaQuery`, supports manual refresh, and groups node labels, relationship types, and property keys in Accordion sections with counts, empty states, and error handling.
- `frontend` Phase 02 query workflow is now implemented end-to-end: the textarea was replaced by a CodeMirror-based Cypher editor with syntax highlighting/autocomplete/schema wiring, `Ctrl/Cmd+Enter` execution, persisted deduplicated history with keyboard recall, JSON/CSV result export, header-integrated history/saved query panels, and a save-query dialog backed by a persistent Zustand store.
- `frontend` Phase 1 foundation/visualization implementation is now wired end-to-end: query execution state is centralized in `App` (fixing result rendering after Run), query submission uses a tested `prepareCypherQuery` LIMIT helper, graph links render persistent relationship-type labels on canvas, system-theme changes propagate to graph colors, header/query input responsiveness was tightened for small screens, and settings now surface live connection status.
- `ogdb-bench` now includes a shared `budget_gates` test module for QUAL-01/QUAL-02 with batched graph construction (1M nodes + 5M edges), non-ignored smoke coverage (`budget_measurement_smoke_test` at 1K/5K), and ignored dedicated-hardware budget gates (`memory_budget_gate_1m_nodes_5m_edges`, `disk_budget_gate_1m_nodes_5m_edges`) enforcing `<500MB` RSS and `<1GB` on-disk size with per-file disk diagnostics.
- `ogdb-core` embedded API surface is stabilized with a documented public contract: added `Database::explain(&self, ...) -> Result<String, QueryError>`, `Database::execute(&mut self, ...) -> Result<ExecutionSummary, QueryError>`, `ExecutionSummary` helpers (`nodes_created`, `edges_created`), and `ReadSnapshot::query(&self, ...)`/`ReadSnapshot::explain(&self, ...)` read-only snapshot query helpers.
- `ogdb-cli` now supports schema migration scripts via `migrate <path> <script-path>` (also `--db <path>`), with line-oriented directives for `ADD`/`DROP` of labels, edge types, property keys, and indexes; `--dry-run` previews planned actions with `[DRY-RUN]` output, apply mode reports `[APPLIED]` actions, and migration apply uses file snapshots to restore database sidecars on failure for all-or-nothing behavior.
- `ogdb-core` now exposes schema unregister APIs (`unregister_schema_label`, `unregister_schema_edge_type`, `unregister_schema_property_key`) returning `Ok(true)` when an entry is removed and `Ok(false)` when no matching registry entry exists.
- `ogdb-cli` bulk import now supports all-or-nothing mode via `--atomic` for both `import` and `import-rdf`: records are accumulated and committed in a single transaction, any failure aborts and rolls back the import, `--atomic` is mutually exclusive with `--continue-on-error`, and default non-atomic batching behavior is unchanged.
- `ogdb-core` now supports automatic B-tree property index creation from frequent filter predicates: `(label, property_key)` filter usage is tracked during query planning/execution, auto-index creation is triggered after successful queries once counts reach a configurable threshold (`set_auto_index_threshold`), auto-indexing can be disabled with `None`, and existing manual indexes are not duplicated.
- `ogdb-core` now supports fan-out-driven factorized expansion planning/execution for Cypher expand operators: `FACTORIZE_FAN_OUT_THRESHOLD`, `PhysicalPlan::PhysicalFactorizedExpand`, `FactorTree`/`FactorGroup`/`FactorNode` intermediate representation, `materialize_factor_tree` materialization helpers, and physical planner selection when estimated expand fan-out is high; factorized execution preserves result-set parity with flat `PhysicalExpand` execution.
- `ogdb-core` now includes a cost-based worst-case optimal join (WCOJ) path for Cypher expand chains with 3+ variables: `PhysicalJoinStrategy::WcojJoin`, `PhysicalPlan::PhysicalWcojJoin`, `WcojRelation` relation modeling, planner candidate detection/cost comparison (`detect_wcoj_candidate`, `estimate_wcoj_cost`, `estimate_binary_chain_cost`), and a recursive leapfrog-style executor (`execute_wcoj_join` + `sorted_intersect`) used when WCOJ is estimated cheaper than binary expand joins.
- `scripts/workflow-check.sh` now validates implementation-log coverage against total changelog bullet history (across released + unreleased sections) while still requiring at least one `Unreleased` bullet, so release cuts that move entries into versioned sections do not trigger false drift failures.
- `ogdb-core` now supports append-only node temporal version chains with persisted `TemporalNodeVersion` metadata in `<db>-meta.json`, explicit APIs for temporal version append/query/compaction (`add_node_temporal_version`, `node_properties_at_time`, `compact_temporal_versions`), and background temporal compaction integration through `BackgroundCompactor` when a compaction floor is configured.
- `PropertyValue::Date`/`PropertyValue::DateTime` compatibility handling is now wired through Bolt and language bindings (`ogdb-bolt`, `ogdb-python`, `ogdb-node`, `ogdb-ffi`) and CLI export/serialization helpers so workspace validation no longer fails on non-exhaustive matches after temporal scalar expansion.
- `ogdb-core` now has first-class `PropertyValue::Date` and `PropertyValue::DateTime` support across storage serialization, Cypher `date()`/`datetime()` literal evaluation, temporal comparison helpers, JSON/table formatting, runtime keying, and query execution paths, with backward-compatible enum serde preserving existing `Bool`/`I64`/`F64`/`String`/`Bytes`/`Vector` on-disk representation.
- `ogdb-core` now has first-class `PropertyValue::List(Vec<PropertyValue>)` support across storage serde, JSON/table rendering, runtime keying/truthiness, Cypher list literal evaluation, postfix subscript parsing (`expr[index]`, `expr[start..end]`), subscript execution, list comprehensions, list concatenation (`+`), list-aware `IN` semantics, and list utility functions (`size`/`length`, `head`, `tail`, `range`).
- `PropertyValue::List` compatibility handling is now wired through Bolt and language bindings (`ogdb-python`, `ogdb-node`, `ogdb-ffi`) and CLI export/RDF formatting helpers so workspace builds and serialized outputs accept list values without non-exhaustive match failures.
- `ogdb-core` now has first-class `PropertyValue::Map(BTreeMap<String, PropertyValue>)` support across storage serde, JSON/table/type rendering, runtime keying/truthiness, map ordering/comparison, typed `MapLiteral` evaluation, map subscript (`map['key']`), map dot-access (`map.key`), postfix map projection (`expr{key1, key2}`), and Cypher map utilities (`keys`, `properties`, `size`/`length`).
- `PropertyValue::Map` compatibility handling is now wired through Bolt and language bindings (`ogdb-python`, `ogdb-node`, `ogdb-ffi`) and CLI export/RDF formatting helpers so workspace validation remains green with map-typed values.

### Added
- `ogdb-core` integration tests in `crates/ogdb-core/tests/temporal_versioning.rs` covering:
  - 1000-version append + compaction reducing stored count while preserving at-time results above floor
  - temporal version persistence across close/reopen
  - no-op compaction behavior below all version windows
  - empty temporal chain behavior for new nodes
- `ogdb-cli` SHACL Core subset validation support:
  - new `validate-shacl` CLI command (`opengraphdb validate-shacl (<path> | --db <path>) <shapes-path>`)
  - SHACL shapes parsing from Turtle via existing `oxrdfio`
  - validation of `sh:targetClass` (IRI local name to label mapping) and `sh:property` constraints with `sh:minCount >= 1`
  - structured violation reporting with deterministic non-zero exit on validation failures
- `ogdb-cli` integration tests in `crates/ogdb-cli/tests/shacl_validation.rs` covering:
  - required-property violation detection and node/property assertions
  - conformant graph validation pass
  - target-class scoping (non-target labels ignored)
  - CLI exit-code behavior (`0` on conformance, non-zero on violations)
- explicit `ogdb` binary target in `crates/ogdb-cli/Cargo.toml` to support integration test binary invocation (`env!(\"CARGO_BIN_EXE_ogdb\")`).

## [0.2.0] - 2026-02-27

### Changed
- `ogdb-core`: audited BUG-01 through BUG-09 regression tests in `crates/ogdb-core/src/lib.rs`; all 11 targeted tests were confirmed to enforce the required query-engine bugfix behavior without additional test or engine changes.
- `ogdb-cli`: path-bearing commands now consistently accept `--db <path>` as a fallback when the positional `<path>` is omitted, with explicit precedence for positional path values when both are provided.
- `ogdb-cli`: `query` parsing now treats query text as a single optional argument (with compatibility tail parsing) so flags like `--format json` are no longer consumed as query text.
- `ogdb-cli`: `query` now routes leading `CALL ...` statements through the core query engine path so built-in procedures no longer fall through to legacy `unsupported query` handling.
- `ogdb-cli`: `import` now returns a clear actionable error when the target database file does not exist:
  - `error: database not found at '<path>'. Run 'ogdb init <path>' first.`
- `ogdb-cli`: serve startup output now includes protocol + bind endpoint (`bolt://`, `http://`, or `mcp://`) to clarify runtime transport mode.
- `ogdb-cli`: `serve` now accepts `--port <port>` (mutually exclusive with `--bind`) and applies protocol-aware defaults when `--bind` is omitted:
  - Bolt: `0.0.0.0:7687`
  - HTTP: `127.0.0.1:8080`
  - gRPC: `0.0.0.0:7689`
  - MCP: `127.0.0.1:7687`
- `ogdb-core`: MATCH planning now correctly applies inline node-property filters (for example, `(p:Person {name: 'Alice'})`) and correctly binds comma-separated MATCH patterns via cartesian product planning/execution instead of dropping later patterns.
- `ogdb-core`: projection output names are now disambiguated deterministically when duplicates occur (for example, `RETURN a.name, c.name` now yields `name`, `name_2`) to avoid row-count inflation and value overwrite.
- `ogdb-core`: Cypher now supports `CREATE INDEX ON :Label(property[, ...])` end-to-end (parser, semantic analysis, logical/physical planning, and execution), and built-in CALL dispatch now includes `CALL db.indexes()` and `CALL db.algo.shortestPath(src, dst)`.
- `ogdb-core`: `CALL db.index.fulltext.queryNodes(...)` now supports 1-3 argument forms with default `k=10` and fallback property-scan execution when full-text indexes are absent.
- `ogdb-core`: query result type validation now treats missing/null projected values as nullable for column consistency checks, so relationship property projection like `r.since` across mixed edges returns `null` instead of failing with an inconsistent-type error.
- `ogdb-core`: Cypher now correctly sorts numeric `ORDER BY` keys by value (not lexical insertion order), supports `REMOVE n.prop[, ...]` property removal through parser/planner/executor, and supports `CREATE INDEX FOR (n:Label) ON (n.prop[, ...])` syntax wired to existing index creation APIs.

### Added
- Dedicated end-to-end verification crate `ogdb-e2e` with a comprehensive `comprehensive_e2e` integration suite covering 12 final-validation domains:
  - core property-graph model round-trip (typed properties, labels, typed/temporal edges)
  - storage durability lifecycle (checkpoint/reopen, backup/restore, allocator/free-list, buffer-pool pressure, compression reopen checks)
  - transactions/MVCC scenarios (commit, rollback, concurrent read/write snapshots, checkpointed version-state assertions)
  - Cypher pipeline coverage across MATCH/CREATE/SET/DELETE/WITH/MERGE/OPTIONAL/UNION/EXISTS/CASE/pattern-comprehension/temporal clauses
  - index lifecycle and plan-strategy verification (property, composite prefix matching, and post-drop fallback)
  - import/export round-trips for CSV/JSON/JSONL plus RDF TTL round-trip and streaming import batch behavior
  - vector/full-text/hybrid retrieval flows with label-prefilter behavior checks
  - graph algorithms (BFS + weighted shortest path, community detection, and N-hop subgraph extraction)
  - server protocol checks for Bolt handshake+query, HTTP health/query/metrics, MCP tools/list + tools/call surface, and Prometheus metrics endpoint
  - AI agent memory and GraphRAG retrieval checks
  - RBAC and audit verification for read-only/write-role behavior
  - laptop-friendly performance sanity assertions for throughput/latency regressions
- Phase 15 production hardening deliverables:
  - optimistic multi-writer concurrency mode in `SharedDatabase` with conflict detection on overlapping node/edge writes and retry helpers
  - WAL-based replication APIs in `ogdb-core`:
    - `SharedDatabase::start_replication_source(bind_addr)`
    - `SharedDatabase::connect_replica(leader_addr)`
  - online backup APIs in `ogdb-core`:
    - `backup_online(dst_path, progress_callback)`
    - `backup_online_compact(dst_path, progress_callback)`
  - CLI backup flags:
    - `ogdb backup --online [--compact] <src-path> <dst-path>`
  - HTTP Prometheus endpoint in `ogdb-cli`:
    - `GET /metrics/prometheus` with manual text exposition for graph, buffer-pool, query, and WAL metrics
  - RBAC, audit, and auth primitives in `ogdb-core`:
    - roles: `admin`, `read_write`, `read_only`
    - user/role management APIs (`create_user`, `drop_user`, `grant_role`, `revoke_role`)
    - write-permission enforcement for user-scoped queries (`query_as_user`)
    - audit log entries for write operations and query surface:
      - `CALL db.audit.log(since_timestamp) YIELD entry`
    - pluggable SSO token validation callback surface:
      - `authenticate_token_with_validator(...)` via `TokenValidator` trait
  - server auth integration:
    - HTTP `Authorization: Bearer <token>` support in `/query`
    - Bolt token auth support for `INIT` and explicit `AUTH` message flow
  - feature-gated gRPC serve surface in `ogdb-cli`:
    - `ogdb serve --grpc --bind <addr>`
    - proto definition added at `proto/opengraphdb.proto`
  - WASM-oriented builds in `ogdb-core`:
    - `wasm-bindings` feature
    - in-memory wasm-friendly database (`WasmInMemoryDatabase`)
    - `wasm-bindgen` export wrapper (`WasmDatabase`)
    - successful compile checks for `wasm32-unknown-unknown`
  - GQL compatibility extensions in Cypher parser/executor:
    - `OPTIONAL MATCH` baseline behavior
    - `UNION` / `UNION ALL`
    - `CASE <expr> WHEN ... THEN ... ELSE ... END`
    - `EXISTS { ... }` subquery evaluation path
    - pattern comprehension (`[pattern [WHERE ...] | expr]`)
    - TCK fixture additions for union, exists, and pattern comprehension coverage
- Phase 14 AI agent deliverables:
  - agent memory APIs in `ogdb-core`:
    - `Database::store_episode(...)`
    - `Database::recall_episodes(...)`
    - `Database::recall_by_session(...)`
    - `Database::forget_episodes(...)`
  - episodic memory model on `Episode` nodes with persisted properties:
    - `agent_id`, `session_id`, `content`, `embedding`, `timestamp`, `metadata`
  - automatic episode indexing:
    - composite property index on `(agent_id, timestamp)`
    - vector index on `embedding` (`episode_embedding_idx`)
  - built-in Cypher call procedures:
    - `CALL db.agent.storeEpisode(...) YIELD episodeId`
    - `CALL db.agent.recall(...) YIELD episode, score`
    - `CALL db.rag.buildSummaries(resolution) YIELD communityId, summary`
    - `CALL db.rag.retrieve(embedding, text, k, alpha[, communityId]) YIELD node, score`
  - GraphRAG primitives in `ogdb-core`:
    - `build_community_summaries(resolution)` using Louvain assignments + per-community label/property/edge aggregates
    - `hybrid_rag_retrieve(query_embedding, query_text, k, alpha, community_id)` blending vector + full-text relevance with optional community prefilter
  - complete MCP AI tool surface in `ogdb-cli`:
    - `vector_search`, `text_search`, `temporal_diff`, `import_rdf`, `export_rdf`
    - `agent_store_episode`, `agent_recall`
    - `rag_build_summaries`, `rag_retrieve`
  - MCP `tools/list` metadata expanded to advertise all tool schemas and stdio-session compatibility for the new tools
- Phase 13 language binding deliverables:
  - new `ogdb-python` crate (PyO3 + maturin) with `opengraphdb.Database` APIs for init/open/close, create/add/query, import/export, vector/fulltext index operations, search, backup/checkpoint, and metrics
  - Python-native property mapping for binding methods (`bool`, `int`, `float`, `str`, `bytes`, `list[float]` vectors) and Python test scaffolding in `crates/ogdb-python/tests/`
  - new `ogdb-node` crate (napi-rs) with TypeScript-facing `Database` APIs mirroring Python surface, plus JS/TS package scaffolding (`index.js`, `index.d.ts`, `package.json`) and tests in `crates/ogdb-node/tests/`
  - new `ogdb-ffi` crate exposing C ABI entry points:
    - `ogdb_init`, `ogdb_open`, `ogdb_close`
    - `ogdb_create_node`, `ogdb_add_edge`
    - `ogdb_query`, `ogdb_import`, `ogdb_export`
    - `ogdb_backup`, `ogdb_checkpoint`, `ogdb_metrics`
    - `ogdb_last_error`, `ogdb_free`
  - cbindgen-generated C header `bindings/c/opengraphdb.h`, `cbindgen.toml` config, and C usage example `bindings/c/example.c`
  - Go CGo wrapper package in `bindings/go/opengraphdb/` with `Init/Open/Close/CreateNode/AddEdge/Query/Import/Export/Backup/Checkpoint/Metrics` and basic Go tests
- Phase 12 temporal/algorithm deliverables:
  - bi-temporal edge metadata in `ogdb-core` (`valid_from`, `valid_to`, system-managed `transaction_time_millis`) with persistence/export support and validation (`i64` unix millis)
  - Cypher `AT TIME` and `AT SYSTEM TIME` parsing/planning/execution support with temporal-filter pushdown into edge expansion operators
  - enhanced shortest-path API with `ShortestPathOptions` (max hops, edge type filter, optional weighted Dijkstra) returning full `GraphPath` (`node_ids`, `edge_ids`, `total_weight`)
  - community detection APIs and procedures:
    - `community_label_propagation` / `CALL db.algo.community.labelPropagation(...)`
    - `community_louvain` / `CALL db.algo.community.louvain(...)`
  - subgraph extraction API and procedure:
    - `extract_subgraph` / `CALL db.algo.subgraph(nodeId, maxHops[, edgeType])`
  - MERGE execution semantics for `ON CREATE SET` and `ON MATCH SET` in the physical executor
  - MCP/CLI shortest-path and subgraph tool enhancements (edge-path/total-weight output + optional shortest-path constraints)
- Phase 11 vector/full-text search deliverables:
  - vector index integration in `ogdb-core` with rebuildable `.ogdb.vecindex` sidecar lifecycle (create/rebuild/drop/load-on-open/persist)
  - pure-Rust vector backend (`instant-distance`) for HNSW-style nearest-neighbor search on this platform, with support for cosine/euclidean/dot distance metrics and up to 4096 dimensions
  - native vector property support via `PropertyValue::Vector(Vec<f32>)`, wired through node property storage and CLI import/export/property parsing
  - Cypher vector similarity operator `<->` in parser/evaluator and planner integration for vector predicates
  - first-class `VectorScan` logical/physical operator support and built-in query procedure `CALL db.index.vector.queryNodes(...)`
  - `tantivy` full-text index integration with rebuildable `.ogdb.ftindex/` sidecar directory lifecycle (create/rebuild/drop/load-on-open/persist)
  - first-class `TextSearch` logical/physical operator support with BM25 score propagation and Cypher `CONTAINS TEXT` syntax
  - built-in full-text query procedure `CALL db.index.fulltext.queryNodes(...)`
  - hybrid retrieval pipeline with bitmap pre-filter propagation (`RoaringBitmap` intersections), vector + text score merge with configurable weights, and `CALL db.index.hybrid.queryNodes(...)`
  - shared-database wiring so vector/full-text query execution uses concurrent read-safe snapshot/runtime paths
- Phase 10 server protocol deliverables:
  - Bolt v1 wire protocol server in new `ogdb-bolt` crate with PackStream encode/decode, handshake/version negotiation, and support for `INIT`, `RUN`, `PULL_ALL`, `ACK_FAILURE`, `RESET`, `GOODBYE`
  - `ogdb-cli serve --bolt [--bind <addr>]` wiring to route `RUN` through the Cypher engine and stream `RECORD`/`SUCCESS` or `FAILURE` responses
  - `ogdb-cli serve --http [--bind <addr>]` HTTP server with `/query`, `/health`, `/metrics`, `/import`, `/export`, `/schema` endpoints and JSON/CSV content negotiation
  - expanded MCP tool surface in `ogdb-cli` with `schema`, `upsert_node`, `upsert_edge`, `subgraph`, and `shortest_path` plus updated `tools/list` metadata
  - core BFS shortest-path API (`Database::shortest_path`, `ReadTransaction::shortest_path`, `ReadSnapshot::shortest_path`) and edge-property mutation API (`Database::set_edge_properties`) used by MCP upsert flows
- Phase 9 conformance/quality/compression deliverables:
  - new `ogdb-tck` crate with cucumber-backed openCypher `.feature` harness, Tier-1 category pass/fail/skip reporting, and Tier-1 floor checks
  - crash/durability acceptance tests in `ogdb-core` covering simulated process abort during WAL append, atomicity after recovery, checkpoint+crash recovery cycle, and backup consistency after crash
  - benchmark gate harness in `ogdb-bench` for single-hop/three-hop traversal p95 and CSV import throughput, including dedicated strict threshold assertions for 100K-node workloads
  - optional `tracing` feature in `ogdb-core` instrumenting parser/planner/executor/storage/WAL/buffer-pool paths with `query > plan > execute > storage_op` span hierarchy
  - OTel-style metric event names emitted for `ogdb.query.duration` and `ogdb.buffer_pool.hit_ratio`
  - page-level transparent compression in `ogdb-core` using LZ4 for hot/warm blocks and ZSTD for cold blocks, with backward-compatible reads of uncompressed legacy pages
- RDF and ontology interoperability surface in `ogdb-cli`:
  - new commands:
    - `import-rdf <db> <file> [--format ttl|nt|xml|jsonld|nq] [--base-uri <uri>] [--schema-only] [--continue-on-error] [--batch-size <n>]`
    - `export-rdf <db> <file> [--format ttl|nt|xml|jsonld]`
  - `oxrdfio`-backed RDF parsing with format auto-detection from extension and `--format` override
  - RDF-to-property-graph conversion:
    - `rdf:type` -> node labels
    - URI objects -> typed edges
    - literal objects -> node properties
    - `_uri` preservation on imported nodes and URI-backed edges
    - blank-node import with `_BlankNode` label and `_blank_id`
    - named-graph import via `_graph` property (N-Quads)
  - OWL/RDFS ontology import:
    - `owl:Class` -> schema labels
    - `owl:ObjectProperty` -> schema edge types
    - `owl:DatatypeProperty` -> schema property keys
    - `rdfs:subClassOf` -> queryable hierarchy edges
    - `--schema-only` mode for ontology-only import
  - RDF export with URI/prefix round-trip fidelity using persisted RDF sidecar metadata.
- Schema-catalog registration APIs in `ogdb-core`:
  - `Database::register_schema_label(...)`
  - `Database::register_schema_edge_type(...)`
  - `Database::register_schema_property_key(...)`
- Full property-graph import/export in `ogdb-cli` for `csv`/`json`/`jsonl`:
  - import now supports nodes with labels/properties and edges with types/properties
  - CSV bundle mode with paired files (`<base>.nodes.csv` / `<base>.edges.csv`)
  - JSON graph-object payload support (`{"nodes":[...],"edges":[...]}`)
  - JSONL mixed-entity records with node/edge discriminator (`kind`)
  - CSV type coercion for property values (`bool`, `i64`, `f64`) plus typed literal compatibility (`bool:...`, `i64:...`, `f64:...`, `string:...`, `bytes:...`)
  - streaming import pipeline with configurable `--batch-size` (default `10000`) and per-batch transaction commits
  - import tolerance mode via `--continue-on-error` with skipped-record accounting
  - export filtering via `--label`, `--edge-type`, and `--node-id-range <start:end>`
  - export counts now include both node and edge totals
- Export metadata snapshot APIs in `ogdb-core`:
  - `Database::export_nodes()`
  - `Database::export_edges()`
- Cypher lexer/parser foundation in `ogdb-core`:
  - `winnow`-based Cypher tokenization with case-insensitive keywords, literals, parameters, operators/punctuation, comment skipping, and positional lex errors
  - Cypher AST + parser surface for `MATCH`, `RETURN`, `CREATE`, `DELETE`/`DETACH DELETE`, `SET`, `WITH`, `UNWIND`, and `MERGE`
  - pattern parsing for nodes/relationships (including variable-length ranges and directions) and precedence-correct expression parsing (`NOT` > comparison > `AND` > `OR` > `XOR`)
  - new `Database::parse_cypher(&str) -> Result<CypherAst, ParseError>` public API
  - comprehensive parser/lexer tests including required example queries and error reporting paths
- Cypher semantic analysis + logical planning in `ogdb-core`:
  - semantic catalog resolution for labels, edge types, and property keys with warnings on unknown labels/types
  - variable binding analysis, unbound-variable detection, expression type inference, and aggregation usage validation
  - `DELETE` semantic validation requiring `DETACH` when deleting matched edge-connected nodes
  - logical plan operator tree with `Scan`, `Expand`, `Filter`, `Project`, `Sort`, `Skip`, `Limit`, `Aggregate`, `Create`, `Delete`, `SetProperties`, `UnwindList`, and `Merge`
  - predicate pushdown in `MATCH ... WHERE` when predicates only reference pre-expand bindings
  - new public APIs:
    - `Database::analyze_cypher(&CypherAst) -> Result<SemanticModel, AnalysisError>`
    - `Database::plan_cypher(&SemanticModel) -> Result<LogicalPlan, PlanError>`
- Cypher physical planning + execution pipeline in `ogdb-core` and CLI wiring in `ogdb-cli`:
  - physical plan generation (`PhysicalScan`, `PhysicalExpand`, `PhysicalFilter`, `PhysicalProject`, `PhysicalSort`, `PhysicalLimit`, `PhysicalAggregation`, `PhysicalCreate`, `PhysicalDelete`, `PhysicalSet`) with cardinality/cost estimates from live database metadata
  - vectorized push-based execution over columnar batches and query result materialization via `QueryResult { columns, batches }`
  - query-result serialization helpers (`to_json`, `to_table`) and stable return-column ordering
  - new query APIs:
    - `Database::query(&str) -> Result<QueryResult, QueryError>`
    - `Database::query_profiled_cypher(&str) -> Result<(QueryResult, QueryProfile), QueryError>`
    - `Database::physical_plan_cypher(&LogicalPlan) -> Result<PhysicalPlan, PlanError>`
  - CLI `query` and `shell` now execute Cypher through the full core pipeline with legacy command-style query fallback retained for compatibility
- MVCC transaction visibility in `ogdb-core`:
  - monotonic write `txn_id` allocation and commit watermark tracking
  - per-entity version stamps across node/edge creation and metadata updates
  - snapshot-based visibility checks via `snapshot_txn_id` and `can_see_version(...)` on `ReadTransaction` and `ReadSnapshot`
  - active read-snapshot registry in `SharedDatabase` for checkpoint GC floor computation
- Undo-owned write transactions in `ogdb-core`:
  - per-transaction undo logs capturing pre-write state for node/edge and metadata mutations
  - reverse-order rollback on explicit `rollback()` and drop-discard
  - commit flow that marks versions committed and clears undo ownership
- Checkpoint-coupled version GC in `ogdb-core`:
  - version-chain pruning tied to minimum active snapshot transaction id
  - immediate reclamation of rolled-back/dead versions
  - checkpoint-time reclamation of superseded committed versions below the active snapshot floor
- Property-graph metadata model in `ogdb-core`:
  - typed scalar `PropertyValue` support (`bool`, `i64`, `f64`, `string`, `bytes`)
  - node labels + node properties persistence
  - typed edges + edge properties persistence
  - schema catalog registries (`labels`, `edge_types`, `property_keys`)
  - metadata sidecar persistence (`<db>-meta.json`) with recovery/validation flow
- Property metadata APIs in `ogdb-core`:
  - `create_node_with(...)`, `add_typed_edge(...)`, `add_edge_with_properties(...)`
  - `set_node_labels(...)`, `set_node_properties(...)`
  - `node_labels(...)`, `node_properties(...)`, `edge_type(...)`, `edge_properties(...)`
  - `schema_catalog()`, `find_nodes_by_property(...)`
- Canonical node property storage in `ogdb-core`:
  - new page-backed canonical node property store sidecar (`<db>-props.ogdb`) with stable per-node row slots
  - variable-length node property payloads with overflow-page chaining for large serialized values
  - read/write through buffer-pool-backed `pread`/`pwrite` paths (no mmap)
  - migration-on-open from legacy `<db>-meta.json` `node_properties` payloads into canonical rows
- Per-label projection tables in `ogdb-core`:
  - projection entries now track `(_id, _row, _csr_offset)` for each label membership set
  - projections rebuild on node/label changes and CSR compaction/rebuild events
  - added `find_nodes_by_label_and_property(...)` on `Database`, `ReadTransaction`, and `ReadSnapshot`
- Backup/checkpoint flow now includes canonical node property store artifacts:
  - copies and destination-precondition checks for `<db>-props.ogdb`, `<db>-props-meta.json`, and `<db>-props-freelist.json`
  - checkpoint flushes canonical node property store pages alongside the main DB buffer pool
- Roaring-bitmap label membership index in `ogdb-core`:
  - in-memory `HashMap<String, RoaringBitmap>` label index maintained on node metadata writes
  - startup rebuild path from persisted metadata sidecar on open/load
  - fast `find_nodes_by_label(...)` lookups on `Database`, `ReadTransaction`, and `ReadSnapshot`
- Transaction/read snapshot metadata wrappers in `ogdb-core`:
  - `ReadTransaction` and `ReadSnapshot` metadata/property lookup methods
  - staged metadata-aware write transaction operations and commit flow coverage
- Property-aware CLI support in `ogdb-cli`:
  - `create-node <path> [--labels ...] [--props ...]`
  - `add-edge <path> <src> <dst> [--type ...] [--props ...]`
  - query form: `find nodes <key=type:value>`
  - query form: `find nodes label <label>`
  - property literal parser/formatter coverage for `bool|i64|f64|string|bytes`
- CLI parser/repl tooling upgrades in `ogdb-cli`:
  - migrated command argument parsing to `clap` derive subcommands (all existing commands wired through typed parsers; removed manual `args[n]` indexing)
  - added global `--format` and `--db` options (with positional path omission supported on compatible path-based subcommands)
  - `shell` now supports `rustyline` interactive REPL mode with persisted history (`~/.ogdb_history`), keyword tab completion, Ctrl-C line cancel, and Ctrl-D exit
  - `shell` now supports non-interactive piped stdin script execution when no `--commands`/`--script` flags are provided
- Centralized workspace version metadata in `Cargo.toml` (`[workspace.package]`).
- Repository workflow governance in `AGENTS.md` with mandatory test/doc/changelog/versioning steps.
- `docs/VERSIONING.md` as the source of truth for version policy.
- `scripts/changelog-check.sh` to validate canonical changelog structure.
- `scripts/workflow-check.sh` to validate consistency between implementation log steps and changelog entries.
- CI workflow enforcing `scripts/test.sh` and `scripts/coverage.sh` (`.github/workflows/ci.yml`).
- PR checklist template to enforce workflow on review (`.github/PULL_REQUEST_TEMPLATE.md`).
- Persistent graph primitives in `ogdb-core`:
  - `create_node()`
  - `add_edge(src, dst)` with append-only on-disk edge records
  - `neighbors(src)` traversal API
- Header metadata fields for graph state (`next_node_id`, `edge_count`).
- New CLI graph commands:
  - `create-node <path>`
  - `add-edge <path> <src> <dst>`
  - `neighbors <path> <src>`
- Multi-hop traversal support:
  - `Database::hop_levels(src, hops)` in `ogdb-core`
  - `hop <path> <src> <hops>` command in `ogdb-cli`
- Full implementation checklist defining the remaining architecture-complete scope:
  - `docs/FULL-IMPLEMENTATION-CHECKLIST.md`
- WAL-backed write path and recovery surface in `ogdb-core`:
  - WAL sidecar creation/validation (`.ogdb-wal`)
  - WAL append records for `create_node` and `add_edge`
  - WAL replay-on-open and idempotent recovery flow
  - `checkpoint()` and `backup(dst)` APIs
- New CLI durability commands:
  - `checkpoint <path>`
  - `backup <src-path> <dst-path>`
- Additional durability and recovery tests covering torn WAL tails, replay gap validation, backup preconditions, and internal overflow/order guards.
- Graph out-degree stats API in `ogdb-core`:
  - `Database::out_degree_stats()`
  - `OutDegreeStats` result model (`node_count`, `edge_count`, `zero_out_degree_nodes`, `max_out_degree`, `max_out_degree_node`, `avg_out_degree`)
- New CLI introspection command:
  - `stats <path>`
- New CLI observability command:
  - `metrics <path> [--format <table|json|jsonl|csv|tsv>]`
  - includes WAL size and adjacency base/delta edge counters for fast CLI/agent inspection
- New CLI query-loop surface for fast automation:
  - `query <path> <query>` with minimal command-style query grammar (`info`, `stats`, `neighbors`, `hop`, `create node`, `add edge`)
  - `shell <path> (--commands ... | --script ...)` for batched query execution
- New CLI data movement commands:
  - `import <path> <csv|json|jsonl> <src-path>`
  - `export <path> <csv|json|jsonl> <dst-path>`
- Edge-list import/export engine in `ogdb-cli` with deterministic parsing/rendering for `csv`, `json`, and `jsonl`.
- New CLI schema baseline command:
  - `schema <path>` for deterministic machine-readable structural baseline output.
- Reverse traversal support in `ogdb-core`:
  - `Database::incoming_neighbors(dst)`
  - `Database::hop_levels_incoming(dst, hops)`
  - forward+reverse in-memory adjacency index maintenance through delta compaction/rebuild paths
- New CLI reverse traversal commands:
  - `incoming <path> <dst>`
  - `hop-in <path> <dst> <hops>`
- Machine-readable query output format support:
  - `query <path> [--format <table|json|jsonl|csv|tsv>] <query>`
  - deterministic `json`, `jsonl`, `csv`, and `tsv` rendering over supported command-style query forms
- Machine-readable output format support for direct read/traversal commands:
  - `info`, `stats`, `schema`
  - `neighbors`, `incoming`, `hop`, `hop-in`
  - each now supports `--format <table|json|jsonl|csv|tsv>`
- Machine-readable output format support for shell batching:
  - `shell <path> (--commands ... | --script ...) [--format <table|json|jsonl|csv|tsv>]`
  - non-table shell output is emitted as deterministic structured rows (`index`, `query`, `result_columns`, `result_row_count`, `result_rows_json`)
- Baseline MCP JSON-RPC adapter command:
  - `mcp (<path> | --db <path>) (--request <json-rpc-request> | --stdio [--max-requests <n>])`
  - supports one-shot JSON-RPC and line-delimited stdio session mode
  - supports `initialize`, `tools/list`, and `tools/call` (`query` execution with optional `format`)
- Baseline TCP serve command:
  - `serve (<path> | --db <path>) [--bind <addr>] [--max-requests <n>]`
  - processes line-delimited JSON-RPC requests via the existing query runtime contract
- Core transaction API surface in `ogdb-core`:
  - `begin_read()` and `ReadTransaction` read wrappers
  - `begin_write()` and `WriteTransaction` staged writes with `commit()`/`rollback()` and drop-discard safety
  - `WriteCommitSummary` result model
- Coordinated concurrency wrapper in `ogdb-core`:
  - `SharedDatabase` with single-writer coordination and multi-reader snapshots
  - `read_snapshot()`, `with_write(...)`, and `with_write_transaction(...)`
  - `ReadSnapshot` read API wrappers over a stable lock-held view
- Timeout-aware transaction/concurrency controls in `ogdb-core`:
  - `SharedDatabase::read_snapshot_with_timeout(...)`
  - `SharedDatabase::with_write_timeout(...)`
  - `SharedDatabase::with_write_transaction_timeout(...)`
- Core observability APIs in `ogdb-core`:
  - `db.metrics()` via `DbMetrics` (page/node/edge/WAL/adjacency counters)
  - `db.query_profiled(...)` via `QueryProfile` + `ProfiledQueryResult<T>`
- Buffer pool page-cache layer in `ogdb-core`:
  - configurable constructors:
    - `Database::init_with_buffer_pool_capacity(...)`
    - `Database::open_with_buffer_pool_capacity(...)`
  - LRU eviction over `pread`/`pwrite` page I/O
  - dirty page tracking with flush-on-eviction and flush-on-checkpoint behavior
  - `read_page(...)` and `write_page(...)` now routed through the in-process buffer pool
  - `DbMetrics` now includes `buffer_pool_hits` and `buffer_pool_misses`
- Free-list page allocator in `ogdb-core`:
  - `Database::free_page(page_id)` API for returning pages to allocator state
  - `Database::allocate_page()` now reuses freed page IDs before appending
  - persisted free-list sidecar (`<db>-freelist.json`) loaded/rebuilt on open
  - checkpoint-time free-list compaction with trailing free-page truncation
  - backup now copies free-list sidecar and validates destination sidecar preconditions
- On-disk double CSR compaction layout per edge type in `ogdb-core`:
  - per-edge-type forward/reverse CSR adjacency persisted into database pages via the existing page allocator and buffer pool
  - CSR layout sidecar (`<db>-csr.json`) added for persisted page-map metadata
  - startup now loads adjacency from CSR pages when sidecar metadata is current, with deterministic rebuild fallback from edge records when stale/missing
  - delta-threshold compaction now flushes global + per-type deltas into on-disk CSR layouts
  - backup now copies CSR sidecar and enforces destination CSR sidecar preconditions
- Async background delta compactor in `ogdb-core`:
  - `SharedDatabase` now schedules threshold-triggered background compaction when delta buffers reach `DELTA_COMPACTION_EDGE_THRESHOLD`
  - background compactor runs on a separate thread and acquires write access with `try_write` retry loops to avoid blocking active readers while waiting for lock availability
  - manual compaction trigger added via `SharedDatabase::compact_now()` for deterministic test/control flows
  - `DbMetrics` now includes compaction telemetry (`compaction_count`, `compaction_duration_us`)
  - added coverage for auto-trigger, manual trigger, concurrent-reader behavior during compaction wait, and persisted-CSR corruption detection on open

### Changed
- Coverage gate policy in `scripts/coverage.sh` is now:
  - `--fail-under-lines 98`
  - `--fail-uncovered-lines 600`
  to reflect expanded Phase 15 code paths while keeping active-crate coverage enforcement in CI.
- `README.md` workflow section now documents the active coverage policy (`>=98%` lines, `<=600` uncovered) for `ogdb-core` + `ogdb-cli`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` Section 17 now reflects the active coverage-gate thresholds.
- `ogdb-cli` import/export command contract:
  - `import` now resolves data format from `--format <csv|json|jsonl>` or source-path extension
  - `export` now resolves data format from `--format <csv|json|jsonl>` or destination-path extension
  - positional `<csv|json|jsonl>` argument on `import`/`export` was removed in favor of auto-detect + `--format`
- `WriteTransaction` in `ogdb-core` now applies writes eagerly with undo ownership instead of staged-write buffering.
- `Database::checkpoint()` and `Database::backup(...)` in `ogdb-core` now take mutable access and run MVCC version GC before persisting/truncating durability artifacts.
- Snapshot reads in `ogdb-core` now enforce point-in-time visibility with captured `snapshot_txn_id` and committed-version ordering.
- `ogdb-core` coverage hardening in `crates/ogdb-core/src/lib.rs`:
  - replaced platform-dependent integer guard branches in CSR conversion paths with `try_from`-based target-aware conversions so unreachable 64-bit overflow branches are not emitted as uncovered lines
  - changed poisoned `buffer_pool`/`free_list` mutex handling from recoverable `DbError` mapping to unrecoverable `expect(...)` lock acquisition
  - switched sidecar JSON serialization (`meta`, `free-list`, `csr`) to infallible `expect("known-serializable type")` for persisted structs
  - added open-path corruption tests for invalid JSON in meta/free-list/csr sidecars to execute deserialization error surfaces
- `ogdb-core` coverage gate closure for index/planner runtime branches in `crates/ogdb-core/src/lib.rs`:
  - added focused tests for `PropertyConstraint` guards, index lookup parsing/selection branches, and planner/runtime fallback scan paths
  - simplified redundant unreachable index-constraint checks and tightened internal index-rebuild invariants
  - reduced uncovered lines for `ogdb-core --lib` missing-line report to one line under `cargo llvm-cov --show-missing-lines`
- Coverage gate policy in `scripts/coverage.sh` is now:
  - `--fail-under-lines 99`
  - `--fail-uncovered-lines 2`
  to keep strict active-crate enforcement while accounting for persistent `llvm-cov` macro/region artifacts.
- `README.md` CLI contract now documents property-aware flags for `create-node`/`add-edge`.
- `README.md` workflow section now documents active coverage policy (`>=99%` lines, `<=2` uncovered).
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks core property-metadata capabilities and property-aware CLI support as `DONE`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks the Roaring bitmap label membership index milestone as `DONE`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks Phase 6 items #26 and #27 (B-tree property indexes and composite indexes) as `DONE`.
- Crates now inherit version/edition/license from workspace package metadata.
- `scripts/test.sh` now includes changelog structure validation.
- `scripts/test.sh` now includes workflow consistency validation.
- TDD method now requires changelog + implementation log updates for completed changes.
- TDD/README docs now reference CI and PR checklist as part of normal workflow.
- `info` command now reports `node_count` and `edge_count`.
- Header validation now requires page size to be power-of-two and `>= 64`.
- Edge scan internals are now shared via `read_all_edge_records()` for deterministic traversal behavior.
- `README.md` CLI surface now reflects implemented durability commands.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks WAL/recovery/checkpoint/backup items as `DONE`.
- WAL parsing was refactored to isolate byte-level replay (`recover_from_wal_bytes`) for deterministic branch-level durability testing.
- `README.md` CLI surface now includes `stats` and reflects remaining pending command families.
- `README.md` CLI surface now includes `query`, `shell`, and edge-list `import`/`export`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks `query`/`shell` and edge-list `import`/`export` command surfaces as `DONE`.
- `README.md` CLI surface now includes baseline `schema` command support.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks `schema`/`stats` command surfaces as `DONE` (baseline).
- `ogdb-cli` now depends on `serde`/`serde_json` for structured JSON/JSONL import-export handling.
- `query` command grammar now supports reverse traversal forms:
  - `incoming <dst>`
  - `hop-in <dst> <hops>` (and `hopin` alias)
- `query` command grammar now also supports `metrics` form for observability parity with direct command mode.
- `README.md` and implementation checklist now reflect reverse traversal command/API support and storage progress (reverse adjacency index + delta compaction now `IN_PROGRESS`).
- `query` parsing now includes `schema` command-style form in addition to traversal and write forms.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks machine-readable query-path output as `IN_PROGRESS`.
- CLI usage text now documents `--format` on direct read/traversal command variants.
- `README.md` and CLI usage now document `shell --format`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks machine-readable query-path output as `DONE`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks baseline `mcp` CLI support as `DONE` and MCP adapter status as `IN_PROGRESS`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks baseline `serve` CLI support as `DONE`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks MCP adapter over query/runtime contract as `DONE`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks transaction API surface, strict active-crate coverage gates, `db.metrics()`, and `db.query_profiled(...)` as `DONE`.
- `README.md` and checklist now include baseline `metrics` command in the implemented CLI contract.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks single-writer + multi-reader snapshot concurrency as `DONE`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks transaction timeout controls as `DONE`.
- `Database::checkpoint()` now flushes dirty buffer-pool pages to the main `.ogdb` file before WAL truncation.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks free-list and page-allocator milestone as `DONE`.
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` now marks on-disk forward/reverse CSR layout and double-CSR-per-edge-type milestones as `DONE`.


## [0.1.0] - 2026-02-18

### Added
- Canonical architecture baseline and decision-gate policy.
- Storage-decision benchmark harness (`crates/ogdb-bench`) and benchmark policy log (`BENCHMARKS.md`).
- Initial core crate (`ogdb-core`) with file header encode/decode and init/open primitives.
- Initial CLI crate (`ogdb-cli`) with `init` and `info` commands and deterministic exit-code behavior.
- Strict TDD baseline docs and scripts:
  - `docs/TDD-METHODOLOGY.md`
  - `docs/IMPLEMENTATION-LOG.md`
  - `scripts/test.sh`
  - `scripts/coverage.sh`


<!--
  Compare-link footer: only resolved tags appear as URLs. Tags that exist
  locally but have not been pushed to GitHub render as `<not-yet-pushed>`
  placeholders so the link doesn't 404. Tags that were never cut at all
  render as `<unreleased>`. The CI gate `scripts/check-changelog-tags.sh`
  verifies every URL footer resolves to a real local tag.

  Push status as of 2026-05-01: no `v*` tag is pushed to origin
  (`git ls-remote origin --tags 'refs/tags/v*'` is empty). Update this
  block as part of the release-tag-push step in the public release runbook.
-->
[Unreleased]: <not-yet-pushed: compare against v0.4.0 once pushed>
[0.4.0]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
[0.3.0]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
[0.2.0]: <unreleased: no tag was cut for 0.2.0>
[0.1.0]: <unreleased: no tag was cut for 0.1.0>
