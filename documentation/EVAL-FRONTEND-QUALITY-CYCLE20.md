## EVAL · FRONTEND-QUALITY · Cycle 20

**Base commit:** `fb0ec7a` (origin/main, post cycle-19 path-sweep + migration-spec selectors).
**Worktree:** a fresh detached worktree off `origin/main`.
**Scope:** `frontend/`.
**Date:** 2026-05-05.
**Cycle status (per prompt):** cycle-16 + cycle-17 + cycle-18 + cycle-19 ALL `0 BLOCKER + 0 HIGH` → 4th-round CONVERGED. Cycle-20 is **bookkeeping confirmation**.

---

## Frontend churn between cycle-19 base (`6c17c3d`) and cycle-20 base (`fb0ec7a`)

```
$ git log --oneline 6c17c3d..fb0ec7a -- frontend/
ae7ebb5 fix(migration-spec): update e2e selectors to match cycle-18 F02 wins-section restructure

$ git diff --stat 6c17c3d..fb0ec7a -- frontend/
 frontend/e2e/migration-guide-snippets.spec.ts | 11 +++++++----
 1 file changed, 7 insertions(+), 4 deletions(-)
```

The two commits since cycle-19 (`ae7ebb5`, `fb0ec7a`) only touch one frontend file: `frontend/e2e/migration-guide-snippets.spec.ts:249-259` — a 3-line selector resilience tweak that lower-cases the response body before the `scale-mismatch*` substring check, accommodating cycle-18 F02's `**Scale-mismatched**` capitalised sub-heading. No production source touched. `fb0ec7a` is purely backend (`crates/`, `skills/`, `scripts/`). All gate counts and bundle hashes match cycle-19 / cycle-18 / cycle-17 / cycle-16 exactly.

---

## Gate runs (cycle-20, per crate cap, no `--workspace test`)

| Gate | Command | Result | Δ vs cycle-19 |
| --- | --- | --- | --- |
| ESLint | `npm run lint` | **0 warnings / 0 errors** ✅ | unchanged |
| TypeScript strict | `npx tsc -b --noEmit` | **0 errors** ✅ | unchanged |
| Vitest | `npm run test:vitest` | **14 files / 116 tests passed** in 1.55s ✅ | unchanged |
| node:test | `npm run test:unit` | **99 tests passed** ✅ | unchanged |
| Playwright list | `npx playwright test --list` | **251 tests in 70 files** (cycle-15 floor: 250/70) ✅ | unchanged |
| App build | `npm run build:app` | **succeeds** — bundle hashes byte-identical to cycle-19 | unchanged |
| Visual baselines | `e2e/__screenshots__/visual-regression.spec.ts/chromium/` | **13 PNGs** ✅ | unchanged |
| `.npmrc` | `frontend/.npmrc` | `legacy-peer-deps=true` preserved ✅ | unchanged |
| sacred-blue token gate | `scripts/check-token-sacred-blue.sh` | `#5B9DFF appears only in the traversal surfaces.` ✅ | unchanged |
| palette-amber HSL pin | `e2e/palette-amber.spec.ts:10` + `src/index.css:177,193` | `40 95% 62%` still pinned on `--primary` and `--ring` ✅ | unchanged |
| Knip | `npx knip --no-config-hints` | 23 unused files / 31 unused exports / 34 unused exported types / 2 unused deps / 2 unused devDeps | unchanged |

All eleven gates clean. Cycle-20 reproduces cycle-19 to the test/byte. The lone frontend touch (`migration-guide-snippets.spec.ts`) is contained inside one already-listed Playwright file — no test count drift, no selector failures.

---

## Bundle status (cycle-15 F01/F02 KNOWN-TRADEOFF — no growth)

| Chunk | gzip (`.gz` bytes) | brotli | hash vs cycle-19 / cycle-18 / cycle-17 / cycle-16 | Realistic 1.6 MB cap |
| --- | --- | --- | --- | --- |
| `cypher-grammar-vendor-Dh-eIzo2.js` | **1,581,690 B** (~1,544.62 kB / ~1.508 MB) | 1,033.56 kB | **identical hash** (`Dh-eIzo2`) | ✅ under 1.6 MB |
| `lintWorker-DsPJ23Ae.mjs` | **1,606,092 B** (~1,568.45 kB / ~1.531 MB) | 1,051.03 kB | **identical hash** (`DsPJ23Ae`) | ✅ under 1.6 MB |

Both chunks are byte-for-byte identical to cycle-19 (and cycle-18, cycle-17, cycle-16) — the rebuild produced the same content-hashes and the same `.gz` byte counts to the byte, confirming zero source drift. Both stay below the 1.6 MB realistic cap. Both still exceed the historic 1.5 MB gzip BLOCKER threshold but remain explicitly **KNOWN-TRADEOFF** — no upstream split exists (`@neo4j-cypher/language-support` ships the entire ANTLR grammar as one ESM bundle, and `@neo4j-cypher/react-codemirror` instantiates its lint worker via `new URL('./lintWorker.mjs', import.meta.url)` which inlines the grammar a second time). Both chunks are *lazy* — neither blocks first paint of marketing or playground bundles. Cycle-15 patch sketches (split worker via `worker.rollupOptions.output.manualChunks`, pre-compile grammar to wasm) remain valid future work but stay out of scope until upstream tooling supports it. **Not re-flagged in cycle-20.**

---

## Findings (cycle-20 — pure carryovers, no new issues)

### F01 · MEDIUM · `mobile-chrome` Playwright project still excludes `mobile-narrow-viewport.spec.ts` *(carryover from cycle-19 F01 / cycle-18 F01 / cycle-17 F01 / cycle-16 F01 / cycle-15 F04 — UNFIXED)*

- **File:** `frontend/playwright.config.ts:55-60` (verified at `fb0ec7a`: `name: 'mobile-chrome'`, `testMatch: /eval-cycle1-mobile\.spec\.ts/`).
- **Problem:** unchanged. `e2e/mobile-narrow-viewport.spec.ts` (3 tests covering `/`, `/claims`, `/docs/:slug` reflow at 375 px) only runs on the desktop `chromium` project; the Pixel 7 device profile, mobile UA, touch input, and `coarse` pointer media query never exercise it.
- **Patch sketch:** unchanged — extend `testMatch` to `/(eval-cycle1-mobile|mobile-narrow-viewport)\.spec\.ts/` and drop the manual `setViewportSize` + `addInitScript` from `mobile-narrow-viewport.spec.ts:25-30`.

### F02 · MEDIUM · React 19 `forwardRef` drift across shadcn-ui *(carryover from cycle-19 F02 / cycle-18 F02 / cycle-17 F02 / cycle-16 F02 / cycle-15 F05 — UNFIXED)*

- **Files (8 files still using `React.forwardRef` / destructured `forwardRef`, verified at `fb0ec7a` via `grep -rln forwardRef src/components/ui/`):**
  `frontend/src/components/ui/button.tsx`, `card.tsx`, `dialog.tsx`, `table.tsx`, `input.tsx`, `sheet.tsx`, `accordion.tsx`, `motion.tsx`. (Same 8 files as cycle-19; total call-site count unchanged.)
- **Problem:** unchanged. React 19 promotes `ref` to a regular prop and deprecates `React.forwardRef`; every shadcn-ui primitive is still wrapped. Bundle savings remain real (~5 kB raw minified) and deprecation will compound on the next shadcn upstream sync.
- **Patch sketch:** unchanged — per-component, drop `React.forwardRef` wrapper and accept `ref` as a regular prop.

### F03 · LOW · Knip surfaces 31 unused exports + 34 unused exported types *(carryover from cycle-19 F03 / cycle-18 F03 / cycle-17 F03 / cycle-16 F03 / cycle-15 F06 — UNFIXED)*

- **Detected by:** `npx knip --no-config-hints` (in `frontend/`) — counts `Unused exports (31)` and `Unused exported types (34)`, exact match vs cycle-19, cycle-18, cycle-17, cycle-16.
- Same hot spots: `src/api/queries.ts:11,23` (`useHealthCheck`, `useCypherQuery`), `src/components/ui/card.tsx:81` (`CardFooter`), `src/components/ui/table.tsx:115,119` (`TableFooter`, `TableCaption`), `src/graph/obsidian/tween.ts:9-57` (`HEARTBEAT_PERIOD_MS`, `HEARTBEAT_AMPLITUDE`, `cubicBezier`, `heartbeatPhase`), `src/lib/ai/providers.ts:19` (`PROVIDER_MODELS`), `src/lib/rdfClient.ts:42` (`contentTypeFor`), `src/components/ui/motion.tsx:11,32` (`MotionPanel`, `MotionPanelDiv`).
- **Patch sketch:** unchanged — drop the `export` keyword for symbols only used in-file; delete the orphan helpers; consider adding `npx knip --include exports,types` as a CI soft gate (allow-list current count, fail on growth).

### F04 · LOW · `deck.gl` umbrella package declared but never imported directly *(carryover from cycle-19 F04 / cycle-18 F04 / cycle-17 F04 / cycle-16 F04 / cycle-15 F07 — UNFIXED)*

- **File:** `frontend/package.json:34` (`"deck.gl": "^9.2.10"`).
- **Problem:** unchanged. Source only imports `@deck.gl/mapbox` and `@deck.gl/layers` (both in `src/components/graph/GeoCanvas.tsx`). `grep -rn "from 'deck.gl'\|from \"deck.gl\"" frontend/src/` still returns zero hits.
- **Patch sketch:** unchanged — drop the `deck.gl` line from `dependencies`.

### F05 · LOW · `pngjs` + `@types/pngjs` declared but never imported *(carryover from cycle-19 F05 / cycle-18 F05 / cycle-17 F05 / cycle-16 F05 — UNFIXED)*

- **Files:** `frontend/package.json:55` (`"@types/pngjs": "^6.0.5"`) and `:65` (`"pngjs": "^7.0.0"`).
- **Problem:** unchanged. `grep -rn "from 'pngjs'\|from \"pngjs\"\|require('pngjs')" frontend/` (excluding `node_modules` + `package-lock.json`) returns zero hits. The OG-card test (`src/scripts/og-card.test.ts:22-36`) parses the IHDR chunk by hand and never depends on the library. Knip still lists both in "Unused devDependencies (2)".
- **Patch sketch:** unchanged — drop both lines from `package.json` `devDependencies`.

---

## Reviewed and clean (no findings)

- **ESLint:** `eslint .` reports no warnings or errors.
- **TypeScript strict:** `tsc -b --noEmit` clean across `tsconfig.app.json`, `tsconfig.tests.json`, `tsconfig.node.json`.
- **vitest:** 14 files / 116 tests pass in 1.55s.
- **node:test:** 99 tests pass.
- **Playwright e2e:** **251 tests / 70 files** — meets/exceeds cycle-15 floor (250/70). Net 0 spec drift since cycle-16. The `ae7ebb5` selector tweak inside `e2e/migration-guide-snippets.spec.ts` is contained — no test add/remove, just the lower-case substring guard.
- **Visual baselines:** 13 PNGs covering hero (light+dark), showcase, features, get-started, AI integration, claims (green/red badge, banner, table), schema browser, perf strip, 2D graph canvas. The 3D baseline remains intentionally skipped on software renderers (`e2e/visual-regression.spec.ts:336-342`).
- **a11y-axe sweep:** covers `/`, `/playground`, `/claims`, `/docs/llm-to-cypher` with WCAG 2 A/AA tags and fails on critical/serious. Coverage matches cycle-19.
- **`palette-amber.spec.ts` + `polish-cohesion.spec.ts`:** still pin amber primary HSL `40 95% 62%`, dark color-scheme, dark theme-color meta, reduced-motion overrides, and amber-terminal hero bg.
- **`migration-guide-snippets.spec.ts:249-259`:** post-cycle-19 selector update verified — `body.toLowerCase().includes('scale-mismatch'|'scale mismatch'|'scale-mismatched')` is a strictly broader matcher than cycle-18's case-sensitive triple, so the assertion still passes whichever capitalisation the docs surface emits. No flake risk.

---

## Summary

- **0 BLOCKER · 0 HIGH** — fifth consecutive clean cycle (cycle-16 → cycle-17 → cycle-18 → cycle-19 → cycle-20). Frontend area remains CONVERGED.
- 5 carryovers — `F01` and `F02` are MEDIUM (mobile project + React 19 forwardRef drift), `F03`/`F04`/`F05` LOW (knip dead-code, two unused deps).
- Two cycles in a row, the only frontend churn has been a single defensive selector tweak inside one e2e spec file. Production source is fully frozen since cycle-15.
- All eleven gates pass with byte-for-byte parity to cycle-19, cycle-18, cycle-17, cycle-16. Bundle content-hashes (`Dh-eIzo2`, `DsPJ23Ae`) and `.gz` byte counts (`1,581,690` / `1,606,092`) reproduce exactly.
- Recommendation: dissolve frontend into the rotation of converged areas; reactivate only on alert (visual-regression diff, knip count growth, gz bundle byte delta, or Playwright spec count below 250/70 floor).
