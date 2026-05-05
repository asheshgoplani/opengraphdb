# Coverage Audit — 2026-05-05

Pre-launch sweep for **what is NOT tested** (orthogonal to the in-flight `test-sweep-2026-05-05`, which answers "do existing tests pass"). Worktree was a fresh detached checkout off `origin/main` at commit `cfb3d40`.

Method:
- `cargo llvm-cov --summary-only` per shipped library crate (one crate at a time, never `--workspace`).
- `grep` cross-reference of every `Commands::` arm and `handle_*` fn in `crates/ogdb-cli/src/lib.rs` against `crates/*/tests/` to find subcommands with no end-to-end coverage.
- Inventory diff of `scripts/check-*.sh` vs. `scripts/test-check-*.sh` to find gates that have no red-green meta-test.
- Spot-check of 5 random `.claude/release-tests.yaml` entries against the on-disk test files.
- Read of every README/QUICKSTART claim against the test that would catch a regression.
- Read of `scripts/install.sh` against `scripts/test-install-detect-target.sh` for unsimulated install scenarios.

---

## Severity table (top-10, ordered by launch risk)

| # | Finding | Sev | Section |
|---|---|---|---|
| 1 | `ogdb init --agent` end-to-end (the `curl install.sh \| sh` last-mile) has zero integration test — `init_agent::run()` is uncalled by any test, only individual upsert/skill helpers are unit-tested | **BLOCKER** | §1, §6 |
| 2 | `ogdb-import` library crate is at **36.32% line / 38.89% function** coverage — `parse_pdf_sections`, `parse_markdown_sections`, `detect_cross_references` are publicly exported and have **no tests** | **BLOCKER** | §1 |
| 3 | `ogdb-types` library crate is at **65.30% line / 23.81% function** (`32 of 42` functions uncovered). It owns `PropertyValue` + `PropertyMap`, the value type EVERY downstream crate consumes | **HIGH** | §1 |
| 4 | 10 of 24 documented CLI subcommands (`info`, `shell`, `migrate`, `stats`, `metrics`, `create-node`, `add-edge`, `neighbors`, `incoming`, `hop`, `hop-in`, `backup`, `checkpoint`) have **no end-to-end CLI test** — they are reachable only via `readme_cli_listing` (which only checks that they are documented) | **HIGH** | §2 |
| 5 | No e2e test exercises the `curl install.sh \| sh` flow on a clean machine. `test-install-detect-target.sh` only validates the rust-target triple table; nothing actually runs the installer end-to-end | **HIGH** | §3, §7 |
| 6 | No e2e test exercises an MCP roundtrip from a real coding-agent client (Claude Code / Cursor / Aider / Goose / Continue / Codex). `init_agent.rs` ships agent-id branches for all six but only the `claude` MCP-config-write helper is unit-tested | **HIGH** | §3, §6 |
| 7 | 20 of 30 `scripts/check-*.sh` gates have **no red-green meta-test** (`scripts/test-check-*.sh`). Past incidents (cycle-15/16) prove drift here ships dead gates to CI | **HIGH** | §4 |
| 8 | `ogdb-bolt` is at **66.06% line / 69.12% function** — the Bolt v1 server is below the 80% workspace floor; 21/68 functions uncovered. Rare protocol paths (auth failures, packstream edge values) are likely the gap | **MEDIUM** | §1 |
| 9 | `ogdb-ffi` is at **71.37% line / 69.57% function** — `ogdb_open` and `ogdb_last_error` C ABI entry-points are not touched by `ffi_smoke.rs` (only `ogdb_init` is) | **MEDIUM** | §1 |
| 10 | `install.sh` has unhandled scenarios with no test: 32-bit ARM / FreeBSD / Alpine musl, `~/.local/bin` missing + `/usr/local/bin` writable, root-user install, read-only `~/.ogdb`, stale schema on `~/.ogdb/demo.ogdb` | **MEDIUM** | §7 |

Counts: **2 BLOCKER, 5 HIGH, 3 MEDIUM** (no LOW filed; below-the-line gaps elided).

---

## §1 — Rust per-crate coverage

`scripts/coverage.sh` ratchets `--workspace --fail-under-lines 80 --fail-uncovered-lines 5000`. The aggregate stays green because `ogdb-core` (41 297 LOC, well-tested) compensates. **Per-crate**, the picture is uglier:

| Crate | Line cov | Func cov | Verdict |
|---|---:|---:|---|
| ogdb-vector | 98.68% | 100.00% | green |
| ogdb-text | 100.00% | 100.00% | green |
| ogdb-temporal | 100.00% | 100.00% | green |
| ogdb-export | 100.00% | 100.00% | green |
| ogdb-algorithms | 92.50% | 90.00% | green |
| **ogdb-ffi** | **71.37%** | **69.57%** | below floor |
| **ogdb-bolt** | **66.06%** | **69.12%** | below floor |
| **ogdb-types** | **65.30%** | **23.81%** | below floor — only 10 of 42 fns hit |
| **ogdb-import** | **36.32%** | **38.89%** | well below floor |
| ogdb-core | not run (41K LOC, ~12 min llvm-cov compile) | — | implicit-trust per the gate |
| ogdb-cli | not run (cost cap) | — | — |
| ogdb-python / ogdb-node | binding crates, exercised only via `*_smoke` | — | — |

### Lowest-coverage publicly callable functions

Identified by reading `pub fn` declarations + cross-referencing `tests/api_smoke.rs` files:

| # | Function | Crate | Severity | Why |
|---|---|---|---|---|
| 1 | `parse_pdf_sections(data: &[u8])` | ogdb-import | **BLOCKER** | gated behind `document-ingest` feature; doc-to-graph path. No test. |
| 2 | `parse_markdown_sections(text: &str)` | ogdb-import | **BLOCKER** | same path; no test. |
| 3 | `detect_cross_references(sections)` | ogdb-import | **HIGH** | RAG cross-reference detection; no test. |
| 4 | `init_agent::run(opts)` | ogdb-cli | **BLOCKER** | the `ogdb init --agent` end-to-end orchestrator (resolve_db, ensure_demo_db, run_agent×N, start_http_server, render_summary). Zero test calls it. |
| 5 | `ogdb_open(path)` | ogdb-ffi | **HIGH** | C ABI; `ffi_smoke.rs` only exercises `ogdb_init`. Open-existing-DB path is unverified. |
| 6 | `ogdb_last_error()` | ogdb-ffi | **MEDIUM** | C ABI; the only error-channel for FFI consumers; not asserted. |
| 7 | `bolt::perform_handshake(stream)` | ogdb-bolt | **HIGH** | Bolt v1 handshake path; only the size-cap test exercises a slice of the server. |
| 8 | `register_aider_mcp` / `register_continue_mcp` / `register_goose_mcp` / `register_codex_mcp` | ogdb-cli | **HIGH** (×4) | each is a documented agent-id branch in `init_agent.rs`. Only the upsert helpers (file-format) are unit-tested; no test asserts any of these four MCP registrations write a config the agent could parse. |
| 9 | `temporal_filter_matches`, `validate_valid_window` | ogdb-temporal | green (100% covered) | flagged by past cycle-3 H5 incident — now safe. |
| 10 | `handle_create_node`, `handle_add_edge`, `handle_neighbors`, `handle_incoming`, `handle_hop`, `handle_hop_in`, `handle_migrate`, `handle_info`, `handle_stats`, `handle_metrics`, `handle_schema`, `handle_backup`, `handle_checkpoint`, `handle_shell` (all `crates/ogdb-cli/src/lib.rs`) | ogdb-cli | **HIGH** | reachable from `Commands::` dispatch; have NO direct CLI integration test (see §2). Some are touched indirectly via `QueryPlan::*` shell paths. |

**Verdict:** the workspace gate is honest at the aggregate level but masks four crates below floor and ~17 publicly-callable functions with no asserting test.

---

## §2 — CLI subcommand coverage

`documentation/CLI.md` lists 24 subcommands. Cross-referenced against grepped `"<subcmd>"` literal occurrences in every `crates/*/tests/` file:

| Subcommand | Hits in tests | Notes |
|---|---:|---|
| init | 20 | well covered |
| query | 17 | well covered |
| serve | 12 | comprehensive_e2e §9 |
| import | 9 | csv/json/jsonl/streaming |
| export | 8 | csv/json/jsonl |
| metrics | 5 | http_prometheus + comprehensive_e2e |
| schema | 4 | http_static_assets + mcp |
| import-rdf | 4 | rdf_import_edge_type_case + comprehensive_e2e |
| checkpoint | 4 | wal/durability tests |
| validate-shacl | 3 | shacl_validation.rs |
| mcp | 3 | http_mcp + comprehensive_e2e |
| demo | 3 | demo_subcommand + demo_datasets_seed |
| export-rdf | 2 | comprehensive_e2e §6 |
| backup | 2 | comprehensive_e2e |
| **stats** | 1 | only readme_cli_listing — **no E2E** |
| **shell** | 1 | only readme_cli_listing — **no E2E** |
| **neighbors** | 1 | only readme_cli_listing — **no E2E** |
| **migrate** | 1 | only readme_cli_listing — **no E2E** |
| **info** | 1 | only readme_cli_listing — **no E2E** |
| **incoming** | 1 | only readme_cli_listing — **no E2E** |
| **hop-in** | 1 | only readme_cli_listing — **no E2E** |
| **hop** | 1 | only readme_cli_listing — **no E2E** |
| **create-node** | 1 | only readme_cli_listing — **no E2E** |
| **add-edge** | 1 | only readme_cli_listing — **no E2E** |

**10 subcommands have no end-to-end test.** `info`, `shell`, `migrate`, and `stats` are user-visible from the QUICKSTART (`ogdb info ~/.ogdb/demo.ogdb` is literally in the docs at L43). Severity **HIGH** for those four; **MEDIUM** for the graph-manipulation cluster (`create-node`, `add-edge`, `neighbors`, `incoming`, `hop`, `hop-in`) since those paths are also reachable via Cypher and have indirect coverage from the `QueryPlan` dispatch.

`handle_create_node`, `handle_add_edge`, `handle_neighbors`, `handle_incoming`, `handle_hop`, `handle_hop_in`, `handle_migrate`, `handle_info`, `handle_stats`, `handle_metrics`, `handle_schema`, `handle_backup`, `handle_checkpoint`, `handle_shell` are dispatched from `Commands::` arms but **none has a unit test that constructs `argv` and calls `ogdb_cli::run`**. The closest is `comprehensive_e2e.rs` which exercises a subset via `cli_ok(vec!["init", ...])` style invocations.

---

## §3 — Frontend e2e coverage

`frontend/e2e/` has **57 spec files** (the brief said 24 — that count is out of date). Audited the spec list against likely-to-bite launch flows:

### Spec inventory snapshot

- Landing/marketing: `landing.spec.ts`, `landing-nav-links.spec.ts`, `hero-and-getstarted-ctas.spec.ts`, `F4-ai-integration-section.spec.ts`, `showcase-card-hover-tooltip.spec.ts`, `mobile-narrow-viewport.spec.ts`, `eval-cycle1-mobile.spec.ts`, `eval-cycle1-seo.spec.ts`, `polish-cohesion.spec.ts`
- Playground: `playground.spec.ts`, `c9-playground-values.spec.ts`, `cypher-keyboard.spec.ts`, `pg-data-clarity.spec.ts`, `pg-high-fixes.spec.ts`, `pg-high-fixes-probe.spec.ts`, `pg-query-result-summary.spec.ts`, `pg-result-table-light-dark.spec.ts`
- Visual: `obsidian-graph*.spec.ts` (×6), `graph-pan-zoom.spec.ts`, `theme-cycle.spec.ts`, `palette-amber.spec.ts`, `visual-regression.spec.ts`
- Live mode: `live-mode-failures.spec.ts`, `live-empty-db-seed.spec.ts`, `live-sample-roundtrip.spec.ts`, `connection-badge-states.spec.ts`, `empty-db-overlay.spec.ts`, `claims-states.spec.ts`
- Real backend: `claims/power-tab-real-cypher.spec.ts`, `claims/schema-tab-real-backend.spec.ts`, `rdf-import-real.spec.ts`, `rdf-formats.spec.ts`, `cookbook-snippets-runnable.spec.ts`, `migration-guide-snippets.spec.ts`, `reposition/landing-cli-snippets-correct.spec.ts`
- A11y: `a11y-axe-sweep.spec.ts`, `a11y-sweep.spec.ts`, `obsidian-a11y.spec.ts`

### Five most-likely-to-bite-on-launch flows with NO spec

| # | Missing flow | Severity | Why it bites |
|---|---|---|---|
| 1 | **Curl-install → first query** end-to-end on a clean machine. No spec runs `install.sh`, asserts `ogdb` is on `$PATH`, and runs the README's `MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name, m.title LIMIT 5` query. The README literally promises this in 5 minutes; nothing CI-side asserts the promise still holds. | **BLOCKER** | First-touch path of every new user. |
| 2 | **MCP roundtrip from a real Claude Code / Cursor session** against `ogdb mcp --stdio`. `crates/ogdb-cli/tests/http_mcp.rs` covers the HTTP surface and the comprehensive_e2e §10 covers MCP-over-stdio at the transport level, but no test simulates a coding-agent reading the MCP server's `tools/list` and calling `execute_cypher`. The 6-agent matrix (`claude/cursor/aider/continue/goose/codex`) has no end-to-end agent-side verification. | **BLOCKER** | The headline "AI-first" claim. |
| 3 | **`ogdb init --agent` on a fresh agent install** (no existing `.claude.json` / `.cursor/mcp.json`). Only the `upsert_*` helpers are unit-tested with synthetic JSON; the wire-up + skill-bundle drop + background-server start sequence is exercised by **zero** tests. | **HIGH** | The QUICKSTART step-5 promise. |
| 4 | **RDF Turtle import + Cypher query over imported triples** (the QUICKSTART §3-§4 friends.ttl flow). `rdf-import-real.spec.ts` and `rdf-formats.spec.ts` cover upload-via-UI; no spec exercises the CLI flow `ogdb init friends.ogdb && ogdb import-rdf friends.ogdb friends.ttl && ogdb query friends.ogdb "MATCH (a)-[:KNOWS]->(b) RETURN ..."` shown in QUICKSTART L67-L81. `cookbook-snippets-runnable.spec.ts` exercises some HTTP snippets but not this CLI cookbook. | **HIGH** | RDF is the second top-of-readme bullet. |
| 5 | **`ogdb info`/`ogdb stats`/`ogdb schema` against an EMPTY DB** (after `install.sh` + before `ogdb demo`). The QUICKSTART L43 says "you'll see node counts, edge counts, and labels" — but `ogdb info` on a 0-node DB has no test. Empty-DB path is one of the QUICKSTART's explicit "if you skipped demo" branches. | **MEDIUM** | Trivial-looking but it's the first command a user runs. |

The frontend has STRONG coverage for the **playground UI surface** (live mode, visual regression, palette) but THIN coverage for the **shell-out-to-binary** surface that sits between the curl install and the playground first-paint.

---

## §4 — CI gates vs claimed protection

`scripts/` ships **30** `check-*.sh` gates and only **12** `test-check-*.sh` red-green meta-tests (counting `test-check-install-demo-path-matches.sh` and `test-check-opengraphdb-path-coherence.sh` which differ in name from the gate they verify).

### Gates with **no** meta-test

```
check-binary-name.sh
check-binding-readmes.sh
check-bindings-no-handwritten-unsafe.sh
check-crate-metadata.sh                 (covered by test-crate-metadata.sh — fine, name drift only)
check-crate-root-docs.sh
check-deny-expirations.sh
check-design-vs-impl.sh
check-doc-anchors.sh
check-doc-ratchet.sh
check-doc-rust-blocks.sh
check-doc-tests-wired.sh
check-no-advisory-swallow.sh
check-npm-version.sh
check-public-doc-tmp-leak.sh
check-pypi-version.sh
check-rust-toolchain-pin.sh
check-shipped-doc-coverage.sh
check-token-sacred-blue.sh
check-workspace-lint-pins.sh
```

That's **19** structural gates with no proof they fail when violated. `scripts/test-all-check-scripts-wired.sh` proves each gate is **invoked** from `scripts/test.sh` — but invocation ≠ correctness. The cycle-15/16 lesson the codebase already learned (creating gate ≠ wiring gate) has a sibling lesson it has NOT learned: wiring gate ≠ proving gate fails red.

**Severity HIGH** for the gates whose claim is non-trivial: `check-design-vs-impl.sh` (5 separate doc-vs-impl drift checks), `check-doc-anchors.sh` (regex-based symbol resolution), `check-no-advisory-swallow.sh` (workflow-pattern detection), `check-token-sacred-blue.sh` (allowlist enforcement), `check-doc-tests-wired.sh` (CI-step presence).

**Severity MEDIUM** for the rest (mostly version-mirror or path-mirror checks where the claim is mechanical).

I did NOT execute the meta-tests against their gates — `test-sweep-2026-05-05` is the right place to measure pass/fail. This finding is structural: meta-tests don't exist, so the question can't be answered.

---

## §5 — release-tests.yaml drift spot-check

`.claude/release-tests.yaml` has **64** entries. Spot-checked 5 random:

| ID | Claimed test | Exists on disk | Drift? |
|---|---|---|---|
| `baseline-includes-skill-quality` | `crates/ogdb-eval/tests/baseline_includes_skill_quality.rs` | ✓ | no |
| `hnsw-vector-index-acceptance` | `crates/ogdb-core/tests/hnsw_recall_at_10_over_0_95_at_10k.rs` (+ 4 siblings) | ✓ | no |
| `claims-schema-tab-real-backend-e2e` | `frontend/e2e/claims/schema-tab-real-backend.spec.ts` | ✓ | no |
| `ogdb-types-reexport-shim` | `crates/ogdb-core/tests/ogdb_types_reexport_shim.rs` | ✓ | no |
| `multi-iter-median-aggregation` | `crates/ogdb-eval/tests/multi_iter_aggregation.rs` | ✓ | no |

**5/5 pass the existence check.** The manifest-source contract appears intact. I did NOT verify each test's body still asserts the original claim (would require running them all + reading bodies — out of scope for this audit; deferred to `test-sweep-2026-05-05`).

---

## §6 — README + QUICKSTART claim audit

For each user-facing claim, the test that would catch a regression:

| Claim | Test | Verdict |
|---|---|---|
| "Single binary, no Java needed" | implicit (build artifacts) | OK, structural |
| "Built-in agent integration so Claude, Cursor, and other coding assistants can query your graph directly" | `init_agent.rs` unit tests on upsert helpers only | **BLOCKER** — no end-to-end test that wired-up agent can call `tools/list` |
| "Embeds in your app — Rust, Python, Node" | `crates/ogdb-python/tests/test_basic.py`, `crates/ogdb-node/tests/basic.test.js`, `crates/ogdb-ffi/tests/ffi_smoke.rs` | OK |
| `curl ... install.sh \| sh` works | `scripts/test-install-detect-target.sh` (table only) | **HIGH** — no end-to-end install test |
| Drops binary at `~/.local/bin/ogdb` (or `/usr/local/bin/ogdb`) | implicit in install.sh `pick_bin_dir`; not asserted | **MEDIUM** — `pick_bin_dir` precedence has no test |
| `ogdb demo` loads MovieLens + opens playground | `demo_subcommand.rs::demo_seeds_into_existing_empty_init_file` | OK |
| `ogdb init --agent --agent-id <claude\|cursor\|aider\|continue\|goose\|codex>` | upsert helpers tested for Claude format only | **HIGH** — Cursor/Aider/Continue/Goose/Codex MCP-config-write paths untested |
| `ogdb query <db> "<cypher>"` returns rows | comprehensive_e2e §4, http_post_query_accepts_unwind, http_post_bare_return | OK |
| RDF: Turtle, N-Triples, RDF/XML, JSON-LD, N-Quads imported | `rdf-formats.spec.ts` covers upload UI; CLI path covered by `rdf_import_edge_type_case.rs` for one format | **MEDIUM** — only Turtle has a CLI-level test; the other 4 formats are upload-UI-only |
| Cypher / openCypher | extensive (every test file in ogdb-core hits the parser/planner) | OK |
| Vector search built in | `hnsw_recall_at_10_over_0_95_at_10k.rs` + 4 siblings | OK |
| Full-text search | comprehensive_e2e §7 | OK (light) |
| RDF import/export | one test each direction | OK (light) |
| Snapshot transactions with crash recovery | `wal_replay_preserves_committed_labels_across_simulated_power_loss.rs` | OK |
| Embedded web playground from same binary | `http_static_assets.rs` | OK |
| `ogdb serve --http` listens on port 8080 | comprehensive_e2e §9 picks ephemeral port; port-8080 default not asserted | **MEDIUM** — port default could silently change |
| MCP tool count (20 tools registered) | grep of `"name":` in `lib.rs` MCP block returns 20 — but no test asserts the count | **MEDIUM** — drop-a-tool-by-accident is silently undetectable |

**The biggest README→test gap is the agent integration claim.** It's the headline differentiator and the test surface is the thinnest.

---

## §7 — install.sh fresh-machine simulation

`scripts/test-install-detect-target.sh` is a table-driven test of `detect_target()` for the 5 supported (uname -s, uname -m) pairs. It does **not** exercise:

| Scenario | Behavior in install.sh today | Severity | Mitigation |
|---|---|---|---|
| 32-bit ARM Linux (`armv7l`, `armhf`) | `unsupported linux arch: $arch` → exit 1 | LOW | clear error; users on raspberry-pi-32 are not the target audience |
| FreeBSD / OpenBSD | `unsupported os: $os` → exit 1 | LOW | clear error |
| Alpine musl (`x86_64-unknown-linux-musl`) | resolves to `x86_64-unknown-linux-gnu` archive → glibc-linker mismatch at runtime | **HIGH** | binary downloads but fails at first glibc symbol; no test catches this |
| `$HOME/.local/bin` doesn't exist + `/usr/local/bin` not writable | `mkdir -p "$bin_dir"` creates `~/.local/bin`; PATH-not-already-containing branch fires | LOW | handled, untested but safe |
| `$HOME/.local/bin` writable + `/usr/local/bin` ALSO writable | `pick_bin_dir` picks `/usr/local/bin` first (the `[ -w /usr/local/bin ]` check) | **MEDIUM** | undocumented precedence; user expecting `~/.local/bin` (per README) may end up with the binary in `/usr/local/bin`. No test pins this. |
| `~/.ogdb/demo.ogdb` already exists with stale schema | `bootstrap_demo` skips `ogdb init` if file exists; later `ogdb init --agent` may try to open and fail | **HIGH** | upgrade path is unverified — `upgrade_fixture_v0_5_0_opens_on_current.rs` exists but only for `0.5.0→current`, not for arbitrary stale schemas |
| `~/.ogdb` is a read-only filesystem | `mkdir -p` fails silently because of `set -eu`; install aborts mid-flow | **MEDIUM** | error surfaces but with a confusing message; no test |
| User runs `install.sh` as root | `pick_bin_dir` picks `/usr/local/bin`; `bootstrap_demo` writes `~/.ogdb` to `/root/.ogdb`; then `ogdb init --agent` tries to wire **root's** `.claude.json` (probably absent) — silent no-op for the user's actual agent | **HIGH** | undocumented; no `[ "$EUID" -eq 0 ]` check; no test |
| User has corporate proxy / no DNS for `github.com` | `download` uses `--fail`; surfaces 4xx/curl-error correctly | LOW | already handled by cycle-19 fix; ok |
| User runs with `OGDB_VERSION=v0.99.99` (nonexistent) | `download` 404s → exit 1 | LOW | already handled by cycle-18 fix; ok |
| `gh` available but unauthenticated | falls through to curl-API path | LOW | already handled |

**Severity HIGH on three:** Alpine musl (binary downloads, fails at runtime), root-user install (silently breaks agent wiring), stale `~/.ogdb` schema (no upgrade path test for non-adjacent versions).

`scripts/test-install-detect-target.sh` should be paired with a `scripts/test-install-bin-dir-precedence.sh` and a `scripts/test-install-root-user-refuses.sh` (or better: install.sh refuses to run as root with a clear `please don't run me as root` message).

---

## Recommended pre-launch fixes (priority order)

1. **Add `init_agent::run()` integration test.** Spawn `ogdb init --agent --agent-id <each-of-6>` against a tmpdir-scoped `$HOME`, assert each agent's MCP config file exists with the expected JSON shape, assert the skill bundle dropped to the expected path, assert the background server is reachable on `127.0.0.1:8765/health`. Closes finding #1, #6.
2. **Add `parse_pdf_sections` + `parse_markdown_sections` + `detect_cross_references` tests** in `crates/ogdb-import/tests/api_smoke.rs`. Closes finding #2.
3. **Add a `crates/ogdb-cli/tests/cli_subcommand_smoke.rs`** that smoke-tests every subcommand with `--help` (catches argv-parse drift) and a happy-path invocation for `info`/`stats`/`schema`/`shell`/`migrate`/`backup`/`checkpoint`/`create-node`/`add-edge`/`neighbors`/`incoming`/`hop`/`hop-in`. Closes finding #4 + half of #10.
4. **Add a Docker-based `scripts/test-install-end-to-end.sh`** that runs `install.sh` in a clean alpine + ubuntu + debian container, asserts `ogdb --version` returns the right tag, runs the README's MovieLens query. Closes findings #5, #10 (musl + root + stale schema can be added as additional containers).
5. **Add red-green meta-tests for the 19 unmetatested gates.** Top 3 by impact: `check-design-vs-impl.sh`, `check-doc-anchors.sh`, `check-no-advisory-swallow.sh`. Closes finding #7.
6. **Add an MCP-tool-count assertion test:** scan `crates/ogdb-cli/src/lib.rs` for `"name":` entries inside the `tools/list` response block and assert `count == 20` so a tool can't silently drop. Pins the README "20 tools" implicit claim.

These six together close all BLOCKER + 4 of 5 HIGH findings, and would consume ~1-2 days of focused work before a public launch.
