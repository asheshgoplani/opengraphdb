import { create } from 'zustand'
import type { TraceStep } from '@/types/graph'

interface TraceState {
  isPlaying: boolean
  activeNodeId: string | number | null
  traversedNodeIds: Set<string | number>
  traversedEdgeIds: Set<string | number>
  steps: TraceStep[]
  currentStepIndex: number
  speedMultiplier: number
}

interface GraphState {
  selectedNodeId: string | number | null
  selectedEdgeId: string | number | null
  selectNode: (id: string | number) => void
  selectEdge: (id: string | number) => void
  clearSelection: () => void
  trace: TraceState | null
  setTrace: (steps: TraceStep[], speed?: number) => void
  advanceTrace: (nodeId: string | number, stepIndex: number) => void
  clearTrace: () => void
  setTraceSpeed: (speed: number) => void
  semanticHighlights: Set<string | number>
  semanticHoverId: string | number | null
  setSemanticHighlights: (ids: Iterable<string | number>) => void
  setSemanticHoverId: (id: string | number | null) => void
  clearSemanticHighlights: () => void
  timeCutoff: number | null
  setTimeCutoff: (cutoff: number | null) => void
}

export const useGraphStore = create<GraphState>()((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),
  trace: null,
  setTrace: (steps, speed = 1) =>
    set({
      trace: {
        isPlaying: true,
        activeNodeId: null,
        traversedNodeIds: new Set(),
        traversedEdgeIds: new Set(),
        steps,
        currentStepIndex: 0,
        speedMultiplier: speed,
      },
    }),
  advanceTrace: (nodeId, stepIndex) =>
    set((state) => {
      if (!state.trace) return state
      const traversedNodeIds = new Set(state.trace.traversedNodeIds)
      traversedNodeIds.add(nodeId)
      return {
        trace: {
          ...state.trace,
          activeNodeId: nodeId,
          traversedNodeIds,
          currentStepIndex: stepIndex,
        },
      }
    }),
  clearTrace: () => set({ trace: null }),
  setTraceSpeed: (speed) =>
    set((state) => {
      if (!state.trace) return state
      return { trace: { ...state.trace, speedMultiplier: speed } }
    }),
  semanticHighlights: new Set<string | number>(),
  semanticHoverId: null,
  setSemanticHighlights: (ids) => set({ semanticHighlights: new Set(ids) }),
  setSemanticHoverId: (id) => set({ semanticHoverId: id }),
  clearSemanticHighlights: () =>
    set({ semanticHighlights: new Set<string | number>(), semanticHoverId: null }),
  timeCutoff: null,
  setTimeCutoff: (cutoff) => set({ timeCutoff: cutoff }),
}))
