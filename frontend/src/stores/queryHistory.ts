import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface SavedQuery {
  id: string
  name: string
  query: string
  savedAt: string
}

export interface QueryHistoryState {
  history: string[]
  savedQueries: SavedQuery[]
  addToHistory: (query: string) => void
  saveQuery: (name: string, query: string) => void
  removeSavedQuery: (id: string) => void
  clearHistory: () => void
}

export const MAX_HISTORY_ENTRIES = 100

export function buildHistoryWithQuery(history: string[], query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return history

  return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(
    0,
    MAX_HISTORY_ENTRIES
  )
}

export const useQueryHistoryStore = create<QueryHistoryState>()(
  persist(
    (set) => ({
      history: [],
      savedQueries: [],
      addToHistory: (query) =>
        set((state) => ({
          history: buildHistoryWithQuery(state.history, query),
        })),
      saveQuery: (name, query) =>
        set((state) => ({
          savedQueries: [
            {
              id: crypto.randomUUID(),
              name,
              query,
              savedAt: new Date().toISOString(),
            },
            ...state.savedQueries,
          ],
        })),
      removeSavedQuery: (id) =>
        set((state) => ({
          savedQueries: state.savedQueries.filter((savedQuery) => savedQuery.id !== id),
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'ogdb-query-history',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
