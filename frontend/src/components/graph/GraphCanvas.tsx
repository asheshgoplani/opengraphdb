import { useCallback, useMemo, useState } from 'react'
import type { GraphData, GraphNode } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'
import { AppBackdrop } from '@/components/layout/AppBackdrop'
import { GraphEmptyState } from './GraphEmptyState'
import { GraphLegend } from './GraphLegend'
import { GeoCanvas } from './GeoCanvas'
import { useTraceAnimation } from './useTraceAnimation'
import { TraceControls } from './TraceControls'
import { ObsidianGraph } from '@/graph/obsidian/ObsidianGraph'

interface GraphCanvasProps {
  graphData: GraphData
  isGeographic?: boolean
  // Accepted for API compatibility with PlaygroundPage; trace/semantic/ontology
  // overlays are rewired onto ObsidianGraph in a follow-up slice (S4 note).
  ontologyMode?: boolean
}

export function GraphCanvas({ graphData, isGeographic }: GraphCanvasProps) {
  const selectNode = useGraphStore((s) => s.selectNode)
  const clearSelection = useGraphStore((s) => s.clearSelection)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
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
      <AppBackdrop variant="playground" />
      <ObsidianGraph
        graphData={graphData}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        hoveredNodeId={hoveredNodeId}
        selectedNodeId={selectedNodeId}
      />
      <GraphLegend labels={uniqueLabels} labelIndex={labelIndex} />
      <TraceControls />
    </div>
  )
}
