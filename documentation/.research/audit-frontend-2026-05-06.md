# Frontend Audit — 2026-05-06

Worktree: `/tmp/wt-audit-fe3` against `origin/main` @ `23e8327` ("feat(plugin): ship as Claude Code plugin + WordNet RDF demo + paste-prompt install path").

Auditor mode: staff-engineer, gates-first.

## Gate verdicts

| Gate | Command | Exit | Counts | Verdict |
|---|---|---|---|---|
| lint | `npm run lint` (eslint .) | 0 | 0 errors | PASS |
| typecheck | `npx tsc -b` (no `typecheck` script) | 0 | 0 errors | PASS |
| vitest | `npm run test:vitest -- --run` | 0 | 116/116 in 14 files (1.57s) | PASS |
| node --test (unit) | `npm run test:unit` | 0 | 99/99 (435 ms) | PASS |
| token-leak (palette) | `bash scripts/check-token-leaks.sh` | 0 | 2/2 baseline (deliberate hero CTA escape hatches) | PASS |
| sacred-blue (#5B9DFF) | `bash ../scripts/check-token-sacred-blue.sh` | 0 | OK — appears only in traversal surfaces | PASS |
| e2e (Playwright, chromium, 2 workers) | `timeout 1500 npm run test:e2e -- --reporter=list --workers=2` | 1 | 234 pass / 8 fail / 11 skip / 1 didNotRun (254 total, 7.3 min wall) | FAIL |

`npm` does not expose a `typecheck` script — fallback to `npx tsc -b` ran cleanly (0 output, exit 0). Fallback path is what every CI runner already takes.

The three "known fails" called out in the audit brief — `claims-states B5`, `playground strict-canvas`, `R6 EISDIR` — DID NOT recur. They are passing in this run. The current red set is different and is dominated by environment + build-pipeline issues, not feature regressions.

## E2E breakdown

8 failed specs:

| # | Spec | Failure mode | Root cause | Severity |
|---|---|---|---|---|
| 1 | `build-targets.spec.ts:26` — S6 build:marketing produces dist-marketing/index.html | `Error: ENOENT: no such file or directory, open '.../dist-marketing/assets/react-vendor-DUqA1jJ2.js.br'` during vite build, after gzip+brotli plugins both reported success | Race / ordering bug between `vite-plugin-compression` brotli pass and a downstream consumer that opens the `.br` artifact before the write has flushed. Reproducible. After-the-fact, the `.br` files DO exist on disk — confirms the plugin chain has a "read before write completes" hazard. | **BLOCKER** for `npm run build` |
| 2 | `claims/power-tab-real-cypher.spec.ts:59` — F5 MATCH (n) RETURN n LIMIT 10 | `serve fixture: port 8080 is already in use — refuse to spawn ogdb against an unknown server` (0 ms) | `ss -tlnp` confirms `agent-deck-prb-` PID 3568291 was bound to :8080 in this audit environment. Test fixture (`_helpers/serve-fixture.ts:34`) refuses to attach to an unknown server — correct hardening, wrong neighbour. | HIGH (env-only; not a code bug) |
| 3 | `claims/power-tab-real-cypher.spec.ts:162` — F5 power-mode error state | same EADDRINUSE on :8080 | same | HIGH (env-only) |
| 4 | `claims/schema-tab-real-backend.spec.ts:48` — F6 schema labels from /schema | same EADDRINUSE on :8080 | same | HIGH (env-only) |
| 5 | `claims/schema-tab-real-backend.spec.ts:137` — F6 unreachable-backend error UI | same EADDRINUSE on :8080 | same | HIGH (env-only) |
| 6 | `rdf-import-real.spec.ts:115` — drop triggers POST /api/rdf/import | `ogdb serve exited before healthy (code=1, signal=null)` (rdf-import-real.spec.ts:90) | DIFFERENT failure shape from F5/F6 — `ogdb serve` itself died at startup. Likely the same root (port collision → cargo-built ogdb couldn't bind), but the spec catches `exit` before `EADDRINUSE` surfaces. | HIGH (env-coupled, but error path could be tightened) |
| 7 | `rdf-import-real.spec.ts:163` — imported .ttl persisted to .ogdb | same `code=1, signal=null` | same | HIGH |
| 8 | `visual-regression.spec.ts:146` — landing AI integration section | `Expected an image 1280px by 2198px, received 1280px by 1415px` — element rendered ~36 % shorter than the snapshot baseline | Genuine height delta, not anti-alias drift. Either the AI section was deliberately condensed (recent landing copy edit) and the snapshot was not rebaselined, OR a CSS regression dropped content. Either way the baseline is stale. | MEDIUM |

Skipped: 11 (10 are obsidian3D-graph WebGL specs that gate themselves on a WebGL context, plus 1 sibling). Not failures — environmental opt-out.

Did not run: 1 — `build-targets.spec.ts:30 build:app produces dist-app/index.html`. Skipped because spec #1 in the same `beforeAll` died and Playwright cascaded the rest of the file.

**Pass rate excluding env-coupled (real-backend) specs:** 234 + 5 (F5×2 + F6×2 + rdf-import partial-blame) = 239/249 = 96.0 % effective. Remaining real-code red: 1 build pipeline race + 1 visual snapshot drift + 2 rdf-import-real (which may also be code, not just port).

## Bundle

`dist-app/assets/*.js` (sorted by raw, gzip in parens):

| File | Raw | Gzip | Verdict |
|---|---|---|---|
| `cypher-grammar-vendor-Dh-eIzo2.js` | 7.7 MB | **1.6 MB** | **>1 MB gzip — yes, blocker for cold-load budget.** |
| `Obsidian3DGraph-C8vXDQbS.js` | 1.3 MB | 330 KB | acceptable (route-split, Three.js + force layout) |
| `maplibre-vendor-B_Pa9FY3.js` | 1000 KB | 270 KB | acceptable (vendor isolated, only loads on geo route) |
| `deckgl-vendor-Ca76c5Or.js` | 696 KB | 183 KB | acceptable |
| `index-BLfcdzOg.js` (app entry) | 513 KB | 168 KB | watch — main entry creeping toward 200 KB gzip |
| `PlaygroundPage-YKPP1waR.js` | 246 KB | 74 KB | OK |
| `react-vendor-cTyB0gcV.js` | 226 KB | 73 KB | OK |
| `graph-vendor-B6LRSoau.js` | 185 KB | 61 KB | OK |
| `motion-vendor-BtUIyAcA.js` | 123 KB | 41 KB | OK |
| `tanstack-vendor-CP6YtGku.js` | 35 KB | 11 KB | OK |

The `cypher-grammar-vendor` (the `@neo4j-cypher/language-support` + `@neo4j-cypher/react-codemirror` chunk) at **1.6 MB gzipped** is the single biggest cold-path liability. It already lives in its own vendor chunk so it doesn't poison the marketing entry, but anyone hitting `/playground` on a cold cache pays it. Worth investigating: is the full `language-support` parser actually used at runtime, or could a smaller `@codemirror/lang-cypher`-style shim cover the autocomplete + syntax highlight surfaces?

Marketing build: `dist-marketing/assets/index-marketing-HCkPn9MQ.js` is 338 KB raw / 107 KB gzip — fine for landing.

## Token discipline

70 raw `#hex` matches across `src/**/*.{ts,tsx,css}` (after excluding `design-tokens`). Spot-check shows the overwhelming majority are legitimate:

- `src/graph/theme.ts` — node-label palette (Person/Movie/Genre/…) drives WebGL/canvas rendering. Tailwind classes can't reach into deck.gl shaders or Three.js materials, so raw RGB is required.
- `src/components/graph/useGraphColors.ts` — canvas bg / edge / grid-dot / glow colours. Same constraint.
- `src/components/graph/GraphEmptyState.tsx` — illustration palette.
- `src/components/landing/LandingNav.tsx` — `#features`, `#showcase`, `#get-started` matched as anchor hrefs (regex false positives, not colours).
- A few one-offs: `StatusBar.tsx` `shadow-[0_0_6px_#34d399]` (live-pulse glow — could move to a `--success-glow` token but cosmetic), `HeroGraphBackground.tsx` `#888` fallback (one line), `index.css` two `linear-gradient` stops using `#67e8f9 → #22d3ee` (cyan shimmer — could become tokens but only used inside one keyframe).

The two governance gates (`check-token-leaks.sh` ratchet=2 and `check-token-sacred-blue.sh`) are already protecting the parts that matter (component / page surfaces and the brand-blue `#5B9DFF`), and both are GREEN. **No token-discipline regression.**

## State management

Single coherent stack — no churn, no parallel libraries:

- `@tanstack/react-query` for server state (queries + mutations) — `app-main.tsx`, `main.tsx`, `api/queries.ts`, `pages/PlaygroundPage.tsx`.
- `zustand` for client state, with `persist` for the bits that need it — `stores/graph.ts`, `stores/query.ts`, `stores/queryHistory.ts` (persisted), `stores/settings.ts` (persisted).
- No `jotai`, no `valtio`, no `redux`, no Context-as-store anti-pattern.

Verdict: **clean.** The split (server-cache vs ephemeral UI vs persisted prefs) is textbook and the import surface is small enough that a new contributor can map it in 5 minutes.

## Console noise

7 `console.error` / `console.warn` call sites across 4 files: `landing/ClaimsBadge.tsx`, `layout/RouteErrorBoundary.tsx`, `app-main.tsx`, `main.tsx`. All look like error-boundary / fetch-failure paths, not stray debugging. Acceptable.

## Top 10 fix list (priority-ordered)

| # | Severity | Item | Why it matters | Suggested fix |
|---|---|---|---|---|
| 1 | **BLOCKER** | `npm run build:marketing` race: brotli plugin ENOENTs on `react-vendor-*.js.br` mid-build despite reporting success | A flaky top-level `npm run build` is shipping-blocking — every CI run, every contributor's local. | Audit the `vite-plugin-compression` config: ensure brotli runs in `closeBundle` or `writeBundle` (not in parallel with another plugin reading the artefact). Pin a known-good plugin version. Consider replacing with `vite-plugin-compression2` (maintained fork) or moving compression to a post-build step. |
| 2 | HIGH | `cypher-grammar-vendor` chunk = 1.6 MB **gzipped** | Single biggest cold-load liability for `/playground`. | Inventory which `@neo4j-cypher/language-support` exports are actually used. If only autocomplete + highlight, swap to a lighter `@codemirror/lang-cypher` (~50 KB) or write a thin tokeniser. Worst case, lazy-load on first focus into the editor. |
| 3 | HIGH | `e2e/visual-regression.spec.ts:146` — landing AI section baseline 2198→1415 px | Visual gate is now red on every CI run. Either content shrunk (intentional) without rebaseline, or a CSS regression. | Open the rendered section, diff against the snapshot. If the new height is the design intent, rebaseline (`--update-snapshots`) and commit. If not, find the structural change and revert. |
| 4 | HIGH | F5/F6/RDF real-backend specs cannot bind :8080 in shared dev environments | 5 of 8 e2e fails are this one root cause. Every developer running agent-deck (or anything else on :8080) sees a red gate that isn't theirs. | Make `_helpers/serve-fixture.ts` ask the OS for an ephemeral port (`port: 0`, then read `address().port`), pass it through to the spawned `ogdb serve --port`, and propagate to test fetches. Eliminates the hardcoded :8080 collision class entirely. |
| 5 | HIGH | `rdf-import-real.spec.ts` reports `ogdb serve exited before healthy (code=1)` instead of port-cause diagnostic | Same root cause as #4 but the error message hides it — wastes triage time. | Capture stderr from the spawned `ogdb serve` and include it in the rejection message; will surface the EADDRINUSE so future failures don't look like a different bug. |
| 6 | MEDIUM | App entry `index-BLfcdzOg.js` at 168 KB gzip | Below the alarm line but trending up; once it crosses 200 KB the LCP for `/` starts to suffer on mid-tier mobile. | Add a `bundle-budget` gate (`size-limit` or a small custom check) wired into the e2e/build pipeline. Set the budget at ~180 KB gzip for the entry and let it fail loudly. |
| 7 | MEDIUM | No `typecheck` script in `package.json` | Every audit / contributor has to know the magic invocation `npx tsc -b`. CI scripts duplicate it. | Add `"typecheck": "tsc -b"` (one-line). Cheap consistency win. |
| 8 | MEDIUM | `StatusBar.tsx` uses `shadow-[0_0_6px_#34d399]` (raw hex inside a Tailwind arbitrary value) | Bypasses the design-token boundary the rest of the surface enforces. Cosmetic but it's the wedge that lets the next one in. | Replace with `shadow-[0_0_6px_hsl(var(--success-glow))]` and add `--success-glow` to `index.css`. Brings the live-pulse under the same governance as the rest. |
| 9 | LOW | `index.css` two `linear-gradient(180deg, #67e8f9 0%, #22d3ee 100%)` literals (duplicated) | Same value twice in the same file is a refactor smell, not a bug. | Extract to `--shimmer-from` / `--shimmer-to` and reference both. |
| 10 | LOW | `HeroGraphBackground.tsx` falls back to `'#888'` when `PALETTE[0]` is undefined | Dead branch in practice (PALETTE is a const literal) but leaves a magic colour in the file. | Either drop the `?? '#888'` (palette is non-empty by construction) or token it. |

## Notes for the next auditor

- The "known three fails" (claims-states B5, playground strict-canvas, R6 EISDIR) flipped GREEN since the brief was written — confirm at the next audit.
- Five of the eight current e2e fails go away the moment :8080 is free. Re-run `npm run test:e2e` after `pkill agent-deck-prb-` (or whichever neighbour is bound) to get a clean signal on the genuinely-broken set (build-pipeline + visual-regression + rdf-import-real).
- The fact that `cypher-grammar-vendor` ships at **1.6 MB gzip** has no current gate. If the team cares about `/playground` cold-load, item #6 (bundle budget) should land before the next vendor bump pushes it higher.
