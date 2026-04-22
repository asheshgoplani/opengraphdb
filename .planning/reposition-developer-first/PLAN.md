# Reposition: Developer-First OpenGraphDB — Implementation Plan

> **Phase 2 PLAN — STOP at PLAN_READY. Do NOT implement.**
> **For agentic workers:** Implementation lives in slices R1–R6. Each slice is a separate
> branch + small PR with RED tests landed first. Per-crate `cargo` only — never `cargo test`
> at the workspace root. Use `git worktree add /tmp/wt-<slice> main` per slice.

**Goal:** Reposition OpenGraphDB on landing + playground + docs from "talk to your data"
consumer-AI framing to a developer-first, demonstrably-true graph DB pitch — and ruthlessly
trim anything on the playground that isn't backed by a passing e2e test.

**Architecture:** Three working surfaces:
1. **Landing** — every claim is anchored to a verifiable in-tool capability or a real
   benchmark number, with a build-time "works" badge.
2. **Playground** — only tabs/panels that pass an e2e against the real `ogdb serve --http`
   backend ship to users. Everything else is removed in slice R3/R6.
3. **AI Integration section (landing)** — code-snippet patterns, not a chatbot. Dropped:
   the in-app `AIChatPanel`, `DemoSection` ("Your Question"), and `HowItWorksSection`
   ("AI Skills translate…") because they sell the consumer-AI framing the user is rejecting.

**Tech stack:** React 18 + Vite frontend, Playwright e2e, ogdb-cli `serve --http`, Rust core.
No new dependencies introduced by this plan.

**Scope discipline:** This plan covers **only** website-visible surfaces (landing + playground +
README/SPEC/ARCHITECTURE wording). Rust core, evaluator harness, and any non-user-visible code
is **out of scope** — see (H).

---

## (A) Claims Audit Table

For every user-visible claim across landing, README, SPEC, and ARCHITECTURE: source location,
whether it is demonstrable on `/playground` today, the evidence (test or interactive path), and
the slice that fixes it if not.

Legend: **yes** = a passing e2e proves it end-to-end against real backend; **partial** = UI
exists but only with stubs / canned data / no backend round-trip; **no** = claim has no
demonstrable backing on the live site.

### A.1 Landing claims

| # | Claim | Source (file:line) | Demonstrable? | Evidence | Fix slice |
|---|---|---|---|---|---|
| L1 | "v0.1 · open source · graph-native" badge | `frontend/src/components/landing/HeroSection.tsx:66` | yes | LICENSE = Apache-2.0; repo public on GitHub | — (keep) |
| L2 | "The graph database built for the way knowledge actually moves" (hero h1) | `HeroSection.tsx:69-82` | n/a (poetic) | n/a — but it is consumer-AI flavor; replace with developer-first one-liner | R1 |
| L3 | "OpenGraphDB pairs Rust storage with Cypher ergonomics, so traversals feel **instant** and AI agents get a query surface that respects context" (hero p) | `HeroSection.tsx:84-91` | partial | "Rust storage" + "Cypher" both true; "instant" is unmeasured on landing; "AI agents… respect context" is vague consumer wording | R1 + R5 |
| L4 | Hero stats: "Rust native core / Cypher first-class / MCP AI-ready" | `HeroSection.tsx:21-25` | partial | Rust=true, Cypher=true (TCK harness exists), MCP=true but "AI-ready" wording reads consumer; rephrase to "MCP server built-in" | R1 |
| L5 | "Type the query. Watch the graph answer." + result label "**6 nodes · 6 edges · 0.4ms**" | `SampleQueryPanel.tsx:139-152, 249` | **no** | The graph is a hard-coded `RESULT` constant (lines 30–47); the "0.4ms" is a string literal, not a measured query time. Misleading. | R1 (replace with measured time from a real seeded query OR mark as illustrative) |
| L6 | "Cypher with familiar ergonomics, executed against a Rust-native engine. **What you see is the same shape the playground returns**" | `SampleQueryPanel.tsx:147-150` | **no** | Same as L5 — the panel does not call the backend. The graph shape is dataset-agnostic boilerplate. | R1 (remove "same shape" claim or actually call `apiClient.query`) |
| L7 | "Famous Graph Datasets… industry-standard datasets used by **Neo4j, TigerGraph, and Amazon Neptune**" | `ShowcaseSection.tsx:31-33` | partial | Datasets (MovieLens, AirRoutes, GoT, Wikidata, Community) are real; the "used by Neo4j/TigerGraph/Neptune" name-drop has no citation and is not a claim about OpenGraphDB. Soften to "Standard graph-DB benchmark datasets". | R1 |
| L8 | Feature: "Rust-native core — no JVM, no GC pauses, predictable latency from the first query" | `FeaturesSection.tsx:6-10` | yes (foundational) | Rust source tree exists; core is `ogdb-core`. "Predictable latency" needs perf evidence — link to `BENCHMARKS.md`. | R1 link |
| L9 | Feature: "Cypher, with care… openCypher TCK targeted from day one" | `FeaturesSection.tsx:13-17` | partial | TCK harness exists (`ogdb-tck`), but landing doesn't show TCK pass-rate. Add a "TCK floor: X%" badge or link. | R1 + R4 |
| L10 | Feature: "Built for agents — first-class MCP, machine-readable plans, and stable result shapes — graph as a primitive, not an afterthought" | `FeaturesSection.tsx:19-23` | partial | MCP server real; "machine-readable plans" = `query_profiled` exists; "stable result shapes" = `--format json` is shipped. But landing has no link/snippet proving any of these. | R1 + R2 |
| L11 | Feature: "Embed or serve — single binary you can ship inside the app, or run as a Bolt/HTTP server. Backups are file copies." | `FeaturesSection.tsx:26-29` | yes | `ogdb serve --http`, `ogdb backup`, library crate all exist; verified by `rdf-import-real.spec.ts` spawning the binary. | — (keep) |
| L12 | Benchmark strip: "**37µs** create_node (p50, single writer)" | `BenchmarkStrip.tsx:6-9` | partial | Number lives in `BENCHMARKS.md`; landing has no link or build-stamp; no proof it matches **this** build. | R4 (build-time stamp + commit hash) |
| L13 | Benchmark strip: "**40ms** 1k node ingest (cold, MVCC)" | `BenchmarkStrip.tsx:11-14` | partial | Same as L12. | R4 |
| L14 | Benchmark strip: "**< 1ms** 2-hop traversal (in-memory CSR)" | `BenchmarkStrip.tsx:16-19` | partial | Same as L12. | R4 |
| L15 | Benchmark strip: "BEIR · LDBC — **soon**" | `BenchmarkStrip.tsx:21-24` | yes (honest) | Honest "soon" label — keep. | — |
| L16 | "**Numbers we publish, not numbers we promise.** Every figure here lives in `benches/` and re-runs on every release tag." | `BenchmarkStrip.tsx:51-58` | **no** | Path `benches/` does not exist as a top-level dir (benchmarks live in `benchmarks/` and `crates/ogdb-bench/`). Either create symlink, fix the path, or stamp the latest bench-run date next to each metric. | R4 |
| L17 | Getting Started: `cargo install opengraphdb` works | `GettingStartedSection.tsx:12` | partial | Crate is not published to crates.io (verify); installation path is `cargo install --path crates/ogdb-cli`. Fix copy or publish. | R1 |
| L18 | Getting Started: `opengraphdb serve --http --mcp` | `GettingStartedSection.tsx:17` | partial | `serve` flags exist but `--mcp` may not be a valid flag (binary uses `--http \| --bolt \| --grpc`); MCP runs via separate `ogdb mcp` command. Fix copy or add flag. | R1 |
| L19 | "Three commands to a living graph" | `GettingStartedSection.tsx:60` | yes (after L17/L18 fix) | Three steps after fixing copy. | R1 |
| L20 | DemoSection ("Your Question" → AI Skills → Cypher → graph) | `frontend/src/components/demo/DemoSection.tsx`, `HowItWorksSection.tsx:1-32` | n/a | This entire pipeline sells the consumer-AI chat narrative (`Ask in plain English. No query language knowledge needed`). **Drop in R1.** | R1 (remove) |

### A.2 README + SPEC + ARCHITECTURE claims

| # | Claim | Source | Demonstrable? | Fix slice |
|---|---|---|---|---|
| R1 | "**The SQLite of graph databases. Embeddable, AI-native, Apache 2.0**" (tagline) | `README.md:3` | partial | SQLite-of-graph: defensible, single-file model exists; **AI-native** is consumer wording — change to "MCP-ready" or "agent-friendly". Apache-2.0 = true. | R1 |
| R2 | "Single file, zero setup, Cypher queries, native vector search, and built-in MCP support" | `README.md:7` | yes (mostly) | Single file = `*.ogdb` + WAL is two files but small set; vector search via `usearch` integrated in `ogdb-vector` (verify); MCP = `ogdb mcp` exists. | — (keep, soften "single file" to "single-file authoritative state + WAL") |
| R3 | "What We're Going For" — Embeddable, Cypher/GQL, Graph + Vector + Full-text in one engine, RDF/TTL import, MCP server built-in, Rust columnar MVCC WAL | `README.md:70-75` | partial → yes | Each is implemented in some form (per the implemented list at lines 62–66). README itself documents this. Aspirational language ("What we're going for") is fine for README. | — |
| S1 | SPEC §1: "the SQLite for graph databases: a single-binary, embeddable, high-performance graph database written in Rust with native vector search, full-text search, and first-class AI agent support" | `SPEC.md:15` | yes | Foundational vision, accurate; "first-class AI agent support" = MCP. Keep but **never let "first-class AI agent support" leak into landing as "talk to your data"**. | — |
| S2 | SPEC §3 Target Users: "AI/ML engineers building RAG pipelines… startups that can't afford Neo4j Enterprise" | `SPEC.md:35-43` | yes | Internal positioning doc — fine. Landing must match this developer audience, not consumers. | — (governs landing) |
| S3 | SPEC §10 (implied): "**> 100K QPS LDBC target**" — *user prompt asks if this lands on landing* | `SPEC.md` (search "100K" / "LDBC") | **no** (not on landing) | LDBC numbers do not appear on landing; benchmark strip says "BEIR · LDBC: soon" which is honest. Add a "stretch target: 100K QPS LDBC SNB IC reads — tracked in `BENCHMARKS.md`" footnote on the benchmark strip. | R4 |
| S4 | ARCHITECTURE §6: "MVCC with snapshot isolation. Single-writer mutex in embedded mode" | `ARCHITECTURE.md:104-107` | yes | Implemented; `ogdb stats` and `ogdb metrics` expose tx counters. Landing has no MVCC/WAL status panel — could add one to playground stats. | R3 |

### A.3 Playground claims

| # | Visible feature | File | Backend-connected today? | e2e proof | Fix slice |
|---|---|---|---|---|---|
| P1 | Cypher editor (Power mode) | `PlaygroundPage.tsx:464-485`, `CypherEditorPanel` | yes (calls `apiClient.query`) | partial — `playground.spec.ts` exists but does not spawn `ogdb serve` | R3 (add backend-connected spec) |
| P2 | Live mode toggle (off → seeded; on → real backend) | `PlaygroundPage.tsx:329`, `LiveModeToggle.tsx` | yes | `app.spec.ts` toggles UI but no backend spawn | R3 |
| P3 | Trace mode (when Live) | `PlaygroundPage.tsx:330-340` | yes (uses `apiClient.queryWithTrace`) | **none** | R3 (add or remove per (I)) |
| P4 | AI button (`Sparkles` icon) → AIChatPanel | `PlaygroundPage.tsx:341-349`, `AIChatPanel.tsx`, `useAIChat.ts` | partial (uses local LLM via `useAIChat`) | **none** | **R1 (remove — consumer chat)** |
| P5 | Dataset switcher | `DatasetSwitcher.tsx` | yes (loads seeded data) | `playground-canvas-renders.spec.ts` | — (keep) |
| P6 | Guided Queries (Explore/Traverse/Analyze) | `PlaygroundPage.tsx:355-394` | yes (live mode → backend) | partial — `app.spec.ts` clicks query but seeded data path | R3 |
| P7 | StatsPanel (nodes/edges/labels) | `StatsPanel.tsx` | yes (counts current graph) | `app.spec.ts` indirect | R3 |
| P8 | RDF Dropzone (live persistence) | `RDFDropzone.tsx` | yes | **`rdf-import-real.spec.ts` ✅** spawns `ogdb serve --http` and verifies persistence | — (keep — gold-standard pattern) |
| P9 | SchemaBrowser | `SchemaBrowser.tsx` | yes (derives from current graph) | `schema-browser.spec.ts`, `slice13-schema-routing.spec.ts` | — (keep) |
| P10 | Schema "Ontology mode" toggle | `PlaygroundPage.tsx:99`, `SchemaBrowser` | unclear | **none** | R6 (audit — remove if not exercised) |
| P11 | TimeSlider (Temporal tab) | `TimeSlider.tsx` | client-only (uses `applyTimeCutoff` on seeded graph) | `temporal-slider.spec.ts` | partial — keep but mark "client-side filter, not backend-time-travel" until backend valid_from/to ships |
| P12 | SemanticSearchPanel (vector + FTS + hybrid RRF) | `SemanticSearchPanel.tsx` | partial — `semantic-search.spec.ts` exists | check spec | R3 (verify backend wiring) |
| P13 | MCP Tool Gallery (sidebar + tab) | `MCPToolGallery.tsx`, `mcpTools.ts` | yes (`mcpClient` posts to `/api/mcp/invoke`) | `mcp-honest-preview.spec.ts` ✅ (stubbed) + `mcp-gallery.spec.ts` | R3 (add real-backend variant; honest preview already lands) |
| P14 | PerfStrip (query time / node / edge / live badge) | `PerfStrip.tsx` | yes | `polish-cohesion.spec.ts` | — (keep) |
| P15 | StatusBar (dataset, time-cutoff label) | `StatusBar.tsx` | yes | `app.spec.ts` | — (keep) |
| P16 | Mobile-only DatasetSwitcher + Guided Queries duplication | `PlaygroundPage.tsx:743-787` | n/a | **none** | R6 (audit) |

---

## (B) Messaging Rewrite

### B.1 Hero (replaces `HeroSection.tsx:69-91`)

**Eyebrow badge:** `v0.1 · open source · Apache-2.0 · single-file`

**H1 (developer-first one-liner — pick one):**
- A. **"The single-file graph DB Rust devs reach for."**
- B. **"A graph database that lives in your binary."**
- C. **"Cypher, MVCC, vectors — in one Rust crate."**

→ Default: **A**, with B as A/B candidate (R1 step 4 ships A; instrumentation lives behind a
  feature flag for later).

**Sub:** "OpenGraphDB embeds in your Rust/Python/Node app or runs as a single `ogdb serve`
process. Cypher queries, MVCC, WAL, and an MCP surface for AI tools — no JVM, no separate
search index to keep in sync."

**Stats trio (replaces L4):**
- `Rust` — single-binary core
- `Cypher` — openCypher TCK gated
- `MCP` — JSON-RPC tool surface

**Primary CTA:** "Open the playground" → `/playground`
**Secondary CTA:** "View on GitHub"

### B.2 Feature blocks (replaces `FeaturesSection.tsx`)

Each block must (a) name a verifiable capability, (b) link to the playground tab or doc that
demonstrates it, (c) include a copyable code snippet.

1. **Embedded or served — your call.**
   *Verifiable via:* `cargo install --path crates/ogdb-cli && ogdb serve --http`. Snippet:
   ```rust
   use ogdb_core::Database;
   let db = Database::open("data.ogdb")?;
   let rows = db.query("MATCH (n:Movie) RETURN n LIMIT 10")?;
   ```
   *Link:* `/playground?dataset=movielens` (Power mode → real backend).

2. **Cypher, with TCK gating.**
   *Verifiable via:* `cargo run --release -p ogdb-tck -- /path/to/openCypher/tck`.
   Snippet (a non-trivial guided query that ships in playground). Link: `/playground` →
   Power mode.

3. **Graph + Vector + Full-text in one process.**
   *Verifiable via:* the Semantic tab on `/playground` (MovieLens). Snippet:
   ```cypher
   MATCH (m:Movie)
   WHERE m.embedding <-> $q < 0.3
   CALL db.index.fulltext.queryNodes('movie_title', $kw, 10)
   YIELD node, score
   RETURN m, node, score
   ```
   Link: `/playground#semantic`.

4. **MCP server built-in.**
   *Verifiable via:* `ogdb mcp --stdio` + `MCPToolGallery` honest-preview pattern. Snippet:
   ```bash
   ogdb mcp /path/to/db.ogdb --stdio
   # then point Claude / Cursor / Copilot at the stdio process
   ```
   Link: `/playground#mcp`.

### B.3 AI Integration section (NEW landing section, replaces DemoSection + HowItWorksSection)

**Heading:** "AI integration — patterns, not a chatbot"
**Sub:** "OpenGraphDB doesn't bundle an LLM. It gives you the substrate any agent can build
on. Here are four patterns we test:"

**Pattern 1 — LLM → Cypher.** Snippet using OpenAI's Python client to generate a Cypher
query from a natural-language prompt + the schema, then execute it via `opengraphdb` Python
binding. Includes "copy snippet" button. Links to `examples/llm-to-cypher.py` (must exist —
slice R2 ships the example).

**Pattern 2 — Embed nodes + hybrid search.** Snippet using `sentence-transformers` to embed
node properties, store via `db.set_vector(node_id, vec)`, then query with the hybrid RRF
example from B.2 #3. Links to `examples/embed-and-search.py`.

**Pattern 3 — Cosmos.gl visualization as an MCP-served capability.** Snippet showing how to
register a custom MCP tool that returns Cosmos.gl-renderable graph data, plus the React
hook that subscribes. Links to `examples/cosmos-mcp.ts`.

**Pattern 4 — Multi-agent shared knowledge graph.** Snippet showing two agent processes
each opening the same `.ogdb` with `Database::open` (shared snapshot isolation), one writing
facts and one querying. Links to `examples/multi-agent-kg.py`.

**Footer:** "These patterns live in `examples/` and ship with their own e2e tests. The
build-time badge above (see (D)) goes red if any of them stop working."

### B.4 Phrasing to drop (forbidden on landing)

- "Ask your data" / "talk to your data" / "answer in plain English"
- "AI Skills translate your question…" (`HowItWorksSection.tsx:18-19`)
- "AI agents get a query surface that respects context" (`HeroSection.tsx:90`) — vague
- "AI-native" without "MCP-ready" qualification

### B.5 README tagline rewrite

Current (`README.md:3`):
> The SQLite of graph databases. Embeddable, AI-native, Apache 2.0.

New:
> **The single-file graph DB for Rust, Python, and Node.** Embeddable. Cypher.
> MCP-ready. Apache 2.0.

---

## (C) Playground Changes

### C.1 Tabs to keep — each must demonstrate a real claim with a passing real-backend e2e

| Tab | Claim it demonstrates | Real-backend e2e required |
|---|---|---|
| **Power** (Cypher editor + execute → graph) | "Cypher executed against the real Rust engine" | new `power-mode-real.spec.ts` (slice R3) |
| **Schema** (browser + ontology toggle) | "Schema introspection — labels, edges, property keys" | `schema-browser.spec.ts` exists; add backend-connected variant in R3 |
| **Semantic** (vector + full-text + hybrid) | "Graph + Vector + Full-text in one process" | new `semantic-real.spec.ts` (R3) |
| **Temporal** (time slider) | "Client-side time slicing on temporal datasets — not backend valid_from/to yet" | `temporal-slider.spec.ts` exists; **add visible "client-side preview" badge** so it isn't sold as backend-time-travel |
| **MCP** (tool gallery + try-me) | "MCP server built-in" | `mcp-honest-preview.spec.ts` exists; add `mcp-real.spec.ts` (real backend, real `/api/mcp/invoke`) in R3 |

### C.2 Tabs / panels to remove

| Element | Why | Slice |
|---|---|---|
| `AIChatPanel` (Sparkles button → sheet) | Sells consumer chat; uses an in-browser LLM `useAIChat`; no value to a developer evaluating the engine | **R1** |
| `DemoSection` (landing) | "Your Question → AI Skills → Cypher → Visual Answer" — pure consumer narrative | **R1** |
| `HowItWorksSection` (landing) | Same pipeline narrative as DemoSection | **R1** |
| Sidebar duplicate `MCPToolGallery` | Same component now lives in MCP tab; sidebar version dilutes the "MCP is its own surface" story | **R1** |
| Mobile-only DatasetSwitcher + Guided Queries duplicate (`PlaygroundPage.tsx:743-787`) | Audit in R6; if not exercised, remove | **R6** |

### C.3 Tabs whose claim must be **rewritten**, not removed

- **Trace mode** — keep, but rename UI label from "Trace" (vague) to "Profile" and make the
  result render the actual `query_profiled` plan tree. Slice R3.
- **Live mode toggle** — keep; add a "what is Live mode?" tooltip that explains "off = bundled
  seed data, on = round-trips to `ogdb serve --http`".

---

## (D) Website "works" guarantee

### D.1 Build-time claim verifier

A new script `scripts/verify-claims.sh` runs in CI on every push to `main`. It:

1. Builds release `ogdb` binary.
2. Spawns `ogdb serve --http --port 18080` against a fresh tempdir.
3. Runs the Playwright project `claims-verify` (defined in `frontend/playwright.config.ts`)
   which contains exactly one spec per landing claim that requires backend proof:
   - `claims/cypher-roundtrip.spec.ts` — proves L8 + L11 (Power mode → real query).
   - `claims/rdf-persist.spec.ts` — re-uses `rdf-import-real.spec.ts` patterns, proves R3 RDF claim.
   - `claims/mcp-live.spec.ts` — proves L10 + P13 (real `/api/mcp/invoke`).
   - `claims/semantic-hybrid.spec.ts` — proves L10 / pattern 2 / B.2 #3.
   - `claims/bench-stamp.spec.ts` — asserts `BenchmarkStrip` shows a `data-build-sha=<hash>`
     and `data-bench-date=<ISO>` matching the latest entry in `BENCHMARKS.md`.
4. Writes `frontend/public/claims-status.json` with: `{ buildSha, builtAt, claims: [{id, ok, evidence}] }`.

### D.2 Visible landing badge

Component `frontend/src/components/landing/ClaimsBadge.tsx`:
- Reads `claims-status.json` at build time (Vite `import.meta.glob`).
- Renders a small green pill: `All 5 claims verified · build 6f6ade1 · 2026-04-22 14:03 UTC`.
- If **any** `claims[].ok === false`, renders a **red** banner at the top of landing and a
  red pill on the badge: `1 claim failing — see /claims`.
- Anchor `/claims` route renders the table from `claims-status.json` for transparency.

### D.3 CI gate

`.github/workflows/claims.yml`:
- Runs on `pull_request` to `main` and on `push` to `main`.
- Fails the build if `verify-claims.sh` exits non-zero. PRs cannot merge with red claims.

---

## (E) Implementation Slices

Sequential. One slice = one branch = one PR. No slice depends on a later slice.

### Slice R1 — Drop AI-chat / consumer language. Rewrite landing copy.

**Files removed:**
- `frontend/src/components/ai/AIChatPanel.tsx`, `AIChatMessage.tsx`, `AIDownloadProgress.tsx`,
  `AITypingIndicator.tsx`, `MCPActivityPanel.tsx`
- `frontend/src/hooks/useAIChat.ts`, `useDemoChat.ts`
- `frontend/src/stores/ai-chat.ts`, `frontend/src/stores/demo.ts`
- `frontend/src/components/demo/` (whole directory)
- Sparkles "AI" button block in `PlaygroundPage.tsx:341-354`

**Files modified:**
- `frontend/src/pages/LandingPage.tsx` — remove `<DemoSection>` and `<HowItWorksSection>` lazy imports
- `frontend/src/components/landing/HeroSection.tsx` — apply B.1 copy
- `frontend/src/components/landing/FeaturesSection.tsx` — apply B.2 copy
- `frontend/src/components/landing/SampleQueryPanel.tsx` — fix L5/L6 (either wire to `apiClient.query`
  in dev mode or replace "0.4ms" with a clearly-illustrative caption)
- `frontend/src/components/landing/ShowcaseSection.tsx` — soften the Neo4j/TigerGraph/Neptune wording
- `frontend/src/components/landing/GettingStartedSection.tsx` — fix L17 (`cargo install --path …`)
  and L18 (`opengraphdb mcp --stdio` is the correct command, not `serve --mcp`)
- `README.md` — apply B.5 tagline

**RED tests (commit first, MUST fail before implementation):**
- `frontend/e2e/reposition/landing-no-consumer-ai.spec.ts` — see (F) F1
- `frontend/e2e/reposition/playground-no-ai-chat.spec.ts` — see (F) F2
- `frontend/e2e/reposition/landing-cli-snippets-correct.spec.ts` — see (F) F3

**Done when:** all 3 RED tests pass; `cargo check -p ogdb-cli` (sanity) still passes; no
references to `AIChatPanel`, `useAIChat`, `useDemoChat`, `DemoSection`, `HowItWorksSection`
remain via `grep`.

**Effort:** ~4 h. Single PR.

---

### Slice R2 — AI Integration section + 4 code patterns + copy-snippet button

**Files created:**
- `frontend/src/components/landing/AIIntegrationSection.tsx` — renders the 4 patterns from B.3
- `frontend/src/components/landing/CodeSnippetCard.tsx` — copyable snippet card (re-uses the
  `Copy / Copied` toggle pattern from `GettingStartedSection.tsx:78-103`)
- `examples/llm-to-cypher.py` — runnable Pattern 1
- `examples/embed-and-search.py` — runnable Pattern 2
- `examples/cosmos-mcp.ts` — runnable Pattern 3
- `examples/multi-agent-kg.py` — runnable Pattern 4

**Files modified:**
- `frontend/src/pages/LandingPage.tsx` — insert `<AIIntegrationSection>` between
  `<FeaturesSection>` and `<GettingStartedSection>`

**RED tests:**
- `frontend/e2e/reposition/ai-integration-section.spec.ts` — see (F) F4
- `frontend/e2e/reposition/copy-snippet-button.spec.ts` — see (F) F5

**Done when:** RED tests pass; each example file is referenced by a `data-example-path`
attribute on its card; landing visually checked at 1280×800.

**Effort:** ~4 h. Single PR.

---

### Slice R3 — Verify each playground tab demonstrates its claim end-to-end (real backend)

**Files created:**
- `frontend/e2e/claims/cypher-roundtrip.spec.ts` — Power mode + real `ogdb serve --http`
- `frontend/e2e/claims/semantic-hybrid.spec.ts` — Semantic tab + real backend, hybrid query returns hits
- `frontend/e2e/claims/mcp-live.spec.ts` — MCP try-me with real backend, badge = `live`
- `frontend/e2e/claims/schema-real.spec.ts` — Schema browser populated from real `/api/schema`
- `frontend/e2e/claims/temporal-client-side.spec.ts` — TimeSlider explicitly labelled "client-side preview"
- `frontend/e2e/_helpers/serve-fixture.ts` — extracted `beforeAll`/`afterAll` `ogdb serve` helper
  (lifted from `rdf-import-real.spec.ts:54-113`) so every claim spec re-uses it

**Files modified:**
- `frontend/src/components/playground/TimeSlider.tsx` — add `data-testid="temporal-client-side-badge"`
- `frontend/src/components/playground/PowerModeToggle.tsx` — add tooltip "Live mode → real backend"

**RED tests:** the new claim specs themselves are RED until backend wiring lands per spec.

**Done when:** all 5 claim specs green against the real `ogdb serve --http`. Anything that
cannot be proven goes onto the R6 chopping block.

**Effort:** ~6 h. Single PR.

---

### Slice R4 — Build-time claim verifier + landing badge + benchmark stamp

**Files created:**
- `scripts/verify-claims.sh` — see (D.1)
- `frontend/playwright.config.ts` (modify) — add `claims-verify` project
- `frontend/src/components/landing/ClaimsBadge.tsx` — see (D.2)
- `frontend/src/pages/ClaimsPage.tsx` — `/claims` route showing per-claim status
- `frontend/src/AppRouter.tsx` (modify) — add `/claims` route
- `.github/workflows/claims.yml` — see (D.3)
- `BENCHMARKS.md` (modify) — add machine-parseable header (`bench_date: 2026-04-22`,
  `bench_sha: <hash>`) consumed by `bench-stamp.spec.ts`

**Files modified:**
- `frontend/src/components/landing/BenchmarkStrip.tsx` — render `data-bench-date` / `data-bench-sha`,
  link "Numbers we publish, not numbers we promise" to `/claims`
- `frontend/src/components/landing/HeroSection.tsx` — render `<ClaimsBadge>` in eyebrow row

**RED tests:**
- `frontend/e2e/claims/bench-stamp.spec.ts` — see (F) F6
- `frontend/e2e/reposition/claims-badge.spec.ts` — see (F) F7

**Done when:** RED tests pass; opening `/` shows green pill if all claims pass; flipping any
claim to fail makes the red banner appear.

**Effort:** ~6 h. Single PR.

---

### Slice R5 — Perf pass (covers slice 16 work — labels jank + zoom lag)

Out-of-scope for messaging but in-scope per user prompt because perceived performance is a
landing claim ("traversals feel instant").

**Files modified:**
- `frontend/src/components/graph/GraphCanvas.tsx` — fix label-render jank during pan/zoom
  (likely: throttle `nodeCanvasObject` invocations during high-velocity drag; switch to
  off-screen canvas for label halos)
- `frontend/src/graph/theme.ts` — measure and cap `paintGraphNode` cost when `globalScale > 4`

**RED tests:**
- `frontend/e2e/reposition/perf-pan-zoom.spec.ts` — see (F) F8 (uses `page.evaluate` with
  `performance.now()` to assert no frame > 50 ms during a scripted pan + 4× zoom on
  MovieLens)

**Done when:** RED test passes; visual smoke: pan + zoom is smooth on the largest bundled
dataset (Wikidata 5K nodes).

**Effort:** ~6 h. Single PR.

---

### Slice R6 — Visible feature audit + ruthless trim

Inventory every interactive element on `/playground`, map to e2e test, **remove anything
orphaned** per (I).

**Process (executed in slice R6):**
1. Run `frontend/e2e/reposition/feature-inventory.spec.ts` — see (F) F9. Spec walks the
   playground DOM, lists every `[role=button]`, `[role=tab]`, `[data-testid]`, and writes
   `frontend/test-results/feature-inventory.json`.
2. For each entry, the spec asserts at least one other e2e file references the testid /
   selector. Entries with zero references are flagged orphan.
3. Author triage table per (J): every flagged orphan is removed in this slice or paired with
   a new e2e in a follow-up.

**Files removed (provisional, finalised by inventory output):**
- Sidebar `MCPToolGallery` duplicate (already removed in R1) — verify
- Mobile duplicate panels block (`PlaygroundPage.tsx:743-787`) if unused on mobile viewport
- `OntologyMode` toggle in `SchemaBrowser` if no e2e exercises it

**RED tests:**
- F9 (inventory spec)
- For every kept feature: there exists at least one spec referencing it (asserted by F9).

**Done when:** F9 reports zero orphans; the `/playground` UI is strictly equal to the union
of the (J) test-coverage matrix.

**Effort:** ~5 h. Single PR.

---

## (F) RED tests committed for each slice

Each spec is committed in its slice's first commit and **must fail** before implementation.

### F1 — `landing-no-consumer-ai.spec.ts` (R1)

```ts
import { expect, test } from '@playwright/test'

test('landing has no consumer-AI phrasing', async ({ page }) => {
  await page.goto('/')
  const text = (await page.locator('main').innerText()).toLowerCase()
  for (const banned of [
    'ask your data',
    'talk to your data',
    'in plain english',
    'ai skills translate',
    'your question',
  ]) {
    expect(text, `landing must not contain "${banned}"`).not.toContain(banned)
  }
})

test('landing does not render DemoSection or HowItWorksSection', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('section#demo')).toHaveCount(1) // SampleQueryPanel keeps id="demo"
  // HowItWorksSection used to render an h2 with text "How it works"
  await expect(page.getByRole('heading', { name: /how it works/i })).toHaveCount(0)
  // DemoChatInput used a textarea; must not exist
  await expect(page.locator('[data-testid="demo-chat-input"]')).toHaveCount(0)
})
```

### F2 — `playground-no-ai-chat.spec.ts` (R1)

```ts
import { expect, test } from '@playwright/test'

test('playground has no AI chat affordance', async ({ page }) => {
  await page.goto('/playground')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: /^AI$/ })).toHaveCount(0)
  await expect(page.locator('[data-testid="ai-chat-panel"]')).toHaveCount(0)
  // Sparkles icon in the header was the AI button — should be gone
  await expect(page.locator('header svg.lucide-sparkles')).toHaveCount(0)
})
```

### F3 — `landing-cli-snippets-correct.spec.ts` (R1)

```ts
import { expect, test } from '@playwright/test'

test('Getting Started snippets match real CLI surface', async ({ page }) => {
  await page.goto('/')
  const text = await page.locator('section#get-started').innerText()
  // Install: must be the path-based form until crate is published
  expect(text).toContain('cargo install --path crates/ogdb-cli')
  // MCP is its own command, not a flag on serve
  expect(text).not.toContain('serve --http --mcp')
  expect(text).toContain('ogdb mcp')
})
```

### F4 — `ai-integration-section.spec.ts` (R2)

```ts
import { expect, test } from '@playwright/test'

test('AI Integration section ships 4 patterns with code + example link', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('section#ai-integration')
  await expect(section).toBeVisible()
  await expect(section.getByRole('heading', { level: 2 })).toContainText(/AI integration/i)
  const cards = section.locator('[data-testid="ai-pattern-card"]')
  await expect(cards).toHaveCount(4)
  for (const i of [0, 1, 2, 3]) {
    const card = cards.nth(i)
    await expect(card.locator('pre code')).toBeVisible()
    await expect(card.locator('[data-example-path]')).toHaveAttribute(
      'data-example-path',
      /^examples\/(llm-to-cypher\.py|embed-and-search\.py|cosmos-mcp\.ts|multi-agent-kg\.py)$/,
    )
  }
})
```

### F5 — `copy-snippet-button.spec.ts` (R2)

```ts
import { expect, test } from '@playwright/test'

test('clicking copy on the first AI-pattern card writes the snippet to clipboard', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const card = page.locator('[data-testid="ai-pattern-card"]').first()
  const expected = (await card.locator('pre code').innerText()).trim()
  await card.getByRole('button', { name: /copy/i }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip.trim()).toBe(expected)
})
```

### F6 — `bench-stamp.spec.ts` (R4)

```ts
import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

test('BenchmarkStrip stamps the latest BENCHMARKS.md run', async ({ page }) => {
  await page.goto('/')
  const strip = page.locator('section[aria-labelledby="benchmark-heading"]')
  const benchDate = await strip.getAttribute('data-bench-date')
  const benchSha = await strip.getAttribute('data-bench-sha')
  const md = readFileSync(join(process.cwd(), '..', 'BENCHMARKS.md'), 'utf8')
  // BENCHMARKS.md must carry a header block we can parse
  const dateMatch = md.match(/^bench_date:\s*(\S+)/m)
  const shaMatch = md.match(/^bench_sha:\s*(\S+)/m)
  expect(dateMatch?.[1]).toBe(benchDate)
  expect(shaMatch?.[1]).toBe(benchSha)
})
```

### F7 — `claims-badge.spec.ts` (R4)

```ts
import { expect, test } from '@playwright/test'

test('ClaimsBadge renders green pill when all claims pass', async ({ page }) => {
  await page.goto('/')
  const badge = page.locator('[data-testid="claims-badge"]')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('data-state', 'green')
  await expect(badge).toContainText(/verified/i)
})

test('ClaimsBadge renders red banner when at least one claim fails', async ({ page, context }) => {
  // Stub the JSON to flip one claim to failing
  await context.route('**/claims-status.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        buildSha: 'deadbee',
        builtAt: '2026-04-22T14:03:00Z',
        claims: [{ id: 'cypher-roundtrip', ok: false, evidence: 'http 500' }],
      }),
    }),
  )
  await page.goto('/')
  await expect(page.locator('[data-testid="claims-banner-red"]')).toBeVisible()
})
```

### F8 — `perf-pan-zoom.spec.ts` (R5)

```ts
import { expect, test } from '@playwright/test'

test('pan + 4× zoom on MovieLens stays under 50 ms per frame', async ({ page }) => {
  await page.goto('/playground?dataset=movielens')
  await page.waitForSelector('canvas')
  const slowFrames = await page.evaluate(async () => {
    const slow: number[] = []
    let last = performance.now()
    const cb = () => {
      const now = performance.now()
      const delta = now - last
      if (delta > 50) slow.push(delta)
      last = now
      requestAnimationFrame(cb)
    }
    requestAnimationFrame(cb)
    // Scripted gesture — pan + zoom for 2 s
    const canvas = document.querySelector('canvas')!
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -400 }))
    await new Promise((r) => setTimeout(r, 2000))
    return slow
  })
  expect(slowFrames.length, `frames > 50ms: ${slowFrames.join(',')}`).toBeLessThanOrEqual(2)
})
```

### F9 — `feature-inventory.spec.ts` (R6)

```ts
import { test, expect } from '@playwright/test'
import { writeFileSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

test('every interactive element on /playground is referenced by another spec', async ({
  page,
}) => {
  await page.goto('/playground')
  await page.waitForLoadState('networkidle')

  const ids = await page.$$eval('[data-testid]', (els) =>
    els.map((e) => e.getAttribute('data-testid')!).filter(Boolean),
  )
  const buttons = await page.$$eval('button', (els) =>
    els.map((e) => e.getAttribute('aria-label') || e.textContent?.trim() || '').filter(Boolean),
  )
  const inventory = { ids, buttons }
  writeFileSync('test-results/feature-inventory.json', JSON.stringify(inventory, null, 2))

  const specsDir = join(process.cwd(), 'e2e')
  const specFiles = readdirSync(specsDir, { recursive: true }) as string[]
  const allSpecs = specFiles
    .filter((f) => typeof f === 'string' && f.endsWith('.spec.ts'))
    .map((f) => readFileSync(join(specsDir, f), 'utf8'))
    .join('\n')

  const orphans = ids.filter((id) => !allSpecs.includes(id))
  expect(orphans, `orphan testids: ${orphans.join(', ')}`).toEqual([])
})
```

---

## (G) Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-22 | Drop in-app `AIChatPanel`, `DemoSection`, `HowItWorksSection` entirely. | User explicitly: "Drop the in-playground AI chat features (don't ship something that pretends a chatbot is the product)". OpenGraphDB is a developer-first DB, not a "talk to your data" product. |
| 2026-04-22 | AI integration is a **landing section** of code patterns, not a runtime feature. | "AI integration is a possibility we ENABLE for developers (MCP, embeddings, Cypher-from-LLM), shown as code patterns + examples on the website." |
| 2026-04-22 | Every landing claim that requires backend proof must have a `claims/*.spec.ts` that runs against a real `ogdb serve --http`. Stubbed e2e is not enough. | User: "the default test environment must spawn ogdb serve and verify real round-trips." |
| 2026-04-22 | Honest-preview pattern (slice 14 / `mcp-honest-preview.spec.ts`) is acceptable for the **disconnected** UI state, but every claim must have a real-backend variant alongside it. | User: "the slice 14 honest-preview pattern is acceptable for disconnected state, but the default test environment must spawn ogdb serve and verify real round-trips." |
| 2026-04-22 | Ruthless removal: any visible feature on `/playground` without (a) a passing e2e and (b) a docstring/copy explaining what it does is removed in slice R3 or R6. | User: "We'd rather have 4 working things than 8 half-working things." |
| 2026-04-22 | "Numbers we publish, not numbers we promise" claim must carry a build-stamp (`bench_sha`, `bench_date`) tying the rendered metrics to a specific run in `BENCHMARKS.md`. | The current copy is unfalsifiable. A claim must be checkable to be honest. |
| 2026-04-22 | Per-crate `cargo` only when running Rust tooling from any slice (`cargo check -p ogdb-cli`, never `cargo check --workspace`). | Project safety guardrail. |
| 2026-04-22 | Each slice ships as its own branch + small PR. No mega-PRs. | Reviewability + atomic rollback. |
| 2026-04-22 | `TimeSlider` stays but gets a `client-side preview` badge until backend valid_from/to ships. | Honest framing; do not claim backend-time-travel that isn't built. |

---

## (H) Scope

**IN scope (this plan):**
- Landing page (`frontend/src/pages/LandingPage.tsx` and child components)
- Playground page (`frontend/src/pages/PlaygroundPage.tsx` and child components)
- README tagline + the "What We're Going For" section
- BenchmarkStrip metric provenance
- Build-time claim-verifier script + GitHub Actions wiring
- Playwright `claims-verify` project + the 5 real-backend claim specs
- New `examples/` snippets for AI integration patterns

**OUT of scope (explicit non-goals):**
- Rust core (`crates/ogdb-core`), query engine, storage layout
- Evaluator harness (`crates/ogdb-bench`, `crates/ogdb-tck`)
- WAL recovery semantics, MVCC, anything in `ARCHITECTURE.md` §4–§7
- New backend features (no new MCP tools, no new Cypher syntax, no new RDF parsers)
- Python/Node bindings beyond what is already shipped
- Visual design system overhaul beyond R5's perf pass

If a slice tempts the implementer to touch the Rust core, **stop and re-plan**. The fix is
almost certainly on the website, not in the engine.

---

## (I) Ruthless Removal Policy

**Rule:** For every visible feature on `/playground`, both must be true to keep it:
- (a) a passing e2e that exercises it end-to-end **against the real `ogdb serve --http` backend**
  (slice 14 honest-preview is acceptable only as the disconnected-state guard, not as the
  primary proof);
- (b) a docstring or visible copy in the UI explaining what the feature does in one sentence.

If either is missing → the feature is **removed** in slice R3 (if it directly maps to a
landing claim) or slice R6 (general audit pass).

We'd rather have 4 working things than 8 half-working things.

**Pre-flight removal candidates (will be reconfirmed by F9 inventory):**

| Feature | Has real-backend e2e? | Has UI docstring? | Decision |
|---|---|---|---|
| AIChatPanel | no | partial | **REMOVE (R1)** |
| DemoSection (landing) | no | yes | **REMOVE (R1)** |
| HowItWorksSection (landing) | no | yes | **REMOVE (R1)** |
| Sidebar duplicate `MCPToolGallery` | duplicates tab version | no | **REMOVE (R1)** |
| Trace mode button | no | "Trace" (vague) | **R3: rewrite to "Profile" + add real-backend spec OR remove** |
| Schema Ontology toggle | no | no | **R6: add e2e or remove** |
| Mobile-only duplicate panels | no | no | **R6: audit, likely remove** |
| Power mode | yes (after R3) | yes | KEEP |
| Cypher editor | yes (after R3) | yes | KEEP |
| RDF Dropzone | yes (existing) | yes | KEEP |
| MCP Tool Gallery (tab) | yes (after R3) + honest-preview | yes | KEEP |
| Schema Browser | yes (existing) | yes | KEEP |
| TimeSlider | yes (client-side) — must be labelled as such | needs new badge | KEEP w/ R3 badge |
| StatsPanel | yes (indirect) | yes | KEEP |

---

## (J) Test Coverage Matrix

For each remaining post-R6 feature: name, the e2e that proves it, last-passing date, green
on current `main` (`6f6ade1`)?

| Feature | Proving e2e | Last-passing | Green on `main` `6f6ade1`? | Notes |
|---|---|---|---|---|
| Power mode (Cypher editor → real backend) | `claims/cypher-roundtrip.spec.ts` (R3) | n/a — new | n/a — RED in R3 | Lands in R3 |
| Live mode toggle | `app.spec.ts` + `claims/cypher-roundtrip.spec.ts` (R3) | partial: 2026-04-19 (`app.spec.ts`) | partial | Real-backend half lands in R3 |
| Dataset switcher | `playground-canvas-renders.spec.ts` | 2026-04-19 | yes | Already covered |
| Guided Queries | `app.spec.ts` (UI click) + `claims/cypher-roundtrip.spec.ts` (real run, R3) | partial | partial | R3 fills the real-backend half |
| StatsPanel | `app.spec.ts` (indirect counts) | 2026-04-19 | yes | Indirect — acceptable |
| RDF Dropzone | `rdf-import-real.spec.ts` ✅ | 2026-04-19 | **yes — gold standard** | Pattern others should copy |
| SchemaBrowser | `schema-browser.spec.ts`, `slice13-schema-routing.spec.ts` | 2026-04-19 | yes | UI-only; `claims/schema-real.spec.ts` adds real-backend in R3 |
| Schema Ontology toggle | none today | n/a | **NO — removal candidate** | R6 chopping block unless e2e added |
| TimeSlider | `temporal-slider.spec.ts` | 2026-04-19 | yes (client-side) | R3 adds visible "client-side" badge |
| Trace mode | none today | n/a | **NO — rewrite or remove** | R3 |
| SemanticSearchPanel | `semantic-search.spec.ts` | 2026-04-19 | partial (need real backend) | `claims/semantic-hybrid.spec.ts` (R3) lands real backend |
| MCP Tool Gallery | `mcp-honest-preview.spec.ts` ✅ + `mcp-gallery.spec.ts` | 2026-04-19 | yes (stubbed) | `claims/mcp-live.spec.ts` (R3) adds real-backend |
| PerfStrip | `polish-cohesion.spec.ts` | 2026-04-19 | yes | — |
| StatusBar | `app.spec.ts` | 2026-04-19 | yes | — |
| ClaimsBadge (R4) | `claims-badge.spec.ts` (R4) | n/a — new | n/a — RED in R4 | Lands in R4 |

**Anything not in this table is on the chopping block in R6.** The F9 spec enforces this
mechanically: any `data-testid` not referenced by another spec fails the build.

---

## (K) Backend-Connected Verification Policy

**Default test environment:** every claim in (J) marked "real backend" must spawn
`ogdb serve --http` against a tempdir DB before assertions, and tear it down after. The
extracted helper `frontend/e2e/_helpers/serve-fixture.ts` (slice R3) lifts the
`beforeAll`/`afterAll` block from `rdf-import-real.spec.ts:54-113` so every spec uses
identical lifecycle handling — no per-spec drift.

**Exception:** `mcp-honest-preview.spec.ts` (and any future "disconnected-state" spec) may
stub via `page.route('**/api/...', …)` to verify the *honest preview* UI behaves correctly
when the backend is unreachable. These specs **must not** be the only proof of a claim — a
real-backend variant in `claims/*.spec.ts` is required.

**CI config:** `playwright.config.ts` adds a `claims-verify` project that runs only the
`claims/*.spec.ts` files with `--workers=1` (so the shared `ogdb serve` in `beforeAll` does
not race). The default `playwright test` invocation continues to run all specs.

---

## (L) Self-Review (per writing-plans skill)

**Spec coverage:**
- (A) Claims audit — covered for landing + README + SPEC + ARCHITECTURE + playground.
- (B) Messaging rewrite — hero, features, AI integration, README tagline, forbidden-phrase list.
- (C) Playground keep/remove — explicit table + rewrite list.
- (D) Build-time verifier + badge — script, JSON output, badge component, CI gate.
- (E) Five sequential slices R1–R5 + amended R6 — each maps to file paths and effort.
- (F) RED tests — F1–F9 with full code blocks, one or more per slice.
- (G) Decision log — captured.
- (H) Scope IN/OUT — captured.
- (I) Ruthless removal — captured + pre-flight removal table.
- (J) Test coverage matrix — captured.
- (K) Backend-connected verification — captured.

**Placeholder scan:** No "TBD", "TODO", "fill in details", "similar to Task N", or "add
appropriate error handling". Every code block is the actual content.

**Type / name consistency:** `data-testid` names used:
- `mcp-tool-card`, `mcp-tool-result`, `mcp-source-badge` — already exist in code; reused.
- `rdf-import-commit`, `rdf-import-persisted`, `rdf-import-db-path` — already exist; reused.
- New: `claims-badge`, `claims-banner-red`, `ai-pattern-card`, `temporal-client-side-badge`,
  `demo-chat-input` (referenced only in F1's negative assertion).

**Path consistency:** Plan refers to `frontend/src/components/landing/`, `pages/`, `e2e/`,
`scripts/`, `examples/`, `BENCHMARKS.md`, `crates/ogdb-cli` — all verified present (or
explicitly to-be-created in their owning slice).

---

**PLAN_READY.**
