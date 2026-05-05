# EVAL · FRONTEND-QUALITY · Cycle 16

**Base commit:** `8496878` (origin/main, post cycle-15 convergence — F03 unlisted-deps fixed in `b6cc6f0`; F01/F02 bundle-cap deferred as audit-threshold tradeoff)
**Worktree:** `/tmp/wt-c16-frontend-quality` (detached HEAD)
**Scope:** `frontend/`
**Date:** 2026-05-05

---

## Gate runs

| Gate | Command | Result |
| --- | --- | --- |
| ESLint | `npm run lint` | **0 warnings / 0 errors** ✅ |
| TypeScript strict | `npx tsc -b --noEmit` | **0 errors** ✅ |
| Vitest | `npm run test:vitest` | **14 files / 116 tests passed** ✅ |
| node:test | `npm run test:unit` | **99 tests passed** ✅ |
| Playwright list | `npx playwright test --list` | **251 tests in 70 files** (cycle-15 floor: 250/70) ✅ |
| App build | `npm run build:app` | **succeeds** — bundle sizes flat vs cycle-15 (see "Bundle status") |
| Visual baselines | `e2e/__screenshots__/visual-regression.spec.ts/chromium/` | **13 PNGs** (3D omitted by design — software-renderer skip path) ✅ |
| `.npmrc` | `frontend/.npmrc` | `legacy-peer-deps=true` preserved ✅ |
| sacred-blue token gate | `scripts/check-token-sacred-blue.sh` | `#5B9DFF appears only in the traversal surfaces.` ✅ |

ESLint, tsc, vitest, node:test, playwright count, sacred-blue, palette-amber and `.npmrc` are all clean.

---

## Bundle status (cycle-15 F01/F02 carryover — KNOWN-TRADEOFF, no growth)

| Chunk | gzip | vs cycle-15 |
| --- | --- | --- |
| `cypher-grammar-vendor-Dh-eIzo2.js` | **1,544.62 kB** (~1.508 MB) | **flat** |
| `lintWorker-DsPJ23Ae.mjs` | **1,568.45 kB** (~1.531 MB) | **flat** |

Per cycle-16 prompt, both chunks remain **above the 1.5 MB gzip BLOCKER threshold** but are tagged as **audit-threshold tradeoff** because no upstream split exists (`@neo4j-cypher/language-support` ships the entire ANTLR grammar as one ESM bundle, and `@neo4j-cypher/react-codemirror` instantiates its lint worker via `new URL('./lintWorker.mjs', import.meta.url)` which inlines the grammar a second time). Both chunks are *lazy* — neither blocks first paint of the marketing or playground bundles. The cycle-15 patch sketches (split worker via `worker.rollupOptions.output.manualChunks`, or pre-compile grammar to wasm) remain valid future work but are out of scope until upstream tooling supports it. **Not re-flagged in cycle-16 since sizes have not grown.**

---

## Findings

### F01 · MEDIUM · `mobile-chrome` Playwright project still excludes `mobile-narrow-viewport.spec.ts` *(carryover from cycle-15 F04 — UNFIXED)*

- **File:** `frontend/playwright.config.ts:55-60`
  ```ts
  {
    name: 'mobile-chrome',
    testMatch: /eval-cycle1-mobile\.spec\.ts/,
    use: { ...devices['Pixel 7'] },
  }
  ```
- **Problem:** `e2e/mobile-narrow-viewport.spec.ts` (3 tests covering `/`, `/claims`, `/docs/:slug` reflow at 375 px) runs ONLY on the desktop `chromium` project — it manually calls `page.setViewportSize({ width: 375, height: 812 })` at line 30 and pins `window.innerWidth=375` via `addInitScript` (line 27). It never hits Pixel 7's mobile UA, touch input, or `coarse` pointer media query, so any mobile-only style/UA bug slips through. Cycle-15 surfaced this; cycle-16 confirms it is unchanged on `8496878`.
- **Patch sketch:**
  ```ts
  testMatch: /(eval-cycle1-mobile|mobile-narrow-viewport)\.spec\.ts/,
  ```
  and drop the manual `setViewportSize` + `addInitScript` from `mobile-narrow-viewport.spec.ts:25-30` so the Pixel 7 device profile drives the viewport instead. Rebaseline the 3 mobile reflow assertions under `mobile-chrome` so any future viewport-meta or UA-stylesheet drift gets caught.

### F02 · MEDIUM · React 19 `forwardRef` drift across shadcn-ui *(carryover from cycle-15 F05 — UNFIXED)*

- **Files (30 `forwardRef` call sites across 8 files):**
  `frontend/src/components/ui/button.tsx:13` (1), `card.tsx:5,20,32,49,61,69` (6), `dialog.tsx:16,31,83,98` (4), `table.tsx:5,19,27,39,54,69,84,99` (8), `input.tsx:5` (1), `sheet.tsx:15,53,102,114` (4), `accordion.tsx:9,21,41` (3), `motion.tsx:11,32` (3 incl. import).
- **Problem:** React 19 promotes `ref` to a regular prop on function components and deprecates `React.forwardRef`. Every shadcn-ui primitive is still wrapped — the codebase locked the shadcn defaults that pre-date React 19. Bundle savings are real (`forwardRef` adds ~200 B per use × ~24 unique components = ~5 KB raw minified) and the deprecation will compound when shadcn pulls a React-19 update upstream. Already-named in cycle-15; cycle-16 sees no migration commits.
- **Patch sketch (per-component, ~3 lines each):**
  ```tsx
  // before:
  const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, ...props }, ref) => (
    <button ref={ref} className={...} {...props} />
  ))
  // after (React 19):
  function Button({ ref, className, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
    return <button ref={ref} className={...} {...props} />
  }
  ```
- **Risk:** low (`forwardRef` is deprecated, not removed). Flagged because each shadcn-ui upstream sync will quietly compound the drift.

### F03 · LOW · Knip surfaces 31 unused exports + 34 unused exported types *(carryover from cycle-15 F06 — UNFIXED)*

- **Detected by:** `npx knip --no-config-hints` (in `frontend/`)
- **Same hot spots as cycle-15** (sample, not exhaustive):
  - `src/api/queries.ts:11` — `useHealthCheck` function never called.
  - `src/api/queries.ts:23` — `useCypherQuery` function never called.
  - `src/components/ui/card.tsx:81` — `CardFooter` exported, no consumers.
  - `src/components/ui/table.tsx:115,119` — `TableFooter`, `TableCaption` exported, no consumers.
  - `src/graph/obsidian/tween.ts:9-57` — `HEARTBEAT_PERIOD_MS`, `HEARTBEAT_AMPLITUDE`, `cubicBezier`, `heartbeatPhase` exported but only used inside the file.
  - `src/lib/ai/providers.ts:19` — `PROVIDER_MODELS` constant unused.
  - `src/lib/rdfClient.ts:42` — `contentTypeFor` function unused.
  - `src/components/ui/motion.tsx:11,32` — `MotionPanel`, `MotionPanelDiv` exported, no callers.
- **Counts unchanged vs cycle-15:** 31 unused exports + 34 unused exported types. No ratchet up, no ratchet down.
- **Patch sketch:** drop the `export` keyword for symbols only used in-file; delete the orphan helper functions outright. Add `npx knip --include exports,types` as a CI soft gate (allow-list current count, fail on growth) to keep this from compounding.

### F04 · LOW · `deck.gl` umbrella package declared but never imported directly *(carryover from cycle-15 F07 — UNFIXED, partially)*

- **File:** `frontend/package.json:34` (`"deck.gl": "^9.2.10"`)
- **Problem:** code only imports `@deck.gl/mapbox` (`src/components/graph/GeoCanvas.tsx:3,5`) and `@deck.gl/layers` (`src/components/graph/GeoCanvas.tsx:4`). The umbrella package is never imported from source — confirmed via `grep -rn "from 'deck.gl'\|from \"deck.gl\"" src/` returning zero hits. Knip flags this as an unused dependency.
- **Note re cycle-15:** cycle-15 F07 also flagged `@radix-ui/react-accordion` as unused. **It is in fact used** by `src/components/schema/SchemaPanel.tsx:6-10` → `Header.tsx:3,37` → `AppShell.tsx:1` → `App.tsx:2,36-70` → `AppRouter.tsx` (the `build:legacy` build target). Knip flags the chain as "Unused files" because the legacy entry has no live build script in `npm run build`. Removing `accordion` is a deeper refactor (delete the legacy build chain) — keeping it scoped to `deck.gl` for cycle-16.
- **Patch sketch (one line from `package.json`):**
  ```diff
  -    "deck.gl": "^9.2.10",
  ```
  Re-run knip; the umbrella entry should disappear from "Unused dependencies".

### F05 · LOW · `pngjs` + `@types/pngjs` declared but never imported *(NEW in cycle-16)*

- **File:** `frontend/package.json:55` (`"@types/pngjs": "^6.0.5"`) and `:65` (`"pngjs": "^7.0.0"`)
- **Problem:** `grep -rn "from 'pngjs'\|from \"pngjs\"\|require('pngjs')" frontend/` (excluding `node_modules` + `package-lock.json`) returns zero hits. The OG-card test (`src/scripts/og-card.test.ts:22-36`) reads PNG dimensions by parsing the IHDR chunk by hand and never depends on the library. Knip flags these as unused devDependencies. Not flagged in cycle-15 because the cycle-15 patch sketch focused on `deck.gl` + `@radix-ui/react-accordion` — these two slipped through.
- **Patch sketch (two lines from `package.json` `devDependencies`):**
  ```diff
  -    "@types/pngjs": "^6.0.5",
  ...
  -    "pngjs": "^7.0.0",
  ```
  Verify by re-running knip; both entries should drop out of "Unused devDependencies".

---

## Reviewed and clean (no findings)

- ESLint: `eslint .` reports no warnings or errors.
- TypeScript strict: `tsc -b --noEmit` clean across `tsconfig.app.json`, `tsconfig.tests.json`, `tsconfig.node.json`.
- vitest: 14 files / 116 tests pass.
- node:test: 99 tests pass.
- Playwright e2e: **251 tests / 70 files** — meets/exceeds cycle-15 floor (250/70). Net +1 spec since cycle-15.
- Visual baselines: 13 PNGs covering hero (light+dark), showcase, features, get-started, AI integration, claims (green/red badge, banner, table), schema browser, perf strip, 2D graph canvas. The 3D baseline remains intentionally skipped on software renderers (verified in `e2e/visual-regression.spec.ts:336-342`) — not stale.
- a11y-axe sweep: covers `/`, `/playground`, `/claims`, `/docs/llm-to-cypher` with WCAG 2 A/AA tags and fails on critical/serious. Coverage matches cycle-15.
- `palette-amber.spec.ts` + `polish-cohesion.spec.ts`: still pin amber primary HSL `40 95% 62%`, dark color-scheme, dark theme-color meta, reduced-motion overrides, and amber-terminal hero bg (not cosmos navy).
- `scripts/check-token-sacred-blue.sh`: passes — `#5B9DFF` appears only on traversal surfaces (`StepCounterBadge.tsx`, `palette.ts`).
- `frontend/.npmrc`: `legacy-peer-deps=true` preserved (required for `@neo4j-cypher/react-codemirror` peer-dep installs).
- React 19 lazy-loading patterns: `Suspense` + `React.lazy` adoption is good (4 routes lazy-loaded via `AppShellRouter`, `CypherEditorPanel`, `GraphCanvas` GeoCanvas/3D). Only drift is `forwardRef` (F02).
- Cycle-15 F03 (unlisted runtime deps `@deck.gl/mapbox` + `@neo4j-cypher/language-support`) — **fixed** in `b6cc6f0`; both packages now appear in `frontend/package.json:11-12`. Knip no longer surfaces "Unlisted dependencies".

---

## Severity tally

| Severity | Count |
| --- | --- |
| BLOCKER | 0 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 3 |

Cycle-15 F01/F02 (BLOCKER bundle-cap violations) remain present but are explicitly KNOWN-TRADEOFF per cycle-16 prompt — sizes did not grow (1,544.62 kB / 1,568.45 kB gzip both flat).
