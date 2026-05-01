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

// EVAL-FRONTEND-QUALITY-CYCLE3.md H-3: cycle-2 H-1 deleted the four AI-SDK
// provider classes but left the SettingsDialog UI asking for an OpenAI /
// Anthropic / Gemini API key and the zustand store persisting it to
// localStorage. With no consumer of `aiApiKey`, every saved value is a
// silent leak: the key sits indefinitely under `localStorage['ogdb-settings']`
// and any XSS path on `*.opengraphdb.dev` (or the embedded console at
// `localhost:7878`) exfiltrates it in clear text. Fix in two halves:
//
//   1. Strip `aiApiKey` / `aiModel` / `aiBaseUrl` / `aiProvider` from the
//      persisted blob via `partialize`. New values entered with the
//      VITE_ENABLE_AI_SETTINGS flag stay in-memory only until the v0.6
//      chat surface ships and migrates them to sessionStorage.
//   2. Drop any pre-existing values via `migrate`/`version: 1`. Users who
//      saved a key against cycle-2's leaky build have it deleted on next
//      load; serverUrl / theme / resultLimit are preserved.
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: 'http://localhost:8080',
      theme: 'system',
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
    {
      name: 'ogdb-settings',
      version: 1,
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        theme: state.theme,
        resultLimit: state.resultLimit,
      }),
      migrate: (persisted: unknown) => {
        if (persisted && typeof persisted === 'object') {
          const p = persisted as Record<string, unknown>
          delete p.aiApiKey
          delete p.aiModel
          delete p.aiBaseUrl
          delete p.aiProvider
          return p as Partial<SettingsState>
        }
        return persisted as Partial<SettingsState>
      },
    }
  )
)
