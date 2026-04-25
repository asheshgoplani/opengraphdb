# Neo4j → OpenGraphDB Migration Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docs/MIGRATION-FROM-NEO4J.md` — a 5-minute, honesty-first companion to `docs/COOKBOOK.md` that lets a Neo4j developer decide whether OpenGraphDB fits their use case. Validated by an e2e test that exercises every runnable code snippet against a live `ogdb serve --http`.

**Architecture:** A single `docs/MIGRATION-FROM-NEO4J.md` with seven numbered sections, each anchored to a verifiable artifact (license file, crate, BENCHMARKS row, COOKBOOK recipe). The doc cross-links *down* to `docs/COOKBOOK.md` (recipe-level how-to) and *across* to `docs/BENCHMARKS.md` (numbers). It cites real, in-tree facts only — no estimates, no Bolt-version inflation, no TCK pass-rate guesses. A new playwright spec (`frontend/e2e/migration-guide-snippets.spec.ts`) spins up `ogdb serve --http` against a tmp `.ogdb`, runs every Cypher snippet from Section 7 (the "working examples" section), and shape-asserts the rest of the doc body so the file cannot silently rot.

**Tech stack:** Markdown for the guide. TypeScript + `@playwright/test` + `node:fs` + `node:child_process` for the e2e spec. The spec reuses the bring-up pattern from `frontend/e2e/cookbook-snippets-runnable.spec.ts` (build release binary on demand, spawn `ogdb serve --http`, healthcheck, run, kill). Zero new production code.

**Scope:** `docs/MIGRATION-FROM-NEO4J.md` (new) + `frontend/e2e/migration-guide-snippets.spec.ts` (new) + this `PLAN.md`. **Do NOT touch `crates/`**. Do not edit `docs/COOKBOOK.md`, `docs/BENCHMARKS.md`, `README.md`, or `SPEC.md` — the migration guide *cites* them, never edits them.

---

## Section A — Audience and 5-minute reading goal

**Reader profile.** A senior backend or AI engineer who already runs Neo4j (Community, Enterprise, or AuraDB) and is evaluating OpenGraphDB for one of three new-build pressures:

1. **Embed in a commercial product** — Neo4j Community is GPLv3 and Enterprise is commercial; AGPLv3 lives in some Neo4j plugins. They need a permissive license for an embedded shipping product.
2. **Edge / on-device / AI-agent** — they don't want to ship a JVM, run a server cluster, or maintain a Python sidecar bridge for every Claude/Cursor agent.
3. **AI-native primitives in the core** — they currently glue Neo4j + Pinecone + Lucene + a Python MCP shim, and want one engine that does HNSW vector + tantivy text + graph in the same query plan.

**Reading goal (5 min, ~1250 words).** By the bottom of the page they can answer:

- Is this Apache 2.0 single-binary embed-friendly enough for my product? (Section 1)
- Will my read-heavy Cypher port without a rewrite? (Section 2 + Section 7)
- Will my existing Neo4j Java/Python driver connect over Bolt? (Section 3 — answer: with caveats; Bolt v1 only today)
- Do I get vector + text + graph in one query, or do I have to glue plugins? (Section 4)
- Where does OpenGraphDB win on perf, where does it lose? (Section 5)
- What schema / index / `id()` rewrites should I budget for? (Section 6)
- Show me one query that runs identically and one that needs translation. (Section 7)

**Non-goals for this guide.** This is a fit-evaluation document, not a step-by-step migration runbook. Bulk-data migration tooling, Bolt-driver compatibility-matrix expansion, multi-writer kernel — all are explicit "not yet" items deferred to BENCHMARKS Section 4 follow-ups.

---

## Section B — Document outline + word-count budget

Single file. Markdown. Seven inline sections, each ≤ 250 words. Total target ≈ 1250 words ≈ 5 minutes at 250 wpm.

```
# OpenGraphDB for Neo4j developers — a 5-minute migration guide

> Companion to docs/COOKBOOK.md. Every code snippet on this page is exercised
> by frontend/e2e/migration-guide-snippets.spec.ts on every PR.

[100w intro: who this is for, the 7 questions you'll answer in 5 min, link to COOKBOOK]

## 1. License and deployment                         [~200w]
   - Apache 2.0 single binary vs AGPLv3-tinged Neo4j stack
   - When this matters: embedded apps, edge devices, on-device AI agents,
     commercial closed-source agents, anywhere AGPL legal review is friction
   - Proof: link to LICENSE; cite README single-binary claim; cite ARCHITECTURE
     "embeddable first" principle

## 2. Cypher coverage delta                          [~200w]
   - What works today: Tier-1 categories — MATCH, RETURN, WHERE, CREATE,
     DELETE, SET — plus OPTIONAL MATCH, UNION, EXISTS, pattern comprehension,
     CASE (cited from README line 62)
   - What's partial: aggregation + ordering work; complex APOC procedures do
     not port (rewrite as plain Cypher or a small MCP tool, per COOKBOOK
     Recipe 6)
   - What's missing: LOAD CSV, shortestPath() function, CALL/YIELD against
     arbitrary procedures (see ogdb-tck/src/lib.rs:230 — exactly the
     scenarios the TCK harness skips)
   - **TCK number — honest framing.** ogdb-tck enforces a 50% Tier-1 floor
     (`crates/ogdb-tck/src/lib.rs:355`). The full external-openCypher-TCK
     pass rate is **not yet published** in this repo — point the reader at
     `cargo run --release -p ogdb-tck -- /path/to/openCypher/tck` to compute
     it themselves against an upstream checkout. Do NOT invent a number.

## 3. Bolt protocol compatibility                    [~150w]
   - Status today: ogdb-bolt implements **Bolt v1 only** (BOLT_MAGIC =
     0x6060_B017, BOLT_VERSION_1 = 1, see crates/ogdb-bolt/src/lib.rs:9).
     Messages: INIT, RUN, PULL_ALL, ACK_FAILURE, RESET, GOODBYE, AUTH.
     Default bind: 0.0.0.0:7687.
   - What this means in driver terms: Bolt v1 is the Neo4j 3.0–3.4 wire
     era. Modern drivers (neo4j-java-driver 5.x, neo4j-python-driver 5.x,
     neo4j-javascript-driver 5.x) negotiate Bolt v4/v5 by default and will
     not silently fall back to v1. Connect by pinning the driver's
     supported protocol version to v1 if the driver allows it, or use the
     HTTP `POST /query` endpoint (Recipe 1 of COOKBOOK shows the same
     transport for MCP).
   - Caveat: Bolt v3+ features (transactional `BEGIN`/`COMMIT` over Bolt,
     `RUN` with metadata, multi-database routing) are not implemented.
   - Honest framing: "Bolt is wired, but not drop-in for modern drivers
     yet" — point at the COOKBOOK migrate-from-neo4j recipe row 1 for the
     "single-file embed" alternative if Bolt-v1-only is a blocker.

## 4. AI-native primitives                           [~150w]
   - Vector + text + graph in one query plan: not bolt-on. Neo4j ships
     vector + GenAI + Lucene as separate plugins; OpenGraphDB ships
     `vector_search`, `text_search`, `rag_retrieve`, `agent_store_episode`,
     `agent_recall`, `rag_build_summaries`, plus `POST /mcp/tools` /
     `POST /mcp/invoke` in the core CLI binary.
   - Single concrete pointer: link to `docs/COOKBOOK.md` Recipe 2 (Hybrid
     retrieval) for a runnable `POST /rag/search` snippet that fuses HNSW
     kNN + 1-hop graph + BM25 in one round-trip with RRF. No translation
     of any Neo4j vector-plugin call needed because there is no
     vector-plugin call to translate — it's one endpoint.
   - MCP integration: `ogdb mcp --stdio` exposes 20 tools to Claude /
     Cursor / Goose without a Python sidecar. See COOKBOOK Recipe 1 for
     the catalog.

## 5. Performance characteristics — wins and losses  [~200w]
   - Cite BENCHMARKS rows verbatim. No hype, no extrapolation, no warm
     numbers (every BENCHMARKS row is cold-first-run on i9-10920X).
   - **Where ogdb wins (apples-to-apples or clears spec threshold):**
     - Row 7 — enrichment round-trip p50/p95/p99 = 38.8/44.2/113.2 ms
       (3.4× under the 150 ms competitive threshold; misses 40 ms
       best-in-class by 4 ms).
     - Row 10 — graph-feature rerank batch p95 = 1.88 μs (91 000× faster
       than Cohere Rerank 3.5 generic-cross-encoder baseline; structurally
       different but legitimate as graph-native vs neural-forward-pass).
     - Row 13 — scaling tier 10 k nodes: read p95 = 0.41 μs, load = 0.30
       s, RSS = 26.3 MB, file = 39.4 MB (all three gates clear with 2-3
       orders of margin).
   - **Where ogdb loses (apples-to-apples, clear gap):**
     - Row 1 — bulk ingest 256 nodes/s vs Memgraph ≈ 295 k nodes/s (1
       150× behind on the same-scale workload). Root cause:
       one-tx-per-node driver path. Tracked in BENCHMARKS Section 4.1.
     - Row 2 — streaming ingest 300 nodes/s (33× behind Memgraph
       Benchgraph weakest number). Same root cause.
     - Row 9 — concurrent multi-writer is single-writer-kernel-limited;
       N=4 measurement is mechanical. Tracked in BENCHMARKS Section 4.6.
   - **Honesty footer:** scaling rows 3, 4, 5, 11, 12 are scale-mismatched
     (10 k nodes, not Pokec / SF10 / Datagen-9.0). Directional only —
     re-run on r7i.4xlarge at SF1/SF10 before claiming the record.

## 6. What to know before migrating                  [~150w]
   - **Schema model: LABEL → labels.** OpenGraphDB nodes carry a
     `Vec<String>` of labels (multi-label). Neo4j 4.x+ also supports
     multi-label so most schema ports cleanly. Migrate `MERGE (n:Label
     {key:val})` patterns by ensuring property indexes exist (see next
     row).
   - **Index DDL: BTREE → CREATE INDEX ON.** Neo4j 4.x+ uses
     `CREATE INDEX FOR (n:Person) ON (n.email)`. OpenGraphDB uses the
     pre-4.x form `CREATE INDEX ON :Person(email)` (confirmed by
     `crates/ogdb-cli/src/lib.rs:9951` — the existing test). Vector
     indexes use `CALL vector.create_index(...)` — see
     `skills/schema-advisor/SKILL.md` (cited from COOKBOOK Recipe 6).
     Full-text uses `CALL text.create_index(...)`.
   - **Identity: id() function.** OpenGraphDB does not implement Neo4j's
     `id(n)` function. Node identity comes back in the row payload —
     `MATCH (n) RETURN n` returns `{"id": <u64>, "labels": [...],
     "properties": {...}}`. Translation rule: replace `RETURN id(n) AS
     nid` with `RETURN n` and read `n.id` from the JSON row.
   - **APOC.** Not portable. Rewrite as plain Cypher or a small MCP
     tool. See COOKBOOK Recipe 6.

## 7. Working examples                               [~100w + code]

   **Identical (runs as-is on both):**

   ```cypher
   MATCH (n) RETURN count(n) AS c
   ```

   ```cypher
   CREATE (a:Person {name: 'Alice'})-[:KNOWS]->(b:Person {name: 'Bob'})
   ```

   **Needs translation (Neo4j 4.x+ → OpenGraphDB):**

   | Neo4j 4.x+                                              | OpenGraphDB                                   |
   |---------------------------------------------------------|-----------------------------------------------|
   | `CREATE INDEX person_email FOR (n:Person) ON (n.email)` | `CREATE INDEX ON :Person(email)`              |
   | `MATCH (n:Person) RETURN id(n) AS nid`                  | `MATCH (n:Person) RETURN n` (read `n.id`)     |
   | `CALL db.index.vector.queryNodes('emb', 10, $vec)`      | `POST /rag/search` (COOKBOOK Recipe 2)        |
   | `CALL apoc.path.expandConfig(...)`                      | rewrite as plain Cypher or MCP tool           |

## See also
- docs/COOKBOOK.md — recipe-level how-to (Recipe 1: MCP; Recipe 2: hybrid; Recipe 6: migration mechanics)
- docs/BENCHMARKS.md — every cited latency number, with reproducibility notes
- crates/ogdb-tck/README.md — how to compute your own openCypher TCK pass rate
- README.md — project status and install
```

---

## Section C — Implementation sketch (the 8 phases)

### Phase 1 — PLAN + RED commit (this PR)
- Files: `.planning/neo4j-migration-guide/PLAN.md` (this file), `frontend/e2e/migration-guide-snippets.spec.ts`
- One commit: `plan(neo4j-migration-guide): PLAN.md + RED-phase failing tests`

### Phase 2 — `docs/MIGRATION-FROM-NEO4J.md` scaffold
- Create file with H1, intro callout (cookbook companion + every snippet exercised), audience block, and 7 empty section headings (1–7) plus "See also".
- Commit: `docs(migration): scaffold MIGRATION-FROM-NEO4J.md with 7 sections`

### Phase 3 — Section 1 (License + deployment)
- Write ≤ 200 words. Cite `LICENSE` (Apache 2.0), `README.md:3` ("single-file"), and `SPEC.md` Section 4.9 deployment-modes table. Frame the three pressures (embed in commercial product, edge / on-device, AI agents).
- e2e: spec asserts the section body contains the strings "Apache 2.0", "AGPL", and "single-file" (or "single binary"). Plus the literal section heading text.
- Commit: `docs(migration): section 1 — license and deployment`

### Phase 4 — Sections 2 + 3 (Cypher delta + Bolt compat)
- Section 2 (≤ 200 words). List Tier-1 categories from `crates/ogdb-tck/src/lib.rs:10` verbatim. Cite README line 62 for OPTIONAL MATCH / UNION / EXISTS / pattern comprehension / CASE. Cite the TCK skip list at `crates/ogdb-tck/src/lib.rs:230` for what doesn't port. **Do not invent a TCK pass-rate number** — point the reader at `cargo run --release -p ogdb-tck -- /path/to/openCypher/tck` and the 50% floor at `crates/ogdb-tck/src/lib.rs:355`.
- Section 3 (≤ 150 words). Bolt v1 only — cite `crates/ogdb-bolt/src/lib.rs:9` (BOLT_VERSION_1 = 1). List the seven implemented messages from lines 28–34 verbatim. Note: modern Neo4j drivers negotiate Bolt v4/v5 and will not silently fall back to v1; pin protocol version or use the HTTP `POST /query` path. Caveat: Bolt v3+ features (transactional BEGIN/COMMIT over Bolt, multi-DB routing, RUN-with-metadata) are not implemented.
- e2e: spec asserts Section 2 contains "TCK", "Tier-1", "ogdb-tck", and the *honest* framing string "not yet published" (so future drift toward an invented number triggers a test failure). Spec asserts Section 3 contains "Bolt v1", "0x6060", and the literal driver-version-caveat string "Bolt v3+".
- Commit: `docs(migration): sections 2-3 — cypher delta + bolt compat`

### Phase 5 — Section 4 (AI-native primitives)
- Write ≤ 150 words. Lift the 7 first-class tool names from `crates/ogdb-cli/src/lib.rs:3179-3441` (already cited in COOKBOOK Recipe 1): `vector_search`, `text_search`, `rag_retrieve`, `agent_store_episode`, `agent_recall`, `rag_build_summaries`, plus the MCP transport endpoints. Single forward-link to `docs/COOKBOOK.md` Recipe 2 for the runnable `POST /rag/search` snippet. Single forward-link to Recipe 1 for the MCP catalog.
- e2e: spec asserts the section body contains "vector_search", "text_search", "rag_retrieve", "MCP", and a relative link to "COOKBOOK.md".
- Commit: `docs(migration): section 4 — AI-native primitives`

### Phase 6 — Section 5 (Performance — wins and losses)
- Write ≤ 200 words. Cite **only** these BENCHMARKS rows by exact number — copy the latency / throughput verbatim from `docs/BENCHMARKS.md` Section 2:
  - Win row 7: enrichment round-trip 38.8 / 44.2 / 113.2 ms
  - Win row 10: rerank batch p95 = 1.88 μs
  - Win row 13: scaling 10k — p95 = 0.41 μs / load = 0.30 s / RSS = 26.3 MB / file = 39.4 MB
  - Loss row 1: bulk ingest 256 nodes/s vs Memgraph ≈ 295 k nodes/s
  - Loss row 2: streaming ingest 300 nodes/s
  - Loss row 9: concurrent multi-writer is kernel-limited
- Add the honesty footer: rows 3, 4, 5, 11, 12 are scale-mismatched. Do not extrapolate.
- e2e: spec asserts the section contains the literal strings "38.8", "44.2", "256 nodes/s", "scale-mismatch" (or "scale mismatch"), and the relative link "BENCHMARKS.md".
- Commit: `docs(migration): section 5 — performance honestly`

### Phase 7 — Sections 6 + 7 (What to know + Working examples)
- Section 6 (≤ 150 words). Three migration mechanics: schema (LABEL → labels — multi-label is fine), index DDL (`CREATE INDEX FOR ... ON ...` → `CREATE INDEX ON :Label(prop)` — confirmed by `crates/ogdb-cli/src/lib.rs:9951`), identity (`id(n)` not implemented — read `n.id` from row payload). Cite `skills/schema-advisor/SKILL.md` for vector / text index DDL.
- Section 7 (≤ 100 words + code blocks). Two identical-on-both Cypher snippets (`MATCH (n) RETURN count(n) AS c`, the `CREATE … KNOWS …` one). One translation table with four rows (index DDL, id(), vector plugin, APOC). Lock the wording: every row of the table maps to a concrete crate-level fact.
- e2e: spec asserts (a) Section 7 contains the exact string `MATCH (n) RETURN count(n) AS c`; (b) `POST /query` with that exact string returns 200; (c) `POST /query` with the translated form `CREATE INDEX ON :Person(email)` returns 200. Section 6 asserts on "labels", "id(", "CREATE INDEX ON".
- Commit: `docs(migration): sections 6-7 — what to know + working examples`

### Phase 8 — Final pass: GREEN run + cross-link review + commit
- Run the full e2e spec end-to-end (`cd frontend && npx playwright test e2e/migration-guide-snippets.spec.ts`) and confirm all 11 tests pass against the live backend.
- Cross-check every BENCHMARKS row citation against `docs/BENCHMARKS.md`. Replace any drift.
- Cross-check every link target resolves: `LICENSE`, `docs/COOKBOOK.md`, `docs/BENCHMARKS.md`, `crates/ogdb-tck/README.md`, `README.md`, `skills/schema-advisor/SKILL.md`.
- Word-count audit: confirm total body ≤ 1300 words (read time ≤ 5 min @ 250 wpm).
- Commit: `docs(migration): cross-link + word-count + GREEN run`

---

## Section D — Test contract (`frontend/e2e/migration-guide-snippets.spec.ts`)

**Pattern:** mirror `frontend/e2e/cookbook-snippets-runnable.spec.ts` (sibling file shipped two commits ago). Same `ensureReleaseBinary()`, same SKIP gate (`process.env.CI === 'true' && !existsSync(OGDB_BIN) && process.env.OGDB_E2E_LIVE !== '1'`), same `beforeAll`/`afterAll` lifecycle. One `test.describe` block. Different port (`8182`) so the two specs can run concurrently without colliding.

**CI gating** — identical policy to the cookbook spec:

```ts
const SKIP =
  process.env.CI === 'true' &&
  !existsSync(OGDB_BIN) &&
  process.env.OGDB_E2E_LIVE !== '1'
```

**Test cases** (one `test()` per assertion class — 11 total):

1. `migration guide doc exists with all 7 section headings` — reads `docs/MIGRATION-FROM-NEO4J.md`, asserts the file is present and contains each of the seven section titles verbatim ("License and deployment", "Cypher coverage delta", "Bolt protocol compatibility", "AI-native primitives", "Performance characteristics", "What to know before migrating", "Working examples"). **RED:** fails because the file does not exist yet.
2. `setup gate: GET /health returns ok` — confirms the live backend is up before content tests run.
3. `section 1 (license + deployment) names Apache 2.0 vs AGPL and single-file deployment` — body contains "Apache 2.0", "AGPL", and one of "single-file" or "single binary".
4. `section 2 (cypher coverage) cites TCK harness and avoids inventing a pass-rate number` — body contains "TCK", "Tier-1", "ogdb-tck", and the honesty marker "not yet published" (so future drift toward an invented number triggers this test).
5. `section 3 (bolt compat) names v1 only with the v3+ caveat` — body contains "Bolt v1", the magic constant "0x6060", and the literal "Bolt v3+" caveat string.
6. `section 4 (AI-native) names the in-core MCP tool surface and links to COOKBOOK Recipe 2` — body contains "vector_search", "text_search", "rag_retrieve", "MCP", and a relative link to `COOKBOOK.md`.
7. `section 5 (performance) cites BENCHMARKS rows verbatim and labels scale-mismatched rows` — body contains "38.8", "44.2", "256 nodes/s", "BENCHMARKS.md", and one of "scale-mismatch" / "scale mismatch".
8. `section 6 (what to know) names the LABEL/id()/INDEX rewrites` — body contains "labels", "id(", "CREATE INDEX ON".
9. `section 7 working example: POST /query with the identical Cypher returns 200` — POSTs the exact string `MATCH (n) RETURN count(n) AS c` (lifted from the doc) and asserts 200 + a numeric count in the response body.
10. `section 7 working example: POST /query with the translated index DDL returns 200` — POSTs `CREATE INDEX ON :Person(email)` (lifted from the doc) and asserts 200 (no error). Confirms the migration table's row 1 is real, not aspirational.
11. `cross-links resolve to in-repo files` — for every relative link the doc claims (LICENSE, docs/COOKBOOK.md, docs/BENCHMARKS.md, crates/ogdb-tck/README.md, README.md, skills/schema-advisor/SKILL.md), assert the target file exists.

**RED-phase verification command:**

```bash
cd frontend && npx playwright test e2e/migration-guide-snippets.spec.ts
```

Expected RED output: every test fails. Test 1 fails directly (`docs/MIGRATION-FROM-NEO4J.md does not exist`). Tests 3–8 and 11 short-circuit on the missing-doc read. Tests 2, 9, 10 require the doc to exist for their setup helpers but assert against the live backend — they also fail on the missing-doc gate.

**GREEN-phase verification command:** same. After Phase 8, every test passes.

**Per-spec runner command (for narrow iteration):**

```bash
cd frontend && npx playwright test e2e/migration-guide-snippets.spec.ts -g "section 7"
```

**Why this is the right test surface:**
- The two `POST /query` cases (tests 9 + 10) prove the working-examples table is *runnable*, not aspirational. Anything else in the doc is prose / framing — shape assertions are the right tool.
- The "honesty markers" (test 4 "not yet published"; test 5 "Bolt v3+") fail if a future edit replaces the honest framing with an invented number. This is the test surface the user asked for: "CITE THE TCK number — don't estimate."
- The cross-link existence test (test 11) catches the most likely silent-rot mode: a renamed crate or moved doc breaks a link.

---

## Section E — Self-review checklist

**Spec coverage (user's brief, bullet by bullet):**
- [x] (a) target audience + 5-min reading goal — Section A
- [x] (b) 7-section outline + word-count budget per section — Section B (each section budgeted ≤ 250w; total ≤ 1300w)
- [x] (c) failing tests at exact path `frontend/e2e/migration-guide-snippets.spec.ts` that run every code snippet against `ogdb serve` and prove they work AS DOCUMENTED — Section D, tests 9 + 10 (POST /query for the two runnable Cypher snippets); plus 9 shape-assertion tests for the prose
- [x] (d) impl sketch with concrete numbers from BENCHMARKS + TCK + ogdb-bolt — Section C, Phases 4 + 5 + 6 cite exact line numbers and exact BENCHMARKS rows
- [x] (e) scope: docs/ + new e2e test ONLY, do NOT touch crates — explicitly excluded in the **Scope** header and reaffirmed in Section F

**User's seven required topics, mapped to outline sections:**
- [x] 1. License + deployment → outline Section 1
- [x] 2. Cypher coverage delta + cite TCK number (honest) → outline Section 2
- [x] 3. Bolt protocol compat → outline Section 3
- [x] 4. AI-native primitives + link to COOKBOOK hybrid recipe → outline Section 4
- [x] 5. Performance honestly (no hype) → outline Section 5
- [x] 6. What to know before migrating (LABEL → labels, id(), BTREE → HNSW) → outline Section 6
- [x] 7. Working examples (one identical, one needing translation) → outline Section 7 + tests 9 + 10

**Placeholder scan:** none. Every section has a concrete word budget, a concrete cite (file + line or doc + row number), a concrete e2e assertion, and a concrete commit message.

**Honesty audit:**
- [x] TCK pass-rate is *not* invented. The plan explicitly tells the writer to cite the 50% floor and the harness command, *not* a number. Test 4 enforces this with the "not yet published" honesty marker.
- [x] Bolt status is honest (v1 only, modern drivers won't fall back). Test 5 enforces with the "Bolt v3+" caveat string.
- [x] Performance section is honest (no hype) — only the rows that BENCHMARKS already labels as wins are cited as wins; the 3 losses are listed by exact ratio; the 5 scale-mismatched rows are deferred. Test 7 enforces with the "scale-mismatch" assertion.

**Type / fact consistency:**
- All seven section headings (used by test 1) match the outline section names exactly.
- All BENCHMARKS row numbers (1, 2, 7, 9, 10, 13) and verbatim numbers (38.8, 44.2, 113.2, 256, 1.88, 0.41, 0.30, 26.3, 39.4) are cross-checked against `docs/BENCHMARKS.md` Section 2.
- Bolt constants (`0x6060_B017`, `BOLT_VERSION_1 = 1`) match `crates/ogdb-bolt/src/lib.rs:8-9` exactly.
- TCK constants (`TIER1_CATEGORIES = ["MATCH", "RETURN", "WHERE", "CREATE", "DELETE", "SET"]`, 50% floor) match `crates/ogdb-tck/src/lib.rs:10` and `:355` exactly.
- The `CREATE INDEX ON :Person(email)` translation row is grounded in the existing test at `crates/ogdb-cli/src/lib.rs:9951`.

**Per-crate test policy:** the only test running is `npx playwright test e2e/migration-guide-snippets.spec.ts` (a single playwright spec, not the full e2e suite). No `cargo test` is needed because no crates change. No whole-suite invocation.

---

## Section F — What stays out of scope

- Editing `crates/*` (the migration guide cites the existing API surface as-is)
- Editing `docs/COOKBOOK.md` (the migration guide is its companion, not a rewrite)
- Editing `docs/BENCHMARKS.md` (the migration guide cites it; doesn't update it)
- Editing `README.md` or `SPEC.md` (cite-only)
- Editing any `skills/*/SKILL.md` (cite-only)
- Adding a new MCP tool, endpoint, or Bolt protocol version
- Publishing a measured external-openCypher-TCK pass rate (deferred — would require an upstream-TCK fixture in CI; tracked as future work outside this guide)
- Bumping Bolt protocol to v3/v4/v5 (deferred — separate engineering plan)
- Multi-writer kernel work (deferred — see BENCHMARKS Section 4.6)
- Bulk-data migration tooling (deferred — see BENCHMARKS Section 4.1)
- `cargo test` on any crate (no Rust code changes)
- Whole-suite playwright run (`npx playwright test` with no filter is forbidden by the per-crate-tests policy)
