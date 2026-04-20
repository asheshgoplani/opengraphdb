# Graph-viz Premium Patterns — Distilled from 16 References

Shot corpus at `/tmp/ux-research-graph-viz/refs/*.png` (Cosmograph, cosmos.gl, Retina, Sigma.js, pixi-graph, Nomic Atlas, Neo4j Bloom, Memgraph Lab, Observable d3-force, Obsidian, Kumu, Cytoscape, Are.na, Hex, Tinybird, Grafana, Linear).

## 1. Deep-space dark canvas, not "chart dark mode"
Cosmograph, Nomic Atlas, Obsidian, Memgraph Lab all use near-black (#0B0D14 / #111318) with a faint radial bloom at center. Photo/chart dark modes use #1F2937. The "space" reading comes from being *darker than the surrounding UI* — panels sit above at #181A24.

## 2. Points as filled dots with light-source gradient, not 3-tone cartoony circles
Obsidian + Atlas render each node as a near-flat dot with one soft radial gradient (bright upper-left, deep lower-right). Avoid hard strokes at scale. Our current `paintGraphNode` already does this; keep it.

## 3. Edges as 40-60% alpha hairlines, no arrows at rest
Cosmograph default edge opacity ~0.5; Atlas ~0.3; Retina ~0.45. Arrows only on hovered subgraph. Our current arrows-always at 0.55 is a tell for "tech demo."

## 4. Community coloring > per-type coloring
Cosmograph, Retina, Nomic Atlas cluster by community detection and assign stable per-community hues. Reads as natural structure. Even without Louvain, a degree-bucket or label-bucket palette (what we have) is acceptable — the key is *consistent hue per cluster*, not rainbow-per-node.

## 5. WebGL point primitive at small size + label overlay in DOM
cosmos.gl, Sigma.js v3, pixi-graph all render dots in GL and labels via a separate DOM/canvas layer positioned in screen-space. Labels get a CSS halo (text-shadow: 0 0 6px #000). This is the single biggest lift for "looks AAA": crisp typography with subpixel AA.

## 6. Subtle ambient motion (not animated edges)
Cosmograph simulation runs for ~800ms then settles; drift is imperceptible. Our current `linkDirectionalParticles` flowing at rest is a gimmick. Turn particles OFF at rest, keep for traces only.

## 7. Hover ring in white @ 40-55% opacity, 1px-1.5px stroke
Atlas, Bloom, Cosmograph all do this. Ours is already close. Keep.

## 8. Dot-grid backdrop at 5-7% opacity, 24-32px cell
Linear, Obsidian, Memgraph Lab use this for scale reference without overpowering. Our 28px / 7% is correct.

## 9. Inspector panel as a floating glass card, not sidebar
Bloom, Atlas, Hex: right-side overlay card with blur backdrop, ~360px wide, floats over canvas. Sigma's demo uses a fixed panel — feels older. Ours is tabs in a fixed sidebar; could upgrade later.

## 10. "FPS badge" or tiny performance pill as a subtle flex
Cosmograph shows an unobtrusive FPS pill in a corner. Subliminal "this is fast" signal for devs. We can enable `showFPSMonitor` in dev only, or show node/edge count pill always.

## Takeaway
The aesthetic delta from "react-force-graph-2d dark theme" to "Cosmograph feel" is 70% a canvas + palette swap, 20% label-overlay layer, 10% motion discipline (stop continuous animation). Not a fundamental renderer change — but WebGL also unlocks 10x future scale headroom for free.
