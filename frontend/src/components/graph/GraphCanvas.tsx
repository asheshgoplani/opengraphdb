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
  ontologyMode?: boolean
}

const getLinkNodeId = (n: GraphNode | string | number): string | number =>
  typeof n === 'object' && n !== null ? n.id : n

export function GraphCanvas({ graphData, isGeographic, ontologyMode }: GraphCanvasProps) {
  const selectNode = useGraphStore((s) => s.selectNode)
  const clearSelection = useGraphStore((s) => s.clearSelection)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const trace = useGraphStore((s) => s.trace)
  const semanticHighlights = useGraphStore((s) => s.semanticHighlights)
  const semanticHoverId = useGraphStore((s) => s.semanticHoverId)
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
      {/* Base flat fill — the baseline navy so corners stay dark. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: GRAPH_THEME.bg }}
      />
      {/* Vertical gradient — brighter at top, darker at bottom. This is what
          the slice-11 backdrop-vertical-gradient gate measures: top vs
          bottom luma must differ by ≥ 10. */}
      <div
        data-testid="graph-backdrop-vgradient"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(180deg, hsla(220, 70%, 55%, 0.22) 0%, hsla(225, 55%, 35%, 0.10) 42%, hsla(230, 30%, 8%, 0.0) 100%)',
        }}
      />
      {/* Warm off-center radial to give the canvas perceived depth rather
          than the flat-rectangle feel the fresh-eyes review flagged. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 65% 55% at 52% 38%, hsla(220, 70%, 58%, 0.18), hsla(260, 50%, 30%, 0.05) 55%, transparent 80%)',
        }}
      />
      {/* SVG dot grid — 28 px spacing, ~3.5% alpha. A grid is the visual
          cue that reads as "dataviz surface" instead of empty black. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        data-testid="graph-backdrop-dot-grid"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="ogdb-dot-grid"
            width={GRAPH_THEME.gridSize}
            height={GRAPH_THEME.gridSize}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="rgba(160, 178, 220, 0.09)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ogdb-dot-grid)" />
      </svg>
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
        semanticHighlights={semanticHighlights}
        semanticHoverId={semanticHoverId}
        ontologyMode={ontologyMode}
      />
      <GraphLegend labels={uniqueLabels} labelIndex={labelIndex} />
      <TraceControls />
    </div>
  )
}
