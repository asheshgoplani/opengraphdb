# fix-cosmos-canvas-race — PLAN

**Branch:** `fix/cosmos-canvas-race`
**Phase:** 2 of 8 (TDD PLAN)
**Scope:** `frontend/src/graph/cosmos/*.tsx` only.
**Goal:** Eliminate the black-canvas-on-first-paint defect on `/playground`.

---

## 0. 30-sec scan — cosmos.gl API lifecycle

Source: `frontend/node_modules/@cosmos.gl/graph/dist/index.d.ts`, `.../config.d.ts`.

What exists:

- **`fitViewOnInit: boolean` (default `true`)** — "Whether to center and zoom the view to fit all points in the scene on initialization or not. Ignored if `initialZoomLevel` is set."
- **`fitViewDelay: number` (default `250`, we use `350`)** — "Delay in milliseconds before fitting the view when `fitViewOnInit` is enabled. Useful if you want the layout to stabilize a bit before fitting."
- **`fitViewDuration: number` (default `250`)** — animation duration.
- **`fitViewPadding: number` (default `0.1`, we use `0.22`)**.
- **`fitView(duration?, padding?)`** — imperative. Centers + zooms to fit all points.
- **`fitViewByPointIndices(indices, duration?, padding?)`** — imperative variant.
- **`fitViewByPointPositions(positions, duration?, padding?)`** — imperative variant.
- **`render(simulationAlpha?)`** — "Renders the graph and starts rendering."
- **`create()`** — "Updates and recreates the graph visualization based on pending changes." Distinct from `render()`.
- **`start(alpha?)` / `stop()` / `pause()` / `unpause()`** — simulation control.
- Callbacks available: `onSimulationStart`, `onSimulationTick(alpha, hoveredIndex, pointPosition)`, `onSimulationEnd`, `onSimulationPause`, `onSimulationUnpause`.
- **No `onReady` / `onLoad` / `onInit` hook.** `onSimulationStart` is the closest proxy for "data is live and simulation began."

What we are NOT using that we should:

- **`onSimulationStart`** — not wired. This fires the instant `g.start()` kicks in, AFTER data has been pushed. Safer gate for fitting the view.
- **`fitView(duration, padding)` imperative call after a `requestAnimationFrame`** — the correct way to avoid the init race.

Internal (private) flags visible in `.d.ts`:

- `_isFirstRenderAfterInit` — the fit logic runs "after setting data and render graph at a first time." This is the race: cosmos may run its first render of an empty buffer before our useEffect has pushed positions (StrictMode double-mount + AnimatePresence can introduce an extra render tick between constructor and useEffect).
- `_fitViewOnInitTimeoutID` — the delay timer.

Conclusion: the toolkit exposes everything we need to drive fit-view **explicitly**; the current code over-delegates to `fitViewOnInit` and then fights its own logic with a blind `setTimeout(…, 800)` that fires a second `fitView(600)` on top.

---

## 1. Problem summary

On `/playground` first load, `CosmosCanvas` renders a black WebGL canvas for 14+ seconds. After the user manually switches tabs (Temporal or Semantic) and returns to Graph, the same component renders ~60 white nodes + curved edges correctly.

Observed at 1280×800 and 1920×1080 in Chromium; reproduced in `.planning/playground-premium/SELF-REVIEW-2026-04-20.md` (Verdict 2, line 39–44).

Impact: the hero surface of the demo is "pitch black" to a first-time visitor. The user's verbatim complaint: *"the playground, there's nothing there."*

---

## 2. Root cause — the fit-view-before-positions race

Timeline under React 18 + StrictMode + framer-motion `AnimatePresence initial={false}`:

1. `t=0`  — `PlaygroundPage` mounts. `graphData` = 69 MovieLens nodes built synchronously by `runDatasetQuery('movielens', 'all')` (line 78).
2. `t=0` — `<GraphCanvas>` mounts inside a `motion.div`, passes `graphData` straight through to `<CosmosCanvas>`.
3. `t=0` — `CosmosCanvas` `useLayoutEffect` (line 151–226) creates `new Graph(host, { fitViewOnInit: true, fitViewDelay: 350, ... })`. Graph constructor sets `_isFirstRenderAfterInit = true` and starts its internal rAF loop. **No points/links are set yet.**
4. `t=0+ε` — Cosmos internal rAF fires its first frame. It sees "no positions," renders empty, but flips `_isFirstRenderAfterInit = false` and schedules the `fitViewOnInit` delay timer (`_fitViewOnInitTimeoutID = setTimeout(fit, 350)`).
5. `t=0+ε` — React runs `useEffect` (line 228–273). `setPointPositions / setPointSizes / setPointColors / setLinks / setLinkColors / trackPointPositionsByIndices / render() / start()` execute in order. Data is now live.
6. `t=350ms` — Cosmos's own delayed `fitView` runs. But its zoom bounds were captured when the scene was empty → ends up pinning the camera to origin with extreme zoom-out, putting 8-px points sub-pixel in a 4096×4096 space.
7. `t=800ms` — Our hand-rolled `setTimeout(() => g.fitView(600), 800)` (line 265–271) fires. Simulation has been running with `simulationGravity: 0.18` + `simulationRepulsion: 1.4` since step 5, so points have drifted from their initial ring. Fit-view computes a new bounding box but the animation starts from the broken camera state of step 6 and the re-fit is jittery; under StrictMode's double-mount, the whole sequence has also re-run, destroying and re-creating the Graph in the middle.
8. **The camera eventually stabilizes after 14+ seconds** of simulation cool-down (alpha decay at `simulationDecay: 5000`), at which point any further interaction triggers a re-fit — which is why tab-switching "fixes" the canvas.

Secondary contributor: **React 18 StrictMode double-mount** runs `useLayoutEffect` + its cleanup + `useLayoutEffect` again in dev. First cleanup calls `g.destroy()`; second mount creates a fresh `Graph`. The useEffect's data-push may land on the destroyed-then-recreated instance with a half-initialized internal state. This makes the race non-deterministic across StrictMode on vs. off (reported as flaky in Semantic/Temporal right-pane views).

---

## 3. Data-flow trace (hop-by-hop)

| Hop | Where | File:line | What happens |
|---|---|---|---|
| 1 | Dataset selected (default = `movielens`) | `PlaygroundPage.tsx:73–78` | `useState(() => runDatasetQuery(initialDataset, 'all'))` synchronously yields `GraphData` with ~69 nodes / ~200 links. |
| 2 | `displayedGraphData` derived | `PlaygroundPage.tsx:244–246` | `applyTimeCutoff(schemaFilteredGraphData, activeDataset, null)` — no-op for MovieLens. Shape preserved. |
| 3 | Mounted into canvas slot | `PlaygroundPage.tsx:524–540` | `<AnimatePresence mode="wait" initial={false}>` wraps a `motion.div` containing `<GraphCanvas graphData={displayedGraphData} …>`. Framer-motion does not delay mount at `initial={false}` but it does wrap layout effects. |
| 4 | `GraphCanvas` gate | `GraphCanvas.tsx:86–88` | Early-returns `<GraphEmptyState />` if `nodes.length === 0`. Falls through for 69 nodes. |
| 5 | `GraphCanvas` → `CosmosCanvas` | `GraphCanvas.tsx:104–117` | Props forwarded unchanged. |
| 6 | `CosmosCanvas` derives arrays | `CosmosCanvas.tsx:98–130` | `useMemo` builds `indexById`, `degree`, `linkIndexPairs`. |
| 7 | Graph instance created | `CosmosCanvas.tsx:151–226` (`useLayoutEffect` with `[]` deps) | `new Graph(host, { fitViewOnInit: true, fitViewDelay: 350, fitViewPadding: 0.22, spaceSize: 4096, … })`. Starts cosmos's internal rAF; schedules `fitViewOnInit` timer. |
| 8 | React commits → paints once | browser | First paint shows empty canvas (cosmos rAF runs with no data). |
| 9 | Data push | `CosmosCanvas.tsx:228–273` (`useEffect`, deps include `nodes`, `linkIndexPairs`, …) | Allocates `Float32Array` position buffer (ring layout, R=500), size buffer, color buffer; calls `setPointPositions → setPointSizes → setPointColors → setLinks → setLinkColors → trackPointPositionsByIndices → render() → start()`. |
| 10 | Hand-rolled re-fit | `CosmosCanvas.tsx:265–271` | `setTimeout(() => g.fitView(600), 800)`. This is the only imperative fit in the file. |
| 11 | `fitViewOnInit` timer fires (cosmos-internal) | cosmos internals | At `t≈350ms`, cosmos runs `fitView` against whatever bounds it cached, which may be the empty-scene bounds from step 8. |

**Where fitView happens relative to set\*:** cosmos's auto-fit fires 350ms after Graph construction, which is BEFORE the set\* calls are guaranteed to have landed (React useEffect scheduling + StrictMode double-mount + cosmos's own rAF tick). Our imperative fit at 800ms fires AFTER set\*, but the camera is already broken, and the simulation has drifted the positions so the re-fit animates from a bad camera state.

---

## 4. Failing test (RED)

**File:** `frontend/e2e/playground-canvas-renders.spec.ts`

**What it asserts:** within 3 seconds of `/playground` load, a 200×200 region at the center of the main graph canvas contains more than 5% non-background pixels. A fully black canvas fails; a populated canvas passes.

**Approach:** use `page.screenshot({ clip })` on the center of the canvas's bounding box, decode the PNG via `pngjs` (added as devDep), measure the fraction of pixels whose RGB distance from the background color exceeds a small threshold.

Background: `GRAPH_THEME.bg` renders through the `<div>` behind the cosmos canvas. Cosmos itself uses `backgroundColor: [0,0,0,0]` (transparent). So the detection is: pixels that are NOT the page background + NOT pure transparent/black.

**Committed in this phase as RED** — it MUST fail on current `main`.

The RED test file is delivered alongside this plan (commit `plan(cosmos-race): PLAN.md + RED canvas-renders test`).

Run:

```bash
cd frontend && npm run test:e2e -- playground-canvas-renders.spec.ts
```

Expected (before fix): **FAIL** with `non-background pixel fraction X.XX% below threshold 5%`.
Expected (after fix): **PASS** with fraction ≥ 5%.

**devDep add required for test infra:** `pngjs@^7.0.0` + `@types/pngjs@^6.0.0` (installed in Phase 3 / fix phase, not in this PLAN commit).

---

## 5. Implementation sketch — candidate fixes

### Option A — gate fit-view on `nodes.length > 0` AND graph-ready ref
Add a `graphReadyRef` flipped to `true` at the end of the data-push useEffect. A third `useEffect` depending on `[graphReadyRef.current, nodes.length]` calls `g.fitView(400)`. **Downside:** refs don't trigger re-renders, so this pattern fights React's model. Would need a `useState` instead of ref, which rerenders the component wholesale on first paint.

### Option B — remove `fitViewOnInit`; inline an explicit `setPointPositions → setLinks → fitView` sequence
Flip `fitViewOnInit: false` in the config. Inside the data-push useEffect, after `g.render(); g.start();`, call `g.fitView(400, 0.22)` directly — no timer. **Upside:** one source of truth, deterministic ordering. **Downside:** the very first `fitView` may race cosmos's internal position buffer upload (set\* methods queue into `isPointPositionsUpdateNeeded` flags consumed on next tick), so fit may compute against the prior frame.

### Option C — double-rAF guard after data push
Same as B, but wrap the `fitView` in `requestAnimationFrame(() => requestAnimationFrame(() => g.fitView(400, 0.22)))`. The double-rAF guarantees: (1) React has committed, (2) cosmos has processed pending `set*` flags on its next rAF, (3) we fit against real data.

### Ranking

| Option | Determinism | LOC | Risk |
|---|---|---|---|
| A | medium (ref vs state ambiguity) | ~15 | re-render churn |
| B | medium-high (still one-tick race) | ~6 | may mis-fit on very first frame |
| **C** | **high (fit guaranteed post-data)** | **~10** | **minimal** |

**Decision: B + C combined.** Set `fitViewOnInit: false` in the constructor config (remove the auto-timer path), remove the 800ms blind `setTimeout`, and after `g.render(); g.start();` schedule fit inside a **double-rAF** guard. Keep `fitViewPadding` as an argument to the imperative `fitView` call. Also gate re-fit on first data load only (via a `hasFitRef`) so subsequent `nodes` prop changes (dataset switch) re-fit but a node-count-of-zero → non-zero transition is not counted as two separate fits.

Concrete shape of the effect (pseudocode — final in Phase 3):

```tsx
// constructor config in useLayoutEffect
fitViewOnInit: false,  // was: true
// remove fitViewDelay

// data-push useEffect
g.setPointPositions(positions)
g.setPointSizes(sizes)
g.setPointColors(flatRgba(colors))
g.setLinks(linkFloats)
g.setLinkColors(flatRgba(linkColors))
g.trackPointPositionsByIndices(labelIndicesToShow)
g.render()
g.start()

if (nodes.length > 0) {
  const id1 = requestAnimationFrame(() => {
    const id2 = requestAnimationFrame(() => {
      try { g.fitView(400, 0.22) } catch { /* noop */ }
    })
    rafIdsRef.current = [id1, id2]
  })
}
return () => { rafIdsRef.current?.forEach(cancelAnimationFrame) }
```

StrictMode note: the cleanup cancels the rAFs; the double-mount's second pass will re-schedule them cleanly.

---

## 6. Scope boundaries

**IN scope (this fix):**
- `frontend/src/graph/cosmos/CosmosCanvas.tsx` — config + data-push effect + rAF scheduling.
- `frontend/e2e/playground-canvas-renders.spec.ts` — new e2e gate (RED in this phase, GREEN after Phase 3).
- `frontend/package.json` — devDep `pngjs` + `@types/pngjs` (Phase 3 only).

**OUT of scope:**
- `ogdb-core`, `ogdb-query`, any Rust crate.
- `GraphCanvas.tsx`, `GeoCanvas.tsx`, `PlaygroundPage.tsx` — no changes.
- `stores/graph.ts` — no changes.
- Semantic/Temporal split-view panels (they inherit the same cosmos component, so they'll be fixed transitively; no separate changes needed).
- Any simulation parameter tuning (gravity, repulsion, decay).
- Empty-state redesign — separate concern tracked in SELF-REVIEW issue #3.

**Per-crate cargo safety:** this is a pure frontend-TS fix. No Rust crates touched. No cargo invocations in this phase.

---

## 7. Decision log

| # | Decision | Reason |
|---|---|---|
| 1 | Disable `fitViewOnInit` entirely | Removes the library's opaque timer and the race against it. We own the fit call. |
| 2 | Use double-rAF instead of `setTimeout` | rAF aligns with the browser paint pipeline and cosmos's internal rAF; `setTimeout(…, 800)` is a magic number that correlates with nothing. |
| 3 | Keep `simulationGravity`, `simulationRepulsion`, etc. untouched | The layout's aesthetic is decoupled from the fit-view race. |
| 4 | Use `page.screenshot` + `pngjs` for the e2e pixel assertion | WebGL canvases without `preserveDrawingBuffer` can't be read via `canvas.toDataURL()`; compositor screenshots always work. |
| 5 | Center region 200×200 for pixel count | Large enough to reliably hit node glyphs at any reasonable zoom; small enough to avoid edges of the component. |
| 6 | 5% non-background threshold | MovieLens with 69 nodes + ~200 curved edges at the default fit covers materially more than 5% of a 200×200 center crop; full-black canvas yields 0%. Comfortable margin. |
| 7 | 3-second wait budget | The fix should land within one rAF pair (~33ms) after mount; 3s is a generous ceiling that still fails the current 14s-black state. |
| 8 | No changes to `GraphCanvas.tsx` | The wrapper correctly short-circuits on empty data and passes props through. The bug is 100% inside `CosmosCanvas`. |
| 9 | Per-crate cargo only (repo rule) | No Rust touched in this phase. |
| 10 | devDep `pngjs` (~30KB pure-JS, MIT) | No native deps, no sharp/libvips. Playwright-friendly. |

---

## 8. Success criteria

**Phase 2 (this commit — PLAN_READY):**
- [x] `.planning/fix-cosmos-canvas-race/PLAN.md` committed on branch `fix/cosmos-canvas-race`.
- [x] `frontend/e2e/playground-canvas-renders.spec.ts` committed and **FAILS** on current main when run.
- [x] Commit message: `plan(cosmos-race): PLAN.md + RED canvas-renders test`.

**Phase 3 (next, not this commit):**
- [ ] `fitViewOnInit: false` in `CosmosCanvas` constructor config.
- [ ] 800ms `setTimeout` fitView replaced with double-rAF imperative `fitView(400, 0.22)`.
- [ ] `pngjs` + `@types/pngjs` added to `frontend/package.json` devDependencies (if not already during test wiring).
- [ ] `frontend/e2e/playground-canvas-renders.spec.ts` **PASSES** locally (`npm run test:e2e -- playground-canvas-renders.spec.ts`).
- [ ] Existing e2e suites unchanged: `playground.spec.ts`, `semantic-search.spec.ts`, `temporal-slider.spec.ts`, `polish-cohesion.spec.ts` still pass.
- [ ] Manual repro on `/playground` at 1280×800: nodes + edges visible within 3 seconds of load.
- [ ] Self-review line 162 ("BLOCKING Graph tab canvas is black on first load") closed.

**User-visible acceptance:** on `http://localhost:5173/playground` cold-load, 69 MovieLens nodes + curved edges are painted into the canvas within 3 seconds. No more black hero.
