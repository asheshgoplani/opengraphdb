// Phase-3 STORY — traversal cinematic driver.
//
// playTraversal() orchestrates the step-by-step path animation:
//
//   Frame 0  : camera dollies to source; source ignites cyan-blue;
//              non-path nodes fade to 0.18 opacity.
//   Frame N  : per-step (~600-800ms) — particle stream from current node
//              along the next edge to the next node; that node ignites.
//              Camera swings to follow.
//   Frame K+1: camera pulls back to fit the entire lit-up path.
//              `Path complete ✓` badge appears.
//
// The driver mutates a shared TraversalState ref that ObsidianGraph reads
// on every canvas frame to:
//   - tint the lit nodes with TRAVERSAL_ACCENT
//   - tint the active edge with TRAVERSAL_ACCENT (full) and adjacent
//     path edges with TRAVERSAL_ACCENT_DIM (hint)
//   - paint the EdgeFlow particle stream on the current segment
//   - draw all non-path nodes at 0.18 opacity
//
// Cancellation: `signal: AbortSignal`. The driver checks signal.aborted
// at every await boundary; the EdgeFlow is cleared and the state ref is
// reset on cancel — no leftover lit edges, no orphan particles.

import type { ForceGraphMethods } from 'react-force-graph-2d'
import type { GraphData, GraphNode } from '@/types/graph'
import type { EdgeFlow } from './edgeFlow'

export interface TraversalState {
  isPlaying: boolean
  litNodeIds: Set<string | number>
  litEdgeIds: Set<string | number>
  activeEdgeId: string | number | null
  pathNodeIds: Set<string | number>
  pathEdgeIds: Set<string | number>
  currentStep: number
  totalSteps: number
  completed: boolean
}

export function emptyTraversalState(): TraversalState {
  return {
    isPlaying: false,
    litNodeIds: new Set(),
    litEdgeIds: new Set(),
    activeEdgeId: null,
    pathNodeIds: new Set(),
    pathEdgeIds: new Set(),
    currentStep: 0,
    totalSteps: 0,
    completed: false,
  }
}

interface PlayTraversalOpts {
  fgRef: { current: ForceGraphMethods<GraphNode, unknown> | undefined }
  graphData: GraphData
  pathNodeIds: Array<string | number>
  state: { current: TraversalState }
  edgeFlow: EdgeFlow
  signal: AbortSignal
  onStep?: (step: number, total: number) => void
  onComplete?: () => void
  // Per-step duration in ms. Spec: 600-800ms; default 700.
  stepDurationMs?: number
}

// Resolve consecutive node-id pairs into edge ids. The path may not have
// explicit edge metadata, so we infer by looking up either direction in
// graphData.links. If no edge connects two consecutive ids, that step is
// silently skipped (camera still moves) — the cinematic is best-effort.
function inferEdgeIds(
  graphData: GraphData,
  pathNodeIds: Array<string | number>,
): Array<string | number | null> {
  const edges: Array<string | number | null> = []
  for (let i = 0; i < pathNodeIds.length - 1; i += 1) {
    const a = pathNodeIds[i]
    const b = pathNodeIds[i + 1]
    if (a == null || b == null) {
      edges.push(null)
      continue
    }
    const link = graphData.links.find((l) => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source
      const tId = typeof l.target === 'object' ? l.target.id : l.target
      return (sId === a && tId === b) || (sId === b && tId === a)
    })
    edges.push(link?.id ?? null)
  }
  return edges
}

function nodePos(graphData: GraphData, id: string | number): { x: number; y: number } | null {
  const n = graphData.nodes.find((x) => x.id === id)
  if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') return null
  return { x: n.x, y: n.y }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

export async function playTraversal(opts: PlayTraversalOpts): Promise<void> {
  const {
    fgRef,
    graphData,
    pathNodeIds,
    state,
    edgeFlow,
    signal,
    onStep,
    onComplete,
    stepDurationMs = 700,
  } = opts

  if (pathNodeIds.length < 2) return

  const edgeIds = inferEdgeIds(graphData, pathNodeIds)
  const totalSteps = pathNodeIds.length - 1
  const pathNodeSet = new Set<string | number>(pathNodeIds)
  const pathEdgeSet = new Set<string | number>(
    edgeIds.filter((e): e is string | number => e != null),
  )

  // Reset state for a fresh run. We mutate `.current` so the caller's
  // ref handle stays the same (React renders watching this ref via a
  // wrapper hook re-read on every frame).
  state.current = {
    isPlaying: true,
    litNodeIds: new Set([pathNodeIds[0]!]),
    litEdgeIds: new Set(),
    activeEdgeId: null,
    pathNodeIds: pathNodeSet,
    pathEdgeIds: pathEdgeSet,
    currentStep: 1,
    totalSteps,
    completed: false,
  }
  onStep?.(1, totalSteps + 1)

  try {
    // Frame 0 — camera dollies to source.
    const src = nodePos(graphData, pathNodeIds[0]!)
    const fg = fgRef.current
    if (fg && src) {
      fg.centerAt(src.x, src.y, 600)
      fg.zoom(2.4, 600)
    }
    await sleep(650, signal)

    // Frames 1..K — particle stream + ignite next node.
    for (let i = 0; i < totalSteps; i += 1) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const fromId = pathNodeIds[i]!
      const toId = pathNodeIds[i + 1]!
      const from = nodePos(graphData, fromId)
      const to = nodePos(graphData, toId)
      const edgeId = edgeIds[i]
      if (from && to) {
        // Look up curvature on the host link so the flow follows the same arc.
        const hostLink = graphData.links.find((l) => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source
          const tId = typeof l.target === 'object' ? l.target.id : l.target
          return (sId === fromId && tId === toId) || (sId === toId && tId === fromId)
        })
        const curvature =
          (hostLink as (typeof hostLink) & { curvature?: number } | undefined)?.curvature ?? 0
        edgeFlow.setSegment(from, to, curvature)
      }
      state.current = {
        ...state.current,
        activeEdgeId: edgeId ?? null,
        currentStep: i + 1,
      }
      onStep?.(i + 1, totalSteps + 1)

      // Camera follows the midpoint of the active segment.
      if (fg && from && to) {
        fg.centerAt((from.x + to.x) / 2, (from.y + to.y) / 2, stepDurationMs)
      }
      await sleep(stepDurationMs, signal)

      // Ignite the next node + lock in the lit edge for the rest of the run.
      state.current = {
        ...state.current,
        litNodeIds: new Set([...state.current.litNodeIds, toId]),
        litEdgeIds:
          edgeId != null
            ? new Set([...state.current.litEdgeIds, edgeId])
            : state.current.litEdgeIds,
      }
    }

    // Frame K+1 — pull back, park particles, mark complete.
    edgeFlow.clear()
    if (fg) {
      fg.zoomToFit(800, 80, (n: GraphNode) => pathNodeSet.has(n.id))
    }
    state.current = {
      ...state.current,
      isPlaying: false,
      activeEdgeId: null,
      currentStep: totalSteps + 1,
      completed: true,
    }
    onComplete?.()
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      edgeFlow.clear()
      // Wipe everything so no stale lit edges or particles linger.
      state.current = emptyTraversalState()
      return
    }
    throw err
  }
}
