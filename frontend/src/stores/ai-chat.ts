import { create } from 'zustand'

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming: boolean
  cypherBlocks: string[]
  queryResult?: string
  queryError?: string
}

export interface DownloadProgress {
  message: string
  percent: number
}

interface AIChatState {
  messages: AIChatMessage[]
  isOpen: boolean
  isLoading: boolean
  downloadProgress: DownloadProgress | null

  setIsOpen: (open: boolean) => void
  addUserMessage: (content: string) => string
  startAssistantMessage: () => string
  appendToMessage: (id: string, token: string) => void
  finalizeMessage: (id: string, cypherBlocks: string[]) => void
  setQueryResult: (id: string, result: string) => void
  setQueryError: (id: string, error: string) => void
  setIsLoading: (loading: boolean) => void
  setDownloadProgress: (progress: DownloadProgress | null) => void
  clearMessages: () => void
}

export const useAIChatStore = create<AIChatState>()((set) => ({
  messages: [],
  isOpen: false,
  isLoading: false,
  downloadProgress: null,

  setIsOpen: (open) => set({ isOpen: open }),

  addUserMessage: (content) => {
    const id = crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id,
          role: 'user',
          content,
          isStreaming: false,
          cypherBlocks: [],
        },
      ],
    }))
    return id
  },

  startAssistantMessage: () => {
    const id = crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id,
          role: 'assistant',
          content: '',
          isStreaming: true,
          cypherBlocks: [],
        },
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

  finalizeMessage: (id, cypherBlocks) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, isStreaming: false, cypherBlocks } : msg
      ),
    })),

  setQueryResult: (id, result) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, queryResult: result } : msg
      ),
    })),

  setQueryError: (id, error) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, queryError: error } : msg
      ),
    })),

  setIsLoading: (loading) => set({ isLoading: loading }),

  setDownloadProgress: (progress) => set({ downloadProgress: progress }),

  clearMessages: () => set({ messages: [] }),
}))
