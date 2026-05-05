# EVAL · FRONTEND-QUALITY · Cycle 17

**Base commit:** `b994aa7` (origin/main, post cycle-16 frontend baseline at `8496878`).
**Worktree:** `/tmp/wt-c17-frontend-quality` (detached HEAD).
**Scope:** `frontend/`.
**Date:** 2026-05-05.

---

## Frontend churn between cycle-16 base (`8496878`) and cycle-17 base (`b994aa7`)

```
$ git diff --stat 8496878..b994aa7 -- frontend/
(no output — zero files touched under frontend/)
```

The three commits since cycle-16 (`09f9161`, `f72f7cd`, `b994aa7`) only touch `skills/`, `mcp/`, `documentation/`, and `scripts/`. The cycle-16 prompt's specific concern — "did `09f9161` introduce any new frontend lint/typecheck issue?" — is answered by the diff: `09f9161` modified `mcp/package.json`, `skills/package.json`, `skills/src/index.ts`, and two new `scripts/check-npm-package-github-url.sh` + `scripts/test-check-npm-package-github-url.sh` files. **No frontend file was touched.** All gates below confirm this — every count matches cycle-16 to the test/byte.

---

## Gate runs

| Gate | Command | Result |
| --- | --- | --- |
| ESLint | `npm run lint` | **0 warnings / 0 errors** ✅ (unchanged vs cycle-16) |
| TypeScript strict | `npx tsc -b --noEmit` | **0 errors** ✅ (unchanged) |
| Vitest | `npm run test:vitest` | **14 files / 116 tests passed** ✅ (unchanged) |
| node:test | `npm run test:unit` | **99 tests passed** ✅ (unchanged) |
| Playwright list | `npx playwright test --list` | **251 tests in 70 files** (cycle-15 floor: 250/70) ✅ (unchanged) |
| App build | `npm run build:app` | **succeeds** — bundle hashes byte-identical to cycle-16 (see "Bundle status") |
| Visual baselines | `e2e/__screenshots__/visual-regression.spec.ts/chromium/` | **13 PNGs** ✅ (unchanged) |
| `.npmrc` | `frontend/.npmrc` | `legacy-peer-deps=true` preserved ✅ |
| sacred-blue token gate | `scripts/check-token-sacred-blue.sh` | `#5B9DFF appears only in the traversal surfaces.` ✅ |
| palette-amber HSL pin | `e2e/palette-amber.spec.ts` | `40 95% 62%` still pinned ✅ |

All ten gates clean.

---

## Bundle status (cycle-15 F01/F02 carryover — KNOWN-TRADEOFF, no growth)

| Chunk | gzip | brotli | hash vs cycle-16 |
| --- | --- | --- | --- |
| `cypher-grammar-vendor-Dh-eIzo2.js` | **1,544.62 kB** (~1.508 MB) | 1,033.56 kB | **identical hash** (`Dh-eIzo2`) |
| `lintWorker-DsPJ23Ae.mjs` | **1,568.45 kB** (~1.531 MB) | 1,051.03 kB | **identical hash** (`DsPJ23Ae`) |

Both chunks are byte-for-byte identical to cycle-16 — the rebuild produced the same content-hashes, confirming zero source drift. Both remain above the 1.5 MB gzip BLOCKER threshold but stay tagged as **audit-threshold tradeoff** because no upstream split exists (`@neo4j-cypher/language-support` ships the entire ANTLR grammar as one ESM bundle, and `@neo4j-cypher/react-codemirror` instantiates its lint worker via `new URL('./lintWorker.mjs', import.meta.url)` which inlines the grammar a second time). Both chunks are *lazy* — neither blocks first paint of the marketing or playground bundles. Patch sketches from cycle-15 (split worker via `worker.rollupOptions.output.manualChunks`, pre-compile grammar to wasm) remain valid future work but stay out of scope until upstream tooling supports it. **Not re-flagged in cycle-17 since sizes have not grown.**

---

## Findings

### F01 · MEDIUM · `mobile-chrome` Playwright project still excludes `mobile-narrow-viewport.spec.ts` *(carryover from cycle-16 F01 / cycle-15 F04 — UNFIXED)*

- **File:** `frontend/playwright.config.ts:55-60` (verified at this commit: `name: 'mobile-chrome'`, `testMatch: /eval-cycle1-mobile\.spec\.ts/`)
- **Problem:** unchanged from cycle-16. `e2e/mobile-narrow-viewport.spec.ts` (3 tests covering `/`, `/claims`, `/docs/:slug` reflow at 375 px) only runs on the desktop `chromium` project; the Pixel 7 device profile, mobile UA, touch input, and `coarse` pointer media query never exercise it.
- **Patch sketch:** unchanged from cycle-16 — extend `testMatch` to `/(eval-cycle1-mobile|mobile-narrow-viewport)\.spec\.ts/` and drop the manual `setViewportSize` + `addInitScript` from `mobile-narrow-viewport.spec.ts:25-30`.

### F02 · MEDIUM · React 19 `forwardRef` drift across shadcn-ui *(carryover from cycle-16 F02 / cycle-15 F05 — UNFIXED)*

- **Files (30 `forwardRef` call sites across 8 files, count verified again at `b994aa7`):**
  `frontend/src/components/ui/button.tsx`, `card.tsx`, `dialog.tsx`, `table.tsx`, `input.tsx`, `sheet.tsx`, `accordion.tsx`, `motion.tsx`.
- **Problem:** unchanged from cycle-16. React 19 promotes `ref` to a regular prop and deprecates `React.forwardRef`; every shadcn-ui primitive is still wrapped. Bundle savings are still real (~5 KB raw minified) and deprecation will compound on the next shadcn upstream sync.
- **Patch sketch:** unchanged from cycle-16 — per-component, drop `React.forwardRef` wrapper and accept `ref` as a regular prop.

### F03 · LOW · Knip surfaces 31 unused exports + 34 unused exported types *(carryover from cycle-16 F03 / cycle-15 F06 — UNFIXED)*

- **Detected by:** `npx knip --no-config-hints` (in `frontend/`) — counts `Unused exports (31)` and `Unused exported types (34)`, exact match vs cycle-16.
- Same hot spots as cycle-16: `src/api/queries.ts:11,23` (`useHealthCheck`, `useCypherQuery`), `src/components/ui/card.tsx:81` (`CardFooter`), `src/components/ui/table.tsx:115,119` (`TableFooter`, `TableCaption`), `src/graph/obsidian/tween.ts:9-57` (`HEARTBEAT_PERIOD_MS`, `HEARTBEAT_AMPLITUDE`, `cubicBezier`, `heartbeatPhase`), `src/lib/ai/providers.ts:19` (`PROVIDER_MODELS`), `src/lib/rdfClient.ts:42` (`contentTypeFor`), `src/components/ui/motion.tsx:11,32` (`MotionPanel`, `MotionPanelDiv`).
- **Patch sketch:** unchanged from cycle-16 — drop the `export` keyword for symbols only used in-file; delete the orphan helpers; consider adding `npx knip --include exports,types` as a CI soft gate (allow-list current count, fail on growth).

### F04 · LOW · `deck.gl` umbrella package declared but never imported directly *(carryover from cycle-16 F04 / cycle-15 F07 — UNFIXED)*

- **File:** `frontend/package.json:34` (`"deck.gl": "^9.2.10"`)
- **Problem:** unchanged from cycle-16. Source only imports `@deck.gl/mapbox` and `@deck.gl/layers` (both in `src/components/graph/GeoCanvas.tsx`). `grep -rn "from 'deck.gl'\|from \"deck.gl\"" src/` still returns zero hits.
- **Note re cycle-16:** `@radix-ui/react-accordion` also still appears in knip's "Unused dependencies (2)" list, but it is in fact transitively used by the legacy `AppRouter` / `AppShell` chain (`src/components/schema/SchemaPanel.tsx:6-10` → `Header.tsx` → `AppShell.tsx` → `App.tsx` → `AppRouter.tsx`). Knip flags it because the legacy entry has no live build script in `npm run build`; removing it is a deeper refactor (delete the legacy chain) — keeping cycle-17 scoped to `deck.gl` for the same reason cycle-16 did.
- **Patch sketch (one line from `package.json`):**
  ```diff
  -    "deck.gl": "^9.2.10",
  ```
  Re-run knip; the umbrella entry should disappear from "Unused dependencies".

### F05 · LOW · `pngjs` + `@types/pngjs` declared but never imported *(carryover from cycle-16 F05 — UNFIXED)*

- **Files:** `frontend/package.json:55` (`"@types/pngjs": "^6.0.5"`) and `:65` (`"pngjs": "^7.0.0"`)
- **Problem:** unchanged from cycle-16. `grep -rn "from 'pngjs'\|from \"pngjs\"\|require('pngjs')" frontend/` (excluding `node_modules` + `package-lock.json`) returns zero hits. The OG-card test (`src/scripts/og-card.test.ts:22-36`) parses the IHDR chunk by hand and never depends on the library. Knip still lists both in "Unused devDependencies (2)".
- **Patch sketch:** unchanged from cycle-16 — drop both lines from `package.json` `devDependencies`.

---

## Reviewed and clean (no findings)

- ESLint: `eslint .` reports no warnings or errors.
- TypeScript strict: `tsc -b --noEmit` clean across `tsconfig.app.json`, `tsconfig.tests.json`, `tsconfig.node.json`.
- vitest: 14 files / 116 tests pass.
- node:test: 99 tests pass.
- Playwright e2e: **251 tests / 70 files** — meets/exceeds cycle-15 floor (250/70). Net 0 spec drift since cycle-16.
- Visual baselines: 13 PNGs covering hero (light+dark), showcase, features, get-started, AI integration, claims (green/red badge, banner, table), schema browser, perf strip, 2D graph canvas. The 3D baseline remains intentionally skipped on software renderers (`e2e/visual-regression.spec.ts:336-342`).
- a11y-axe sweep: covers `/`, `/playground`, `/claims`, `/docs/llm-to-cypher` with WCAG 2 A/AA tags and fails on critical/serious. Coverage matches cycle-16.
- `palette-amber.spec.ts` + `polish-cohesion.spec.ts`: still pin amber primary HSL `40 95% 62%`, dark color-scheme, dark theme-color meta, reduced-motion overrides, and amber-terminal hero bg.
- `scripts/check-token-sacred-blue.sh`: passes — `#5B9DFF` appears only on traversal surfaces (`StepCounterBadge.tsx`, `palette.ts`).
- `frontend/.npmrc`: `legacy-peer-deps=true` preserved (required for `@neo4j-cypher/react-codemirror` peer-dep installs).
- React 19 lazy-loading patterns: `Suspense` + `React.lazy` adoption is good (4 routes lazy-loaded via `AppShellRouter`, `CypherEditorPanel`, `GraphCanvas` GeoCanvas/3D). Only drift is `forwardRef` (F02).
- npm-packages cycle-16 fix (`09f9161`): touched `skills/` and `mcp/` only — frontend gates re-run on `b994aa7` show identical counts (251/70 specs, 116 vitest, 99 node:test, 0 lint, 0 tsc, identical bundle hashes), confirming the fix did not leak any frontend regression.

---

## Severity tally

| Severity | Count |
| --- | --- |
| BLOCKER | 0 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 3 |

Cycle-15 F01/F02 (BLOCKER bundle-cap violations) remain present but stay explicitly KNOWN-TRADEOFF per the cycle-16 prompt — sizes did not grow (1,544.62 kB / 1,568.45 kB gzip, byte-identical content-hashes vs cycle-16). All five non-BLOCKER findings are pure carryovers; cycle-17 surfaces no new frontend issue. Per the cycle-17 prompt, **0 BLOCKER + 0 HIGH = CONVERGED** (second consecutive clean round; cycle-16 was the first).
