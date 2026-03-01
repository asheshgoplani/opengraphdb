import { create } from 'zustand'

interface GraphState {
  selectedNodeId: string | number | null
  selectedEdgeId: string | number | null
  selectNode: (id: string | number) => void
  selectEdge: (id: string | number) => void
  clearSelection: () => void
}

export const useGraphStore = create<GraphState>()((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),
}))
