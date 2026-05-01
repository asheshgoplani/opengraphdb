import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettingsStore } from '@/stores/settings'
import { Settings, ShieldCheck } from 'lucide-react'
import { ConnectionStatus } from './ConnectionStatus'
import { PROVIDER_MODELS, type AIProviderType } from '@/lib/ai/providers'

// EVAL-FRONTEND-QUALITY-CYCLE3.md H-3: hide the AI rows behind a build-time
// flag until the v0.6 chat surface ships. Flag is opt-in (default off) so
// the leaky API-key field never renders in production builds.
const AI_SETTINGS_ENABLED =
  (import.meta.env.VITE_ENABLE_AI_SETTINGS ?? 'false') === 'true'

const PROVIDER_OPTIONS: { value: AIProviderType; label: string }[] = [
  { value: 'webllm', label: 'WebLLM (Free, Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
]

const API_KEY_PLACEHOLDERS: Record<AIProviderType, string> = {
  webllm: '',
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  gemini: 'AI...',
  'openai-compatible': 'Enter API key',
}

export function SettingsDialog() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const resultLimit = useSettingsStore((s) => s.resultLimit)
  const aiProvider = useSettingsStore((s) => s.aiProvider)
  const aiApiKey = useSettingsStore((s) => s.aiApiKey)
  const aiModel = useSettingsStore((s) => s.aiModel)
  const aiBaseUrl = useSettingsStore((s) => s.aiBaseUrl)

  const setServerUrl = useSettingsStore((s) => s.setServerUrl)
  const setResultLimit = useSettingsStore((s) => s.setResultLimit)
  const setAiProvider = useSettingsStore((s) => s.setAiProvider)
  const setAiApiKey = useSettingsStore((s) => s.setAiApiKey)
  const setAiModel = useSettingsStore((s) => s.setAiModel)
  const setAiBaseUrl = useSettingsStore((s) => s.setAiBaseUrl)

  const [open, setOpen] = useState(false)
  const [localUrl, setLocalUrl] = useState(serverUrl)
  const [localLimit, setLocalLimit] = useState(String(resultLimit))
  const [localAiProvider, setLocalAiProvider] = useState<AIProviderType>(aiProvider)
  const [localAiApiKey, setLocalAiApiKey] = useState(aiApiKey)
  const [localAiModel, setLocalAiModel] = useState(aiModel)
  const [localAiBaseUrl, setLocalAiBaseUrl] = useState(aiBaseUrl)
  const [customModel, setCustomModel] = useState(false)

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setLocalUrl(serverUrl)
      setLocalLimit(String(resultLimit))
      setLocalAiProvider(aiProvider)
      setLocalAiApiKey(aiApiKey)
      setLocalAiModel(aiModel)
      setLocalAiBaseUrl(aiBaseUrl)
      // Determine if currently using a custom model
      const models = PROVIDER_MODELS[aiProvider]
      const isCustom = aiModel !== '' && !models.some((m) => m.id === aiModel)
      setCustomModel(isCustom)
    }
    setOpen(isOpen)
  }

  const handleSave = () => {
    setServerUrl(localUrl.trim() || 'http://localhost:8080')
    const limit = parseInt(localLimit, 10)
    if (!isNaN(limit) && limit > 0) {
      setResultLimit(limit)
    }
    if (AI_SETTINGS_ENABLED) {
      setAiProvider(localAiProvider)
      setAiApiKey(localAiApiKey)
      setAiModel(localAiModel)
      setAiBaseUrl(localAiBaseUrl)
    }
    setOpen(false)
  }

  const handleProviderChange = (provider: AIProviderType) => {
    setLocalAiProvider(provider)
    setLocalAiModel('')
    setCustomModel(false)
  }

  const providerModels = PROVIDER_MODELS[localAiProvider]
  const showApiKey = localAiProvider !== 'webllm'
  const showBaseUrl = localAiProvider === 'openai-compatible'

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border bg-card/95 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure backend connectivity and query result limits.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="rounded-lg border bg-muted/25 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Connection
            </p>
            <ConnectionStatus />
          </div>
          <div className="space-y-2.5">
            <label htmlFor="server-url" className="text-sm font-medium">
              Server URL
            </label>
            <Input
              id="server-url"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="http://localhost:8080"
              className="focus-visible:ring-2"
            />
            <p className="text-xs text-muted-foreground">
              Used for health checks and Cypher query execution.
            </p>
          </div>
          <div className="space-y-2.5">
            <label htmlFor="result-limit" className="text-sm font-medium">
              Result Limit
            </label>
            <Input
              id="result-limit"
              type="number"
              value={localLimit}
              onChange={(e) => setLocalLimit(e.target.value)}
              placeholder="500"
              min="1"
              className="focus-visible:ring-2"
            />
            <p className="text-xs text-muted-foreground">
              Caps returned records for graph and table rendering.
            </p>
          </div>

          {/* EVAL-FRONTEND-QUALITY-CYCLE3.md H-3: AI rows hidden until v0.6
              ships an actual chat surface. Cycle-2 H-1 deleted the SDK
              consumers; persisting the API key with no consumer is a leak,
              not a feature. Toggle with VITE_ENABLE_AI_SETTINGS=true once
              the consumer ships. */}
          {AI_SETTINGS_ENABLED && (<>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/25 p-3">
              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AI Assistant
              </p>
              <p className="text-xs text-muted-foreground">
                Configure the AI model that converts natural language to Cypher queries.
              </p>
            </div>

            <div className="space-y-2.5">
              <label htmlFor="ai-provider" className="text-sm font-medium">
                Provider
              </label>
              <select
                id="ai-provider"
                value={localAiProvider}
                onChange={(e) => handleProviderChange(e.target.value as AIProviderType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {showApiKey && (
              <div className="space-y-2.5">
                <label htmlFor="ai-api-key" className="text-sm font-medium">
                  API Key
                </label>
                <Input
                  id="ai-api-key"
                  type="password"
                  value={localAiApiKey}
                  onChange={(e) => setLocalAiApiKey(e.target.value)}
                  placeholder={API_KEY_PLACEHOLDERS[localAiProvider]}
                  className="focus-visible:ring-2"
                />
              </div>
            )}

            <div className="space-y-2.5">
              <label htmlFor="ai-model" className="text-sm font-medium">
                Model
              </label>
              {localAiProvider === 'webllm' ? (
                <Input
                  id="ai-model"
                  value={providerModels[0]?.label ?? ''}
                  readOnly
                  className="cursor-not-allowed opacity-60"
                />
              ) : localAiProvider === 'openai-compatible' ? (
                <Input
                  id="ai-model"
                  value={localAiModel}
                  onChange={(e) => setLocalAiModel(e.target.value)}
                  placeholder="e.g. llama-3.1-70b-versatile"
                  className="focus-visible:ring-2"
                />
              ) : customModel ? (
                <div className="space-y-1.5">
                  <Input
                    id="ai-model"
                    value={localAiModel}
                    onChange={(e) => setLocalAiModel(e.target.value)}
                    placeholder="Enter custom model name"
                    className="focus-visible:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => { setCustomModel(false); setLocalAiModel('') }}
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    Choose from list
                  </button>
                </div>
              ) : (
                <select
                  id="ai-model"
                  value={localAiModel}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomModel(true)
                      setLocalAiModel('')
                    } else {
                      setLocalAiModel(e.target.value)
                    }
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select a model...</option>
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value="__custom__">Other (custom)</option>
                </select>
              )}
            </div>

            {showBaseUrl && (
              <div className="space-y-2.5">
                <label htmlFor="ai-base-url" className="text-sm font-medium">
                  Base URL
                </label>
                <Input
                  id="ai-base-url"
                  value={localAiBaseUrl}
                  onChange={(e) => setLocalAiBaseUrl(e.target.value)}
                  placeholder="https://api.groq.com/openai/v1"
                  className="focus-visible:ring-2"
                />
              </div>
            )}

            <div className="flex items-start gap-2 rounded-md border bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Your API key is kept in memory for this session and is never sent to our servers
                or persisted to disk.
              </span>
            </div>
          </div>
          </>)}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
