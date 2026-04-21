import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Graph, type GraphConfigInterface } from '@cosmos.gl/graph'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { GRAPH_THEME, radiusForDegree } from '@/graph/theme'
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
  const [, setFrameTick] = useState(0)
  const rafRef = useRef<number | null>(null)
  const fitRafIdsRef = useRef<number[]>([])
  const fitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const onNodeClickRef = useRef(onNodeClick)
  const onNodeHoverRef = useRef(onNodeHover)
  const onBackgroundClickRef = useRef(onBackgroundClick)

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

  // Show more labels when the graph is small, cap at the top-degree nodes
  // once the dataset gets dense so the canvas doesn't become a wall of text.
  const labelIndicesToShow = useMemo(() => {
    if (nodes.length <= 120) return labelItems.map((l) => l.index)
    const byDeg = [...labelItems].sort((a, b) => b.degree - a.degree)
    const keep = Math.max(48, Math.min(140, Math.floor(nodes.length * 0.25)))
    return byDeg.slice(0, keep).map((l) => l.index)
  }, [labelItems, nodes.length])

  const labelIndexSet = useMemo(() => new Set(labelIndicesToShow), [labelIndicesToShow])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (graphRef.current) return

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
    graphRef.current = g

    const loop = () => {
      setFrameTick((t) => (t + 1) % 1024)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      try {
        g.destroy()
      } catch {
        /* no-op */
      }
      graphRef.current = null
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

    const sizes = new Float32Array(nodes.length)
    nodes.forEach((n, i) => {
      const base = radiusForDegree(degree.get(n.id) ?? 0) * 1.25
      sizes[i] = ontologyMode ? base * ontologyBoost(n) : base
    })

    const colors = nodes.map((n) => colorForNode(n.labels, 1))

    const linkFloats = new Float32Array(linkIndexPairs.length * 2)
    linkIndexPairs.forEach(([s, t], i) => {
      linkFloats[i * 2] = s
      linkFloats[i * 2 + 1] = t
    })

    const linkColors = linkIndexPairs.map(([, , , edge]) =>
      colorForEdgeType(edge.type, 0.72)
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
      return colorForEdgeType(edge.type, 0.72)
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

  const renderedLabels = (() => {
    const g = graphRef.current
    if (!g) return null
    const positions = g.getPointPositions?.()
    if (!positions || positions.length === 0) return null
    const zoom = g.getZoomLevel?.() ?? 1
    if (zoom < 0.02) return null
    const out: Array<React.ReactNode> = []
    for (const l of labelItems) {
      if (!labelIndexSet.has(l.index)) continue
      const sx = positions[l.index * 2]
      const sy = positions[l.index * 2 + 1]
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue
      let screen: [number, number]
      try {
        screen = g.spaceToScreenPosition([sx, sy])
      } catch {
        continue
      }
      const [x, y] = screen
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const isHovered = hoveredNodeId === l.id
      const isSelected = selectedNodeId === l.id
      const isTraceActive = traceActiveNodeId === l.id
      const emphasize = isHovered || isSelected || isTraceActive
      const text = l.text.length > 26 ? l.text.slice(0, 23) + '…' : l.text
      const r = radiusForDegree(l.degree)
      const opacity = emphasize ? 1 : zoom < 0.35 ? 0.72 : 0.94
      out.push(
        <span
          key={String(l.id)}
          className="cosmos-label"
          style={{
            transform: `translate3d(${x}px, ${y + r + 6}px, 0) translateX(-50%)`,
            fontWeight: emphasize ? 600 : 500,
            color: emphasize ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.9)',
            fontSize: emphasize ? 13 : 11,
            opacity,
          }}
        >
          {text}
        </span>,
      )
    }
    return out
  })()

  return (
    <div className="relative h-full w-full">
      <div
        ref={hostRef}
        className="absolute inset-0"
        style={{
          filter: `drop-shadow(0 0 10px ${GRAPH_THEME.particleColor})`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 select-none">
        <style>{`
          .cosmos-label {
            position: absolute;
            top: 0;
            left: 0;
            white-space: nowrap;
            pointer-events: none;
            font-family: "Fraunces", "Source Serif 4", Georgia, serif;
            letter-spacing: 0.01em;
            text-shadow:
              0 0 2px rgba(0,0,0,0.95),
              0 0 8px rgba(0,0,0,0.7),
              0 0 14px rgba(8,10,22,0.55);
            will-change: transform;
          }
        `}</style>
        {renderedLabels}
      </div>
    </div>
  )
}
