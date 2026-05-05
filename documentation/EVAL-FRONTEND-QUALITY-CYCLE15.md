# EVAL · FRONTEND-QUALITY · Cycle 15

**Base commit:** `aff476f` (origin/main, post v0.5.1 + cascade-fix landings)
**Worktree:** `/tmp/wt-c15-frontend-quality` (detached HEAD)
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
| Playwright list | `npx playwright test --list` | **250 tests in 70 files** (≥ cycle-14 floor) ✅ |
| App build | `npm run build:app` | **succeeds** with 2 chunks > 1.5 MB gzip cap (see F01/F02) |
| Visual baselines | `e2e/__screenshots__/visual-regression.spec.ts/chromium/` | **13 PNGs** (3D omitted by design — software-renderer skip path) ✅ |
| `.npmrc` | `frontend/.npmrc` | `legacy-peer-deps=true` preserved ✅ |

Lint, tsc, vitest, node:test all clean. The two material findings are bundle-size cap violations and an unlisted-dependency hazard.

---

## Findings

### F01 · BLOCKER · `cypher-grammar-vendor` chunk exceeds 1.5 MB gzip cap

- **File:** `frontend/vite.config.app.ts:114-118` (manualChunks: `cypher-grammar-vendor` split)
- **Build emits:** `dist-app/assets/cypher-grammar-vendor-Dh-eIzo2.js` — 7,845.19 kB raw / **1,544.62 kB gzip** (~1.508 MB) — over the 1.5 MB gzip BLOCKER threshold defined for this audit.
- **Root cause:** `@neo4j-cypher/language-support` + `@neo4j-cypher/cypher-antlr-grammar` ship the entire Cypher grammar (ANTLR tables) as one ESM bundle; vite cannot tree-shake what's effectively a giant lookup table.
- **Mitigating context:** chunk is a *lazy* import via `CypherEditorPanel`'s dynamic load — does not block first paint.
- **Patch sketch:** split the grammar into a sub-chunk loaded only when the user actually opens the editor *and* a query is non-trivial; or pre-compile the grammar to a `.wasm` table that gzips smaller. Minimum: gate it behind `import.meta.env.PROD ? () => import(...) : ...` with prefetch hint. If a smaller grammar build is unavailable upstream, raise the audit cap to 1.6 MB and document it.

### F02 · BLOCKER · `lintWorker.mjs` worker chunk exceeds 1.5 MB gzip cap

- **File:** `frontend/vite.config.ts:7-49` (DEV middleware) + Vite default worker emit
- **Build emits:** `dist-app/assets/lintWorker-DsPJ23Ae.mjs` — 8,113.17 kB raw / **1,568.45 kB gzip** (~1.531 MB) — over the 1.5 MB gzip BLOCKER threshold.
- **Root cause:** `@neo4j-cypher/react-codemirror` constructs its lint worker via `new URL('./lintWorker.mjs', import.meta.url)`. Vite emits the worker file verbatim, so the *full* grammar gets duplicated inside the worker on top of the F01 vendor chunk.
- **Patch sketch:** instruct rollup to dedupe by emitting the worker as a chunk that imports `cypher-grammar-vendor` instead of inlining the grammar. Either:
  1. patch `react-codemirror`'s worker to `import { ... } from '@neo4j-cypher/language-support'` (so manualChunks deduplicates); or
  2. add a Vite `worker.rollupOptions.output.manualChunks` mirroring the F01 split so the worker links against the same grammar chunk; or
  3. accept the duplication and bump the cap.

### F03 · HIGH · Unlisted runtime dependencies (`@deck.gl/mapbox`, `@neo4j-cypher/language-support`)

- **Files:**
  - `frontend/src/components/graph/GeoCanvas.tsx:3` — `import { MapboxOverlay } from '@deck.gl/mapbox'`
  - `frontend/src/components/graph/GeoCanvas.tsx:5` — `import type { MapboxOverlayProps } from '@deck.gl/mapbox'`
  - `frontend/src/components/query/CypherEditorPanel.tsx:2` — `import type { DbSchema } from '@neo4j-cypher/language-support'`
- **Problem:** neither package is declared in `frontend/package.json`. Both currently resolve via npm hoisting (transitive of `deck.gl` and `@neo4j-cypher/react-codemirror` respectively). A future minor bump of either parent could change hoisting and break `npm ci` — combined with `legacy-peer-deps=true` it's a silent landmine.
- **Patch sketch (1-line each in `frontend/package.json` `dependencies`):**
  ```json
  "@deck.gl/mapbox": "^9.2.10",
  "@neo4j-cypher/language-support": "<match react-codemirror's pinned version>",
  ```
- **Detected by:** `npx knip --no-config-hints` → "Unlisted dependencies (2)".

### F04 · MEDIUM · `mobile-chrome` Playwright project only runs ONE spec

- **File:** `frontend/playwright.config.ts:55-60`
  ```ts
  {
    name: 'mobile-chrome',
    testMatch: /eval-cycle1-mobile\.spec\.ts/,
    use: { ...devices['Pixel 7'] },
  }
  ```
- **Problem:** `e2e/mobile-narrow-viewport.spec.ts` (3 tests covering `/`, `/claims`, `/docs/:slug` reflow at 375 px) runs ONLY on the desktop `chromium` project — it manually calls `page.setViewportSize({ width: 375, height: 812 })` (line 29). It never hits Pixel 7's mobile UA, touch input, or `coarse` pointer media query, so any mobile-only style/UA bug slips through.
- **Patch sketch:**
  ```ts
  testMatch: /(eval-cycle1-mobile|mobile-narrow-viewport)\.spec\.ts/,
  ```
  and drop the manual `setViewportSize` from `mobile-narrow-viewport.spec.ts:29` so the Pixel 7 device profile drives the viewport instead.

### F05 · MEDIUM · React 19 forwardRef drift across shadcn-ui

- **Files (24 occurrences):**
  `frontend/src/components/ui/button.tsx:13`, `card.tsx:5,20,32,49,61,69`, `dialog.tsx:16,31,83,98`, `table.tsx:5,19,27,39,54,69,84,99`, `input.tsx:5`, `sheet.tsx:15,53,102,114`, `accordion.tsx:9,21,41`, `motion.tsx:11,32`.
- **Problem:** React 19 makes `ref` a regular prop on function components and deprecates `React.forwardRef` (still works, but TypeScript no longer requires it and the runtime forwarding wrapper is now overhead). Every shadcn-ui primitive is still wrapped — the codebase locked the shadcn defaults that pre-date React 19.
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
- **Risk:** mostly low (deprecated, not removed) — flagged so it doesn't quietly compound when shadcn pulls a React-19 update upstream. Bundle savings are real (forwardRef adds ~200 B per use × 24 = ~5 KB raw minified).

### F06 · LOW · 31 unused exports + 34 unused exported types (knip)

- **Detected by:** `npx knip --no-config-hints`
- **Hot spots (full list in knip output):**
  - `src/api/queries.ts:11` — `useHealthCheck` function never called.
  - `src/api/queries.ts:23` — `useCypherQuery` function never called.
  - `src/components/ui/card.tsx:81` — `CardFooter` exported, no consumers.
  - `src/components/ui/table.tsx:115,119` — `TableFooter`, `TableCaption` exported, no consumers.
  - `src/graph/obsidian/tween.ts:9-57` — `HEARTBEAT_PERIOD_MS`, `HEARTBEAT_AMPLITUDE`, `cubicBezier`, `heartbeatPhase` — exported but only used inside the file.
  - `src/lib/ai/providers.ts:19` — `PROVIDER_MODELS` constant unused.
  - `src/lib/rdfClient.ts:42` — `contentTypeFor` function unused.
  - `src/components/ui/motion.tsx:11,32` — `MotionPanel`, `MotionPanelDiv` exported, no callers.
- **Patch sketch:** drop the `export` keyword for symbols only used in-file; delete the orphan helper functions outright. Re-run knip in CI as a soft gate (`npx knip --include exports,types`) to keep this from ratcheting back up.

### F07 · LOW · Direct deps `@radix-ui/react-accordion` + `deck.gl` are not actually used directly

- **File:** `frontend/package.json:22` (`@radix-ui/react-accordion`) and `:32` (`deck.gl`)
- **Problem:** `src/components/ui/accordion.tsx` (the only consumer of `@radix-ui/react-accordion`) is itself unused (knip "unused files" — verified by `grep -rnE "accordion" src/` outside the file itself returns nothing). `deck.gl` umbrella package is unused at the root — code only imports `@deck.gl/layers` and the unlisted `@deck.gl/mapbox` (F03).
- **Patch sketch (one removal, two lines from `package.json`):**
  ```diff
  -    "@radix-ui/react-accordion": "^1.2.12",
  -    "deck.gl": "^9.2.10",
  ```
  AND `trash src/components/ui/accordion.tsx`. Verify by re-running knip; expect "Unused dependencies (0)".

---

## Reviewed and clean (no findings)

- ESLint: `eslint .` reports no warnings or errors.
- TypeScript strict: `tsc -b --noEmit` clean across `tsconfig.app.json`, `tsconfig.tests.json`, `tsconfig.node.json`.
- vitest: 14 files / 116 tests pass.
- node:test: 99 tests pass.
- Playwright e2e: 250 tests / 70 files — no regression vs. cycle-14 floor.
- Visual baselines: 13 PNGs covering hero (light+dark), showcase, features, get-started, AI integration, claims (green/red badge, banner, table), schema browser, perf strip, 2D graph canvas. The 3D baseline is intentionally skipped on software renderers (verified in `e2e/visual-regression.spec.ts:336-342`) — not stale.
- a11y-axe sweep: covers `/`, `/playground`, `/claims`, `/docs/llm-to-cypher` with WCAG 2 A/AA tags and fails on critical/serious. Coverage matches cycle-14.
- shadcn-ui token gates: `palette-amber.spec.ts` + `polish-cohesion.spec.ts` still pin amber primary HSL, dark color-scheme, dark theme-color meta, reduced-motion overrides, and amber-terminal hero bg (not cosmos navy).
- React 19 patterns: `Suspense` + `React.lazy` adoption is good (4 routes lazy-loaded via `AppShellRouter`, `CypherEditorPanel`, `GraphCanvas` GeoCanvas/3D). Only drift is forwardRef (F05).
- `frontend/.npmrc`: `legacy-peer-deps=true` preserved (required for `@neo4j-cypher/react-codemirror` peer-dep installs).

---

## Severity tally

| Severity | Count |
| --- | --- |
| BLOCKER | 2 |
| HIGH | 1 |
| MEDIUM | 2 |
| LOW | 2 |
