// EVAL-FRONTEND-QUALITY-CYCLE3.md H-3 regression suite.
//
// Cycle-2 H-1 deleted the AI provider runtime but the SettingsDialog UI
// kept persisting an `aiApiKey` to localStorage with no consumer. Cycle-3
// H-3 strips `aiApiKey` / `aiModel` / `aiBaseUrl` / `aiProvider` from the
// persisted blob via `partialize`, and migrates any legacy values out on
// next load via `migrate` + `version: 1`. This test pins both halves so
// a future change that re-introduces the leak fails CI.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const STORAGE_KEY = 'ogdb-settings'

// vitest.config.mjs runs the suite under `environment: 'node'`, so there
// is no window/localStorage globally. Stub a minimal in-memory storage so
// zustand's `persist` middleware has somewhere to read/write while still
// exercising the real partialize / migrate paths the test wants to pin.
const memoryStore = new Map<string, string>()
const stubStorage: Storage = {
  get length() {
    return memoryStore.size
  },
  clear: () => memoryStore.clear(),
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value)
  },
  removeItem: (key: string) => {
    memoryStore.delete(key)
  },
  key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
}
;(globalThis as unknown as { localStorage: Storage }).localStorage = stubStorage
;(globalThis as unknown as { window: { localStorage: Storage } }).window = {
  localStorage: stubStorage,
}

beforeEach(() => {
  // Each test runs against a clean localStorage slate AND a fresh module
  // instance so the zustand `persist` rehydrate path executes on import.
  memoryStore.clear()
  vi.resetModules()
})

describe('useSettingsStore persistence (H-3)', () => {
  it('does not persist aiApiKey / aiModel / aiBaseUrl / aiProvider', async () => {
    const { useSettingsStore } = await import('../src/stores/settings')
    useSettingsStore.getState().setAiApiKey('sk-leaky-key')
    useSettingsStore.getState().setAiModel('gpt-4o')
    useSettingsStore.getState().setAiBaseUrl('https://leak.example')
    useSettingsStore.getState().setServerUrl('http://localhost:9999')

    // zustand `persist` writes synchronously after a state update.
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw, 'persist payload must be written').not.toBeNull()
    const persisted = JSON.parse(raw!) as { state: Record<string, unknown> }

    expect(persisted.state.serverUrl).toBe('http://localhost:9999')
    expect(persisted.state).not.toHaveProperty('aiApiKey')
    expect(persisted.state).not.toHaveProperty('aiModel')
    expect(persisted.state).not.toHaveProperty('aiBaseUrl')
    expect(persisted.state).not.toHaveProperty('aiProvider')
  })

  it('migrates legacy persisted aiApiKey out on rehydrate', async () => {
    // Simulate a cycle-2 cache: the leaky build wrote aiApiKey to
    // localStorage. After cycle-3 H-3 lands, the store version bumps to
    // 1 and `migrate` strips the four AI fields.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 0,
        state: {
          serverUrl: 'http://localhost:8080',
          theme: 'dark',
          resultLimit: 200,
          aiProvider: 'openai',
          aiApiKey: 'sk-legacy-leak',
          aiModel: 'gpt-4o',
          aiBaseUrl: 'https://legacy.example',
        },
      })
    )

    // Import after seeding so the store rehydrates from the legacy blob.
    // `vi.resetModules` ensures we get a fresh module instance.
    const { useSettingsStore } = await import('../src/stores/settings')
    const state = useSettingsStore.getState()

    // serverUrl / theme / resultLimit are preserved.
    expect(state.serverUrl).toBe('http://localhost:8080')
    expect(state.theme).toBe('dark')
    expect(state.resultLimit).toBe(200)

    // The legacy AI fields are wiped from the rehydrated state. The
    // store's in-memory defaults take over (empty strings + 'webllm'
    // default), and the next persist write will not include them.
    expect(state.aiApiKey).toBe('')
    expect(state.aiModel).toBe('')
    expect(state.aiBaseUrl).toBe('')
    expect(state.aiProvider).toBe('webllm')
  })
})
