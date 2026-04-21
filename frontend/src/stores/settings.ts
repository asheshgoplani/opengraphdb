import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProviderType } from '@/lib/ai/providers'

interface SettingsState {
  serverUrl: string
  theme: 'light' | 'dark' | 'system'
  resultLimit: number
  aiProvider: AIProviderType
  aiApiKey: string
  aiModel: string
  aiBaseUrl: string
  setServerUrl: (url: string) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setResultLimit: (limit: number) => void
  setAiProvider: (p: AIProviderType) => void
  setAiApiKey: (key: string) => void
  setAiModel: (model: string) => void
  setAiBaseUrl: (url: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: 'http://localhost:8080',
      theme: 'dark',
      resultLimit: 500,
      aiProvider: 'webllm',
      aiApiKey: '',
      aiModel: '',
      aiBaseUrl: '',
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setTheme: (theme) => set({ theme }),
      setResultLimit: (resultLimit) => set({ resultLimit }),
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setAiApiKey: (aiApiKey) => set({ aiApiKey }),
      setAiModel: (aiModel) => set({ aiModel }),
      setAiBaseUrl: (aiBaseUrl) => set({ aiBaseUrl }),
    }),
    { name: 'ogdb-settings' }
  )
)
