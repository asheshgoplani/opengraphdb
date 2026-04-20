import { useCallback, useMemo, useState } from 'react'
import type { GraphData, GraphNode } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'
import { GRAPH_THEME } from '@/graph/theme'
import { GraphEmptyState } from './GraphEmptyState'
import { GraphLegend } from './GraphLegend'
import { GeoCanvas } from './GeoCanvas'
import { useTraceAnimation } from './useTraceAnimation'
import { TraceControls } from './TraceControls'
import { CosmosCanvas } from '@/graph/cosmos/CosmosCanvas'

interface GraphCanvasProps {
  graphData: GraphData
  isGeographic?: boolean
}

const getLinkNodeId = (n: GraphNode | string | number): string | number =>
  typeof n === 'object' && n !== null ? n.id : n

export function GraphCanvas({ graphData, isGeographic }: GraphCanvasProps) {
  const selectNode = useGraphStore((s) => s.selectNode)
  const clearSelection = useGraphStore((s) => s.clearSelection)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const trace = useGraphStore((s) => s.trace)
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

  const traceNodeIds = trace?.traversedNodeIds
  const traceActiveNodeId = trace?.activeNodeId ?? null

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

  const handleBackgroundClick = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  if (isGeographic) {
    return <GeoCanvas graphData={graphData} />
  }

  if (graphData.nodes.length === 0) {
    return <GraphEmptyState />
  }

  return (
    <div className="relative h-full w-full">
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
      <CosmosCanvas
        graphData={graphData}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        hoveredNodeId={hoveredNodeId}
        selectedNodeId={selectedNodeId}
        traceActiveNodeId={traceActiveNodeId}
        traceNodeIds={traceNodeIds}
        traceEdgeIds={traceEdgeIds}
      />
      <GraphLegend labels={uniqueLabels} labelIndex={labelIndex} />
      <TraceControls />
    </div>
  )
}
