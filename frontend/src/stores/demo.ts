import { create } from 'zustand'
import type { DatasetKey } from '@/data/datasets'
import type { GraphData } from '@/types/graph'

export interface DemoMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming: boolean
  cypher?: string
}

interface DemoState {
  activeDataset: DatasetKey
  messages: DemoMessage[]
  graphData: GraphData | null
  isLoading: boolean
  isTraceAnimating: boolean

  setActiveDataset: (key: DatasetKey) => void
  addUserMessage: (content: string) => string
  startAssistantMessage: () => string
  appendToMessage: (id: string, token: string) => void
  finalizeMessage: (id: string, cypher?: string) => void
  setGraphData: (data: GraphData | null) => void
  setIsLoading: (loading: boolean) => void
  setIsTraceAnimating: (animating: boolean) => void
  clearConversation: () => void
}

export const useDemoStore = create<DemoState>()((set) => ({
  activeDataset: 'movielens',
  messages: [],
  graphData: null,
  isLoading: false,
  isTraceAnimating: false,

  setActiveDataset: (key) =>
    set({
      activeDataset: key,
      messages: [],
      graphData: null,
      isLoading: false,
      isTraceAnimating: false,
    }),

  addUserMessage: (content) => {
    const id = crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        { id, role: 'user', content, isStreaming: false },
      ],
    }))
    return id
  },

  startAssistantMessage: () => {
    const id = crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        { id, role: 'assistant', content: '', isStreaming: true },
      ],
    }))
    return id
  },

  appendToMessage: (id, token) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content: msg.content + token } : msg
      ),
    })),

  finalizeMessage: (id, cypher) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, isStreaming: false, ...(cypher !== undefined ? { cypher } : {}) } : msg
      ),
    })),

  setGraphData: (data) => set({ graphData: data }),

  setIsLoading: (loading) => set({ isLoading: loading }),

  setIsTraceAnimating: (animating) => set({ isTraceAnimating: animating }),

  clearConversation: () => set({ messages: [], graphData: null }),
}))
