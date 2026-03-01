import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'
import { useGraphColors } from './useGraphColors'
import { paintNode } from './NodeRenderer'
import { GraphLegend } from './GraphLegend'

interface GraphCanvasProps {
  graphData: GraphData
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

export function GraphCanvas({ graphData }: GraphCanvasProps) {
  const colors = useGraphColors()
  const selectNode = useGraphStore((s) => s.selectNode)
  const selectEdge = useGraphStore((s) => s.selectEdge)
  const clearSelection = useGraphStore((s) => s.clearSelection)
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphEdge>>()
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

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

  // Handle container resize
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

  // Force a consistent link length once graph data is set.
  useEffect(() => {
    const linkForce = graphRef.current?.d3Force('link') as
      | { distance?: (distance: number) => unknown }
      | undefined
    if (linkForce?.distance) {
      linkForce.distance(60)
      graphRef.current?.d3ReheatSimulation()
    }
  }, [graphData])

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      paintNode(node, ctx, globalScale, colors, labelIndex, connectionCounts)
    },
    [colors, labelIndex, connectionCounts]
  )

  const linkCanvasObject = useCallback(
    (link: GraphEdge, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = getNodeCoordinate(link.source)
      const target = getNodeCoordinate(link.target)
      if (!source || !target || !link.type) return

      const textPos = {
        x: source.x + (target.x - source.x) * 0.5,
        y: source.y + (target.y - source.y) * 0.5,
      }
      const fontSize = Math.max(10 / globalScale, 3)

      ctx.save()
      ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const textWidth = ctx.measureText(link.type).width
      ctx.fillStyle = colors.edgeLabelBg
      ctx.fillRect(
        textPos.x - textWidth / 2 - 2,
        textPos.y - fontSize / 2 - 1,
        textWidth + 4,
        fontSize + 2
      )
      ctx.fillStyle = colors.edgeLabel
      ctx.fillText(link.type, textPos.x, textPos.y)
      ctx.restore()
    },
    [colors.edgeLabel, colors.edgeLabelBg]
  )

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  const handleLinkClick = useCallback(
    (link: GraphEdge) => {
      selectEdge(link.id)
    },
    [selectEdge]
  )

  const handleBackgroundClick = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  // Memoize graph data to prevent simulation restarts
  const stableData = useMemo(() => graphData, [graphData])

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: colors.bg,
          backgroundImage: `radial-gradient(circle, ${colors.gridDot} 1px, transparent 1px)`,
          backgroundSize: '30px 30px',
        }}
      />
      <ForceGraph2D
        ref={graphRef}
        graphData={stableData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkColor={() => colors.edge}
        linkCurvature={0.18}
        linkDirectionalArrowLength={5}
        linkDirectionalArrowColor={() => colors.edge}
        linkDirectionalArrowRelPos={1}
        linkLabel={(link: GraphEdge) => link.type}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'after'}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        onBackgroundClick={handleBackgroundClick}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        nodeRelSize={1}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.25}
        cooldownTicks={150}
      />
      <GraphLegend labels={uniqueLabels} labelIndex={labelIndex} />
    </div>
  )
}
