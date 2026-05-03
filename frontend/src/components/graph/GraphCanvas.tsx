import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import type { GraphData, GraphNode } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'
import { AppBackdrop } from '@/components/layout/AppBackdrop'
import { GraphEmptyState } from './GraphEmptyState'
import { GraphLegend } from './GraphLegend'
import { useTraceAnimation } from './useTraceAnimation'
import { TraceControls } from './TraceControls'
import { ObsidianGraph } from '@/graph/obsidian/ObsidianGraph'
import { getGraphMode } from '@/graph/obsidian3d/graphModeFlag'
import { hasWebGL } from '@/graph/obsidian3d/webgl'

// Lazy-load the geo canvas (deck.gl + maplibre, ~1 MB) so playground
// visitors who never toggle to the geo layout don't pay for it on cold
// load. EVAL-FRONTEND-QUALITY-CYCLE2.md H-5.
const GeoCanvas = lazy(() =>
  import('./GeoCanvas').then((m) => ({ default: m.GeoCanvas })),
)

// Lazy-load the c14 WebGL renderer (react-force-graph-3d + three.js,
// ~600 KB raw / ~207 KB brotli) so the default 2D visitor does not
// pay for the 3D bundle. Phase-1 GLOW restored 2D as the default;
// the 3D scene is now a power-user opt-in behind `?graph=3d` and
// only this branch loads the chunk.
const Obsidian3DGraph = lazy(() =>
  import('@/graph/obsidian3d/Obsidian3DGraph').then((m) => ({
    default: m.Obsidian3DGraph,
  })),
)

function GeoCanvasFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      Loading map…
    </div>
  )
}

function ThreeDFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      Loading 3D scene…
    </div>
  )
}

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
    return (
      <Suspense fallback={<GeoCanvasFallback />}>
        <GeoCanvas graphData={graphData} />
      </Suspense>
    )
  }

  if (graphData.nodes.length === 0) {
    return <GraphEmptyState />
  }

  // C14 renderer routing (phase-1 GLOW reverted to 2D-as-default):
  //   * `getGraphMode()` returns '2d' by default; '3d' iff the URL
  //     carried `?graph=3d` (or `#graph=3d`) at module-load time.
  //   * `hasWebGL()` still gates the 3D path; an opt-in 3D request
  //     on a browser with missing WebGL transparently falls back
  //     to the 2D renderer. `data-graph-fallback="webgl"` is
  //     exposed for E2E so we can assert "user opted into 3D but
  //     got 2D because GPU was missing, not because of a routing
  //     bug" without parsing logs.
  const mode = getGraphMode()
  const webgl = hasWebGL()
  const shouldRender3D = mode === '3d' && webgl
  const fallbackReason: 'mode' | 'webgl' | null =
    mode === '2d' ? 'mode' : !webgl ? 'webgl' : null

  if (shouldRender3D) {
    return (
      <div
        className="relative h-full w-full"
        data-graph-mode="3d"
      >
        <Suspense fallback={<ThreeDFallback />}>
          <Obsidian3DGraph
            graphData={graphData}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
            hoveredNodeId={hoveredNodeId}
            selectedNodeId={selectedNodeId}
            labelIndex={labelIndex}
          />
        </Suspense>
        <GraphLegend labels={uniqueLabels} labelIndex={labelIndex} />
        <TraceControls />
      </div>
    )
  }

  return (
    <div
      className="relative h-full w-full"
      data-graph-mode="2d"
      data-graph-fallback={fallbackReason ?? undefined}
    >
      <AppBackdrop variant="playground" />
      <ObsidianGraph
        graphData={graphData}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        hoveredNodeId={hoveredNodeId}
        selectedNodeId={selectedNodeId}
        labelIndex={labelIndex}
      />
      <GraphLegend labels={uniqueLabels} labelIndex={labelIndex} />
      <TraceControls />
    </div>
  )
}
