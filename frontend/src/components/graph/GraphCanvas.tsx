import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'
import { useGraphColors } from './useGraphColors'
import { paintNode } from './NodeRenderer'

interface GraphCanvasProps {
  graphData: GraphData
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
