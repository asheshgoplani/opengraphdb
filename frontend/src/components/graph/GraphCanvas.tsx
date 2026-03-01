import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'
import { useGraphColors } from './useGraphColors'
import { paintNode } from './NodeRenderer'

interface GraphCanvasProps {
  graphData: GraphData
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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  const labelIndex = useMemo(() => new Map<string, number>(), [])

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

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      paintNode(node, ctx, globalScale, colors, labelIndex)
    },
    [colors, labelIndex]
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
      ctx.fillStyle = `${colors.bg}CC`
      ctx.fillRect(
        textPos.x - textWidth / 2 - 2,
        textPos.y - fontSize / 2 - 1,
        textWidth + 4,
        fontSize + 2
      )
      ctx.fillStyle = colors.text
      ctx.fillText(link.type, textPos.x, textPos.y)
      ctx.restore()
    },
    [colors.bg, colors.text]
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
    <div ref={containerRef} className="w-full h-full">
      <ForceGraph2D
        graphData={stableData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={colors.bg}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkColor={() => colors.edge}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkLabel={(link: GraphEdge) => link.type}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => 'after'}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        onBackgroundClick={handleBackgroundClick}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
      />
    </div>
  )
}
