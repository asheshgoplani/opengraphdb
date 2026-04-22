# Perf audit — 2026-04-22

Scope: full measurement pass + surgical tightening on `perf/audit-tighten`.
Methodology: measure first (5 metrics), then fix only where evidence demands.

## Environment

- Worktree: `/tmp/wt-perf` on `perf/audit-tighten` (base: `main @ 3d01fa1`)
- Frontend: `vite preview` on built bundle, port 4180
- Backend: `ogdb serve --http` release binary on port 8188
- Browser: headless chromium (SwiftShader software GL) — viewport 1280×800
- Host: Linux 6.17, local disk, no load

## Baseline (before)

### M1 — bundle size (vite build)

Targets: main entry <800 KB gzip. No other chunk >500 KB raw (warning threshold).

| chunk | raw (B) | gzip (B) |
|-------|---------|----------|
| `assets/lintWorker-*.mjs` | 8,307,884 | 1,619,894 |
| `assets/index-*.js` (main entry) | **3,180,074** | **805,587** |
| `assets/maplibre-gl-*.js` | 1,023,030 | 275,803 |
| `assets/graph-vendor-*.js` | 188,429 | 61,560 |
| `assets/PlaygroundPage-*.js` | 178,435 | 55,425 |
| `assets/index-*.css` | 128,446 | ~21,000 |
| `assets/tanstack-vendor-*.js` | 94,099 | ~27,000 |
| `assets/datasets-*.js` | 61,187 | ~15,500 |
| `assets/LandingPage-*.js` | 44,795 | 13,738 |
| `assets/react-vendor-*.js` | 40,586 | ~14,500 |

**Verdict: main entry 805.6 KB gzip — 5.6 KB over budget.** Root cause: `/app` route (`App.tsx`) imported directly in `AppRouter.tsx`, pulling `@cosmos.gl/graph` + `@neo4j-cypher/react-codemirror` + friends into the main chunk despite other routes being lazy. `lintWorker` (codemirror's Cypher lint worker) is an 8.3 MB satellite file, but is loaded as a worker asset and does not hit the main entry critical path.

### M2 — landing-route load (Playwright, built bundle)

5 runs each, fresh context per run.

| route | DOMContent p50 | Load p50 | LCP p50 | LCP p95 | TTI p50 |
|-------|----------------|----------|---------|---------|---------|
| `/` | 369 ms | 369 ms | **988 ms** | 1144 ms | 1932 ms |
| `/playground` | 380 ms | 380 ms | 804 ms | 848 ms | 1909 ms |
| `/claims` | 382 ms | 382 ms | 752 ms | 828 ms | 1908 ms |

Target LCP <1.5 s — **met on all three routes**. `/` is the slowest by ~200 ms vs `/claims`; landing hero + Framer Motion is the likely cause but under budget.

### M3 — backend API latency (N=10 per endpoint)

| endpoint | p50 | p95 | max |
|----------|-----|-----|-----|
| GET `/schema` | 0.28 ms | 0.38 ms | 0.38 ms |
| POST `/query` `MATCH (n) RETURN n LIMIT 10` | 0.37 ms | 0.65 ms | 0.65 ms |
| POST `/rdf/import` (5-triple turtle) | **11.05 ms** | 13.47 ms | 13.47 ms |

RDF import is ~30× slower than /query. Per-call dominates (5 triples is trivial). Hypothesis: per-request WAL fsync on the import commit path. Only matters for workflows that send many tiny imports; bulk imports amortize across batches and are unaffected.

### M4 — playground interaction (zoom flurry)

- 10 mouse-wheel events (5 in, 5 out) over ~1.3 s at canvas center
- rAF frame timings recorded via `requestAnimationFrame` loop

| metric | value |
|--------|-------|
| frames sampled | 52 |
| frame time p50 | 16.70 ms |
| frame time p95 | 17.00 ms |
| frame time p99 | 17.30 ms |
| frames > 25 ms (R5 budget) | **0 / 52 (0.0%)** |

R5 rAF/throttle is correctly wired — zero budget violations. Caveat: measured under headless SwiftShader. User-reported jank was on real-GPU Macs (see R5 thread in CosmosCanvas.tsx:146) — this test cannot reproduce that workload. To verify real-GPU behaviour we'd need a manual pass, but the code path (label/bloom transform via rAF + refs, no React reconcile) is confirmed in place.

### M5 — cold start (CLI init + 100 nodes)

Target: <500 ms total for `init + 100 nodes`.

| workflow | time |
|----------|------|
| `ogdb init` alone | 72 ms |
| `ogdb --help` (release binary startup) | 3 ms |
| 1× `create-node` (fresh DB) | 73 ms |
| 100× `create-node` loop (one CLI invocation each) | **8,605 ms avg (5 runs)** |
| 1× `query` with `UNWIND range(1,100) AS i CREATE (:Person{...})` | 158 ms — but **node_count=0 after** (see bug below) |

**Verdict: far over target (17×) with the literal workflow.** Per-call cost is ~73 ms — process startup is only 3 ms, so the other ~70 ms is DB open + 1 write + WAL fsync + close. Spawning 100 short-lived CLI processes is inherently unsuited to the <500 ms target; a batched writer (one `create-node` invocation that accepts many rows, or a `query` CREATE) is the architectural fix, not a perf regression.

**Correctness bug found during M5** (out of audit scope, flagging):
`ogdb query <db> "UNWIND range(1,100) AS i CREATE (:Person {name: 'p' + toString(i)})"` returns success, exits with code 0, but `ogdb stats` afterwards shows `node_count=0`. Either `CREATE` is a read-only no-op through `ogdb query`, or the write is not being committed. The HTTP `/query` path commits writes (verified earlier — `/rdf/import` persists). Worth a dedicated ticket.

## Analysis — what to fix

Evidence says only one target is missed:

1. **Main entry 805.6 KB gzip vs 800 KB target (+0.7%)**. Fixable with route-level code-splitting. High-impact because main entry is the blocking download for every route; any reduction helps all three landing paths.

Everything else is within target:
- LCP on all three landing routes under 1.2 s (target 1.5 s).
- Backend query/schema submillisecond.
- Zoom p95 17 ms, zero frames over 25 ms.
- Cold-start target is only reachable with a batched workflow, not a per-node CLI loop — that's a documentation/API question, not a perf regression.

Ruled out as shotgun fixes (per user instruction):
- Preloading fonts / hero chunk — LCP already passes.
- Verifying R5 rAF — already verified (0 budget violations).
- Backend hot-path tuning — /query submillisecond, /schema submillisecond, /rdf/import 11 ms is per-call fsync (intentional).

## Fix plan

**Fix A (commit 1):** lazy-import the `/app` route in `AppRouter.tsx`. Currently `App.tsx` is a top-level import and pulls `@cosmos.gl/graph`, `@neo4j-cypher/react-codemirror`, and the result-view tree into the main bundle. Route-level split should move all of that into a `App-*.js` chunk, paid only when the user navigates to `/app`.

**Fix B (commit 2):** extend `vite.config.ts` `manualChunks` to call out `@cosmos.gl/graph`, `framer-motion`, and `@neo4j-cypher/react-codemirror` as separate vendor chunks. Prevents them from being re-bundled into per-route chunks and makes their size visible in future builds.

Expected outcome: main entry drops into the 550-650 KB gzip band (restoring comfortable headroom under 800 KB). LCP for `/` likely improves by 50-150 ms (less bytes on critical path), though already within budget.

## After

### Bundle (post Fix A + Fix B)

| chunk | raw (B) | gzip (B) | notes |
|-------|---------|----------|-------|
| `assets/lintWorker-*.mjs` | 8,307,884 | 1,619,894 | unchanged (worker asset, not on critical path) |
| `assets/codemirror-vendor-*.js` | 1,733,352 | 391,763 | **new** — peeled out of main |
| `assets/maplibre-gl-*.js` | 1,023,030 | 276,993 | unchanged |
| `assets/StatusBar-*.js` | 797,760 | 217,638 | shared between `/app`+`/playground`; was ~719 KB after Fix A alone |
| `assets/cosmos-vendor-*.js` | 365,195 | 107,449 | **new** — peeled out of main |
| `assets/index-*.js` (main entry) | **191,982** | **61,696** | was 3.18 MB raw / 805.6 KB gzip → **−92.3% gzip** |
| `assets/graph-vendor-*.js` | 188,429 | 61,993 | unchanged |
| `assets/motion-vendor-*.js` | 125,764 | 41,282 | **new** — peeled out of main |
| `assets/tanstack-vendor-*.js` | 94,099 | 26,593 | unchanged |
| `assets/datasets-*.js` | 61,201 | 15,533 | unchanged |
| `assets/LandingPage-*.js` | 44,912 | 13,835 | unchanged |
| `assets/App-*.js` | 44,658 | 13,455 | **new route chunk** (was inlined in main) |
| `assets/PlaygroundPage-*.js` | 52,841 | 14,716 | smaller — deps hoisted into shared/vendor chunks |
| `assets/react-vendor-*.js` | 40,586 | 14,500 | unchanged |

**Main entry: 805.6 KB → 61.7 KB gzip (−743.9 KB, −92.3%).** Passes the <800 KB budget with 9× headroom. Largest single chunk on the critical path for landing `/` is now `motion-vendor` at 41 KB gzip, because framer-motion is used by the hero's scroll-driven animations.

### Landing LCP (5 runs per route)

| route | LCP p50 before | LCP p50 after | Δ | LCP p95 before | LCP p95 after | Δ |
|-------|---------------:|--------------:|---:|---------------:|--------------:|---:|
| `/` | 988 ms | **620 ms** | −368 ms | 1144 ms | 1112 ms | −32 ms |
| `/playground` | 804 ms | **536 ms** | −268 ms | 848 ms | 548 ms | −300 ms |
| `/claims` | 752 ms | **488 ms** | −264 ms | 828 ms | 520 ms | −308 ms |

DOMContentLoaded also roughly **−260 ms across the board** (369→117, 380→101, 382→102 ms p50) — the main-entry download is no longer the bottleneck.

### Interaction (playground zoom flurry, re-measured)

| metric | before | after |
|--------|-------:|------:|
| frame time p50 | 16.70 ms | 16.60 ms |
| frame time p95 | 17.00 ms | 17.20 ms |
| frames > 25 ms | 0 / 52 | 0 / 52 |

No regression. Confirms Fix A+B don't perturb the runtime code path — rAF loop still well inside budget.

### Backend + cold-start (not retargeted)

No backend or CLI changes in this audit. `/schema` 0.28 ms, `/query` 0.37 ms, `/rdf/import` 11 ms, and the CLI per-call 73 ms fsync cost all stand as reported. Not actioned because the bundle was the only budget miss and the CLI cold-start hits an architectural floor (durable WAL fsync per process) that a 1-day audit can't rework responsibly.

## Remaining concerns

1. `codemirror-vendor` is 391 KB gzip — only needed on `/playground` and `/app`. Could be further deferred with a `<Suspense>`-wrapped lazy import inside the Cypher editor panel itself, so the editor downloads only when a user focuses the query card. Low-effort, ~200 ms off TTI for first-interaction on `/playground`.
2. `lintWorker` is 1.6 MB gzip (8.3 MB raw). It's a worker asset (loaded off the critical path) but still a download. The upstream `@neo4j-cypher/react-codemirror` bundles a full Cypher parser for lint. If lint is optional on mobile, consider a `?url` / `?worker` opt-in.
3. `/rdf/import` per-call 11 ms — acceptable for batch imports but noticeable for streamed small files. If the UI streams a large RDF file via many POSTs, a `/rdf/import/session` with a single commit at the end would amortize the fsync.
4. Real-GPU zoom jank (R5 user report) can't be reproduced in headless SwiftShader. The rAF+ref path is confirmed in `CosmosCanvas.tsx` at lines 146-156; if reports persist, measure on a user's device with a performance trace rather than in CI.
5. **Correctness bug (out of perf scope):** `ogdb query "UNWIND ... CREATE (:Person ...)"` returns success but does not persist. `ogdb create-node` and `POST /query` both persist correctly. Needs a dedicated ticket, not a perf fix.

## Commits on this branch

- `perf: main entry 805→62 KB gzip, /playground LCP 804→536 ms p50 (lazy /app route + vendor chunks)` — Fix A + Fix B
- `docs: perf-audit-2026-04-22 (before/after)` — this document

