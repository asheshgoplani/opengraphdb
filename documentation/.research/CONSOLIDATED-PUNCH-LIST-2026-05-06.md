# Consolidated Punch List — 2026-05-06

Synthesis of six parallel audits against `origin/main` @ `23e8327` (v0.5.1):

| Source branch | Report | Lens |
|---|---|---|
| `audit/rust-2026-05-06` | `audit-rust-2026-05-06.md` | Per-crate build/test/clippy + architecture |
| `audit/frontend-2026-05-06` | `audit-frontend-2026-05-06.md` | Lint/vitest/Playwright/bundle/tokens |
| `audit/docs-2026-05-06` | `audit-docs-2026-05-06.md` | README/SKILL/SPEC/DESIGN/MIGRATION honesty |
| `audit/eval-2026-05-06` | `audit-eval-2026-05-06.md` | CI gates / meta-tests / release-tests manifest |
| `audit/stab-vs-peers-2026-05-06` | `audit-stability-vs-peers-2026-05-06.md` | Maturity vs claude-code/codex/anthropic-sdk-python/neo4j-go-driver/cozo |
| `audit/system-architect-2026-05-06` | `audit-system-architect-2026-05-06.md` | Layer map / invariants / evolvability / risks |

---

# I. EXECUTIVE SUMMARY

**State of the project (2026-05-06).** OpenGraphDB v0.5.1 is structurally a 4.3/5 mature pre-1.0 project. The product thesis (single-binary embedded multi-modal graph engine, agent-first via MCP) holds end-to-end at the system boundary, and the durability invariants (WAL replay, schema upgrade, single-writer) are defended with real tests. The repo is also unusually honest for its stage: `verify-claims.yml`, BENCHMARKS publishing `LOSS` rows vs Neo4j, and three structural drift gates put it ahead of every surveyed peer on docs honesty. **The cracks are concentrated in two places**: (a) the kernel is two giant files (`ogdb-core/src/lib.rs` at 41,297 LOC and `ogdb-cli/src/lib.rs` at 17,480 LOC) hosting most of the database, with the "split crates" being thin data-only facades; and (b) the **first thing a user copy-pastes from the README returns zero rows**, and several of the next things they reach for (SKILL.md, MIGRATION, COOKBOOK Recipe 3, WordNet recipe) tell them to run Cypher that does not parse. The CI quality job is also currently RED on `main` (dead-gate sentinel test), and the npm wrapper ships at v0.4.0 against a v0.5.1 binary. None of this is structurally unsafe; all of it is closeable in the order below.

## Top 5 immediate actions (highest leverage, < 4hr each)

1. **Flip the `dead-gate sentinel` test from RED→GREEN expectation** in `scripts/test-check-frontend-node-api-surface.sh:223-248` to match the gate contract from commit `966045d`. **Unblocks CI quality job on `main`.** [rust §A]
2. **Bump `npm/cli/package.json` from 0.4.0 → 0.5.1.** `check-npm-version.sh` is currently failing on `main`; install path 4 (`npx @opengraphdb/cli init --agent`) ships stale code. [docs HIGH-3, eval Top-10 #3]
3. **Fix the README MovieLens flagship query (B1).** Either repair label-pattern matching against the seeded `~/.ogdb/demo.ogdb`, or change the README headline to a query that actually returns rows after `ogdb demo`. This is the literal first thing every user runs. [docs B1]
4. **Repair SKILL.md (B3) — drop or fix `serve --mcp` (line 117), the broken aggregation example (170-171), the `agent_store_episode` schema (247), and the UNION/EXISTS claims (149).** Every Claude/Cursor session loads this file into context. [docs B3]
5. **Fix the two clippy errors.** `cast_sign_loss` at `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74` and `redundant_closure` at `crates/ogdb-eval/src/drivers/common.rs:201`. Both 1-line. **Unblocks `cargo clippy --all-targets -- -D warnings` per crate.** [rust §B]

## Top 3 v1.0-blocking structural items

1. **Split `crates/ogdb-core/src/lib.rs` (41,297 LOC) into ~10 modules** — same crate, same exports, same Cargo.toml. Pre-req for every other architectural improvement (replication, alternate indexes, alternate query languages). [rust #1, sysarch Win 1, eval #5 file-size-gate]
2. **Extract `ogdb-server` crate from `ogdb-cli/src/lib.rs` (17,480 LOC).** Bindings (`ogdb-ffi`, `ogdb-python`, `ogdb-node`) currently `use ogdb_cli::run as run_cli;` — they consume the binary's lib crate; that's the layering smell. CLI + bindings + HTTP + MCP + Bolt frontend should all consume a leaf `ogdb-server`. [rust #2, sysarch Win 3]
3. **Decide the SI claim, then enforce it.** Index scans currently leak past `Snapshot::can_see_version` (pinned by `tests/index_scan_phantom_read_caveat.rs`). Either upgrade `find_nodes_by_label`-class APIs to be snapshot-aware (requires `trait Index`, sysarch Win 2), or downgrade marketing copy to "row-level SI; index queries see committed data." Today's "documented caveat" form will become a CVE-flavored bug report once production users hit it. [sysarch Risk 2]

## Bus factor / one critical fix that compounds

**The 41k-line `ogdb-core/src/lib.rs` is the single highest-leverage compounding risk.** Every other refactor (replication, alternate vector backend, snapshot-aware indexes, language-agnostic plan IR, performance work) starts with "first, refactor lib.rs." The cycle-1/cycle-2/cycle-3 HNSW-rebuild-gate progression is evidence of this — three patches in a single function that should be a method on a `trait VectorIndex`. Splitting the file does not change behavior, ABI, or performance, but it converts every subsequent architectural improvement from "a quarter" into "a sprint." `DESIGN.md` §1 already admits the gap in writing; the fix has not yet landed. **One engineer, ~2 weeks, no risk if done as a pure file move first.**

---

# II. CONSOLIDATED FINDINGS

Sorted by severity (BLOCKER → HIGH → MEDIUM → LOW), then by fix-effort ascending within each tier. Cross-audit overlaps deduplicated; multi-source cites listed in `Audit-Source`.

| ID | Severity | Audit-Source | Title | Evidence (file:line) | Fix effort | Fix sketch |
|---|---|---|---|---|---|---|
| C-1 | BLOCKER | rust §A | CI quality job RED on `main` — dead-gate sentinel test contradicts new green-outcome contract | `scripts/test-check-frontend-node-api-surface.sh:223-248` vs `scripts/check-frontend-node-api-surface.sh:515-525` (`966045d`) | <30 min | Flip RED→GREEN expectation; replace `grep -q "scanned 0"` with `grep -q "no marketing snippets reference"`. |
| C-2 | BLOCKER | docs B1 | README's flagship MovieLens query returns 0 rows against the README's own demo DB | `README.md:71-75`; `MATCH (n) RETURN labels(n)` returns null after `ogdb demo` | <1 hr (doc) / 4-8 hr (code) | Pick a verified-passing seed query (e.g. friends-graph QUICKSTART pattern) for the headline, OR diagnose why label-pattern matches against MovieLens seed return null. |
| C-3 | BLOCKER | docs B2 | Binary identity drift — `ogdb` vs `opengraphdb` in `--help` text + dead repo URL footer | `cargo run -p ogdb-cli -- --help` (clap `name`/`after_help`); README/docs use `ogdb`; footer points at `openGraphDB/openGraphDB` (capitalised) | 30 min | Set clap `bin_name = "ogdb"` everywhere; replace `after_help` URL with `asheshgoplani/opengraphdb`. |
| C-4 | BLOCKER | docs B3 | SKILL.md teaches Claude/Cursor agents APIs that don't exist | `skills/opengraphdb/SKILL.md:117` (`serve --mcp` invalid flag); `:170-171` (ORDER BY uses RETURN alias — semantic err); `:247` (`agent_store_episode` wrong schema vs `crates/ogdb-cli/src/lib.rs:3035`); `:149` (UNION/EXISTS claimed; both `unsupported query`) | 1 hr | Replace each broken example with a verified equivalent; add `scripts/check-skill-cypher-runs.sh` so SKILL examples are executed against a fixture in CI. |
| C-5 | BLOCKER | docs B4 | MIGRATION-FROM-NEO4J + COOKBOOK Recipe 6 document `CALL vector.create_index(...)` / `CALL text.create_index(...)` — `CALL` is not implemented | `documentation/MIGRATION-FROM-NEO4J.md:219`; `documentation/COOKBOOK.md` Recipe 6; CLI + HTTP both return `unexpected token while parsing clause at line 1, column 1` | 30 min (doc) | Replace the OGDB column with the actual MCP / HTTP DDL surface users must take. Don't promise `CALL` until it ships. |
| C-6 | BLOCKER | docs B5 | CHANGELOG `[Unreleased]` already shipped in v0.5.1 (14 bullets including the v0.4.0→0.5.1 BENCHMARKS sweep) | `CHANGELOG.md:8-29` | 30 min | Move shipped entries into `[0.5.1]`; cut a `[0.5.2]` section if there is truly something pending; otherwise leave Unreleased empty. |
| C-7 | BLOCKER | docs B6 | BENCHMARKS.md mislabels the measurement commit's version as 0.4.0; the SHA `1afcee3` is **45 commits past `v0.4.0`** and is contained by `v0.5.0` + `v0.5.1` | `documentation/BENCHMARKS.md` (top-of-doc claim "zero perf-relevant code changed"); `git log v0.4.0..v0.5.1 -- crates/ogdb-core` returns 49 commits | 1 hr (relabel) / 4 hr (re-run) | Either re-label "pre-0.5.0 N=5" and drop the "carried forward" framing, OR re-run N=5 at `git rev-list -n 1 v0.5.1` and republish. |
| C-8 | BLOCKER | frontend #1 | `npm run build:marketing` race — `vite-plugin-compression` brotli pass ENOENTs on `react-vendor-*.js.br` mid-build despite reporting success | `e2e/build-targets.spec.ts:26`; reproducible | 1-3 hr | Audit plugin config; ensure brotli runs in `closeBundle`/`writeBundle` (not parallel with consumer). Pin known-good version, OR migrate to `vite-plugin-compression2`. |
| H-1 | HIGH | rust §B + eval B.8 + docs HIGH-3 | npm `@opengraphdb/cli` ships v0.4.0 against v0.5.1 binary; `check-npm-version.sh` is RED on `main` | `npm/cli/package.json:3`; workspace `Cargo.toml:24` | 5 min | One-line bump. |
| H-2 | HIGH | rust §B | Two clippy errors block strict-mode contributors | `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74` (`cast_sign_loss`); `crates/ogdb-eval/src/drivers/common.rs:201` (`(1..=100).map(\|i\| f64::from(i))` → `.map(f64::from)`) | 5 min | One-line fixes per site. |
| H-3 | HIGH | docs HIGH-1 | 37 Cypher snippets use SQL `-- comment`; OGDB only accepts `// comment` | `DESIGN.md` (12), `SPEC.md` (11), `skills/opengraphdb/SKILL.md` (7), `skills/opengraphdb-v2/SKILL.md` (7) | 15 min | Mechanical sweep `s/^-- /\/\/ /g` inside ` ```cypher ` fences. Add gate scanning fenced blocks. |
| H-4 | HIGH | docs HIGH-2 | Three different ports for the playground across three docs | `README.md:103` (8080); `documentation/QUICKSTART.md:14` (8080); `scripts/install.sh:188-193` banner (`OGDB_PORT=8765`) | 15 min | Pick one default; install banner is what user sees first — either change docs to 8765 or change default to 8080 in `install.sh`. |
| H-5 | HIGH | docs HIGH | `ogdb reindex` documented in present tense as recovery fallback; subcommand does not exist | `DESIGN.md:1312`; `ogdb --help` lists no such subcommand | 15 min | Either delete the doc reference or stub the subcommand. |
| H-6 | HIGH | rust §C-7 + frontend (env-coupled F5/F6/RDF) | `ogdb-cli` HTTP static-asset tests panic when SPA isn't pre-built (placeholder vs real `<div id="root">`) | `crates/ogdb-cli/tests/http_static_assets.rs:188` | 30 min | Detect placeholder body and `return Ok(())` early, OR feature-gate on `cfg(feature="spa-built")`. |
| H-7 | HIGH | frontend #4 | E2E real-backend specs hardcode :8080 and refuse to attach to unknown server — collides with anything else on the port | `e2e/_helpers/serve-fixture.ts:34`; 5 of 8 e2e fails are this | 1 hr | Fixture asks OS for ephemeral port (`port: 0`, read `address().port`), passes through to `ogdb serve --port`, propagates to test fetches. |
| H-8 | HIGH | frontend #3 | Visual regression baseline stale — landing AI section snapshot 2198px, current render 1415px | `e2e/visual-regression.spec.ts:146` | 30 min (rebaseline) / 2 hr (root-cause) | Diff the section vs snapshot; if intentional condense, `--update-snapshots`. If CSS regression, find structural change. |
| H-9 | HIGH | docs HIGH | COOKBOOK Recipe 3 response shape fabricated — claims `{document_id, entities_extracted, edges_extracted, duration_ms}`; live: `{content_count, document_node_id, reference_count, section_count, text_indexed, vector_indexed}` (zero overlap). Same recipe documents `[[2]]` rows; live shape is `[{"c":3}]`. | `documentation/COOKBOOK.md` Recipe 3; live `/rag/ingest` + `/query` | 1 hr | Rewrite recipe to live shape; add a snapshot test against the live envelope in `verify-claims.yml`. |
| H-10 | HIGH | docs HIGH | WordNet recipe 3 of 5 example queries fail (variable-length `*1..15`, `MATCH p =`, undirected `(:Synset)-[…]-(:Synset)`) | `documentation/recipes/wordnet-traversal.md:43,56,65` | 1-2 hr | Replace with running queries against the actual WordNet TTL fixture; add to verify-claims gate. |
| H-11 | HIGH | docs (architectural-doc contradictions) + sysarch G | SPEC.md vs ARCHITECTURE.md vs Cargo.toml disagree on vector backend, async runtime, compression | SPEC §13.1 USearch ↔ ARCHITECTURE §12 + code = `instant-distance`; SPEC §4.1 "tokio" ↔ no tokio dep; SPEC §4.2 "LZ4" ↔ only `zstd` in tree; SPEC §10 Bolt v1 "Shipped" ↔ DESIGN §25 v4/v5 "v0.6.0" | 1-2 hr | Treat code as ground truth; rewrite SPEC §4.1, §4.2, §10, §13.1 to match. Add `scripts/check-spec-vs-cargo.sh` gate enumerating named deps from SPEC and asserting presence in `Cargo.lock`. |
| H-12 | HIGH | eval Top-10 #1 | No repo-wide token-leak gate — only frontend scoped. `crates/`, `scripts/`, `.claude/`, `documentation/`, fixtures/ never scanned for `sk-…`/`ghp_…`/`AKIA…`/`xoxb-`/`-----BEGIN ` | `frontend/scripts/check-token-leaks.sh` exists and is GREEN; nothing else | 30 min | New `scripts/check-token-leaks.sh` with broad scope; pair red+green meta-test. |
| H-13 | HIGH | eval Top-10 #2 | No claude-attribution gate — global CLAUDE.md forbids `🤖`/`Co-Authored-By: Claude`/`Generated with Claude` in commits and tracked files; nothing enforces it | none | 20 min | `scripts/check-claude-attribution.sh`: `git log --all --grep` + `git ls-files \| xargs grep -lE`. |
| H-14 | HIGH | eval Top-10 #5 + rust #1 + sysarch Win 1 | No file-size gate; `ogdb-core/src/lib.rs` at 41,297 LOC accumulates silently | `crates/ogdb-core/src/lib.rs` (41,297 lines, 148 types, 1,084 fns) | 30 min (gate) | `scripts/check-file-size.sh` with cap (e.g. 8,000 lines on `*.rs`); pair meta-test. Trips immediately, forces split. |
| H-15 | HIGH | rust #6 + sysarch | No musl target in `release.yml` — released `ogdb` is glibc-linked, breaks on AL2 / CentOS 7 / Alpine | `target/release/ogdb` "dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2" | 1-2 hr | Add `x86_64-unknown-linux-musl` + `aarch64-unknown-linux-musl` matrix rows to `.github/workflows/release.yml`. |
| H-16 | HIGH | stab D-1 | `aarch64-unknown-linux-gnu` not in PR-time `cross-platform-build` matrix — caught only at release-tag time | `.github/workflows/ci.yml` `cross-platform-build` job (`macos-latest, windows-latest` only) | 30 min | One YAML entry; `cross` is already a release-time dep. |
| H-17 | HIGH | stab D-2 | Continuous fuzzing infrastructure exists but never runs — `ogdb-fuzz/fuzz_targets/{fuzz_cypher_parser,fuzz_wal_record_reader}.rs` dormant on shared infra | `crates/ogdb-fuzz/fuzz/` | 1-2 hr | Add `.github/workflows/fuzz.yml` cron: `cargo +nightly fuzz run <target> -- -max_total_time=600` per target/night; report crash to issue. WAL-replay fuzzing is the highest-severity correctness debt (rust #10). |
| H-18 | HIGH | rust #3 | Six seed crates ship runtime kernels with **zero in-crate tests** — `ogdb-algorithms` (Louvain/Leiden/label-prop), `ogdb-import` (parse_pdf_sections, parse_markdown_sections), `ogdb-vector`, `ogdb-text`, `ogdb-temporal`, `ogdb-export` validated only transitively | `crates/ogdb-algorithms/`, `crates/ogdb-import/`, etc. | 4-8 hr per crate | Land proptest invariants on the pure helpers (adjacency-monotone for label-prop, idempotence for `chunk_content`). |
| H-19 | HIGH | eval A-3 + #9 | Six untested HTTP/Bolt endpoints | Bolt `MSG_PULL_ALL` (0x3F), Bolt `MSG_ACK_FAILURE` (0x0E), HTTP `POST /backup`, HTTP detailed `/metrics`, HTTP `POST /schema/evolve`, HTTP `DELETE /indexes/*` | 2-3 hr | One smoke per endpoint in `crates/ogdb-bolt/tests/` and `crates/ogdb-cli/tests/http_*.rs`. |
| H-20 | HIGH | eval A-1 | `vector_search` public fn has zero callsites in embedded test module | `crates/ogdb-core/src/lib.rs:12430` | 1-2 hr | Add direct callsite tests against a fixture index. |
| H-21 | HIGH | eval Top-10 #6 | Six pass-only meta-tests — no planted-fixture failure case, only green-path enforcement | `test-check-benchmarks-version.sh`, `…contributing-coverage-claim`, `…followup-target-not-current`, `…install-demo-path-matches`, `…opengraphdb-path-coherence`, `…security-supported-version` | ~10 min × 6 = 1 hr | Plant red-fixture per gate. |
| H-22 | HIGH | rust #4 | Single `Arc<RwLock<Database>>` is read/write contention point — every compaction, Cypher write, snapshot serialises through one `RwLock` | `crates/ogdb-core/src/lib.rs:8933,8957,8983,9017,9428,10028` | weeks | Shard by store (catalog vs nodes vs edges vs WAL), or move property-store under its own lock. **Structural — Phase C.** |
| H-23 | HIGH | sysarch Risk 2 | Snapshot Isolation is row-level only; index scans (`find_nodes_by_label`) leak past `Snapshot::can_see_version` | `crates/ogdb-core/tests/index_scan_phantom_read_caveat.rs` (pins the wrongness) | weeks | Either upgrade indexes to be snapshot-aware (requires `trait Index`), or downgrade marketing to "row-level SI; index queries see committed data." **Phase C.** |
| H-24 | HIGH | sysarch Risk 3 + Win 2 | No language-agnostic logical-plan IR; `LogicalPlan`/`PhysicalPlan` are openCypher-shaped; planner reaches into `Database` fields directly (no `trait Catalog`) | `crates/ogdb-core/src/lib.rs:3149` (`plan_match_clause`), `:13947` (`execute_physical_plan_batches`) | weeks | Extract `trait Index` / `trait VectorIndex` / `trait FullTextIndex`; route `commit_txn` through registered indexes. **Phase C.** |
| H-25 | HIGH | rust #2 + sysarch Win 3 | `ogdb-cli/src/lib.rs` is 17,480 LOC bundling argv, HTTP server, MCP dispatcher, RDF I/O, static-asset embedder, REPL; bindings depend on it | `crates/ogdb-cli/src/lib.rs` (`use ogdb_cli::run as run_cli;` in ffi/python/node) | weeks | Extract leaf `ogdb-server` crate; CLI + bindings consume it. **Phase C.** |
| H-26 | HIGH | frontend #2 | `cypher-grammar-vendor` chunk = 1.6 MB **gzipped** — biggest cold-load liability for `/playground` | `dist-app/assets/cypher-grammar-vendor-*.js` | 1-2 days | Inventory `@neo4j-cypher/language-support` exports actually used; swap for `@codemirror/lang-cypher` (~50 KB) or lazy-load on first focus. |
| M-1 | MEDIUM | rust #5 | First-time `cargo publish --dry-run` order undocumented — fails because path-deps aren't on crates.io yet | `cargo publish --dry-run -p ogdb-types` → "no matching package named `ogdb-vector`" | 30 min | Bake working order (`ogdb-vector → ogdb-types → … → ogdb-node`) into `scripts/release.sh` or `xtask publish-all`. |
| M-2 | MEDIUM | docs OBSERVATIONS | One dead internal link to `.gitignore`'d directory | `scripts/competitor-bench/README.md:4` → `../../documentation/.planning/neo4j-comparison/PLAN.md` | 5 min | Either commit the plan or rewrite the link. |
| M-3 | MEDIUM | docs OBSERVATIONS | CHANGELOG compare-link footer says `<not-yet-pushed: tag exists locally...>` for v0.5.1/v0.5.0 even though `gh release list` confirms both pushed | `CHANGELOG.md:634-640` | 5 min | Replace placeholder with real GitHub compare URLs. |
| M-4 | MEDIUM | docs OBSERVATIONS | `ogdb demo` is silent for 10-25s; combined with B1 the user has no way to tell broken-vs-loading | `crates/ogdb-cli/src/lib.rs` `handle_demo` | 30 min | Print `loading MovieLens (8019 nodes, 1981 edges)…` and a completion banner. |
| M-5 | MEDIUM | frontend #7 | No `typecheck` script in `package.json` — every audit / contributor uses magic `npx tsc -b` | `frontend/package.json` | 2 min | Add `"typecheck": "tsc -b"`. |
| M-6 | MEDIUM | frontend #6 | App entry `index-*.js` at 168 KB gzip; trending toward 200 KB alarm line | `dist-app/assets/index-*.js` | 1 hr | Wire `size-limit` (or small custom) bundle-budget gate at ~180 KB gzip on the entry. |
| M-7 | MEDIUM | rust #7 | `ogdb-cli` HTTP static-asset tests train contributors to ignore RED — 2/14 SPA-static-asset tests panic on every fresh `cargo test -p ogdb-cli` | `crates/ogdb-cli/tests/http_static_assets.rs:188` | 30 min | See H-6 — same fix. |
| M-8 | MEDIUM | rust #8 | `must_use_candidate` / `cast_lossless` ratchet schedule lives in eval prose, not in code | `Cargo.toml` workspace lints | 30 min | Pin a deadline comment + linkable tracking issue; or implement a `xtask ratchet --enforce` step in CI. |
| M-9 | MEDIUM | eval Top-10 #4 | Three independent version-drift gates can each silently pass while the others are red; no all-sources-must-match master | `check-npm-version.sh`, `check-pypi-version.sh`, `check-benchmarks-version.sh` | 1 hr | One master gate walking Cargo workspace, `frontend/package.json`, `.claude-plugin/plugin.json`, `npm/*/package.json`, `bindings/*/Cargo.toml`, `crates/ogdb-python/pyproject.toml`. |
| M-10 | MEDIUM | eval Top-10 #8 | Path-leak gate scoped only to `documentation/` for `/tmp/*.md`; `/Users/<name>` and `/home/<name>` not scanned anywhere | `scripts/check-public-doc-tmp-leak.sh` | 30 min | Extend to `crates/`, `scripts/`, `frontend/src/`, `Dockerfile`; add `/Users/<name>` + `/home/<name>` patterns. |
| M-11 | MEDIUM | eval Top-10 #10 + claude-code peer | Third-party GitHub Actions pinned to `@v4`-style tags, not SHAs (supply chain) | `.github/workflows/*.yml` | 1 hr | Pin all to SHA; add `scripts/check-action-pins.sh` rejecting non-SHA `uses:` outside allowlist. Add `production-release` GitHub Environment with manual-approval reviewer on `release.yml` + `release-skill.yml`. |
| M-12 | MEDIUM | eval Top-10 #7 + anthropic-sdk-python peer | No public-API breaking-change detector across 6 surfaces (Rust + Python + Node + HTTP + Bolt + MCP) | none | 3-4 hr | `cargo public-api --diff` vs base; `pyright --outputjson` symbol diff for `crates/ogdb-python`; `.d.ts` diff for `npm/cli`. Critically check out the base version of the detector script itself. |
| M-13 | MEDIUM | stab D-3 | Manual release ritual is 4-releases-in-14-days fragile (hand-curate CHANGELOG, hand-bump package.json + Cargo.toml + plugin.json, hand-tag) | none | 1 day | Migrate to release-please (`.release-please-manifest.json` + `release-please-config.json` + `release-please.yml`); existing `release.yml` keeps firing on `v*` tag. |
| M-14 | MEDIUM | stab D-5 | No cross-binding TestKit-style acceptance harness — divergence risk: a query that succeeds via HTTP could fail via FFI silently | `bindings/c`, `bindings/go`, `crates/ogdb-{python,node}` each test in isolation | 1-2 weeks | YAML test corpus + Python harness driving each surface against the same expected-shape; nightly job. |
| M-15 | MEDIUM | stab D-4 | No Homebrew tap or WinGet manifest — the "I want to brew install it" funnel is a real adoption friction | none | 1-2 days | `asheshgoplani/homebrew-opengraphdb` Formula referencing existing release tarballs; WinGet yaml PR to `microsoft/winget-pkgs`. |
| M-16 | MEDIUM | docs OBSERVATIONS | ogdb-core `#![warn(missing_docs)]` paired with `#![allow(missing_docs)]` and self-declared "CYCLE4-DOC-RATCHET: 290 pub items remain undocumented" | `crates/ogdb-core/src/lib.rs` | 2-3 weeks | No dedicated public-API reference for embed users; docs.rs/ogdb-core renders signature-only wall. |
| M-17 | MEDIUM | sysarch C #4 | RDF whole-graph round-trip "vibes" — only edge-IRI verbatim preservation tested, no whole-graph TTL→TTL→diff | `crates/ogdb-cli/tests/rdf_import_edge_type_case.rs` | 1 day | Add whole-graph round-trip test ignoring blank-node renaming. |
| M-18 | MEDIUM | sysarch C #7 | TCK floor "50–55% Tier-1" is aspirational, not a CI gate — shipped harness has 9 scenarios | `crates/ogdb-tck/tests/fixtures/tier1/` (9 .feature files); `skills/opengraphdb/references/cypher-coverage.md:46` | weeks | Either gate the published number, OR drop the claim from SPEC §8.1 + ARCHITECTURE §11. |
| M-19 | MEDIUM | frontend #5 | `rdf-import-real.spec.ts` reports `ogdb serve exited before healthy (code=1)` instead of port-cause diagnostic | `e2e/rdf-import-real.spec.ts:90` | 30 min | Capture stderr from spawned `ogdb serve` and include in rejection message. |
| M-20 | MEDIUM | docs OBSERVATIONS | DESIGN.md is 2,550 lines with several inline "Reality check (0.4.0)" retrofits — reads as project archaeology | `DESIGN.md:60-83, 1570-1608, 2168-2180` | 1 day | Fold history into a "Decisions retired" appendix; ~30% shrink. |
| L-1 | LOW | frontend #8 | `StatusBar.tsx` uses `shadow-[0_0_6px_#34d399]` (raw hex inside Tailwind arbitrary value) — bypasses the design-token boundary | `frontend/src/components/.../StatusBar.tsx` | 5 min | Replace with `shadow-[0_0_6px_hsl(var(--success-glow))]`; add var to `index.css`. |
| L-2 | LOW | frontend #9 | `index.css` two `linear-gradient(180deg, #67e8f9 0%, #22d3ee 100%)` literals duplicated | `frontend/src/index.css` | 5 min | Extract `--shimmer-from`/`--shimmer-to`. |
| L-3 | LOW | frontend #10 | `HeroGraphBackground.tsx` falls back to `'#888'` when `PALETTE[0]` is undefined (dead branch) | `frontend/src/components/.../HeroGraphBackground.tsx` | 2 min | Drop `?? '#888'` (PALETTE is non-empty by construction). |
| L-4 | LOW | docs OBSERVATIONS | `id(n)` returns `string:null` silently rather than erroring | runtime | 1 hr | Either error or document; agents won't notice today. |
| L-5 | LOW | docs OBSERVATIONS | Variable-length `[*1..3]` works on simple chains but `[*2]` doesn't | `documentation/BENCHMARKS.md` §2.2 footnote | 2-4 hr | Add focused gate covering the matcher inconsistency. |

---

# III. CROSS-CUTTING THEMES

Three themes where multiple audits independently surfaced related issues — each reinforces the others.

## Theme 1 — Two files contain 60k of the 70k Rust LOC (rust + sysarch)

Both audits independently identified `ogdb-core/src/lib.rs` (41,297 LOC) and `ogdb-cli/src/lib.rs` (17,480 LOC) as the top-ranked architectural debt. Rust audit lists them as #1 and #2 of the 10-point architectural punch list; sysarch lists them as Risk 1 and Win 3 (and notes they ARE the architecture — everything else is a wrapper). Eval audit's Top-10 #5 (file-size gate) is the structural enforcement mechanism that would prevent regression once split. The "split crates" (`ogdb-vector`, `ogdb-text`, `ogdb-algorithms`, `ogdb-temporal`, `ogdb-import`, `ogdb-export`) at 114-409 LOC each are file-moves of plain data; runtime kernels (`VectorIndexRuntime`, `MaterializedFullTextIndex`, `tantivy::Index`, `instant-distance::HnswMap` driver) all live inside the god-module. **One root, three audit angles.** Phase C is shaped around it.

## Theme 2 — Doc-vs-code drift on backend choices and version metadata (docs + sysarch + eval)

Same drift class, three audits:
- Docs audit B6 (BENCHMARKS measurement-commit version mislabel) + sysarch G #6 (SPEC perf claims at 100K QPS / 1M-node scale not measured).
- Sysarch G #1-#9 enumerates nine SPEC-vs-code disagreements (USearch vs `instant-distance`, tokio claim vs sync `std::net`, LZ4 dep vs only `zstd`, Bolt v1 "Shipped" vs unusable-against-modern-drivers, 14-variant `enum PageType` that doesn't exist in code, etc.). Docs audit independently flagged the SPEC vs ARCHITECTURE USearch / Bolt-version disagreements (HIGH section).
- Eval audit notes the `check-benchmarks-version.sh` exists but is one of three independent version-drift gates that can silently pass past each other (Top-10 #4) while the npm one is currently RED on `main`.

The repo's strongest novel asset is its `verify-claims.yml` + structural drift gates (stab audit ranks docs honesty 5/5, ahead of all five surveyed peers). The drift items above are the gates that **don't yet exist** — they're the failure mode the existing pattern is designed to prevent. Phase B includes net-new drift gates (M-9 master version gate, H-11 SPEC-vs-Cargo gate).

## Theme 3 — The gate suite stops at the frontend boundary (eval + docs + ground-rules)

Eval audit Top-10 #1, #2, #8 each name a class of leak (token, claude-attribution, host-path) that exists at all in the frontend but is unscanned outside it: `crates/`, `scripts/`, `.claude/`, `documentation/`, `Dockerfile`, fixtures, `*.yaml`, `*.json`, `frontend/public/`. The same pattern shows in the docs audit: the SQL-style `-- comment` issue (37 sites in DESIGN/SPEC/SKILL) is exactly the kind of cross-doc consistency a gate scope-extension would catch. **Root cause: gates were authored at the frontend boundary for the verify-claims angle and never extended to the rest of the tree.** Phase A includes both broadening sweeps (H-12 token-leak, H-13 claude-attribution, M-10 path-leak).

## Theme 4 — Onboarding red path (docs + frontend + rust)

The README's "5 minute Quickstart" sequence currently fails at step 3 of 7 (B1 zero-rows query) and again at step 4 (B2 binary-name + B-7 port mismatch). The frontend audit's H-7 (e2e port collision) is the same class of problem one layer down (developer onboarding) — :8080 collisions cause 5/8 e2e fails, training contributors to ignore RED. The rust audit's H-6 (SPA-static-asset test panics) trains contributors to ignore RED in `cargo test -p ogdb-cli`. **All three are "fresh contributor or fresh user immediately hits a fail that isn't theirs."** Phase A targets every one.

## Theme 5 — `verify-claims` discipline exists; just hasn't been pointed at COOKBOOK / SKILL / WordNet / Recipe 3 (docs + eval)

The pattern is in place (`.github/workflows/verify-claims.yml` runs Playwright specs that gate landing-page claims). C-2/C-4/C-5/H-9/H-10 are all "the cookbook/skill/migration says X, the binary does Y" — each is a candidate for the same harness. Eval audit notes ~14 manifest entries are feature-proof rather than fix-regression guards (D-4 hygiene), suggesting the team already started inverting the pattern. Phase B explicitly extends `verify-claims` to SKILL.md, COOKBOOK recipes, and WordNet recipe.

---

# IV. PROPOSED EXECUTION PHASES

Each phase has an entry/exit gate; no item enters Phase B until Phase A is closed.

## Phase A — Trivial reds, CI green (this week, ~4 hr total)

**Entry:** `audit/*` branches merged to `main` as research artifacts (no behavior change).
**Exit:** `bash scripts/test.sh` cold-run on `origin/main` is GREEN; `cargo clippy --all-targets -- -D warnings` per-crate is GREEN; `npm run build` does not race; `verify-claims.yml` GREEN.

| ID | Title | Effort |
|---|---|---|
| C-1 | Flip `dead-gate sentinel` test RED→GREEN expectation | 30 min |
| C-3 | Reconcile `ogdb` ↔ `opengraphdb` binary identity in clap | 30 min |
| C-5 | Stop documenting `CALL vector.create_index` / `CALL text.create_index` | 30 min |
| C-6 | Empty `[Unreleased]` in CHANGELOG; move shipped entries into `[0.5.1]` | 30 min |
| C-7 | Re-label BENCHMARKS measurement commit OR re-run N=5 at v0.5.1 | 1 hr |
| C-8 | Fix `vite-plugin-compression` brotli race on `npm run build:marketing` | 1-3 hr |
| H-1 | Bump `npm/cli/package.json` to 0.5.1 | 5 min |
| H-2 | Two clippy 1-line fixes (`cast_sign_loss`, `redundant_closure`) | 5 min |
| H-3 | Sweep 37 SQL `-- ` comments → `// ` in cypher fences | 15 min |
| H-4 | Pick one playground port; reconcile README/QUICKSTART/install.sh banner | 15 min |
| H-5 | Delete `ogdb reindex` doc reference (or stub the subcommand) | 15 min |
| H-6 | Detect SPA placeholder body and `return Ok(())` early in static-asset tests | 30 min |
| H-8 | Rebaseline visual regression OR root-cause CSS regression | 30 min |
| M-2 | Fix dead `competitor-bench/README.md` link | 5 min |
| M-3 | Replace CHANGELOG compare-link footer placeholder with real GH URLs | 5 min |
| M-5 | Add `"typecheck": "tsc -b"` to `frontend/package.json` | 2 min |
| L-1, L-2, L-3 | Frontend hex-discipline cleanups | 15 min total |

**Phase A total:** ~10 items < 15 min each + 4 items 30 min–3 hr ≈ **3–6 hr of focused work, parallelisable across two contributors**.

## Phase B — HIGH-severity quality-of-life fixes (next 2 weeks, ~20 hr total)

**Entry:** Phase A exit met; CI green on `main`.
**Exit:** No SKILL.md / COOKBOOK / MIGRATION snippet in CI is unverified; gate suite scoped repo-wide; release-tests manifest covers all 30 fix-eligible commits in last 50; aarch64-linux + nightly fuzz running.

| ID | Title | Effort |
|---|---|---|
| C-2 | Repair flagship MovieLens query (verify with new `verify-claims` spec) | 4-8 hr |
| C-4 | Repair SKILL.md API lies + add gate that runs SKILL examples in CI | 2-3 hr |
| H-7 | E2E `serve-fixture` use ephemeral port `port: 0` | 1 hr |
| H-9 | Fix COOKBOOK Recipe 3 response-shape doc + snapshot test | 1 hr |
| H-10 | Fix WordNet recipe failing queries; wire to verify-claims | 1-2 hr |
| H-11 | Sweep SPEC.md to match Cargo deps + add `check-spec-vs-cargo.sh` gate | 1-2 hr |
| H-12 | Add repo-wide token-leak gate + meta-test | 30 min |
| H-13 | Add claude-attribution gate + meta-test | 20 min |
| H-14 | Add file-size gate (cap *.rs at 8000 LOC) — trips immediately, forces split | 30 min |
| H-15 | Add musl x86_64 + aarch64 rows to `release.yml` matrix | 1-2 hr |
| H-16 | Add aarch64-linux to PR-time `cross-platform-build` matrix | 30 min |
| H-17 | `fuzz.yml` cron — both fuzz targets, 10 min/target/night | 1-2 hr |
| H-18 | Add proptest invariants to 6 seed crates (highest-leverage subset: `ogdb-algorithms` Louvain/Leiden + `ogdb-import` parsers) | 4-8 hr |
| H-19 | Six untested HTTP/Bolt endpoint smoke tests | 2-3 hr |
| H-20 | `vector_search` direct callsite tests | 1-2 hr |
| H-21 | Backfill red-path coverage on 6 pass-only meta-tests | 1 hr |
| M-1 | Bake first-time `cargo publish --dry-run` order into release script | 30 min |
| M-4 | Add progress signal to `ogdb demo` | 30 min |
| M-6 | Wire `size-limit` bundle-budget gate at 180 KB gzip | 1 hr |
| M-9 | Master version-drift gate across all 6 surfaces | 1 hr |
| M-10 | Extend path-leak gate to `/Users/`, `/home/`, `crates/`, `scripts/`, `frontend/src/`, `Dockerfile` | 30 min |
| M-11 | SHA-pin all GitHub Actions; gate non-SHA `uses:` | 1 hr |
| M-19 | `rdf-import-real.spec.ts` capture stderr in rejection message | 30 min |

**Phase B total:** ~23 items, **~20-30 hr of focused work; two-week sprint at one engineer ½-time**.

## Phase C — Structural (next 8-12 weeks, parallelisable)

**Entry:** Phase B exit met; CI hardened against drift.
**Exit:** v1.0 cut on a defensible foundation; `cargo check` invalidation cost on a non-cross-cutting edit drops from "the whole core" to "the touched module"; alternate vector backend / replication / SPARQL trade-off decisions become tractable estimates.

| ID | Title | Effort |
|---|---|---|
| H-14 (forcing fn) → **WIN-1** | Split `ogdb-core/src/lib.rs` into `mod storage; mod wal; mod mvcc; mod index; mod parser; mod planner; mod executor; mod catalog; mod surface; mod compression;` — same crate, same exports, zero ABI/perf change | ~2 weeks |
| H-25 → **WIN-3** | Extract `ogdb-server` from `ogdb-cli/src/lib.rs`; bindings consume server crate, not CLI | ~3 weeks |
| H-24 → **WIN-2** | Define `trait Index` / `trait VectorIndex` / `trait FullTextIndex`; route `commit_txn` through registered indexes; move runtime types into the sibling crates that today only hold helpers | ~3 weeks |
| H-22 | Shard the `Arc<RwLock<Database>>` — catalog/nodes/edges/WAL under their own locks, OR property-store sub-lock | ~2 weeks |
| H-23 | Decide & enforce SI claim — either upgrade `find_nodes_by_label`-class APIs to be snapshot-aware, or downgrade marketing copy | ~1-3 weeks (depending on which way decided) |
| H-26 | Replace `cypher-grammar-vendor` (1.6 MB gzip) with `@codemirror/lang-cypher` shim or lazy-load on focus | ~1-2 days |
| M-12 | Public-API breaking-change detector for Rust + Python + Node + HTTP + Bolt + MCP | 3-4 hr |
| M-13 | Migrate release flow to release-please | ~1 day |
| M-14 | Cross-binding TestKit-style harness (YAML corpus + Python driver) | ~1-2 weeks |
| M-15 | Homebrew tap + WinGet manifest | ~1-2 days |
| M-16 | Document the 290 undocumented `pub` items in `ogdb-core` (post-WIN-1, doable per-module) | ~2-3 weeks |
| M-17 | Whole-graph RDF TTL→TTL round-trip test | ~1 day |
| M-18 | Decide TCK gate — either gate the published 50-55% number, or drop from SPEC §8.1 + ARCHITECTURE §11 | weeks |
| M-20 | Fold DESIGN.md retrofits into "Decisions retired" appendix | ~1 day |

**Critical dependency:** WIN-1 (split lib.rs) gates WIN-2 (trait Index) and WIN-3 (ogdb-server). H-22 (sharded lock) and H-23 (snapshot-aware indexes) are dramatically easier post-WIN-1/WIN-2. Sequence: WIN-1 → WIN-2 || WIN-3 → H-22 / H-23.

**Phase C total:** ~8-12 weeks of one engineer, parallelisable to ~5-6 weeks of two.

---

# V. WHAT WE DELIBERATELY DO NOT FIX

Items surfaced by one or more audits that should explicitly NOT be addressed for v1.0.

| Item | Source | Why we don't fix |
|---|---|---|
| **SPARQL as a second query language** | sysarch D-2 | `SPEC.md` §4.8 already rejects this. Sysarch confirms cost is 2-3 months even with WIN-2 done. The "double down on Cypher → GQL" trade-off is the right one and aligns with the agent-first thesis. SPARQL would dilute the design center and add a planner without the ROI of the Cypher one. |
| **JNI / Maven binding** | stab B-3 | Out of scope for v1.0. We have 5 bindings (C, Go, Python, Node, MCP); JVM ecosystem is large but the marginal ROI per audit-month is below brew/winget/PyPI. Reconsider post-1.0 if enterprise prospects ask for it. |
| **iOS/Android native bindings** (CocoaPods/Maven) | stab B-3 | Out of scope. The "embedded-first" thesis applies to *desktop / server / CLI / agent* embedded contexts. Mobile-embedded is a different product. |
| **Maven Enforcer / Error Prone / Spotless equivalents** | eval E-1 | Their value comes from depth of curated bug-pattern library; we don't have the team to maintain a fork. Vanilla clippy + the file-size gate (H-14) covers the highest-leverage pattern (god-module). Revisit if the workspace grows past 30 crates. |
| **APT/RPM packages** | stab B-3 | Brew + WinGet (M-15) covers the macOS + Windows funnel. The Linux funnel is well-served by `curl install.sh`, `cargo install`, and the GHCR docker image. APT/RPM has long maintenance tail (per-distro repo signing, multi-version) for marginal adoption uplift on a CLI. |
| **iOS-CocoaPods, Smalltalk, Clojure, Lisp bindings (cozo-style breadth)** | stab survey | Same trade-off: cozo's 12 bindings spread thin. Our 5 are the ones an AI agent or modern stack actually consumes. |
| **Mutation testing** (`cargo-mutants`) | stab B-1 | Listed as LOW-severity in the source audit. Below the leverage line vs (a) splitting lib.rs (which makes mutation testing tractable per-module afterward) and (b) running the existing fuzz infrastructure. Revisit post-WIN-1. |
| **SBOM publication on release** | stab B-1 | LOW-severity in source audit. Don't add until a downstream consumer asks. `cargo-deny` + `cargo-audit` already cover the dependency-graph hygiene. |
| **Docker-image vulnerability scanning** (Trivy/Grype on GHCR push) | stab B-1 | LOW. The image surface is thin (single binary + busybox base); the marginal CVE find-rate doesn't justify the workflow weight today. |
| **Hosted docs site** (mdbook / Docusaurus / vitepress) | stab B-2 | We chose markdown-in-repo deliberately. The verify-claims gate works because docs are in-tree; a hosted site would either fork from in-tree (drift) or be in-tree-rendered (no functional gain over GitHub's own MD render). Revisit if/when version-frozen docs become a real ask (post-1.0). |
| **Per-version frozen docs** (`/docs/v0.5/`, `/docs/v0.4/`) | stab B-2 | Premature for pre-1.0. Single-trunk + the `[Unreleased]` discipline is enough. |
| **Issue lifecycle automation** (`claude-issue-triage`, `claude-dedupe-issues`, `auto-close-duplicates`, etc.) | eval E-2 | Solves a problem we don't have at v0.5.1 commit volume. Revisit at >100 open issues. |
| **`cypher-grammar-vendor` chunk** kept as-is for now (downgrading H-26 if scope contention) | frontend #2 | If Phase C scope is contended, keep the 1.6 MB chunk because (a) it only loads on `/playground`, route-split; (b) the bundle-budget gate (M-6) tracks creep. The fix is real and worth doing, but it is an optimization, not a correctness item. |
| **HACK / TODO / FIXME / XXX marker sweep** | docs OBSERVATIONS | Docs audit confirmed: zero such markers in any user-facing doc. Nothing to fix here. |
| **Adding more aspirational claims** to fill SPEC §11 perf targets without measurements | sysarch G #6 | Don't paper over. Rewrite §11 to clearly mark targets-vs-measurements (Phase B H-11), and let BENCHMARKS.md remain the truth. |

---

**Net counts.**

```
BLOCKERS = 8     (C-1 .. C-8)
HIGH     = 26    (H-1 .. H-26)
MEDIUM   = 20    (M-1 .. M-20)
LOW      = 5     (L-1 .. L-5)
TOTAL    = 59
Phase A: 17 items (~3-6 hr)
Phase B: 23 items (~20-30 hr)
Phase C: 14 items (~8-12 weeks parallelisable)
```
