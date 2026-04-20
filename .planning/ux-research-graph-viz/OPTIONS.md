# Graph-viz Stack Options — Matrix + Ranking

OpenGraphDB context: dark-theme developer product, interactive Cypher playground (~50-2000 nodes typical), landing demo (~30-80 nodes), future AI-native use cases that may push 10K+ nodes.

## Matrix

| Stack | Max nodes (smooth) | Renderer | Customization | Bundle (gz) | Maintenance | Code reuse | License |
|---|---|---|---|---|---|---|---|
| **react-force-graph-2d** (current) | ~5K | Canvas 2D | Very high (per-node canvas paint) | ~90 KB | Active, solo maintainer | 100% | MIT |
| **react-force-graph-3d** (sibling) | ~10K | WebGL via three.js | Medium (Three.js meshes) | ~200 KB | Active | ~70% hook reuse | MIT |
| **@cosmos.gl/graph** (direct) | **1M+** | WebGL (regl) | Medium (GL primitives + overlays) | ~75 KB | Very active (2.6.4, Nov 2025, OpenJS Foundation) | ~50% | **MIT** ✅ |
| **@cosmograph/react** (packaged) | 1M+ | WebGL | High (has all UX pieces built in) | ~280 KB | Very active | 40% | ❌ **CC-BY-NC-4.0** (non-commercial) |
| **Sigma.js v3** + react-sigma | ~30K | Canvas 2D / WebGL modes | High | ~120 KB | Active (v3 2024, Ouestware) | ~60% | MIT |
| **pixi-graph** (PixiJS) | ~50K | WebGL | Very high (Pixi sprites) | ~180 KB | Maintenance-mode, last release 2023 | ~40% | MIT |
| **d3-force + PixiJS custom** | ~100K | WebGL | Total (build everything) | ~220 KB | — | ~20% | MIT |

## Findings

- **@cosmograph/cosmograph + @cosmograph/react are BLOCKED** — license is CC-BY-NC-4.0, OpenGraphDB is commercial/OSS-intended. Rules them out entirely.
- The underlying engine **@cosmos.gl/graph (v2.6.4, MIT)** is usable and gives the exact same rendering feel as Cosmograph (same authors). The "brand" wrapper is what's non-commercial.
- **pixi-graph** has been effectively unmaintained since 2023 → future risk.
- **Sigma.js v3** is the safe, proven, React-friendly alternative but its default style reads as "academic network vis" not "premium product" (see ref 04).
- **react-force-graph-2d** polish ceiling is basically where we are at slice 3. Additional gloss is diminishing returns.

## Ranking (for OpenGraphDB)

1. **@cosmos.gl/graph + custom thin React wrapper** ✅ — MIT, WebGL, 1M node headroom, gets the Cosmograph "feel" directly, labels via a screen-space DOM overlay we write. Matches ref corpus best on premium axis.
2. **react-force-graph-3d** — premium-ish (3D parallax), but 3D doesn't fit a 2D-first dev tool; tends to disorient for relational-data reading.
3. **Sigma.js v3** — safest, most mature React story, but aesthetic floor is lower than cosmos.gl.
4. react-force-graph-2d polish-harder — cheapest but hits ceiling.
5. pixi-graph — unmaintained, skip.
6. Full custom d3-force + PixiJS — premium ceiling highest but 1-week target doesn't allow.

## Pick

**@cosmos.gl/graph + custom React wrapper**, with DOM overlay for labels and the existing slice-3 palette. Ported slice-3 polish: dot-grid bg + vignette stays as CSS layers; node palette + degree-scaled size maps to `setPointColors` + `setPointSizes`; hover ring uses native `renderHoveredPointRing`; selection ring uses `focusedPointIndex`; glow becomes a CSS `filter: drop-shadow` on the canvas layer (cheap visual win).
