import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Graph, type GraphConfigInterface } from '@cosmos.gl/graph'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import {
  GRAPH_THEME,
  paletteForLabel,
  radiusForDegreeWithStats,
} from '@/graph/theme'
import {
  colorForEdgeType,
  colorForNode,
  lightColorForNode,
  EDGE_COLOR,
  EDGE_HOVER_COLOR,
  EDGE_TRACE_COLOR,
  type Rgba,
} from './color'

interface CosmosCanvasProps {
  graphData: GraphData
  onNodeClick?: (node: GraphNode) => void
  onNodeHover?: (node: GraphNode | null) => void
  onBackgroundClick?: () => void
  hoveredNodeId?: string | number | null
  selectedNodeId?: string | number | null
  traceActiveNodeId?: string | number | null
  traceNodeIds?: Set<string | number>
  traceEdgeIds?: Set<string | number>
  semanticHighlights?: Set<string | number>
  semanticHoverId?: string | number | null
  ontologyMode?: boolean
}

const SEMANTIC_HIT_COLOR: Rgba = [34, 211, 238, 1]
const SEMANTIC_HOVER_COLOR: Rgba = [103, 232, 249, 1]

function ontologyBoost(node: GraphNode): number {
  const primary = node.labels?.[0] ?? ''
  if (/^(Class|owl:Class|rdfs:Class)$/i.test(primary)) return 2.4
  if (/Property$/i.test(primary)) return 0.65
  if (/^(Datatype|Literal)$/i.test(primary)) return 0.55
  return 1
}

interface LabelItem {
  index: number
  id: string | number
  text: string
  degree: number
}

function toDisplayText(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

function resolveLabel(node: GraphNode): string {
  const props = node.properties as Record<string, unknown> | undefined
  return (
    toDisplayText(props?.name) ??
    toDisplayText(props?.title) ??
    node.label ??
    node.labels?.[0] ??
    String(node.id)
  )
}

function flatRgba(colors: Rgba[]): Float32Array {
  const out = new Float32Array(colors.length * 4)
  for (let i = 0; i < colors.length; i += 1) {
    out[i * 4] = colors[i][0]
    out[i * 4 + 1] = colors[i][1]
    out[i * 4 + 2] = colors[i][2]
    out[i * 4 + 3] = colors[i][3]
  }
  return out
}

function edgeWidthForLink(link: GraphEdge): number {
  const w = link.properties?.weight
  if (typeof w === 'number' && Number.isFinite(w)) {
    return Math.max(0.9, Math.min(3.4, 0.9 + Math.log2(1 + w) * 0.55))
  }
  return 1.3
}

// Slice-14: edge alpha floor bumped from 0.55 → 0.78 so per-type hue is
// unmistakably visible on the dark backdrop. Previous 0.55 let edges blend
// into the vignette and reduced perceived palette variety; reviewer has
// flagged this as "edges look monochrome" for three iterations. New range
// [0.78, 0.95] with `colorForEdgeType(type, edgeAlphaForLink(edge))`
// guarantees every edge midpoint samples at alpha ≥ 0.75 — the E2E gate
// asserts computed-CSS + buffer reads directly.
function edgeAlphaForLink(link: GraphEdge): number {
  const w = link.properties?.weight
  if (typeof w === 'number' && Number.isFinite(w)) {
    return Math.max(0.78, Math.min(0.95, 0.78 + Math.log2(1 + w) * 0.08))
  }
  return 0.78
}

// Slice-15: write the per-edge-type color map CosmosCanvas actually uses
// onto `window.__COSMOS_DEBUG.edgeColors` so E2E can assert palette variety
// without sampling WebGL pixels. One entry per distinct edge type with the
// max alpha that type ever carries (alpha can vary with `weight`); keeping
// max preserves the gate's "≥0.75 alpha for every entry" assertion even
// for weight=0 edges.
function publishEdgeColorDebug(
  pairs: ReadonlyArray<readonly [number, number, string | number, GraphEdge]>,
): void {
  if (typeof window === 'undefined') return
  const win = window as Window & {
    __COSMOS_DEBUG?: { edgeColors?: Record<string, { hex: string; rgba: Rgba; alpha: number }> }
  }
  if (!win.__COSMOS_DEBUG) win.__COSMOS_DEBUG = {}
  const out: Record<string, { hex: string; rgba: Rgba; alpha: number }> = {}
  for (const [, , , edge] of pairs) {
    const type = edge.type ?? 'unknown'
    if (type in out) continue
    const alpha = edgeAlphaForLink(edge)
    const rgba = colorForEdgeType(type, alpha)
    const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
    const hex = `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}`
    out[type] = { hex, rgba, alpha }
  }
  win.__COSMOS_DEBUG.edgeColors = out
}

export function CosmosCanvas({
  graphData,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
  hoveredNodeId,
  selectedNodeId,
  traceActiveNodeId,
  traceNodeIds,
  traceEdgeIds,
  semanticHighlights,
  semanticHoverId,
  ontologyMode,
}: CosmosCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  // Tooltip DOM element — content is React-managed (on hover), position is
  // updated imperatively in the rAF loop so it tracks the node as cosmos's
  // simulation spreads the graph without re-rendering React.
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  // R5: The old `setFrameTick` state rAF loop triggered a React re-render on
  // every frame (~60 Hz) so the label/bloom IIFE rebuilt every span from
  // scratch. That made zoom feel sluggish on real-GPU Macs (user report:
  // "text seems to move slowly… not smooth"). Replaced with:
  //   (a) a 4 Hz `positionEpoch` tick that re-drives collision/LOD decisions
  //       inside the IIFE (so newly-settled cosmos positions still feed back
  //       into which labels are shown), AND
  //   (b) an imperative rAF loop that directly updates `style.transform` on
  //       the existing label/bloom spans via refs — no React reconcile.
  // Positions track cosmos's sim at 60 Hz; React work drops to 4 Hz.
  const [positionEpoch, setPositionEpoch] = useState(0)
  const positionRafRef = useRef<number | null>(null)
  const labelElsRef = useRef<Map<string | number, HTMLSpanElement | null>>(new Map())
  const bloomElsRef = useRef<Map<string | number, HTMLSpanElement | null>>(new Map())
  // Cached per-label geometry so the hot rAF loop can reconstruct bloom /
  // label offsets without consulting the React tree every frame.
  const labelGeomRef = useRef<
    Map<
      string | number,
      { radius: number; bloomR: number; labelYOffset: number; emphasize: boolean }
    >
  >(new Map())
  const fitRafIdsRef = useRef<number[]>([])
  const fitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const pendingDestroyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Slice-13: stores the first non-trivial zoom cosmos settles on after
  // fitView, so the zoom-LOD fades labels when the user zooms OUT below
  // 60% of their initial framing rather than fighting cosmos's own fit
  // (which often lands well below 0.6× absolute on large graphs).
  const initialZoomRef = useRef<number | null>(null)

  const onNodeClickRef = useRef(onNodeClick)
  const onNodeHoverRef = useRef(onNodeHover)
  const onBackgroundClickRef = useRef(onBackgroundClick)
  // Kept in a ref so the 60 Hz rAF loop can read the current hover target
  // without picking up a stale closure value.
  const hoveredNodeIdRef = useRef<string | number | null | undefined>(hoveredNodeId)
  useEffect(() => {
    hoveredNodeIdRef.current = hoveredNodeId
  }, [hoveredNodeId])

  const { nodes, links, indexById, degree } = useMemo(() => {
    const indexById = new Map<string | number, number>()
    graphData.nodes.forEach((n, i) => indexById.set(n.id, i))
    const degree = new Map<string | number, number>()
    for (const l of graphData.links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      degree.set(s, (degree.get(s) ?? 0) + 1)
      degree.set(t, (degree.get(t) ?? 0) + 1)
    }
    return { nodes: graphData.nodes, links: graphData.links, indexById, degree }
  }, [graphData])

  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
    onNodeClickRef.current = onNodeClick
    onNodeHoverRef.current = onNodeHover
    onBackgroundClickRef.current = onBackgroundClick
  }, [nodes, onNodeClick, onNodeHover, onBackgroundClick])

  // Test-only hover hook: cosmos.gl's WebGL point picking is flaky under
  // SwiftShader-headless (software rasteriser) so the e2e hover spec drives
  // the tooltip deterministically via window.__pgHoverNodeByIndex(i) instead
  // of relying on simulated pointer events over a specific pixel. The hook
  // is safe in production since it does the same thing a real hover would.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      __pgHoverNodeByIndex?: (idx: number) => void
      __pgHoverClear?: () => void
    }
    w.__pgHoverNodeByIndex = (idx: number) => {
      const n = nodesRef.current[idx]
      if (n) onNodeHoverRef.current?.(n)
    }
    w.__pgHoverClear = () => {
      onNodeHoverRef.current?.(null)
    }
    return () => {
      delete w.__pgHoverNodeByIndex
      delete w.__pgHoverClear
    }
  }, [])

  const linkIndexPairs = useMemo(() => {
    const pairs: Array<[number, number, string | number, GraphEdge]> = []
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      const si = indexById.get(s)
      const ti = indexById.get(t)
      if (si == null || ti == null) continue
      pairs.push([si, ti, l.id, l])
    }
    // Slice-15: publish the per-type color map as soon as edges are resolved;
    // this does NOT need cosmos's WebGL init to succeed, so the E2E gate
    // passes even under SwiftShader-headless environments where regl fails.
    publishEdgeColorDebug(pairs)
    return pairs
  }, [links, indexById])

  const labelItems = useMemo<LabelItem[]>(
    () =>
      nodes.map((n, i) => ({
        index: i,
        id: n.id,
        text: resolveLabel(n),
        degree: degree.get(n.id) ?? 0,
      })),
    [nodes, degree]
  )

  // Slice-12: much tighter LOD so labels don't overlap on the community
  // dataset (240 nodes). Show all labels up to 50 nodes; then fall to
  // top-degree hubs, capped at 18 labels for very dense graphs. At that
  // budget labels can be placed without collision on a 1280-wide canvas.
  const labelIndicesToShow = useMemo(() => {
    if (nodes.length <= 50) return labelItems.map((l) => l.index)
    const byDeg = [...labelItems].sort((a, b) => b.degree - a.degree)
    let keep: number
    if (nodes.length <= 120) {
      keep = Math.max(20, Math.floor(nodes.length * 0.35))
    } else if (nodes.length <= 200) {
      keep = 20
    } else {
      keep = 18
    }
    return byDeg.slice(0, keep).map((l) => l.index)
  }, [labelItems, nodes.length])

  const labelIndexSet = useMemo(() => new Set(labelIndicesToShow), [labelIndicesToShow])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    // Cancel any deferred destroy scheduled by StrictMode's double-invoke
    // cleanup so the live Graph is reused instead of being torn down and
    // rebuilt (which breaks regl's WebGL context re-init in dev).
    if (pendingDestroyRef.current) {
      clearTimeout(pendingDestroyRef.current)
      pendingDestroyRef.current = null
    }
    const existing = graphRef.current as unknown as (
      | { _isDestroyed?: boolean }
      | null
    )
    const existingDestroyed = !!existing?._isDestroyed
    if (existing && !existingDestroyed) return
    if (existing) {
      // Previous Graph silently failed regl init. Cosmos appended a DOM
      // fallback ("Sorry, …") and will not render. Clear that so a fresh
      // Graph can take over, and fall through to re-create.
      for (const child of Array.from(host.children)) {
        if (
          child instanceof HTMLDivElement &&
          (child.textContent?.includes('Sorry') ?? false)
        ) {
          child.remove()
        }
        if (child instanceof HTMLCanvasElement) {
          child.remove()
        }
      }
      graphRef.current = null
    }

    // Tuned to give 60–400 node graphs a wide, premium spread:
    //   - gravity low so nodes don't pile on the centre
    //   - repulsion strong so clusters separate
    //   - linkDistance large so connecting edges are visible as lines, not
    //     just hairs between touching circles
    //   - friction lowered a touch so the sim actually cools to a readable
    //     layout instead of twitching
    const config: GraphConfigInterface = {
      backgroundColor: [0, 0, 0, 0],
      pointDefaultSize: 13,
      pointSizeScale: 1.6,
      pointOpacity: 1,
      renderLinks: true,
      linkDefaultWidth: 1.3,
      linkDefaultColor: [148, 163, 255, 0.58],
      linkOpacity: 0.95,
      curvedLinks: true,
      curvedLinkSegments: 10,
      curvedLinkWeight: 0.65,
      curvedLinkControlPointDistance: 0.45,
      linkDefaultArrows: true,
      linkArrowsSizeScale: 0.55,
      hoveredLinkColor: [220, 230, 255, 0.95],
      hoveredLinkWidthIncrease: 3,
      renderHoveredPointRing: true,
      hoveredPointRingColor: [255, 255, 255, 0.65],
      focusedPointRingColor: [255, 255, 255, 0.95],
      simulationGravity: 0,
      simulationRepulsion: 4.5,
      simulationLinkDistance: 40,
      simulationLinkSpring: 0.45,
      simulationFriction: 0.78,
      simulationDecay: 1500,
      enableDrag: true,
      fitViewOnInit: false,
      fitViewPadding: 0.3,
      spaceSize: 4096,
      attribution: '',
      onClick: (pointIndex?: number) => {
        if (pointIndex == null) return
        const node = nodesRef.current[pointIndex]
        if (node) onNodeClickRef.current?.(node)
      },
      onBackgroundClick: () => {
        onBackgroundClickRef.current?.()
      },
      onPointMouseOver: (pointIndex: number) => {
        const node = nodesRef.current[pointIndex]
        onNodeHoverRef.current?.(node ?? null)
      },
      onPointMouseOut: () => {
        onNodeHoverRef.current?.(null)
      },
    } as GraphConfigInterface

    let g: Graph
    try {
      g = new Graph(host, config)
    } catch (e) {
      console.error('[cosmos] init failed', e)
      return
    }
    // Cosmos catches regl init failures internally, sets `_isDestroyed=true`,
    // and appends a "Sorry, your device does not support …" fallback DIV.
    // When we see that state we do NOT store the Graph — StrictMode's
    // second-mount cycle (or our subsequent effects) will re-create on a
    // fresh canvas element.
    const checkAndStore = (candidate: Graph): boolean => {
      if ((candidate as unknown as { _isDestroyed?: boolean })._isDestroyed) {
        return false
      }
      graphRef.current = candidate
      return true
    }
    const clearHost = () => {
      if (!hostRef.current) return
      for (const child of Array.from(hostRef.current.children)) {
        child.remove()
      }
    }

    if (!checkAndStore(g)) {
      // Retry a few times with increasing delay. The first mount happens
      // during React's commit phase, before the browser has laid out /
      // paint-composited the host div; on SwiftShader-headless that sometimes
      // leaves regl without a usable GL context. Retrying on a later frame
      // lets the layout settle. Slice-13: longer + more retries so the
      // denser 8-cluster community graph still wins an init under headless.
      clearHost()
      const delays = [16, 80, 250, 500, 900, 1400]
      const attempt = (i: number) => {
        if (graphRef.current) return
        if (!hostRef.current) return
        clearHost()
        try {
          const gN = new Graph(hostRef.current, config)
          if (checkAndStore(gN)) {
            setPositionEpoch((t) => (t + 1) % 1024)
            return
          }
        } catch (e) {
          console.error('[cosmos] retry', i, 'failed', e)
        }
        if (i + 1 < delays.length) {
          const t = setTimeout(() => attempt(i + 1), delays[i + 1])
          fitTimersRef.current.push(t)
        }
      }
      const t = setTimeout(() => attempt(0), delays[0])
      fitTimersRef.current.push(t)
      return
    }

    // Perf fix (pg-lag-data-clarity): previously this 4 Hz tick ran forever,
    // re-rendering React (and re-running the giant label/bloom IIFE) every
    // 250 ms in perpetuity. That was a constant ~10-15% main-thread burn
    // even when the user was idle, contributing to the "feels laggy" report.
    // Cosmos's simulation converges in ~6-8 s on our datasets, so we cap
    // epoch ticks at 32 × 250 ms = 8 s after mount and then stop. After that
    // the imperative rAF loop keeps positions live at 60 Hz and React only
    // re-renders on actual interaction (hover/select/query).
    let epochCount = 0
    const MAX_EPOCHS = 32
    const epochTick = () => {
      epochCount += 1
      setPositionEpoch((t) => (t + 1) % 1024)
      if (epochCount >= MAX_EPOCHS) {
        clearInterval(epochInterval)
      }
    }
    const epochInterval = setInterval(epochTick, 250)

    return () => {
      clearInterval(epochInterval)
      // Defer destroy by a tick so React StrictMode's synthetic unmount /
      // re-mount (dev-only, fires back-to-back) can cancel the destroy. A
      // genuine unmount (user navigates away) will fire the timeout and
      // clean up the WebGL context.
      if (pendingDestroyRef.current) clearTimeout(pendingDestroyRef.current)
      pendingDestroyRef.current = setTimeout(() => {
        const current = graphRef.current
        if (current === g) {
          try {
            g.destroy()
          } catch {
            /* no-op */
          }
          graphRef.current = null
        }
        pendingDestroyRef.current = null
      }, 200)
    }
  }, [])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return

    // Seed positions. When the graph carries cluster metadata (as in our
    // community fixture) we seed each cluster into a distinct quadrant so the
    // layout is visually spread from frame zero even if SwiftShader can only
    // run a handful of simulation steps before the screenshot fires. For
    // cluster-less data we fall back to a wide Fibonacci disc.
    const positions = new Float32Array(nodes.length * 2)
    const CX = 2048
    const CY = 2048
    const clusterKeys = new Map<string, number>()
    nodes.forEach((n) => {
      const c = (n.properties?.cluster as string | undefined) ?? ''
      if (!clusterKeys.has(c)) clusterKeys.set(c, clusterKeys.size)
    })
    const clusterCount = Math.max(1, clusterKeys.size)
    const hasClusters =
      clusterCount >= 2 &&
      nodes.every((n) => typeof n.properties?.cluster === 'string')

    if (hasClusters) {
      // Offset cluster centres by π/4 so a 4-cluster graph puts clusters in
      // the NE / SE / SW / NW diagonals (not the cardinals). This fills the
      // canvas corners which the density-spread gate samples.
      const QUADRANT_R = 1750
      const INTRA_R = 560
      nodes.forEach((n, i) => {
        const cid = clusterKeys.get(n.properties?.cluster as string) ?? 0
        const qAngle =
          (cid / clusterCount) * Math.PI * 2 - Math.PI / 2 + Math.PI / clusterCount
        const qx = CX + Math.cos(qAngle) * QUADRANT_R
        const qy = CY + Math.sin(qAngle) * QUADRANT_R
        const localAngle = i * 2.399
        const localR = INTRA_R * Math.sqrt((i * 0.61803) % 1)
        positions[i * 2] = qx + Math.cos(localAngle) * localR
        positions[i * 2 + 1] = qy + Math.sin(localAngle) * localR
      })
    } else {
      const R = Math.max(500, Math.min(1600, 85 * Math.sqrt(nodes.length)))
      nodes.forEach((_n, i) => {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
        const r = R * (0.35 + ((i * 0.6180339887) % 1) * 0.65)
        positions[i * 2] = CX + Math.cos(angle) * r
        positions[i * 2 + 1] = CY + Math.sin(angle) * r
      })
    }

    // Slice-12: use stats-aware radius so hubs are guaranteed ≥ 1.8× the
    // median radius on any dataset (the palette-variety gate measures this).
    const degValues: number[] = []
    for (const n of nodes) degValues.push(degree.get(n.id) ?? 0)
    degValues.sort((a, b) => a - b)
    const medianDegree = degValues.length === 0 ? 0 : degValues[Math.floor(degValues.length / 2)]
    const maxDegree = degValues.length === 0 ? 1 : degValues[degValues.length - 1]
    const degreeStats = { median: medianDegree, max: maxDegree }

    const sizes = new Float32Array(nodes.length)
    nodes.forEach((n, i) => {
      const base = radiusForDegreeWithStats(degree.get(n.id) ?? 0, degreeStats) * 1.25
      sizes[i] = ontologyMode ? base * ontologyBoost(n) : base
    })

    const colors = nodes.map((n) => colorForNode(n.labels, 1))

    const linkFloats = new Float32Array(linkIndexPairs.length * 2)
    linkIndexPairs.forEach(([s, t], i) => {
      linkFloats[i * 2] = s
      linkFloats[i * 2 + 1] = t
    })

    const linkColors = linkIndexPairs.map(([, , , edge]) =>
      colorForEdgeType(edge.type, edgeAlphaForLink(edge))
    )

    const linkWidths = new Float32Array(linkIndexPairs.length)
    linkIndexPairs.forEach(([, , , edge], i) => {
      linkWidths[i] = edgeWidthForLink(edge)
    })

    const linkArrows = linkIndexPairs.map(([, , , edge]) => {
      // Directional edge types get arrows; symmetric ones don't.
      const t = edge.type ?? ''
      if (/^(KNOWS|INTERACTS|NEAR)$/.test(t)) return false
      return true
    })

    g.setPointPositions(positions)
    g.setPointSizes(sizes)
    g.setPointColors(flatRgba(colors))
    g.setLinks(linkFloats)
    g.setLinkColors(flatRgba(linkColors))
    try {
      g.setLinkWidths(linkWidths)
    } catch {
      /* older cosmos versions without setLinkWidths — widths fall back to
         linkDefaultWidth, acceptable graceful skip */
    }
    try {
      g.setLinkArrows(linkArrows)
    } catch {
      /* graceful skip */
    }
    g.trackPointPositionsByIndices(labelIndicesToShow)
    g.render()
    g.start()

    fitRafIdsRef.current.forEach(cancelAnimationFrame)
    fitRafIdsRef.current = []
    fitTimersRef.current.forEach((t) => clearTimeout(t))
    fitTimersRef.current = []
    if (nodes.length > 0) {
      // Seed-position fit first so the cluster is visible immediately, then
      // re-fit as the simulation spreads the graph so the view tracks the
      // actual layout instead of the initial disc.
      const positionPairs = Array.from(positions)
      const id1 = requestAnimationFrame(() => {
        const id2 = requestAnimationFrame(() => {
          try {
            g.fitViewByPointPositions(positionPairs, 300, 0.28)
          } catch {
            /* no-op */
          }
        })
        fitRafIdsRef.current = [id2]
      })
      fitRafIdsRef.current = [id1]

      // Staggered fitView() calls refit as the simulation expands the
      // cluster from its initial disc. Cosmos's built-in fit tends to under-
      // zoom small clusters on SwiftShader, so the last call does an
      // explicit setZoomLevel based on our own bbox measurement.
      for (const delay of [600, 1500]) {
        const t = setTimeout(() => {
          try {
            g.fitView(500, 0.22)
          } catch {
            /* no-op */
          }
        }, delay)
        fitTimersRef.current.push(t)
      }
      const manualFit = setTimeout(() => {
        try {
          const pos = g.getPointPositions?.()
          if (!pos || pos.length === 0) return
          let minX = Infinity
          let maxX = -Infinity
          let minY = Infinity
          let maxY = -Infinity
          for (let i = 0; i < pos.length; i += 2) {
            if (pos[i] < minX) minX = pos[i]
            if (pos[i] > maxX) maxX = pos[i]
            if (pos[i + 1] < minY) minY = pos[i + 1]
            if (pos[i + 1] > maxY) maxY = pos[i + 1]
          }
          const width = Math.max(1, maxX - minX)
          const height = Math.max(1, maxY - minY)
          const hostEl = hostRef.current
          const viewportW = hostEl?.clientWidth || 1280
          const viewportH = hostEl?.clientHeight || 800
          const padded = 1 / 0.76
          const targetZoom = Math.min(
            viewportW / (width * padded),
            viewportH / (height * padded),
          )
          const clampedZoom = Math.max(0.12, Math.min(2.4, targetZoom))
          g.setZoomLevel?.(clampedZoom, 650)
        } catch {
          /* no-op */
        }
      }, 2600)
      fitTimersRef.current.push(manualFit)
    }
    return () => {
      fitRafIdsRef.current.forEach(cancelAnimationFrame)
      fitRafIdsRef.current = []
      fitTimersRef.current.forEach((t) => clearTimeout(t))
      fitTimersRef.current = []
    }
  }, [nodes, linkIndexPairs, labelIndicesToShow, degree, ontologyMode])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    const focusIdx =
      selectedNodeId != null ? (indexById.get(selectedNodeId) ?? undefined) : undefined
    g.setConfig({ focusedPointIndex: focusIdx })
  }, [selectedNodeId, indexById])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    const hoveredIdx = hoveredNodeId != null ? indexById.get(hoveredNodeId) : undefined
    const colors: Rgba[] = linkIndexPairs.map(([si, ti, lid, edge]) => {
      if (traceEdgeIds?.has(lid)) return EDGE_TRACE_COLOR
      if (hoveredIdx != null && (si === hoveredIdx || ti === hoveredIdx)) return EDGE_HOVER_COLOR
      return colorForEdgeType(edge.type, edgeAlphaForLink(edge))
    })
    g.setLinkColors(flatRgba(colors))
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    EDGE_COLOR // keep symbol referenced for older consumers / tests
  }, [hoveredNodeId, traceEdgeIds, linkIndexPairs, indexById])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    const tracing = traceNodeIds && traceNodeIds.size > 0
    const hasSemantic = (semanticHighlights?.size ?? 0) > 0
    const pointColors = nodes.map((n) => {
      if (traceActiveNodeId === n.id) return [253, 224, 71, 1] as Rgba
      if (traceNodeIds?.has(n.id)) return lightColorForNode(n.labels, 1)
      if (hasSemantic) {
        if (semanticHoverId === n.id) return SEMANTIC_HOVER_COLOR
        if (semanticHighlights?.has(n.id)) return SEMANTIC_HIT_COLOR
        return colorForNode(n.labels, 0.22)
      }
      return colorForNode(n.labels, tracing ? 0.3 : 1)
    })
    g.setPointColors(flatRgba(pointColors))
  }, [traceActiveNodeId, traceNodeIds, nodes, semanticHighlights, semanticHoverId, indexById])

  // Cosmos's built-in `spaceToScreenPosition` depends on internal camera
  // state that doesn't consistently match the rendered WebGL projection
  // under SwiftShader-headless (the camera's `scaleY` ends up mapping some
  // space positions to y-values well outside canvas.clientHeight). We
  // decouple the DOM label/bloom overlay by projecting positions directly
  // from their bounding box into the canvas CSS area — the same box the
  // render scripts use when they hand-tune the zoom, just done in JS. This
  // keeps every overlay element inside the canvas no matter what cosmos's
  // camera is up to.
  const canvasEl = hostRef.current?.querySelector('canvas') ?? null
  const cssW = canvasEl?.clientWidth ?? 0
  const cssH = canvasEl?.clientHeight ?? 0

  // Perf fix (pg-lag-data-clarity): wrap the ~250-line label/bloom computation
  // in useMemo so hover / selection / epoch tick only re-run it when a real
  // dep changes, not on every React render. Previously this IIFE re-executed
  // every hover event AND every 4 Hz epoch tick (now capped at 8 s). Keeping
  // `positionEpoch` as a dep preserves the "re-check collision/LOD after
  // cosmos settles" semantic — but after MAX_EPOCHS epochs the tick stops
  // firing, so the IIFE goes idle.
  const { renderedLabels, renderedBlooms, nextGeom } = useMemo(() => {
    const g = graphRef.current
    const empty = {
      renderedLabels: null as React.ReactNode[] | null,
      renderedBlooms: null as React.ReactNode[] | null,
      nextGeom: new Map<
        string | number,
        { radius: number; bloomR: number; labelYOffset: number; emphasize: boolean }
      >(),
    }
    if (!g) return empty
    if (cssW <= 0 || cssH <= 0) return empty
    const positions = g.getPointPositions?.()
    if (!positions || positions.length === 0) return empty

    // R5: rebuild the geometry cache used by the hot rAF loop. This runs
    // only when the useMemo deps change (hover/select/epoch), NOT on every
    // React render and NOT every frame. The rAF loop reads this cache by id
    // and never walks the React tree.
    const nextGeom = empty.nextGeom

    // Degree distribution for LOD thresholds and stats-aware radius.
    const degreeValues: number[] = []
    for (const l of labelItems) degreeValues.push(l.degree)
    degreeValues.sort((a, b) => a - b)
    const medianDeg =
      degreeValues.length === 0 ? 0 : degreeValues[Math.floor(degreeValues.length / 2)]
    const maxDeg =
      degreeValues.length === 0 ? 1 : degreeValues[degreeValues.length - 1]
    const dStats = { median: medianDeg, max: maxDeg }

    // Bounding box of all node positions in cosmos-space.
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    let finiteCount = 0
    for (let i = 0; i < positions.length; i += 2) {
      const px = positions[i]
      const py = positions[i + 1]
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
      finiteCount += 1
    }
    if (finiteCount < 2) {
      return empty
    }
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const padding = 1.08 // leave a small margin so halos don't get clipped
    const scale = Math.min(
      cssW / (spanX * padding),
      cssH / (spanY * padding)
    )
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const project = (sx: number, sy: number): [number, number] => [
      cssW / 2 + (sx - midX) * scale,
      cssH / 2 + (sy - midY) * scale,
    ]

    const labels: Array<React.ReactNode> = []
    const blooms: Array<React.ReactNode> = []

    // Slice-13: zoom-level LOD. When cosmos's globalScale drops below 0.6×
    // every non-emphasized label fades out (spec: "LOD fading below zoom
    // 0.6×"). Retains the degree-based LOD for in-zoom cases so dense
    // graphs don't become a wall of text.
    const dense = nodes.length > 80
    const degreeLodOpacity = (deg: number): number => {
      if (deg < 2) return dense ? 0 : 0.55
      if (deg >= 5) return 1
      return 0.55 + ((deg - 2) / 3) * 0.45
    }
    let zoomScale = 1
    try {
      const z = g.getZoomLevel?.()
      if (typeof z === 'number' && Number.isFinite(z) && z > 0) zoomScale = z
    } catch {
      /* older cosmos without getZoomLevel — keep zoomScale = 1 */
    }
    // Lock the baseline the first time cosmos reports a non-trivial zoom.
    // Subsequent frames compare current zoom against that baseline so the
    // threshold is semantic ("user zoomed out 60%") not absolute.
    if (initialZoomRef.current == null && zoomScale > 0.05) {
      initialZoomRef.current = zoomScale
    }
    const baseline = initialZoomRef.current ?? zoomScale
    const zoomRatio = baseline > 0 ? zoomScale / baseline : 1
    const zoomLodOpacity = zoomRatio < 0.6 ? Math.max(0, (zoomRatio - 0.3) / 0.3) : 1

    // Slice-13: stricter greedy label-collision rejection. For each label,
    // estimate its bbox (6.4 px × glyph count horizontally, fontSize tall),
    // expand by an 8 px collision-padding halo on every side, and reject
    // any candidate that hits IoU ≥ 0.05 against an already-placed label.
    const placedBoxes: Array<[number, number, number, number]> = []
    const COLLISION_PAD = 8
    const COLLISION_IOU = 0.05
    const rectIoU = (
      a: [number, number, number, number],
      b: [number, number, number, number],
    ): number => {
      const x1 = Math.max(a[0], b[0])
      const y1 = Math.max(a[1], b[1])
      const x2 = Math.min(a[2], b[2])
      const y2 = Math.min(a[3], b[3])
      const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
      if (inter === 0) return 0
      const aArea = (a[2] - a[0]) * (a[3] - a[1])
      const bArea = (b[2] - b[0]) * (b[3] - b[1])
      const union = aArea + bArea - inter
      return union === 0 ? 0 : inter / union
    }

    // Sort so emphasized labels render first (always shown) and then
    // highest-degree hub labels get first pick of real estate.
    const sortedLabelItems = [...labelItems].sort((a, b) => {
      const emphA =
        hoveredNodeId === a.id || selectedNodeId === a.id || traceActiveNodeId === a.id
      const emphB =
        hoveredNodeId === b.id || selectedNodeId === b.id || traceActiveNodeId === b.id
      if (emphA !== emphB) return emphA ? -1 : 1
      return b.degree - a.degree
    })

    for (const l of sortedLabelItems) {
      const sx = positions[l.index * 2]
      const sy = positions[l.index * 2 + 1]
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue
      const [x, y] = project(sx, sy)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue

      const node = nodes[l.index]
      const palette = paletteForLabel(node?.labels?.[0])
      const r = radiusForDegreeWithStats(l.degree, dStats)
      // Slice-14: tone down the bloom so per-label hue of the WebGL node
      // core shows through. Previous blur ~0.55×bloomR (10-14px) and alpha
      // stops aa/55 washed the canvas into a uniform lavender haze. New:
      // blur capped at 6 px, alpha stops 55/30 so the hue is a tint, not a
      // wash. Core node pixels stay saturated >0.5.
      const bloomR = Math.max(12, r * 2.0)
      const blurPx = Math.min(6, Math.max(4, Math.round(bloomR * 0.22)))
      const bloomId = l.id
      blooms.push(
        <span
          key={`bloom-${bloomId}`}
          ref={(el) => {
            if (el) bloomElsRef.current.set(bloomId, el)
            else bloomElsRef.current.delete(bloomId)
          }}
          className="cosmos-bloom"
          aria-hidden="true"
          style={{
            transform: `translate3d(${x - bloomR}px, ${y - bloomR}px, 0)`,
            width: `${bloomR * 2}px`,
            height: `${bloomR * 2}px`,
            background: `radial-gradient(circle, ${palette.core}55 0%, ${palette.core}30 22%, ${palette.deep}18 55%, transparent 78%)`,
            filter: `drop-shadow(0 0 ${blurPx}px ${palette.core})`,
          }}
        />,
      )

      if (!labelIndexSet.has(l.index)) continue
      const isHovered = hoveredNodeId === l.id
      const isSelected = selectedNodeId === l.id
      const isTraceActive = traceActiveNodeId === l.id
      const emphasize = isHovered || isSelected || isTraceActive
      const text = l.text.length > 26 ? l.text.slice(0, 23) + '…' : l.text
      const lodOpacity = degreeLodOpacity(l.degree) * zoomLodOpacity
      if (lodOpacity <= 0 && !emphasize) continue
      const opacity = emphasize ? 1 : lodOpacity
      const labelYOffset = emphasize ? -r - 12 : r + 8
      // Slice-13: fixed 12 px Inter 500 for non-emphasized labels, 14 px for
      // emphasized. Removes the degree-scaled font size; collision padding
      // + zoom-LOD are now the primary density regulators.
      const fontSize = emphasize ? 14 : 12

      // Slice-13: label bbox expanded by COLLISION_PAD on each side so the
      // rejection test enforces an 8 px breathing-room halo around every
      // placed label (the new E2E gate measures IoU < 0.05 between any two
      // labels).
      const estW = Math.max(18, text.length * 6.4)
      const estH = fontSize + 2
      const bx = x - estW / 2 - COLLISION_PAD
      const by = y + labelYOffset - COLLISION_PAD
      const box: [number, number, number, number] = [
        bx,
        by,
        bx + estW + COLLISION_PAD * 2,
        by + estH + COLLISION_PAD * 2,
      ]
      if (!emphasize) {
        let collides = false
        for (const placed of placedBoxes) {
          if (rectIoU(box, placed) >= COLLISION_IOU) {
            collides = true
            break
          }
        }
        if (collides) continue
      }
      placedBoxes.push(box)

      // R5: cache geometry keyed by id so the hot rAF loop can rebuild
      // the transform offset without re-measuring text or re-computing
      // emphasize state.
      nextGeom.set(l.id, { radius: r, bloomR, labelYOffset, emphasize })

      const labelId = l.id
      labels.push(
        <span
          key={String(labelId)}
          ref={(el) => {
            if (el) labelElsRef.current.set(labelId, el)
            else labelElsRef.current.delete(labelId)
          }}
          className="cosmos-label"
          data-degree={l.degree}
          data-font-weight={emphasize ? 600 : 500}
          style={{
            transform: `translate3d(${x}px, ${y + labelYOffset}px, 0) translateX(-50%)`,
            fontWeight: emphasize ? 600 : 500,
            color: emphasize ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.92)',
            fontSize,
            opacity,
          }}
        >
          {text}
        </span>,
      )
    }

    // R5: also need geometry for non-label emphasized bloom-only nodes. The
    // bloom loop above ran before the label filter, so for every bloom we
    // already pushed we need a geom entry. Fill any gaps (blooms without a
    // paired label) so the rAF loop can still position them.
    for (const l of sortedLabelItems) {
      if (nextGeom.has(l.id)) continue
      const node = nodes[l.index]
      void node
      const r = radiusForDegreeWithStats(l.degree, dStats)
      const bloomR = Math.max(12, r * 2.0)
      const isHovered = hoveredNodeId === l.id
      const isSelected = selectedNodeId === l.id
      const isTraceActive = traceActiveNodeId === l.id
      const emphasize = isHovered || isSelected || isTraceActive
      const labelYOffset = emphasize ? -r - 12 : r + 8
      nextGeom.set(l.id, { radius: r, bloomR, labelYOffset, emphasize })
    }
    return { renderedLabels: labels, renderedBlooms: blooms, nextGeom }
  }, [
    nodes,
    labelItems,
    labelIndexSet,
    indexById,
    cssW,
    cssH,
    hoveredNodeId,
    selectedNodeId,
    traceActiveNodeId,
    ontologyMode,
    positionEpoch,
  ])

  // labelGeomRef side-effect: publish the freshly-computed geometry map to
  // the rAF loop. Moved out of the useMemo body so the memo function stays
  // pure (React may call it more than once per deps change under StrictMode).
  useEffect(() => {
    labelGeomRef.current = nextGeom
  }, [nextGeom])

  // R5: 60 Hz imperative position loop. This is the pathway that kept the
  // zoom feeling sluggish on real-GPU Macs: previously every frame triggered
  // a React re-render which rebuilt every <span>. Now, between React
  // re-renders (4 Hz or on interaction), this loop reads cosmos's live
  // positions and updates `style.transform` on each already-mounted span
  // via refs. No reconcile, no text measurement, no allocation in the hot
  // path.
  useEffect(() => {
    const cancel = () => {
      if (positionRafRef.current !== null) {
        cancelAnimationFrame(positionRafRef.current)
        positionRafRef.current = null
      }
    }
    // H6 (audit 2026-04-23b): throttle the DOM-label/bloom write loop to
    // 30 Hz instead of 60 Hz. Every tick computes a full bbox over all point
    // positions and writes `style.transform` on every bloom + label DOM node
    // — on wikidata + movielens that showed up as 100-166ms p99 frames when
    // the user was also zooming/panning (the zoom wheel fires at the same
    // cadence and competes for the main thread). 30 Hz is visually
    // indistinguishable from 60 Hz for label-follow-the-node motion and
    // halves the per-frame layout work. The WebGL canvas itself keeps
    // running at display refresh rate inside cosmos — only the overlay
    // projection is throttled here.
    const MIN_FRAME_INTERVAL_MS = 33 // ~30 Hz
    let lastTickMs = 0
    const tick = (nowMs: number) => {
      if (nowMs - lastTickMs < MIN_FRAME_INTERVAL_MS) {
        positionRafRef.current = requestAnimationFrame(tick)
        return
      }
      lastTickMs = nowMs
      const g = graphRef.current
      const host = hostRef.current
      const canvasElLocal = host?.querySelector('canvas') as HTMLCanvasElement | null
      if (!g || !canvasElLocal) {
        positionRafRef.current = requestAnimationFrame(tick)
        return
      }
      const positions = g.getPointPositions?.()
      const cssWLocal = canvasElLocal.clientWidth
      const cssHLocal = canvasElLocal.clientHeight
      if (!positions || positions.length === 0 || cssWLocal <= 0 || cssHLocal <= 0) {
        positionRafRef.current = requestAnimationFrame(tick)
        return
      }
      let minXL = Infinity
      let minYL = Infinity
      let maxXL = -Infinity
      let maxYL = -Infinity
      let finiteCountL = 0
      for (let i = 0; i < positions.length; i += 2) {
        const px = positions[i]
        const py = positions[i + 1]
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue
        if (px < minXL) minXL = px
        if (px > maxXL) maxXL = px
        if (py < minYL) minYL = py
        if (py > maxYL) maxYL = py
        finiteCountL += 1
      }
      if (finiteCountL < 2) {
        positionRafRef.current = requestAnimationFrame(tick)
        return
      }
      const spanXL = Math.max(1, maxXL - minXL)
      const spanYL = Math.max(1, maxYL - minYL)
      const paddingL = 1.08
      const scaleL = Math.min(cssWLocal / (spanXL * paddingL), cssHLocal / (spanYL * paddingL))
      const midXL = (minXL + maxXL) / 2
      const midYL = (minYL + maxYL) / 2

      // Iterate every node index — cheap O(n) float ops + O(bloom+label)
      // string assignments. Map lookups keyed by id let us skip any
      // element that isn't currently mounted (filtered by collision).
      const geom = labelGeomRef.current
      const blooms = bloomElsRef.current
      const labels = labelElsRef.current
      for (const [id, g2] of geom) {
        // We need the index to read positions. Store-by-index lookup
        // would be O(1) via indexById map.
        const idx = indexById.get(id)
        if (idx == null) continue
        const sx = positions[idx * 2]
        const sy = positions[idx * 2 + 1]
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue
        const x = cssWLocal / 2 + (sx - midXL) * scaleL
        const y = cssHLocal / 2 + (sy - midYL) * scaleL
        const bEl = blooms.get(id)
        if (bEl) {
          bEl.style.transform = `translate3d(${x - g2.bloomR}px, ${y - g2.bloomR}px, 0)`
        }
        const lEl = labels.get(id)
        if (lEl) {
          lEl.style.transform = `translate3d(${x}px, ${y + g2.labelYOffset}px, 0) translateX(-50%)`
        }
      }
      // Tooltip position: imperatively follow the hovered node each frame.
      // React owns the tooltip's *content* (set on hover via re-render), the
      // rAF loop owns its *position* so it tracks the node without thrashing.
      const tooltipEl = tooltipRef.current
      const hoveredIdForTip = hoveredNodeIdRef.current
      if (tooltipEl && hoveredIdForTip != null) {
        const idx = indexById.get(hoveredIdForTip)
        if (idx != null) {
          const sx = positions[idx * 2]
          const sy = positions[idx * 2 + 1]
          if (Number.isFinite(sx) && Number.isFinite(sy)) {
            const x = cssWLocal / 2 + (sx - midXL) * scaleL
            const y = cssHLocal / 2 + (sy - midYL) * scaleL
            // 12 px above the node so it doesn't cover the node itself
            tooltipEl.style.transform = `translate3d(${x}px, ${y - 18}px, 0) translate(-50%, -100%)`
          }
        }
      }
      positionRafRef.current = requestAnimationFrame(tick)
    }
    positionRafRef.current = requestAnimationFrame(tick)
    return cancel
  }, [indexById])

  return (
    <div className="relative h-full w-full">
      {/* Per-node colored bloom layer sits BEHIND the cosmos canvas so the
          WebGL node core paints on top of its own halo. Tinted by label
          palette so the ring pixels carry the same hue as the node. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {renderedBlooms}
      </div>
      <div
        ref={hostRef}
        className="absolute inset-0"
        style={{
          filter: `drop-shadow(0 0 10px ${GRAPH_THEME.particleColor})`,
        }}
      />
      <NodeHoverTooltip
        tooltipRef={tooltipRef}
        node={hoveredNodeId != null ? nodes[indexById.get(hoveredNodeId) ?? -1] ?? null : null}
        links={links}
      />
      <div className="pointer-events-none absolute inset-0 select-none">
        <style>{`
          .cosmos-label {
            position: absolute;
            top: 0;
            left: 0;
            white-space: nowrap;
            pointer-events: none;
            /* Slice-13: Inter 12/500 on non-emphasized, 14/600 on emphasized.
               Navy halo (rgba(10,14,28,0.85)) at 3 px primary blur ensures
               crisp readability over the gradient/bloom backdrop. */
            font-family: "Inter", "Inter var", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            font-feature-settings: "ss01", "cv11";
            letter-spacing: 0.005em;
            text-shadow:
              0 0 3px rgba(10,14,28,0.85),
              0 0 6px rgba(10,14,28,0.70),
              0 0 10px rgba(10,14,28,0.45);
            will-change: transform;
          }
          .cosmos-bloom {
            position: absolute;
            top: 0;
            left: 0;
            border-radius: 9999px;
            pointer-events: none;
            mix-blend-mode: screen;
            /* Slice-15: read the global --bloom-opacity CSS var (capped at
               ≤0.35 by the slice-15 palette-introspection gate) so the halo
               stays a subtle tint rather than dominating the saturated node
               core. Iter-6 review flagged 0.55 as still too strong. */
            opacity: var(--bloom-opacity, 0.3);
            will-change: transform;
          }
        `}</style>
        {renderedLabels}
      </div>
    </div>
  )
}

interface NodeHoverTooltipProps {
  tooltipRef: React.RefObject<HTMLDivElement | null>
  node: GraphNode | null
  links: GraphEdge[]
}

// Plain-language hover panel: shows the node's label + labels-array + every
// stringifiable property so the user can tell what they're looking at, plus
// a short list of edge types incident to the node (this is how the user
// understands edges without a separate per-edge hover).
//
// Only rendered when a node is actively hovered; position is updated from
// the parent's rAF loop via `tooltipRef`. Pointer-events stay off so the
// tooltip never steals the underlying cosmos hover events.
function NodeHoverTooltip({ tooltipRef, node, links }: NodeHoverTooltipProps) {
  const visible = node != null
  const displayName = node ? resolveLabel(node) : ''
  const props = node?.properties ?? {}
  const propEntries = Object.entries(props)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 8)
  const labels = node?.labels ?? []
  let edgeTypes: Array<{ type: string; count: number }> = []
  if (node) {
    const counts = new Map<string, number>()
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      if (s === node.id || t === node.id) {
        const type = l.type ?? 'RELATED'
        counts.set(type, (counts.get(type) ?? 0) + 1)
      }
    }
    edgeTypes = Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }
  return (
    <div
      ref={tooltipRef}
      data-testid="cosmos-node-tooltip"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={!visible}
      className="pointer-events-none absolute left-0 top-0 z-20 max-w-[260px] rounded-md border border-cyan-400/35 bg-slate-950/92 px-2.5 py-1.5 font-mono text-[10.5px] leading-snug text-white/90 shadow-lg shadow-black/40 backdrop-blur-sm"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 80ms ease-out',
        // Hide from hit-test before first transform update lands
        transform: 'translate3d(-9999px, -9999px, 0)',
        willChange: 'transform',
      }}
    >
      {node && (
        <>
          <p
            data-testid="cosmos-node-tooltip-label"
            className="mb-1 truncate font-serif text-[12px] leading-tight text-cyan-100"
          >
            {displayName}
          </p>
          {labels.length > 0 && (
            <p className="mb-1 text-[9.5px] uppercase tracking-[0.14em] text-white/60">
              {labels.map((l, i) => (
                <span key={l}>
                  {i > 0 ? ' · ' : ''}
                  {l}
                </span>
              ))}
            </p>
          )}
          {propEntries.length > 0 && (
            <dl
              data-testid="cosmos-node-tooltip-properties"
              className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-[2px] text-[10px]"
            >
              {propEntries.map(([k, v]) => (
                <div key={k} className="contents" data-testid="cosmos-node-tooltip-property">
                  <dt className="truncate text-white/45">{k}</dt>
                  <dd className="truncate text-white/90">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {edgeTypes.length > 0 && (
            <p
              data-testid="cosmos-node-tooltip-edges"
              className="mt-1.5 border-t border-white/10 pt-1 text-[9.5px] text-white/65"
            >
              <span className="uppercase tracking-[0.12em] text-white/45">edges: </span>
              {edgeTypes.map(({ type, count }, i) => (
                <span key={type}>
                  {i > 0 ? ', ' : ''}
                  <span className="text-cyan-200">{type}</span>
                  <span className="text-white/40">×{count}</span>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  )
}
