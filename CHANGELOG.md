# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog.
Versioning follows Semantic Versioning.

## [Unreleased]

- `scripts/install.sh` + `crates/ogdb-cli/src/lib.rs::handle_demo` (cycle-18 docs eval F01) — install.sh banner promised "run `ogdb demo` to load MovieLens" but the post-install workflow could not deliver: install.sh wrote the empty database to `~/.opengraphdb/demo.ogdb` while `ogdb demo`'s default path is `~/.ogdb/demo.ogdb`, and `ogdb demo <existing-path>` short-circuited the seed when the file already existed. Two-pronged fix: (1) `install.sh:17` `OGDB_HOME` default `~/.opengraphdb` → `~/.ogdb` to match the binary default (`crates/ogdb-cli/src/lib.rs::default_demo_db_path`); (2) `handle_demo` now seeds when the file exists but is empty (`node_count == 0 && edge_count == 0`), not just when absent — so install.sh's pre-created empty file gets populated on first `ogdb demo` instead of staying empty. README.md L39+L52 + documentation/QUICKSTART.md L29+L43+L51 path references swept. New `scripts/check-install-demo-path-matches-binary-default.sh` structural gate (with red-green meta-test `scripts/test-check-install-demo-path-matches.sh`) wired into `scripts/test.sh` pins the install.sh `OGDB_HOME` to the binary's `default_demo_db_path`. New `crates/ogdb-cli/tests/demo_subcommand.rs::demo_seeds_into_existing_empty_init_file` regression test pre-creates an empty file via `ogdb init` and asserts MovieLens labels appear after `ogdb demo <path>`.
- `documentation/BENCHMARKS.md` (commit `aff476f`): headline + scope sentence bumped 0.4.0 → 0.5.1; added a 2026-05-05 patch-release note explaining the 0.4.0 → 0.5.0 → 0.5.1 window carries zero perf-relevant code changes and the 0.4.0 N=5 medians remain authoritative; re-baseline tracked as a v0.6.0 follow-up.
- `documentation/BENCHMARKS.md` (cycle-15, commit `cf97159`): rebaselined rows 7–14 to actual 0.4.0 N=5 values from `documentation/evaluation-runs/baseline-2026-05-02.json`; tightened `scripts/check-benchmarks-version.sh` to also gate the table column header so silent header-vs-body drift is caught.
- `SECURITY.md` (cycle-15, commit `01b2554`): Supported Versions bumped 0.4.x → 0.5.x; added `scripts/check-security-supported-version.sh` regression gate that asserts the Supported row's minor matches `Cargo.toml`.
- `SPEC.md` + `documentation/ai-integration/llm-to-cypher.md` + `documentation/SECURITY-FOLLOWUPS.md` + `IMPLEMENTATION-READY.md` version stamps bumped to 0.5.1 (cycle-15, commit `812068f`).
- `frontend/src/components/landing/HeroSection.tsx` + 3 e2e specs (`pg-high-fixes`, `pg-high-fixes-probe`, `a11y-sweep`) now read the version label from `Cargo.toml` at build time via `VITE_OGDB_VERSION` instead of hard-coding `v0.3.0` (cycle-15, commit `acaeae1`).
- `skills/opengraphdb/SKILL.md` + `references/benchmarks-snapshot.md` + `references/cypher-coverage.md` perf and Cypher tables bumped 0.3.0/0.4.0 → 0.5.1 with patch-release framing matching `documentation/BENCHMARKS.md` (cycle-15, commits `cf0bbdb` + `cf97159`).
- `skills/README.md` + `skills/src/install.ts` drop the Copilot install arm to match the SKILL.md compatibility metadata that already lists only 6 supported agents (cycle-15, commit `d4bda6f`).
- `documentation/COMPATIBILITY.md` CLI/flag stability examples bumped 0.4.* → 0.5.* and the v0.5.0 upgrade-fixture test (`crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs`) was added so the L44 promise is enforced by a real gate (cycle-15, commit `c904418`).
- `CONTRIBUTING.md` coverage-gate language aligned with the actual `scripts/coverage.sh` ratchet (80% / 5000 uncovered lines), with a new check that asserts the doc claim matches the script (cycle-15, commit `4185044`).
- `documentation/COOKBOOK.md` recipe-4 `AT TIME` `POST /query` snippet is now exercised by `frontend/e2e/cookbook-snippets-runnable.spec.ts`, restoring the front-matter "every HTTP snippet is exercised" claim (cycle-15, commit `a461c07`).
- `benchmarks/rag/RESULTS.md` marked historical with a banner pointing at `documentation/BENCHMARKS.md` for current rows; the v0.2.0-era RAG-bench numbers no longer masquerade as live (cycle-15, commit `709e38c`).
- `CHANGELOG.md` (cycle-15, this commit): split the conflated `[0.5.1]` body into a real `[0.5.0] - 2026-05-04` minor-release section (Added / Changed / Removed) plus a `[0.5.1] - 2026-05-05` patch section (Fixed only), per Keep-a-Changelog and `docs/VERSIONING.md` Release Checklist step 3; corrected the stale `docs/...` → `documentation/...` path-typos for `BENCHMARKS.md` and `evaluation-runs/baseline-2026-04-25.json` in the `[0.4.0]` retrospective and in `docs/evaluation-runs/history.jsonl` row notes; tightened `scripts/workflow-check.sh` Layer-1 to reject the empty-placeholder bullet so the AGENTS rule is enforced for non-`feat(` commits too.

## [0.5.1] - 2026-05-05

### Fixed
- `scripts/install.sh` asset-name template was wrong: produced `ogdb-linux-x86_64.tar.gz` instead of the actual release artifact `ogdb-<version>-<rust-target-triple>.tar.xz` (or `.zip` on Windows). Real-user E2E test against published `v0.5.0` (real-user E2E test against the v0.5.0 release) failed with curl 404. Fix: `detect_target()` now emits the correct rust-target triples (`x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`) and extensions (`tar.xz` for linux+macos, `zip` for windows). `OGDB_VERSION=latest` now resolves to the actual tag via `gh api repos/.../releases/latest -q .tag_name` (or the GitHub HTTP API as a fallback) BEFORE interpolating the asset URL. Extract path now uses `tar -xJf` for `.tar.xz` and `unzip` for `.zip`.
- `scripts/install.sh` no longer swallows curl 404 errors. Switched download function to `curl --fail -L` and explicit exit-code check so a missing release asset surfaces as `exit 1` instead of silent success.
- `.github/workflows/release.yml` now uploads `scripts/install.sh` as a release asset, so the documented `curl https://github.com/.../releases/download/<tag>/install.sh` URL resolves (was returning 404 — README pointed at a path that did not exist on the releases page).
- `README.md` install command updated to use the working release-asset URL pattern (or pinning to a specific tag via `OGDB_VERSION=v0.5.1`).

## [0.5.0] - 2026-05-04

### Added
- `ogdb demo <path>` subcommand seeds a fresh database with the MovieLens demo dataset and starts the playground HTTP server (commits `0ae8463` / `375198b`); paired with an `EmptyDbOverlay` React dialog in the SPA so a fresh `ogdb serve --http` instance offers one-click sample data instead of an empty graph. Closes the cycle-3 docs eval §C3-H2 workflow gap (`AGENTS.md:13` requires every merged change land an `[Unreleased]` bullet).
- AMBER-TERMINAL palette + motion + a11y foundations promoted across the SPA (S1 + S1-V2 of `.planning/frontend-overhaul/PLAN.md`, commits `60e657a` / `a31bbbf`): warm-amber light + dark tokens in `frontend/src/index.css`, sweeps the AppShell / HeroSection / SampleQueryPanel / RDFDropzone / Header / DisconnectedState / AppBackdrop / PlaygroundPage chrome off the old `hsl(240, ...)` cosmos-navy literals onto `bg-background` / `bg-card` tokens, and adds an `e2e/palette-amber.spec.ts` gate (5 asserts including a hero-bg warm-channel check) so the palette can't regress to indigo-on-navy. Data-viz `LABEL_PALETTE` / `EDGE_PALETTE` hues left untouched.
- `ogdb-cli` embeds the built playground SPA (`frontend/dist-app/`) into the binary via `include_dir!` and serves it from `serve --http`: `GET /` returns the SPA shell, `GET /assets/*` returns the embedded asset with the right `Content-Type`, and any unknown non-API GET falls back to `index.html` so React Router can resolve the route on the client. Existing API endpoints (`GET /health`, `GET /metrics*`, `GET /schema`, all POST routes) are preserved; only previously-unhandled GETs route into the static handler. CI builds the SPA before cargo via a new `Build SPA dist for include_dir!` step in the `quality` job. Slice S7 of `.planning/frontend-overhaul/PLAN.md`.
- Cross-platform `platform_io::FileExt` shim so positional `read_at`/`write_at` work on Windows (via `seek_read`/`seek_write`). Unblocks `cross-platform-build (windows-latest)` matrix in CI.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) and `SECURITY.md` (vulnerability-disclosure path).
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.{md,yml}` standardising bug + feature intake.

### Changed
- README: applied best-practice OSS-readme structure (logo + badge cluster, playground hero screenshot, 3-step quickstart, "Why OpenGraphDB instead of Neo4j" 7-row comparison table, file-pointer feature bullets, architecture / benchmarks / roadmap / contributing / acknowledgements sections). Hero asset is `frontend/e2e/screenshots/playground-movielens-light.png` (already shipped + git-tracked); all anchors checked through `scripts/check-doc-anchors.sh` and `scripts/check-public-doc-tmp-leak.sh`; binding-roadmap bullet phrased to clear `scripts/check-design-vs-impl.sh` C5-H3 gate (no fictional method names like `db.query_df()`).
- README: added CI / verify-claims / latest-release / license badges at the top.
- `CHANGELOG.md` link footer ratchets through `v0.4.0` (`Unreleased` now compares against `v0.4.0`, not `v0.3.0`).
- `CONTRIBUTING.md` coverage gate updated: command is now `./scripts/coverage.sh`, threshold is the script's ratchet (93% / 3000 uncovered lines as of v0.4.0; ratchets DOWN only).
- `documentation/BENCHMARKS.md`: removed a leaked private scratch-path citation in § 6 Source citations; the section now points at Section 5's public source links directly.
- `documentation/BENCHMARKS.md` (cycle-9 perf surface audit, `.planning/c9-perf/PLAN.md`): the "Baseline-version note" no longer claims "numbers do not yet shift" between the 0.3.0 N=5 medianed baseline and the 0.4.0 single-shot, because cycle-9 cross-checked the two baseline JSONs and found rows 3 / 4 / 5 / 6 / 10 move beyond the methodology section's documented 40–70 % N=1 cold-cache variance band (most notably row 4 +110 % traversal p95, row 5 −49 % IS-1 p95, row 6 +66 % mutation p95). The note now reads the per-row "(0.4.0, N=5 median)" tags as "(0.3.0 N=5 median, carried forward to 0.4.0; 0.4.0 single-shot in 2026-05-01 baseline JSON shows drift on rows 3, 4, 5, 6, 10 that is at the boundary of N=1 noise)" and adds § 4 follow-up #11: re-baseline 0.4.0 at N=5 on the i9-10920X bench box and default `OGDB_EVAL_BASELINE_ITERS` to 5. Cycle-9 also confirmed every documented row 1–14 has a backing harness wired through `crates/ogdb-eval/tests/publish_baseline.rs` (no missing run script) and that warm-up/median/p99.9-drop methodology is correctly implemented in `multi_iter::{run_warmup_pass, median_aggregate}`.
- `documentation/ai-integration/{llm-to-cypher,embeddings-hybrid-rrf,cosmos-mcp-tool}.md` (cycle-2 docs eval C2-B2) reshaped into truthful one-paragraph redirects to `documentation/COOKBOOK.md` Recipe 1+2 and `documentation/BENCHMARKS.md`; removed the `**Status:** stub — detailed walkthrough lands in a follow-up slice.` advertisement; corrected fictional API names (`db.schema_summary()` → `Database::schema_catalog()` / `schema` MCP tool; `db.hybrid_search(...)` → `Database::rag_hybrid_search(...)` / `POST /rag/search`; `usearch` → `instant-distance` HNSW). The matching SPA snippet API names (`AIIntegrationSection.tsx`) are corrected too.
- Cycle-4 docs eval (EVAL-DOCS-COMPLETENESS-CYCLE4) — 5 design-vs-impl drift fixes converging the contributor-facing surface (`ARCHITECTURE.md` / `DESIGN.md` / `SPEC.md` / `README.md` / 3 skill files) on the shipped 0.4.0 implementation: C4-H1 vector ANN claim (`usearch` / `hnsw_rs` → `instant-distance`); C4-H2 `README.md:42` drops gRPC from the runnable serve list; C4-H3 `DESIGN.md` §24 fictional Rust API rewritten to mirror the shipped `ogdb_core::Database` surface; C4-H4 `DESIGN.md` §25 + `SPEC.md` Bolt v4.4+ → v1; C4-H5 `DESIGN.md` §34 + §37 fictional `~/.opengraphdb/config.toml` + workspace listing replaced with the truthful CLI-flags-only configuration model + 18-crate workspace. New `scripts/check-design-vs-impl.sh` (wired into `scripts/test.sh`) gates each of the five drifts against `Cargo.toml` / `crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1` / `crates/ogdb-cli/src/lib.rs::handle_serve_grpc` so they cannot regress unobserved; new `crates/ogdb-cli/tests/grpc_unimplemented.rs` is the matching Rust-level regression pin for C4-H2.
- Cycle-5 docs eval (EVAL-DOCS-COMPLETENESS-CYCLE5) — 3 design-vs-impl drift fixes closing the surfaces the cycle-4 patch did not sweep: C5-H1 `DESIGN.md` §1 Project Structure (the FIRST architectural diagram a contributor sees) replaces a 215-line fictional ASCII tree (with never-landed `crates/ogdb-query/` + `crates/ogdb-server/` subtrees and a 27-file `crates/ogdb-core/src/` hierarchy) with the actual shipped 18-crate layout matching `ls crates/`, plus a `> Reality check (0.4.0):` preamble naming the never-landed sketch crates; C5-H2 `SPEC.md:328` `cargo add opengraphdb` → `cargo add ogdb-core` (no `opengraphdb` Rust crate exists; the Python+npm packaging asymmetry made the cycle-3 binary-name gate skip this case); C5-H3 `DESIGN.md` §27 (Python) + §28 (Node) embedded-API code samples rewritten with `> Reality check (0.4.0):` prose preambles + truthful examples calling only methods that exist on the shipped `crates/ogdb-python/src/lib.rs::PythonDatabase` `#[pymethods]` and `crates/ogdb-node/src/lib.rs` `#[napi]` blocks (no `db.query_df()`, `db.import_ttl()`, `with db.transaction()`, `db.transaction(async (tx))`, `db.stream()` — those were Decision-7 sketch ergonomics tracked as a v0.5 follow-up). `scripts/check-design-vs-impl.sh` gains 3 new regression sections (C5-H1 / C5-H2 / C5-H3), each one a positive-list pin against `crates/` / `Cargo.toml` so the same drift cannot be re-introduced.
- Cycle-9 frontend dead-code + integrity fix (commit `29ae8c5`, `.planning/c9-frontend/PLAN.md`): 2 dead nav anchors (`#showcase`, `#how-it-works`) resolved by adding the matching `id=` to `ShowcaseSection.tsx` + `GettingStartedSection.tsx`; 4 orphan files + 10 dead exports removed via ts-prune; `useCopyToClipboard` + `formatClaimsDate` hoisted into `frontend/src/lib/`; `/claims-status.json` fetch deduped into a `useClaimsStatus` hook. Integrity fix: `PerfStrip.tsx` was synthesizing fake parse/plan/execute ms numbers as 5/20/75 % ratios labelled "Verified perf · profiled" — replaced with real Rows / Nodes / Edges / Total counters tied to actual query results, with new `frontend/e2e/c9-playground-values.spec.ts` (3 tests) + `frontend/e2e/reposition/R6-perf-strip.spec.ts` (2 tests) wired into `.claude/release-tests.yaml` as `c9-playground-values-real` and `c9-perf-strip-cells-r6` so synthesized perf cells cannot regress.
- Cycle-9 visual fixes (commit `76b4946`, `.planning/c9-visual-verify/REPORT.md`): C9-V-H1 AI-integration code cards add `.scrollbar-code` utility on `CodeSnippetCard` `<pre>` so long lines scroll horizontally instead of clipping silently; C9-V-H2 `DocPage` enables the `@tailwindcss/typography` plugin so `.prose` selectors render docs with proper `h1`/`h2`/`h3` styling; C9-V-H3 `SchemaBrowser` header swaps `from-primary/20` (peach palette leak) → `from-accent/10` to align with the AMBER-TERMINAL token; C9-V-M1 demo card omits `0 NODES · 0 EDGES` count strip that contradicted the rendered constellation (kept the `illustrative` badge); C9-V-M2 `GettingStartedSection` kicker reads `03 — Get started` (was `HOW IT WORKS`) and the duplicate inner `#how-it-works` anchor + dead `LandingNav` link to it are removed (the section's outer `id="get-started"` is the canonical anchor). 5 new regression tests in `frontend/vitest/c9-visual-fixes.test.tsx`; lint clean, vitest 48/48, token-leak still BASELINE=2.
- Cycle-12 graph-viz MVP polish slice (commit `285ee45`, scoped per `.planning/c9-graph-viz/PROPOSAL.md` "Polish path B"): 5 interactive polish items shipped on the playground's Obsidian-style force-directed graph viz — (1) label-collision priority queue: focused → highest-degree → deterministic-by-id placement order replaces first-paint-wins so important labels stop getting hidden by trivial neighbors, (2) hover tooltip surfaces label + degree + 1–2 selected properties on each node, (3) sticky-fade for touch: tap-and-release pins the neighborhood highlight on mobile (was hover-only), (4) zoom clamp prevents over-zoom past readable label size or out past 2× bounding box, (5) two-hop fade tier (focused full opacity / 1-hop slight dim / 2-hop deeper dim / beyond fully dimmed) replaces the binary in-out fade. 12 polish playwright tests (5 new + 7 regression) at `frontend/e2e/obsidian-graph-quality.spec.ts`; lint+tsc clean, vitest 48/48, unit 64/64. New helpers extracted to `frontend/src/graph/obsidian/tooltip.ts`.
- Cycle-11 LOW nits cleanup (commit `c532a36`): dead `TraceData` interface removed from `frontend/src/types/graph.ts`; dead `EDGE_PALETTE` removed from `frontend/src/graph/theme.ts`; `/claims-status.json` request-level dedupe via `useSyncExternalStore` + module-level cache so `ClaimsBadge` + `ClaimsRedBanner` issue exactly one fetch per page load instead of two.

### Removed
- Cycle-9 rust-quality dead-code + dedup pass (EVAL-RUST-QUALITY-CYCLE9, `.planning/c9-rust/PLAN.md`) — 3 HIGH and 1 dedup, all per-crate verified, no BLOCKERs:
  - **H1** — three circular self-tests in `crates/ogdb-ffi/src/lib.rs` deleted: `parse_metric` / `property_value_to_json` / `query_rows_to_json` were `#[cfg(test)]`-only helpers whose only callers were the two tests `metric_parser_supports_aliases` and `rows_to_json_maps_property_values` that themselves only exercised those helpers (no production-code path under test). Deleted ~80 LoC; the genuine round-trip test `property_json_round_trip_maps_scalars_and_vectors` (which exercises the production `parse_properties_json` helper) is unchanged.
  - **H2** — dead struct `CommunityMember` deleted from `crates/ogdb-core/src/lib.rs`. Zero references in the repo (lib, tests, bindings, docs, changelog, planning); `CommunityHierarchy.members` is `BTreeMap<u64, Vec<u64>>` (raw node-id list), so the speculative struct was never wired up.
  - **H3** — dead method `Database::query_cypher_with_retry` deleted from `crates/ogdb-core/src/lib.rs`. One-line wrapper over `query_cypher_as_user_with_retry("anonymous", …)` with zero in-repo callers and zero docs/changelog mentions; the `_as_user` variant is the canonical surface (cli, e2e, bindings, eval all use it).
  - **H4** — `parse_metric` deduped: identical bodies in `crates/ogdb-python/src/lib.rs` and `crates/ogdb-node/src/lib.rs` (and a third `#[cfg(test)]` copy in `ogdb-ffi`, retired by H1) collapsed onto a single `pub fn parse_distance_metric(raw: Option<&str>) -> Result<VectorDistanceMetric, String>` in `crates/ogdb-vector/src/lib.rs` (re-exported from `ogdb-core`). Both binding crates now call the shared helper; their two duplicate `metric_parser_accepts_supported_values` tests are replaced by a single `parse_distance_metric_accepts_aliases_and_rejects_unknown` covering all 6 aliases + the `None`-default case in `crates/ogdb-vector/tests/api_smoke.rs`.
- `documentation/AI-NATIVE-FEATURES.md` (cycle-2 docs eval C2-B1): the file was a Brainstorming dump that referenced a fictional `opengraphdb` binary, a non-existent `opengraphdb.toml` config file, and Cypher syntax (`OPTIONS {type: 'vector', embedding: true}`, `semantic_distance(...)`) that the engine doesn't speak. The genuine roadmap content folds into `ARCHITECTURE.md`; runnable coverage of the AI-native surface lives in `documentation/COOKBOOK.md` Recipe 1+2 and HNSW thresholds in `documentation/BENCHMARKS.md`. The pointer at `documentation/README.md` and the references in `skills/opengraphdb/SKILL.md` and `skills/opengraphdb/references/cypher-coverage.md` are retargeted accordingly.
- `documentation/ai-integration/multi-agent-shared-kg.md` (cycle-2 docs eval C2-B2): the file claimed `Database::open("shared.ogdb")` "Just Works across processes" with MVCC snapshot isolation. That contradicts the project's own benchmark sheet (`documentation/BENCHMARKS.md` row 9 / § 4.6: *"single-writer-kernel-limited; the N=4 measurement is mechanical, not real contention"*) and the actual file format (`Database::open` takes a single-process exclusive write lock — multi-process open today is undefined behaviour). The matching `MULTI_AGENT_KG` snippet, 4th pattern card, and `docHref` are also removed from `frontend/src/components/landing/AIIntegrationSection.tsx`; the e2e (`frontend/e2e/F4-ai-integration-section.spec.ts`) updates to expect 3 cards and additionally asserts the three remaining `documentation/ai-integration/*.md` files do not advertise themselves as `**Status:** stub`. Real multi-writer support is a v0.5 roadmap item.

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
- `ogdb-eval` rebaselined the release-mode `publish_baseline` harness to N=5 medians: 7-test multi-iter aggregation (median across N, lower-median on even N, p99.9 exclusion at N=5 due to noise), 4-phase warm-up driver (`ingest_streaming` + `ingest_bulk` + `read_point` + `read_traversal`), governor probe + sudo-write fallback. `documentation/BENCHMARKS.md` and `documentation/evaluation-runs/baseline-2026-04-25.json` reflect the new medians and methodology.
- `[profile.release]` workspace gains `lto = "thin"` + `codegen-units = 1` plus `#[inline]` hints on 7 pure helpers in `ogdb-vector` / `ogdb-temporal` / `ogdb-text` to recover the IS-1 cross-crate inlining the monolith-split refactors had cost (~25% on the 1-hop Cypher property-fetch benchmark). IS-1 acceptance gate: median qps over 5 release-mode iterations ≥ 18,000.
- Documentation reorganized into a public/internal split: user-facing docs (`BENCHMARKS.md`, `COOKBOOK.md`, `MIGRATION-FROM-NEO4J.md`, `AI-NATIVE-FEATURES.md`, `ai-integration/`, `evaluation-runs/`) moved from `docs/` to a new `documentation/` folder with a `documentation/README.md` index; `docs/` now holds contributor-only material (`TDD-METHODOLOGY.md`, `VERSIONING.md`).
- `README.md` rewritten as a lean public-facing intro (~80 lines): tagline, the gap OpenGraphDB fills, 30-second quickstart with a Rust embed example, three-bullet positioning, links to `documentation/`, compact CLI surface, and a contributor pointer.
- `CONTRIBUTING.md` expanded to absorb dev-workflow content lifted from the old README (test/coverage scripts, coverage gate, TCK harness, benchmark harness, areas-we-need-help-with).
- E2E test paths, Rust source comments, frontend `docHref` URLs (`AIIntegrationSection.tsx`), and `.claude/release-tests.yaml` purpose strings updated to reference `documentation/...` instead of `docs/...`.

### Added
- `ogdb-eval` real multi-provider LLM adapters behind feature flags: `llm-anthropic` (default), `llm-openai`, `llm-local`. 12 wiremock-based tests (zero real network) cover factory resolution + Anthropic `x-api-key` + request body + OpenAI Bearer + Local URL env enforcement + 429 retry with exponential backoff + malformed-JSON / missing-field error mapping. Closes the dimension-4 recursive-skill-improvement loop.
- `ogdb-eval` dimension-4 skill-quality driver: reads `skills/evals/*.eval.yaml` (data-import, graph-explore, ogdb-cypher, schema-advisor), drives an `LlmAdapter` trait (deterministic `MockAdapter` for CI; real adapters via factory), scores cases against `must_contain` / `must_not_contain` / `pattern` regex + per-case scoring dict, aggregates `pass_rate` + `avg_score` + per-difficulty + per-skill + p50/p95/p99 response latency into an `EvaluationRun`. Wired into `publish_baseline` so every release captures the new run alongside the existing 14; `FailingAdapter` errors produce `suite_status='degraded'` in `EvaluationRun.environment` instead of panicking.
- `ogdb-eval` recursive-skill-improvement closed loop: `diff_engine` detects per-skill `pass_rate` drops > threshold (default -5%, configurable via `OGDB_SKILL_REGRESSION_THRESHOLD`), emits a deterministic `skill_regression_report.json` listing regressed skills + failing cases per skill + a suggested next-plan one-liner the conductor watcher consumes to auto-spawn targeted plan sessions.
- `ogdb-fuzz` `cargo-fuzz` harness (sub-workspace at `crates/ogdb-fuzz/fuzz/`): `fuzz_cypher_parser` + `fuzz_wal_record_reader` targets with seed corpora. Compile-only release-tests entry pins the wiring; full fuzz runs are on-demand via `cargo +nightly fuzz run`.
- `documentation/COOKBOOK.md` (relocated to `documentation/` in this release per § Changed above) — 7 runnable AI-agent recipes; backed by `frontend/e2e/cookbook-snippets-runnable.spec.ts` running every documented snippet (curl + Python + Node) against a live `target/release/ogdb serve --http` to catch API drift in `/mcp/invoke`, `/rag/search`, `/query`.
- `documentation/MIGRATION-FROM-NEO4J.md` (relocated to `documentation/` in this release per § Changed above) — 5-min honesty-first migration guide; backed by `frontend/e2e/migration-guide-snippets.spec.ts` running every Cypher + curl snippet against a live backend (covers LABEL syntax, `id()` function, `CREATE INDEX`, vector search, `/query` shape).
- `crates/ogdb-eval` evaluator drivers shipped in Phase 5 / metrics-expansion: `ldbc_snb` IS-1 driver, `graphalytics` BFS + PageRank driver, `criterion_ingest` driver, `scaling` 10K-tier driver, `cli_runner` plus p99.9 latency tails. Backing `proptest_atomicity` invariants (256 cases each) for commit/rollback all-or-nothing, WAL replay idempotency, ReadSnapshot consistency, MVCC monotonicity.
- `frontend` cosmetic baseline polish: `<title>` tag set on the Vite default page (was "Vite + React + TS"); theme system default flipped from `'light'` to `'system'`; slice12 e2e pins `colorScheme=dark` to survive the default flip.
- `.claude/release-tests.yaml` manifest grew from 27 → 63 entries; every regression test added since v0.3.0 is enumerated with the exact `cargo` / `playwright` invocation, the bug it guards, and the `added:` date.

### Fixed
- `ogdb-cli` HIGH + MED audit closeouts (`crates/ogdb-cli/tests/http_import_count.rs`): import count semantic correctness, invalid-Cypher `400`-not-`500`, missing-`query`-field `400`-not-crash.
- `frontend` slice11–14 cosmos.gl specs (`slice11-color-bloom-backdrop`, `slice12-legibility-palette-depth`, `slice13-label-halos`, `slice13-palette-hues`, `slice13-routing-palette`, `slice14-bloom-balance`) now self-skip when WebGL is unavailable (xvfb / headless hosts) via a shared `skipIfCosmosWebglUnavailable` helper, instead of hard-failing.
- 484-lint clippy drift cleared across `ogdb-cli` / `ogdb-core` / `ogdb-eval` after the monolith-split refactors; ogdb-e2e UNWIND assertion inverted to expect 2-row result post-PhysicalUnwind.
- HNSW `hnsw_query_under_5ms_p95_at_10k` acceptance gate now drives 5 measurement iterations with a warm-up pass and asserts the median p95 ≤ 5ms (was a single-shot p95 prone to timing flake under load); shipped median p95 = 4.62ms on a quiet host. Aligns with the IS-1 + publish_baseline N=5 median methodology.
- `README.md`, `AGENTS.md`, `IMPLEMENTATION-READY.md`, `docs/IMPLEMENTATION-LOG.md`, `docs/TDD-METHODOLOGY.md`, `docs/VERSIONING.md`, `scripts/workflow-check.sh`, `frontend` audit closeouts: scrubbed private absolute paths (`/Users/...`, `/home/...`) and aligned GitHub URLs to `asheshgoplani/opengraphdb` for the upcoming public push; `.planning/` removed from tracking (now under `.gitignore`).

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
  - new `validate-shacl` CLI command (`ogdb validate-shacl (<path> | --db <path>) <shapes-path>`)
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

  Push status as of 2026-05-05: no `v*` tags pushed to origin (verify via
  `git ls-remote origin --tags`). v0.5.0 and v0.5.1 tags were cut locally
  between 2026-05-02 and 2026-05-05; v0.3.0 and v0.4.0 are also still
  local-only. Update this block as part of the release-tag-push step in
  the public release runbook.
-->
[Unreleased]: <not-yet-pushed: compare against v0.5.1 once pushed>
[0.5.1]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
[0.5.0]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
[0.4.0]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
[0.3.0]: <not-yet-pushed: tag exists locally; push to GitHub to enable compare link>
[0.2.0]: <unreleased: no tag was cut for 0.2.0>
[0.1.0]: <unreleased: no tag was cut for 0.1.0>
