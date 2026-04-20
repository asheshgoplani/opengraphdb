import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Graph, type GraphConfigInterface } from '@cosmos.gl/graph'
import type { GraphData, GraphNode } from '@/types/graph'
import { GRAPH_THEME, radiusForDegree } from '@/graph/theme'
import {
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
    const pairs: Array<[number, number, string | number]> = []
    for (const l of links) {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      const si = indexById.get(s)
      const ti = indexById.get(t)
      if (si == null || ti == null) continue
      pairs.push([si, ti, l.id])
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

  const labelIndicesToShow = useMemo(() => {
    if (nodes.length <= 140) return labelItems.map((l) => l.index)
    const byDeg = [...labelItems].sort((a, b) => b.degree - a.degree)
    return byDeg.slice(0, Math.max(32, Math.floor(nodes.length * 0.2))).map((l) => l.index)
  }, [labelItems, nodes.length])

  const labelIndexSet = useMemo(() => new Set(labelIndicesToShow), [labelIndicesToShow])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (graphRef.current) return

    const config: GraphConfigInterface = {
      backgroundColor: [0, 0, 0, 0],
      pointDefaultSize: 8,
      pointSizeScale: 1.4,
      pointOpacity: 1,
      renderLinks: true,
      linkDefaultWidth: 1.1,
      linkOpacity: 0.78,
      curvedLinks: true,
      curvedLinkSegments: 24,
      curvedLinkWeight: 0.7,
      curvedLinkControlPointDistance: 0.5,
      linkDefaultArrows: true,
      linkArrowsSizeScale: 0.55,
      renderHoveredPointRing: true,
      hoveredPointRingColor: [255, 255, 255, 0.6],
      focusedPointRingColor: [255, 255, 255, 0.95],
      simulationGravity: 0.18,
      simulationRepulsion: 1.4,
      simulationLinkDistance: 3,
      simulationLinkSpring: 1,
      simulationFriction: 0.86,
      enableDrag: true,
      fitViewOnInit: true,
      fitViewPadding: 0.22,
      fitViewDelay: 350,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return

    const positions = new Float32Array(nodes.length * 2)
    const R = 500
    nodes.forEach((_n, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
      const r = R * (0.5 + ((i * 0.6180339887) % 1) * 0.5)
      positions[i * 2] = Math.cos(angle) * r
      positions[i * 2 + 1] = Math.sin(angle) * r
    })

    const sizes = new Float32Array(nodes.length)
    nodes.forEach((n, i) => {
      const base = radiusForDegree(degree.get(n.id) ?? 0) * 1.1
      sizes[i] = ontologyMode ? base * ontologyBoost(n) : base
    })

    const colors = nodes.map((n) => colorForNode(n.labels, 1))

    const linkFloats = new Float32Array(linkIndexPairs.length * 2)
    linkIndexPairs.forEach(([s, t], i) => {
      linkFloats[i * 2] = s
      linkFloats[i * 2 + 1] = t
    })

    const linkColors = linkIndexPairs.map(() => EDGE_COLOR)

    g.setPointPositions(positions)
    g.setPointSizes(sizes)
    g.setPointColors(flatRgba(colors))
    g.setLinks(linkFloats)
    g.setLinkColors(flatRgba(linkColors))
    g.trackPointPositionsByIndices(labelIndicesToShow)
    g.render()
    g.start()
    const fitTimer = setTimeout(() => {
      try {
        g.fitView(600)
      } catch {
        /* no-op */
      }
    }, 800)
    return () => clearTimeout(fitTimer)
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
    const colors: Rgba[] = linkIndexPairs.map(([si, ti, lid]) => {
      if (traceEdgeIds?.has(lid)) return EDGE_TRACE_COLOR
      if (hoveredIdx != null && (si === hoveredIdx || ti === hoveredIdx)) return EDGE_HOVER_COLOR
      return EDGE_COLOR
    })
    g.setLinkColors(flatRgba(colors))
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
    const map = g.getTrackedPointPositionsMap()
    const zoom = g.getZoomLevel?.() ?? 1
    if (zoom < 0.35) return null
    return labelItems
      .filter((l) => labelIndexSet.has(l.index))
      .map((l) => {
        const pos = map.get(l.index)
        if (!pos) return null
        const isHovered = hoveredNodeId === l.id
        const isSelected = selectedNodeId === l.id
        const isTraceActive = traceActiveNodeId === l.id
        const emphasize = isHovered || isSelected || isTraceActive
        const [x, y] = pos
        const text = l.text.length > 26 ? l.text.slice(0, 23) + '…' : l.text
        const r = radiusForDegree(l.degree)
        return (
          <span
            key={String(l.id)}
            className="cosmos-label"
            style={{
              transform: `translate3d(${x}px, ${y + r + 6}px, 0) translateX(-50%)`,
              fontWeight: emphasize ? 600 : 500,
              color: emphasize ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.82)',
              fontSize: emphasize ? 13 : 11,
              opacity: emphasize ? 1 : zoom < 0.55 ? 0.55 : 0.9,
            }}
          >
            {text}
          </span>
        )
      })
  })()

  return (
    <div className="relative h-full w-full">
      <div
        ref={hostRef}
        className="absolute inset-0"
        style={{
          filter: `drop-shadow(0 0 8px ${GRAPH_THEME.particleColor})`,
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
