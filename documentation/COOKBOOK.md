# OpenGraphDB AI-Agent Cookbook

> Recipes for building AI-agent workloads on OpenGraphDB. Every HTTP snippet on
> this page is exercised by `frontend/e2e/cookbook-snippets-runnable.spec.ts` on
> every PR, so the docs cannot silently rot away from the running binary.

This cookbook is the entry point for engineers building agents that read and
write a graph database. It sits one layer above the four shipped skills
(`skills/data-import`, `skills/graph-explore`, `skills/ogdb-cypher`,
`skills/schema-advisor`) and links down to them: the skills are mini-cookbooks
for narrow tasks, this file is the integrated story.

## Setup

OpenGraphDB ships as a single binary. There is no separate server install, no
Java runtime, no sidecar. Bring it up against a fresh database file:

```bash
# 1. Build the release binary (one-time; ~2 minutes on a modern laptop).
cargo build --release -p ogdb-cli

# 2. Start the HTTP server against a fresh database in /tmp.
./target/release/ogdb serve --http --port 8080 /tmp/cookbook.ogdb
```

The server prints its bind address and stays in the foreground. In a second
terminal, verify it is up:

```bash
curl -s http://127.0.0.1:8080/health
# => {"status":"ok"}
```

`POST` requests below assume `BASE=http://127.0.0.1:8080`. Set it once:

```bash
export BASE=http://127.0.0.1:8080
```

## Table of contents

1. [AI-agent over MCP: connect Claude/GPT to OpenGraphDB](#recipe-1--ai-agent-over-mcp)
2. [Hybrid retrieval: vector + graph + full-text in one query](#recipe-2--hybrid-retrieval)
3. [Ingest a doc + Cypher-query its knowledge graph](#recipe-3--ingest-a-doc--cypher-query)
4. [Time-travel: as-of queries for audit trails](#recipe-4--time-travel)
5. [Skill-quality eval: measure your agent against the 4 shipped skills](#recipe-5--skill-quality-eval)
6. [Migrate from Neo4j: 3 differences that matter](#recipe-6--migrate-from-neo4j)
7. [Detect knowledge-graph regressions in CI](#recipe-7--detect-knowledge-graph-regressions-in-ci)

---

## Recipe 1 — AI-agent over MCP

**When to use this.** You want Claude, GPT, Cursor, Goose, or any other
MCP-aware client to call the database directly, without a Python adapter or
sidecar process. OpenGraphDB exposes the full Model Context Protocol over plain
HTTP at `POST /mcp/tools` (catalog) and `POST /mcp/invoke` (JSON-RPC `tools/call`
shape). Twenty tools are wired in: schema, query, vector, text, temporal, RDF,
agent memory, and GraphRAG.

**The snippets.** First, list every tool the server exposes:

```bash
curl -s -X POST $BASE/mcp/tools \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Then invoke one. `/mcp/invoke` takes the flat tool-call shape: top-level
`name` + `arguments`. (The full JSON-RPC envelope is accepted on the stdio
MCP transport that `ogdb mcp` exposes; the HTTP endpoint accepts the unwrapped
form so curl bodies stay short.)

```bash
curl -s -X POST $BASE/mcp/invoke \
  -H 'Content-Type: application/json' \
  -d '{ "name": "browse_schema", "arguments": {} }'
```

**Expected output.** `/mcp/tools` returns a `tools` array of twenty entries.
Each entry has a `name`, a non-empty `description`, and a JSON-Schema
`inputSchema`. Names (stable across releases — pinned by
`crates/ogdb-cli/src/lib.rs::mcp_full_ai_tools_round_trip_and_stdio_mode`):

```text
browse_schema  execute_cypher  get_node_neighborhood  search_nodes
list_datasets  query           schema                 upsert_node
upsert_edge    subgraph        shortest_path          vector_search
text_search    temporal_diff   import_rdf             export_rdf
agent_store_episode  agent_recall  rag_build_summaries  rag_retrieve
```

The descriptions are not duplicated here on purpose: keeping a 20-entry copy
in sync with the source is the rot pattern eval cycle 2 flagged
(`"description": "..."` placeholders shipped for >1 release). The canonical
descriptions are the ones returned by `POST /mcp/tools` against a live
`ogdb serve --http`; the e2e in
[`frontend/e2e/cookbook-snippets-runnable.spec.ts`](../frontend/e2e/cookbook-snippets-runnable.spec.ts)
asserts `description.length > 0` for every tool on every CI run, so
`"..."`-style placeholders cannot regress in.

`/mcp/invoke` returns the tool's result body directly on success (200) or an
`{ "error": "..." }` object on a 4xx / 5xx:

```json
{ "labels": [], "edge_types": [], "property_keys": [] }
```

**How to verify and cite.** The catalog above is generated from
`crates/ogdb-cli/src/lib.rs::execute_mcp_request` (the `"tools/list"` arm of
the dispatch match — function/test/struct names survive line-renumbering, so
prefer the named anchor over a line range); the `temporal_diff` round-trip is
covered by the existing unit test
`crates/ogdb-cli/src/lib.rs::mcp_full_ai_tools_round_trip_and_stdio_mode`.
Latency: not yet benchmarked.
The MCP transport is a thin wrapper over the existing query, vector, text, and
temporal paths, so per-tool latency tracks the underlying engine numbers (rows
3, 7, 8 of `documentation/BENCHMARKS.md`).

**Related skills.** [`skills/graph-explore/SKILL.md`](../skills/graph-explore/SKILL.md)
shows how an agent should use `browse_schema`, `search_nodes`, and `subgraph` to
discover an unknown graph.

---

## Recipe 2 — Hybrid retrieval

**When to use this.** Your agent needs to retrieve evidence by *meaning*
(vector kNN), *exact text* (BM25), and *graph context* (1-hop neighbours) in a
single round-trip. Most stacks need three engines and a glue layer.
OpenGraphDB runs all three behind one endpoint and fuses the rankings with
Reciprocal Rank Fusion. If `embedding` is omitted the server falls back to
text-only.

**The snippet.** A single POST. `embedding` is a `f32` array; the `dim` must
match the index. Optional `community_id` scopes the search to a single
community summary built by `rag_build_summaries`.

```bash
curl -s -X POST $BASE/rag/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "alice and bob writing the cookbook",
    "embedding": [0.12, -0.04, 0.31, 0.05, 0.22, -0.18, 0.09, 0.41,
                  0.15, -0.02, 0.27, 0.36, -0.11, 0.08, 0.19, 0.04],
    "k": 10
  }'
```

**Expected output.** The response body is a top-level JSON array, ordered by
fused score. On an empty database the array is empty (status 200):

```json
[]
```

On a populated database each row carries the node id, the score, the matching
labels, and the node's properties:

```json
[
  { "node_id": 42, "score": 0.91, "community_id": 0, "labels": ["Person"], "properties": { "name": "Alice" } },
  { "node_id": 17, "score": 0.78, "community_id": 0, "labels": ["Person"], "properties": { "name": "Bob"   } }
]
```

**How to verify and cite.** From `documentation/BENCHMARKS.md` row 8: hybrid retrieval
(vector kNN + 1-hop) p50 / p95 / p99 = **243 / 378 / 422 μs** on 1 000 nodes ×
100 queries × dim=16, on the i9-10920X bench box (cold cache, no warmup). The
0.38 ms p95 is 200× under the 80 ms best-in-class threshold from spec B.3.
Quality (NDCG@10) is deferred until a BEIR corpus is wired (see Section 4.5 of
BENCHMARKS); the latency win is therefore half-claimed for now and the
composite-SLA story waits on the BEIR harness landing.

**Related skills.** [`skills/ogdb-cypher/SKILL.md`](../skills/ogdb-cypher/SKILL.md)
covers the Cypher-side equivalents (`CALL vector.search` and `CALL text.search`)
when you would rather drive retrieval from inside a query plan.

---

## Recipe 3 — Ingest a doc + Cypher-query its knowledge graph

**When to use this.** Your agent receives a document (markdown, plain text, or
PDF) and must extract entities + relationships, persist them as graph nodes and
edges, then answer Cypher questions over the result. This is the canonical
GraphRAG ingest path, with one HTTP call to ingest and one to query.

**The snippets.** Plain text and markdown go in `content`. PDFs go in
`content_base64`:

```bash
# Ingest a plain-text document.
curl -s -X POST $BASE/rag/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "alice-bob-collab",
    "format": "PlainText",
    "content": "Alice works with Bob on the OpenGraphDB cookbook."
  }'

# Or ingest a PDF (base64-encoded bytes).
curl -s -X POST $BASE/rag/ingest \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg b64 "$(base64 -w0 mydoc.pdf)" \
        '{title:"mydoc", format:"Pdf", content_base64:$b64}')"
```

Read the extracted graph back with Cypher:

```bash
curl -s -X POST $BASE/query \
  -H 'Content-Type: application/json' \
  -d '{ "query": "MATCH (n) RETURN count(n) AS c" }'
```

**Expected output.** `/rag/ingest` returns the extraction summary:

```json
{
  "document_id": "doc-7c3f...",
  "entities_extracted": 2,
  "edges_extracted": 1,
  "duration_ms": 41
}
```

`/query` returns the row set:

```json
{ "columns": ["c"], "rows": [[2]] }
```

**How to verify and cite.** From `documentation/BENCHMARKS.md` row 7: enrichment
round-trip `t_persist` p50 / p95 / p99 = **38.8 / 44.2 / 113.2 ms** on 100
documents × (10 entities + 15 edges per doc), measured on
`crates/ogdb-eval/src/drivers/ai_agent.rs::enrichment_roundtrip`. Storage
latency only (no live LLM in the path; the harness uses a deterministic
extractor). p95 of 44 ms beats the 150 ms competitive threshold by 3.4× and
misses the 40 ms best-in-class bar by 4 ms.

**Related skills.** [`skills/data-import/SKILL.md`](../skills/data-import/SKILL.md)
covers the structured-import side (CSV / JSON / RDF) when the source is already
tabular and does not need LLM extraction.

---

## Recipe 4 — Time-travel

**When to use this.** Your agent needs an audit trail: "what did the graph
look like last Thursday at 09:00 UTC?" or "which edges existed before the
2026-04-19 incident?" OpenGraphDB stores edge `valid_from` / `valid_to`
timestamps as a first-class engine primitive, and openCypher is extended with
`AT TIME <ts>` so the time scope rides along with the query plan.

**The snippets.** Diff two timestamps with the `temporal_diff` MCP tool
(timestamps in seconds since epoch):

```bash
NOW=$(date +%s)
curl -s -X POST $BASE/mcp/invoke \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"temporal_diff\",
    \"arguments\": { \"timestamp_a\": 0, \"timestamp_b\": $NOW }
  }"
```

Or use the openCypher `AT TIME` extension directly (timestamps in
milliseconds, matching `crates/ogdb-core` parser):

```bash
curl -s -X POST $BASE/query \
  -H 'Content-Type: application/json' \
  -d '{ "query": "MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000 RETURN b" }'
```

**Expected output.** `temporal_diff` returns both snapshots and the delta as
the response body directly (no JSON-RPC envelope):

```json
{
  "timestamp_a": 0,
  "timestamp_b": 1735689600,
  "snapshot_a": { "node_count": 2, "edge_count": 0 },
  "snapshot_b": { "node_count": 2, "edge_count": 1 },
  "diff":       { "node_count": 0, "edge_count": 1 }
}
```

`AT TIME` returns the row set as it would have been at that timestamp:

```json
{ "columns": ["b"], "rows": [[ {"id": 17, "labels": ["Person"]} ]] }
```

**How to verify and cite.** Round-trip is covered by
`crates/ogdb-cli/src/lib.rs::mcp_full_ai_tools_round_trip_and_stdio_mode` (MCP
path) and
`crates/ogdb-core/src/lib.rs::cypher_query_filters_edges_with_at_time_and_at_system_time`
(named anchors — line numbers churn with every release).
Latency: not yet benchmarked. Bitemporal queries route through the same
storage path as `neighbors()` (row 3 of BENCHMARKS, p99 = 13.5 μs at 10 k
nodes) plus a per-edge timestamp comparison; expect microsecond-class overhead
once the dedicated benchmark lands.

**Related skills.** None of the four shipped skills cover temporal queries
directly; the openCypher syntax is documented in
[`skills/ogdb-cypher/SKILL.md`](../skills/ogdb-cypher/SKILL.md) under the
extensions section.

---

## Recipe 5 — Skill-quality eval

**When to use this.** Most cookbooks stop at "here is how to call the DB".
This one shows how to *evaluate* an agent that uses the DB. The
`crates/ogdb-eval` harness loads `skills/evals/*.eval.yaml` (JSON-in-yaml-suffix
specs), drives every case through a pluggable `LlmAdapter`, scores responses
against `must_contain` / `must_not_contain` / `pattern` gates, and folds the
case-level scores into a per-difficulty + per-skill `pass_rate`.

**The snippet.** Run the existing publish-baseline test, which exercises the
full driver:

```bash
cd crates/ogdb-eval
cargo build --release
OGDB_EVAL_BASELINE_JSON=/tmp/baseline.json \
OGDB_EVAL_BASELINE_MD=/tmp/auto-summary.md \
  cargo test --release --test publish_baseline -- --nocapture
```

A single eval case (`EvalCase` shape, mirrors
`crates/ogdb-eval/src/drivers/skill_quality.rs:52-80`):

```json
{
  "name": "discover-person-label",
  "difficulty": "easy",
  "input": "What labels exist in this graph?",
  "expected": {
    "must_contain": ["Person"],
    "must_not_contain": ["error"],
    "pattern": "(?i)labels?: .*Person.*"
  },
  "scoring": { "must_contain": 0.6, "pattern": 0.4 }
}
```

A whole skill spec is just `{ "skill": "...", "version": "...", "cases": [ ... ] }`.
Drop your cases into `skills/evals/<your-skill>.eval.yaml` and the
publish-baseline run will pick them up.

**Expected output.** The driver emits an `EvaluationRun` that includes one
metric per skill plus per-difficulty rollups:

```json
{
  "suite": "skill_quality",
  "metrics": [
    { "name": "skill_quality.ogdb-cypher.pass_rate",      "value": 0.93 },
    { "name": "skill_quality.ogdb-cypher.easy.pass_rate", "value": 1.00 },
    { "name": "skill_quality.ogdb-cypher.hard.pass_rate", "value": 0.78 }
  ]
}
```

**How to verify and cite.** Driver source:
`crates/ogdb-eval/src/drivers/skill_quality.rs`. Adapter trait + the four
shipped specs live at `skills/evals/*.eval.yaml`. Latency / wall-clock: not
yet benchmarked as a competitive metric; the eval is wired as a quality gate,
not a perf gate. The full publish-baseline run takes ≈ 140 s on the i9-10920X
bench box (BENCHMARKS Section 5) and emits one row per `(suite, subsuite,
metric)` to `auto-summary.md`.

**Related skills.** All four shipped skills ship with eval specs:
[`skills/evals/data-import.eval.yaml`](../skills/evals/data-import.eval.yaml),
[`skills/evals/graph-explore.eval.yaml`](../skills/evals/graph-explore.eval.yaml),
[`skills/evals/ogdb-cypher.eval.yaml`](../skills/evals/ogdb-cypher.eval.yaml),
[`skills/evals/schema-advisor.eval.yaml`](../skills/evals/schema-advisor.eval.yaml).
Use them as templates for your own.

---

## Recipe 6 — Migrate from Neo4j

**When to use this.** You are evaluating OpenGraphDB against an existing
Neo4j (Community, Enterprise, or AuraDB) deployment and need a concrete
delta-list, not marketing prose. Three differences will dominate the
migration cost / value calculation.

| Difference | Neo4j today | OpenGraphDB | Proof |
|---|---|---|---|
| **Single-file vs server.** Embedded use without a JVM. | Standalone JVM server (`neo4j start`) or AuraDB SaaS. Bolt protocol on port 7687. No supported in-process embedding for new builds. | `Database::open("./mydb.ogdb")` runs in-process on a single file. `ogdb serve --http` is opt-in when you actually want a network endpoint. | `crates/ogdb-core/src/lib.rs::Database::open`; the cookbook's [Setup](#setup) section runs against a single file. |
| **Apache 2.0 vs AGPLv3.** Licensing for embedding in commercial agents. | Community = GPLv3. Enterprise = commercial. AuraDB = SaaS. AGPLv3 modules in some plugins (vector / GenAI). | Apache 2.0. Embed in a closed-source agent without legal review. | [`LICENSE`](../LICENSE) in repo root. |
| **AI-native primitives.** Vector, text, MCP, agent memory in the core. | Vector and full-text are bolt-on plugins (Lucene-HNSW, GenAI plugin). MCP needs a Python sidecar or community adapter. No first-class agent-memory API. | `vector_search`, `text_search`, `temporal_diff`, `agent_store_episode`, `agent_recall`, `rag_build_summaries`, `rag_retrieve`, plus `POST /mcp/tools` / `POST /mcp/invoke` ship in the core CLI binary. | Tool catalog at `crates/ogdb-cli/src/lib.rs::execute_mcp_request` (the `"tools/list"` arm); this cookbook's [Recipe 1](#recipe-1--ai-agent-over-mcp) lists all 20 by name. |

**Migration mechanics (sketch).**

1. **Cypher.** Most read queries port unchanged: openCypher coverage in
   `ogdb-core` is the SNB IS-1..7 subset plus aggregation, ordering, and the
   temporal extension. APOC procedures are not portable; rewrite them as
   plain Cypher or a small MCP tool.
2. **Constraints / indexes.** `CREATE INDEX FOR (n:Person) ON (n.email)` works.
   Vector and text indexes use the OpenGraphDB-specific calls
   (`CALL vector.create_index(...)`, `CALL text.create_index(...)`); see
   [`skills/schema-advisor/SKILL.md`](../skills/schema-advisor/SKILL.md).
3. **RDF.** Both engines speak Turtle / N-Triples / JSON-LD. The
   `import_rdf` and `export_rdf` MCP tools cover round-trip.
4. **Auth.** OpenGraphDB exposes Bearer-token auth on `/query` (see the
   `Authorization: Bearer <token>` header path); user model is single-tier.
   Neo4j role-based access does not have a one-to-one mapping yet.

**How to verify and cite.** No latency comparison row in `documentation/BENCHMARKS.md`
maps to this recipe — the migration story is functional, not a perf claim.
Bulk-ingest performance (BENCHMARKS row 1) is currently a known loss vs Kuzu
and Memgraph; if your migration is dominated by an initial historical load,
budget for that gap or wait for the bulk-loader work tracked in BENCHMARKS
Section 4.1.

**Related skills.** [`skills/data-import/SKILL.md`](../skills/data-import/SKILL.md)
walks an agent through the actual import workflow once you have an export.

---

## Recipe 7 — Detect knowledge-graph regressions in CI

**When to use this.** You have an agent that calls into the database, and you
want a `pull-request → merge → release` loop that fails the build the moment
the agent's Cypher answers drift on a real KG. This recipe wires the existing
`release-tests.yaml` manifest (every regression-guard test in the repo) and
the `skill-regression` watchers (`crates/ogdb-eval/tests/skill_regression_*.rs`)
into a GitHub Actions job.

**The snippets.** Run the regression watchers locally first:

```bash
cargo test --release \
  -p ogdb-eval \
  --test skill_regression_threshold \
  --test skill_regression_diff \
  --test skill_regression_history \
  --test skill_regression_report \
  -- --nocapture
```

Then gate the build on `pass_rate >= 0.85` (or your chosen floor) in a GitHub
Actions step:

```yaml
# .github/workflows/skill-quality.yml
name: skill-quality regression gate
on: [pull_request]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Run skill-regression watchers
        run: |
          cargo test --release -p ogdb-eval \
            --test skill_regression_threshold \
            --test skill_regression_diff \
            --test skill_regression_history \
            --test skill_regression_report \
            -- --nocapture
      - name: Check pass-rate floor
        env:
          MIN_PASS_RATE: "0.85"
        run: |
          PR=$(jq -r '[.metrics[] | select(.name|endswith(".pass_rate")) | .value] | min' \
                 documentation/evaluation-runs/baseline-latest.json)
          awk -v pr="$PR" -v min="$MIN_PASS_RATE" \
            'BEGIN { if (pr+0 < min+0) { exit 1 } }'
```

**Expected output.** Green pipeline when every per-skill `pass_rate` is above
the floor; red with a non-zero exit when any skill regresses. The
`skill_regression_diff` test prints a unified diff of the new vs prior run;
`skill_regression_history` keeps the trailing window so flaky cases can be
filtered out before they gate.

**How to verify and cite.** Test sources:
[`crates/ogdb-eval/tests/skill_regression_threshold.rs`](../crates/ogdb-eval/tests/skill_regression_threshold.rs),
[`crates/ogdb-eval/tests/skill_regression_diff.rs`](../crates/ogdb-eval/tests/skill_regression_diff.rs),
[`crates/ogdb-eval/tests/skill_regression_history.rs`](../crates/ogdb-eval/tests/skill_regression_history.rs),
[`crates/ogdb-eval/tests/skill_regression_report.rs`](../crates/ogdb-eval/tests/skill_regression_report.rs).
Manifest of every regression-guard test: [`.claude/release-tests.yaml`](../.claude/release-tests.yaml).
Latency: not yet benchmarked as a metric; the gate is correctness-gated, not
perf-gated. Wall-clock for the four-test bundle is < 10 s on the i9-10920X
bench box.

**Related skills.** All four shipped skills ship eval specs that this gate
runs against. See Recipe 5 for the spec format.

---

## See also

- [`skills/data-import/SKILL.md`](../skills/data-import/SKILL.md) — mini-cookbook for CSV / JSON / RDF ingest.
- [`skills/graph-explore/SKILL.md`](../skills/graph-explore/SKILL.md) — mini-cookbook for graph discovery.
- [`skills/ogdb-cypher/SKILL.md`](../skills/ogdb-cypher/SKILL.md) — mini-cookbook for Cypher generation.
- [`skills/schema-advisor/SKILL.md`](../skills/schema-advisor/SKILL.md) — mini-cookbook for schema design.
- [`documentation/BENCHMARKS.md`](BENCHMARKS.md) — every cited latency number, with reproducibility notes.
- [`README.md`](../README.md) — project status, install, license.

## What is deliberately not in this cookbook

A "multi-agent shared knowledge graph (concurrent writes + MVCC)" recipe is
omitted on purpose. `documentation/BENCHMARKS.md` row 9 documents that the kernel is
single-writer today; the published `concurrent_rate` measurement uses one DB
per thread, which is mechanical, not a real concurrent-write number. Shipping
a recipe that pretends concurrent writes already work would violate the
project's transparency policy. We will revisit when the multi-writer kernel
ships (BENCHMARKS Section 4.6).
