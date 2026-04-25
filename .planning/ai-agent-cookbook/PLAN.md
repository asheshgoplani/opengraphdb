# AI-Agent Cookbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docs/COOKBOOK.md` — 7 copy-pasteable, runnable AI-agent recipes that together explain why an AI engineer would reach for OpenGraphDB instead of Neo4j. Validated by an e2e test that exercises every HTTP snippet against a live `ogdb serve --http`.

**Architecture:** A single entry-point doc (`docs/COOKBOOK.md`) with a TOC and 7 inline recipes. Each recipe is self-contained: framing → curl/code snippet → expected output → benchmark anchor (where one exists). The doc sits one layer above the four shipped skills (`skills/data-import`, `skills/graph-explore`, `skills/ogdb-cypher`, `skills/schema-advisor`) and links down to them; the four skills are themselves mini-cookbooks for narrow tasks. A new playwright e2e spec (`frontend/e2e/cookbook-snippets-runnable.spec.ts`) spins up `ogdb serve --http` against a tmp `.ogdb`, then runs every HTTP snippet for shape (status code + JSON shape) so the doc can never silently rot.

**Tech stack:** Markdown for the cookbook. TypeScript + `@playwright/test` + `node:fs` + `node:child_process` for the e2e spec. The spec spawns the existing `target/release/ogdb` binary (built by `cargo build --release -p ogdb-cli` if missing) and drives the HTTP MCP / RAG / query endpoints already wired in `crates/ogdb-cli/src/lib.rs`. Zero new production code.

**Scope:** `docs/COOKBOOK.md` (new) + `frontend/e2e/cookbook-snippets-runnable.spec.ts` (new) + this `PLAN.md`. **Do NOT touch `crates/`**. Do not edit any of the four `skills/*/SKILL.md` files — the cookbook references them, doesn't replace them.

---

## Section A — Chosen recipes (7 of 8 candidates)

The user's brief listed 8 candidate recipes. We ship 7. The omitted candidate is **"Multi-agent shared knowledge graph (concurrent writes + MVCC)"** — `docs/BENCHMARKS.md` row 9 documents that the kernel is single-writer today and the concurrent-rate measurement is mechanical (separate DB per thread). Shipping a recipe that pretends concurrent writes already work would violate the project's transparency policy. We will revisit when the multi-writer kernel ships (Section 4.6 of BENCHMARKS).

The 7 we ship, in cookbook order:

| # | Title | Why this recipe |
|---|---|---|
| 1 | **AI-agent over MCP: connect Claude/GPT to OpenGraphDB** | Single biggest differentiator vs Neo4j: HTTP MCP transport (`POST /mcp/tools`, `POST /mcp/invoke`) is built into `ogdb serve --http`. No sidecar adapter, no Python bridge — Claude/Cursor/Goose talk to the DB directly. |
| 2 | **Hybrid retrieval: vector + graph + full-text in one query** | The "vector + graph + full-text in one engine, not three" pitch from `README.md`. `POST /rag/search` runs RRF over HNSW + tantivy + 1-hop in one round-trip; cited number is 243/378/422 μs p50/p95/p99 (BENCHMARKS row 8). |
| 3 | **Ingest a doc + Cypher-query its knowledge graph** | The end-to-end agent flow: `POST /rag/ingest` (with `content_base64` for PDFs) extracts entities and edges, then `POST /query` reads them back as a regular graph. Cited number is 38.8/44.2/113.2 ms enrichment-roundtrip p50/p95/p99 (BENCHMARKS row 7). |
| 4 | **Time-travel: as-of queries for audit trails** | Demonstrates the `temporal_diff` MCP tool + the openCypher extension `MATCH (n) AT TIME <unix_ts>`. Differentiator: temporal scopes are a first-class engine primitive, not a userland convention bolted on top. |
| 5 | **Skill-quality eval: measure your agent against the 4 shipped skills** | Most cookbooks stop at "here's how to call the DB". This one shows how to *evaluate* an agent that uses the DB — uses `crates/ogdb-eval/src/drivers/skill_quality.rs` to score against `skills/evals/*.eval.yaml`. Differentiates from generic graph-DB docs. |
| 6 | **Migrate from Neo4j: 3 differences that matter** | Direct apples-to-apples for the most likely reader. Three concrete migration deltas: single-file vs server, Apache 2.0 vs AGPLv3, and AI-native primitives (vector/text/MCP) that have no Neo4j equivalent. |
| 7 | **Detect knowledge-graph regressions in CI** | The CI loop. Shows how to wire `release-tests.yaml` + the skill-regression watcher so a Cypher answer drifting on a real KG fails the build. Closes the loop on the agent + DB story. |

Recipes deferred / cut:
- **"Multi-agent shared KG"** — cut for honesty (single-writer kernel). Re-add after Section 4.6 of BENCHMARKS resolves.

---

## Section B — Document structure (`docs/COOKBOOK.md`)

Single file. Markdown. Inline recipes (NOT separate files per recipe — keeps the TOC, the prose, and the snippets co-located so a reader can ⌘F across the whole story).

```
# OpenGraphDB AI-Agent Cookbook

> Recipes for building agent workloads on OpenGraphDB. Every snippet is exercised
> by frontend/e2e/cookbook-snippets-runnable.spec.ts on every PR.

## Setup
  - One-command bring-up of `ogdb serve --http` (pinned to v0.3.0 binary)
  - How to verify (`curl /health`)

## Table of contents
  1. AI-agent over MCP: connect Claude/GPT to OpenGraphDB
  2. Hybrid retrieval: vector + graph + full-text in one query
  3. Ingest a doc + Cypher-query its knowledge graph
  4. Time-travel: as-of queries for audit trails
  5. Skill-quality eval: measure your agent against the 4 shipped skills
  6. Migrate from Neo4j: 3 differences that matter
  7. Detect knowledge-graph regressions in CI

## Recipe 1 — AI-agent over MCP                  ← inline body
## Recipe 2 — Hybrid retrieval                   ← inline body
## Recipe 3 — Ingest + Cypher-query              ← inline body
## Recipe 4 — Time-travel                        ← inline body
## Recipe 5 — Skill-quality eval                 ← inline body
## Recipe 6 — Migrate from Neo4j                 ← inline body
## Recipe 7 — Detect KG regressions in CI        ← inline body

## See also
  - skills/data-import/SKILL.md       (mini-cookbook: CSV/JSON/RDF ingest)
  - skills/graph-explore/SKILL.md     (mini-cookbook: graph discovery)
  - skills/ogdb-cypher/SKILL.md       (mini-cookbook: Cypher generation)
  - skills/schema-advisor/SKILL.md    (mini-cookbook: schema design)
  - docs/BENCHMARKS.md                (every cited latency number)
  - README.md                         (project status / install)
```

Each recipe body has the same four sub-sections:

```
### Recipe N — <Title>

**When to use this** — 1 paragraph (~3 sentences). Names the problem class
and the agent shape that benefits.

**The snippet** — copy-pasteable block. Curl by default; Python or Node only
when curl is awkward (e.g., chunking embeddings into JSON arrays).

**Expected output** — concrete JSON or text excerpt showing what success
looks like. Used by the e2e spec as a shape assertion.

**How to verify / cite** — one-line `curl` health check or assertion the
reader can run. Cites a row from `docs/BENCHMARKS.md` *iff* a real measurement
exists for this recipe (no hype: only rows 7, 8, 13 of BENCHMARKS map cleanly
to a recipe). Recipes with no measured baseline say "not yet benchmarked"
explicitly — same transparency policy as `docs/BENCHMARKS.md`.
```

---

## Section C — Implementation sketch (the 8 phases)

### Phase 1 — PLAN + RED commit (this PR)
- Files: `.planning/ai-agent-cookbook/PLAN.md` (this file), `frontend/e2e/cookbook-snippets-runnable.spec.ts`
- One commit: `plan(ai-agent-cookbook): PLAN.md + RED-phase failing tests`

### Phase 2 — `docs/COOKBOOK.md` scaffold + Setup section
- Create file with H1, TOC (placeholder links), Setup section (`ogdb serve --http` bring-up), and 7 empty recipe headings. The "Setup" snippet must be runnable: `ogdb serve --http --port 8080 /tmp/cookbook.ogdb` then `curl http://127.0.0.1:8080/health`. The e2e spec asserts both.
- Commit: `docs(cookbook): scaffold COOKBOOK.md with setup + TOC`

### Phase 3 — Recipe 1 (AI-agent over MCP)
- Write recipe body. Two snippets: `curl POST /mcp/tools` (returns the catalog from `crates/ogdb-cli/src/lib.rs:3179-3441` — names: `browse_schema`, `execute_cypher`, `get_node_neighborhood`, `search_nodes`, `list_datasets`, `query`, `schema`, `upsert_node`, `upsert_edge`, `subgraph`, `shortest_path`, `vector_search`, `text_search`, `temporal_diff`, `import_rdf`, `export_rdf`, `agent_store_episode`, `agent_recall`, `rag_build_summaries`, `rag_retrieve`) and `curl POST /mcp/invoke` (JSON-RPC `tools/call` shape, e.g. invoking `browse_schema` with empty args).
- Cite: no benchmark row maps; says "not yet benchmarked" in the verify section.
- e2e: spec asserts (a) `/mcp/tools` returns a `tools` array containing at least `execute_cypher`, `vector_search`, `temporal_diff`; (b) `/mcp/invoke` for `browse_schema` returns 200.
- Commit: `docs(cookbook): recipe 1 — AI-agent over MCP`

### Phase 4 — Recipe 2 (Hybrid retrieval)
- Write recipe body. Single snippet: `curl POST /rag/search` with `{"query": "...", "embedding": [...], "k": 10}`. Show the request/response from `crates/ogdb-cli/src/lib.rs:4677-4699`. Note that `embedding` is optional — if omitted, the server falls back to text-only.
- Cite: BENCHMARKS row 8 — "Hybrid retrieval (vector kNN + 1-hop) p50/p95/p99 = 243/378/422 μs at 1 000 nodes × 100 queries × dim=16. NDCG@10 deferred until BEIR corpus is wired (Section 4.5 of BENCHMARKS)."
- e2e: spec POSTs `/rag/search` with `{"query":"hello","k":3}` against an empty DB and asserts a 200 with `results: []` shape.
- Commit: `docs(cookbook): recipe 2 — hybrid retrieval`

### Phase 5 — Recipes 3 + 4 (Ingest+Cypher, Time-travel)
- Recipe 3: Two snippets. `curl POST /rag/ingest` with `{"title":"...","format":"PlainText","content":"..."}` (from `crates/ogdb-cli/src/lib.rs:4701-4748`); then `curl POST /query` with a `MATCH` over the resulting nodes. PDF is shown as `format: "Pdf"` + `content_base64`. Cite: BENCHMARKS row 7 — "Enrichment round-trip p50/p95/p99 = 38.8/44.2/113.2 ms (100 docs × 10 entities + 15 edges)."
- Recipe 4: Two snippets. (a) `curl POST /mcp/invoke` for `temporal_diff` with `{"timestamp_a":<unix>,"timestamp_b":<unix>}` (from `crates/ogdb-cli/src/lib.rs:2730-2773`); (b) `curl POST /query` with `MATCH (n) AT TIME 1700000000 RETURN n` to show the openCypher temporal extension. Cite: no benchmark row — says "not yet benchmarked".
- e2e: spec ingests one doc, runs the Cypher, and asserts the doc node count goes 0→1; spec invokes `temporal_diff` with two timestamps and asserts `snapshot_a` + `snapshot_b` keys present.
- Commit: `docs(cookbook): recipes 3-4 — ingest+cypher + time-travel`

### Phase 6 — Recipes 5 + 6 (Skill-quality eval, Migrate from Neo4j)
- Recipe 5: Snippet is a Rust call sketch — `cargo test -p ogdb-eval --test publish_baseline -- --nocapture` (the existing test that drives `crates/ogdb-eval/src/drivers/skill_quality.rs::run`) plus a copy of the `EvalCase` JSON shape from lines 52-80. Reader's takeaway: define `must_contain` / `must_not_contain` / `pattern` gates, plug in their own `LlmAdapter`, get a `pass_rate` + per-difficulty + per-skill breakdown. Cite: no benchmark row.
- Recipe 6: No HTTP snippets — pure prose + a 3-row diff table:
  - **Single-file vs server.** Neo4j: standalone JVM server (or AuraDB). OpenGraphDB: `Database::open("./mydb.ogdb")` works in-process; `ogdb serve --http` is opt-in.
  - **Apache 2.0 vs AGPLv3.** Neo4j Community is GPLv3, Enterprise is commercial; AuraDB is SaaS. OpenGraphDB is Apache 2.0 — embed in commercial agents without legal review.
  - **AI-native primitives.** Neo4j needs vector + GenAI plugins for vector search and an external bridge for MCP. OpenGraphDB ships `vector_search`, `text_search`, `rag_retrieve`, `agent_store_episode`, `agent_recall`, plus `POST /mcp/tools` / `POST /mcp/invoke` in the core CLI binary.
  - Each row links to the file/section that proves it (e.g., `LICENSE` → Apache 2.0; `crates/ogdb-cli/src/lib.rs:3319-3440` → tool catalog).
- e2e: spec asserts the recipe contains the three diff-table rows by checking for the strings "Single-file", "Apache 2.0", "AI-native".
- Commit: `docs(cookbook): recipes 5-6 — skill-quality + migrate-from-neo4j`

### Phase 7 — Recipe 7 (Detect KG regressions in CI)
- Recipe body. Two snippets: (a) `cargo test -p ogdb-eval --test skill_regression_watcher` — the existing pattern from `crates/ogdb-eval` plus link to `release-tests.yaml`; (b) a minimal GitHub Actions snippet showing how to fail the build if `pass_rate < 0.85`. Cite: no benchmark row — says "not yet benchmarked".
- e2e: spec asserts the recipe contains references to the test paths.
- Commit: `docs(cookbook): recipe 7 — detect KG regressions in CI`

### Phase 8 — Final pass: GREEN run + cross-link review + commit
- Run the full e2e spec end-to-end (`npx playwright test e2e/cookbook-snippets-runnable.spec.ts`) and confirm all assertions pass against the live backend.
- Cross-check every benchmark citation against `docs/BENCHMARKS.md`. Replace any drift.
- Verify the "See also" section links resolve (`skills/*/SKILL.md`, `docs/BENCHMARKS.md`, `README.md`).
- Commit: `docs(cookbook): cross-link review + GREEN run`

---

## Section D — Test contract (`frontend/e2e/cookbook-snippets-runnable.spec.ts`)

**Pattern:** mirror `frontend/e2e/rdf-import-real.spec.ts` (existing reference: spawns `ogdb serve --http` against a tmp `.ogdb`, healthchecks, kills cleanly). One `test.describe` block, one `beforeAll` to bring up the backend, one `afterAll` to tear it down.

**CI gating** (the user's "skip in CI if backend not present, but RUN locally" requirement):

```ts
const SKIP = process.env.CI === 'true' && !existsSync(OGDB_BIN)
test.describe.skip(SKIP, 'cookbook snippets — runnable against ogdb serve --http', () => {...})
```

Locally, `ensureReleaseBinary()` builds `target/release/ogdb` if it's missing (same as `rdf-import-real.spec.ts:54-73`). On CI without the binary, the whole describe is skipped — the cookbook still ships, the test just doesn't gate the merge until the binary lands in CI cache.

**Test cases** (one `test()` per assertion class — 9 total):

1. `cookbook doc exists with all 7 recipe headings` — reads `docs/COOKBOOK.md`, asserts the file is present and contains each of the 7 recipe titles verbatim. **RED:** fails because `docs/COOKBOOK.md` does not exist yet.
2. `setup section: GET /health returns ok` — confirms the Setup section's smoke check.
3. `recipe 1: POST /mcp/tools returns the documented tool catalog` — fetches `/mcp/tools`, asserts the JSON has a `tools` array containing `execute_cypher`, `vector_search`, `temporal_diff`, `rag_retrieve`. **RED:** fails on the doc-existence check above; once the doc lands, tests endpoint shape.
4. `recipe 1: POST /mcp/invoke browse_schema returns 200` — invokes the `browse_schema` tool with empty args, asserts 200 + non-error JSON.
5. `recipe 2: POST /rag/search empty DB returns empty results array` — POSTs `{"query":"hello","k":3}` and asserts `200 + {results: []}`.
6. `recipe 3: POST /rag/ingest then POST /query reads the ingested doc back` — ingests a 50-byte plaintext doc, runs `MATCH (n) RETURN count(n) AS c`, asserts `c >= 1`.
7. `recipe 4: POST /mcp/invoke temporal_diff returns snapshot_a + snapshot_b` — invokes with `{timestamp_a: 0, timestamp_b: <now>}`, asserts both snapshot keys present.
8. `recipe 6: migrate-from-Neo4j section names the three differences` — reads the doc and asserts the strings "Single-file", "Apache 2.0", "AI-native" appear in the recipe-6 body.
9. `recipe 7: CI-regression section references release-tests + skill-regression watcher` — reads the doc and asserts the strings `release-tests` and `skill-regression` appear in the recipe-7 body.

**RED-phase verification command:**

```bash
cd frontend && npx playwright test e2e/cookbook-snippets-runnable.spec.ts
```

Expected RED output: every test fails because `docs/COOKBOOK.md` does not exist. (Tests 2-9 short-circuit on the doc-read error in their setup; test 1 fails directly with `file does not exist`.)

**GREEN-phase verification command:** same command. After Phase 8, every test passes.

**Per-recipe test runner command (for narrow iteration):**

```bash
cd frontend && npx playwright test e2e/cookbook-snippets-runnable.spec.ts -g "recipe 3"
```

---

## Section E — Self-review checklist

**Spec coverage:**
- [x] (a) 6-8 recipes + 1-line justification each — 7 chosen, justifications in Section A
- [x] (b) docs structure with COOKBOOK.md as entry point + TOC + inline recipes — Section B
- [x] (c) failing test at exact path `frontend/e2e/cookbook-snippets-runnable.spec.ts` validating curl examples against live `ogdb serve --http`, skip in CI if backend not present — Section D
- [x] (d) impl sketch — Section C, 8 phases
- [x] (e) scope: docs/ + new e2e test only, do NOT touch crates/ — Section C explicitly excludes crates/

**Placeholder scan:** none. Every recipe has a concrete snippet description, a concrete benchmark citation (or honest "not yet benchmarked"), and a concrete e2e assertion.

**Type consistency:** the e2e spec uses the same endpoint paths (`/mcp/tools`, `/mcp/invoke`, `/rag/ingest`, `/rag/search`, `/query`, `/health`) and same JSON shapes (`{tools: [...]}`, `{results: [...]}`, `{snapshot_a:..., snapshot_b:...}`) as the source of truth in `crates/ogdb-cli/src/lib.rs:4338-4751`. No drift.

**Honesty:** Multi-agent shared-KG recipe is explicitly cut, with a pointer to BENCHMARKS Section 4.6 explaining why. Every cited latency number traces back to a numbered row in BENCHMARKS. Recipes without a benchmark row say so.

**Per-crate test policy:** the only test running is `npx playwright test e2e/cookbook-snippets-runnable.spec.ts` (a single playwright spec, not the full e2e suite). No `cargo test` is needed because no crates change. No whole-suite invocation.

---

## Section F — What stays out of scope

- Editing `crates/*` (the recipes use the existing API surface as-is)
- Editing `skills/*/SKILL.md` (the cookbook references them, not replaces them)
- Adding new MCP tools (uses the 20 already in the catalog)
- Editing `docs/BENCHMARKS.md` (cookbook cites it; doesn't update it)
- Multi-agent / concurrent-write recipe (deferred — see Section A)
- `cargo test` on any crate (no Rust code changes)
- Whole-suite playwright run (`npx playwright test` with no filter is forbidden by the per-crate-tests policy)
