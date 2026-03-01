import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  serverUrl: string
  theme: 'light' | 'dark' | 'system'
  resultLimit: number
  setServerUrl: (url: string) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setResultLimit: (limit: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: 'http://localhost:8080',
      theme: 'system',
      resultLimit: 500,
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setTheme: (theme) => set({ theme }),
      setResultLimit: (resultLimit) => set({ resultLimit }),
    }),
    { name: 'ogdb-settings' }
  )
)
