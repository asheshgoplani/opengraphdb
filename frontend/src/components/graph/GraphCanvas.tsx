import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'
import { useGraphColors } from './useGraphColors'
import { paintNode } from './NodeRenderer'
import { GRAPH_THEME, paintGraphNode } from '@/graph/theme'
import { GraphEmptyState } from './GraphEmptyState'
import { GraphLegend } from './GraphLegend'
import { GeoCanvas } from './GeoCanvas'
import { useTraceAnimation } from './useTraceAnimation'
import { TraceControls } from './TraceControls'

interface GraphCanvasProps {
  graphData: GraphData
  isGeographic?: boolean
}

function getNodeId(node: GraphEdge['source']): string | number | null {
  if (typeof node === 'object' && node !== null && (typeof node.id === 'string' || typeof node.id === 'number')) {
    return node.id
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return node
  }
  return null
}

function getNodeCoordinate(node: GraphEdge['source']): { x: number; y: number } | null {
  if (typeof node === 'object' && node !== null && typeof node.x === 'number' && typeof node.y === 'number') {
    return { x: node.x, y: node.y }
  }
  return null
}

const getLinkNodeId = (n: GraphNode | string | number): string | number =>
  typeof n === 'object' && n !== null ? n.id : n

function toDisplayText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

export function GraphCanvas({ graphData, isGeographic }: GraphCanvasProps) {
  const colors = useGraphColors()
  const selectNode = useGraphStore((s) => s.selectNode)
  const selectEdge = useGraphStore((s) => s.selectEdge)
  const clearSelection = useGraphStore((s) => s.clearSelection)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const trace = useGraphStore((s) => s.trace)
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphEdge> | undefined>(undefined)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | number | null>(null)
  useTraceAnimation()

  const uniqueLabels = useMemo(() => {
    const labels = new Set<string>()
    for (const node of graphData.nodes) {
      const primaryLabel = node.labels?.[0]
      if (primaryLabel) labels.add(primaryLabel)
    }
    return Array.from(labels).sort()
  }, [graphData.nodes])

  const labelIndex = useMemo(() => {
    const labels = new Map<string, number>()
    uniqueLabels.forEach((label, index) => {
      labels.set(label, index)
    })
    return labels
  }, [uniqueLabels])

  const connectionCounts = useMemo(() => {
    const counts = new Map<string | number, number>()
    for (const link of graphData.links) {
      const sourceId = getNodeId(link.source)
      const targetId = getNodeId(link.target)
      if (sourceId !== null) counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1)
      if (targetId !== null) counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
    }
    return counts
  }, [graphData.links])

  const traceRenderState = useMemo(() => {
    if (!trace) return null
    return {
      activeNodeId: trace.activeNodeId,
      traversedNodeIds: trace.traversedNodeIds,
      isPlaying: trace.isPlaying,
    }
  }, [trace?.activeNodeId, trace?.traversedNodeIds, trace?.isPlaying])

  const traceEdgeIds = useMemo(() => {
    if (!trace || trace.traversedNodeIds.size < 2) return new Set<string | number>()
    const ids = new Set<string | number>()
    for (const link of graphData.links) {
      const srcId = getLinkNodeId(link.source as GraphNode | string | number)
      const tgtId = getLinkNodeId(link.target as GraphNode | string | number)
      if (trace.traversedNodeIds.has(srcId) && trace.traversedNodeIds.has(tgtId)) {
        ids.add(link.id)
      }
    }
    return ids
  }, [trace?.traversedNodeIds, graphData.links])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width: Math.floor(width), height: Math.floor(height) })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!graphRef.current) return
    const linkForce = graphRef.current.d3Force('link') as
      | { distance?: (distance: number) => unknown }
      | undefined
    const chargeForce = graphRef.current.d3Force('charge') as
      | { strength?: (strength: number) => unknown }
      | undefined
    if (linkForce?.distance) linkForce.distance(GRAPH_THEME.linkDistanceBase)
    if (chargeForce?.strength) chargeForce.strength(GRAPH_THEME.chargeStrength)
    graphRef.current.d3ReheatSimulation()
  }, [graphData])

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      // Trace mode: keep the existing trace-aware renderer for fidelity
      if (traceRenderState) {
        paintNode(node, ctx, globalScale, colors, labelIndex, connectionCounts, traceRenderState)
        return
      }
      const x = node.x ?? 0
      const y = node.y ?? 0
      const display =
        toDisplayText((node.properties as Record<string, unknown> | undefined)?.name) ??
        toDisplayText((node.properties as Record<string, unknown> | undefined)?.title) ??
        node.label ??
        node.labels?.[0] ??
        String(node.id)
      const degree = connectionCounts.get(node.id) ?? 0
      const state =
        selectedNodeId === node.id
          ? 'selected'
          : hoveredNodeId === node.id
            ? 'hover'
            : 'default'
      paintGraphNode(ctx, x, y, {
        label: node.labels?.[0],
        displayText: display,
        degree,
        globalScale,
        state,
      })
    },
    [traceRenderState, colors, labelIndex, connectionCounts, hoveredNodeId, selectedNodeId]
  )

  const linkCanvasObject = useCallback(
    (link: GraphEdge, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (globalScale < 0.5) return

      const source = getNodeCoordinate(link.source)
      const target = getNodeCoordinate(link.target)
      if (!source || !target || !link.type) return

      const textPos = {
        x: source.x + (target.x - source.x) * 0.5,
        y: source.y + (target.y - source.y) * 0.5,
      }
      const fontSize = Math.max(10 / globalScale, 3)

      ctx.save()
      ctx.font = `500 ${fontSize}px "Fraunces", Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const textWidth = ctx.measureText(link.type).width
      ctx.fillStyle = GRAPH_THEME.edgeLabelBg
      ctx.fillRect(
        textPos.x - textWidth / 2 - 3,
        textPos.y - fontSize / 2 - 1.5,
        textWidth + 6,
        fontSize + 3
      )
      ctx.fillStyle = GRAPH_THEME.edgeLabel
      ctx.fillText(link.type, textPos.x, textPos.y)
      ctx.restore()
    },
    []
  )

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNodeId(node?.id ?? null)
    if (typeof document !== 'undefined') {
      document.body.style.cursor = node ? 'pointer' : ''
    }
  }, [])

  const handleLinkClick = useCallback(
    (link: GraphEdge) => {
      selectEdge(link.id)
    },
    [selectEdge]
  )

  const handleBackgroundClick = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  const stableData = useMemo(() => graphData, [graphData])

  if (isGeographic) {
    return <GeoCanvas graphData={graphData} />
  }

  if (graphData.nodes.length === 0) {
    return <GraphEmptyState />
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: GRAPH_THEME.bg,
          backgroundImage: `radial-gradient(circle at center, ${GRAPH_THEME.gridDot} 1px, transparent 1px)`,
          backgroundSize: `${GRAPH_THEME.gridSize}px ${GRAPH_THEME.gridSize}px`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: GRAPH_THEME.vignette }}
      />
      <ForceGraph2D
        ref={graphRef}
        graphData={stableData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkColor={(link: GraphEdge) =>
          hoveredNodeId &&
          (getNodeId(link.source) === hoveredNodeId || getNodeId(link.target) === hoveredNodeId)
            ? GRAPH_THEME.edgeHover
            : GRAPH_THEME.edge
        }
        linkCurvature={GRAPH_THEME.edgeCurvature}
        linkWidth={(link: GraphEdge) =>
          hoveredNodeId &&
          (getNodeId(link.source) === hoveredNodeId || getNodeId(link.target) === hoveredNodeId)
            ? 1.4
            : 0.7
        }
        linkDirectionalArrowLength={5}
        linkDirectionalArrowColor={() => GRAPH_THEME.edgeArrow}
        linkDirectionalArrowRelPos={0.95}
        linkDirectionalParticles={(link: GraphEdge) => (traceEdgeIds.has(link.id) ? 3 : 1)}
        linkDirectionalParticleColor={(link: GraphEdge) =>
          traceEdgeIds.has(link.id) ? colors.traceGlow : GRAPH_THEME.particleColor
        }
        linkDirectionalParticleSpeed={GRAPH_THEME.particleSpeed}
        linkDirectionalParticleWidth={(link: GraphEdge) =>
          traceEdgeIds.has(link.id) ? 2.4 : 1.4
        }
        linkLabel={(link: GraphEdge) => link.type}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'after'}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onLinkClick={handleLinkClick}
        onBackgroundClick={handleBackgroundClick}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        nodeRelSize={1}
        d3AlphaDecay={GRAPH_THEME.alphaDecay}
        d3VelocityDecay={GRAPH_THEME.velocityDecay}
        cooldownTicks={GRAPH_THEME.cooldownTicks}
        autoPauseRedraw={true}
      />
      <GraphLegend labels={uniqueLabels} labelIndex={labelIndex} />
      <TraceControls />
    </div>
  )
}
