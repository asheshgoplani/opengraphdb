import { create } from 'zustand'
import type { ViewMode } from '@/types/graph'

interface QueryState {
  currentQuery: string
  viewMode: ViewMode
  setCurrentQuery: (query: string) => void
  setViewMode: (mode: ViewMode) => void
  toggleViewMode: () => void
}

export const useQueryStore = create<QueryState>()((set) => ({
  currentQuery: '',
  viewMode: 'graph',
  setCurrentQuery: (currentQuery) => set({ currentQuery }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleViewMode: () =>
    set((state) => ({
      viewMode: state.viewMode === 'graph' ? 'table' : 'graph',
    })),
}))
