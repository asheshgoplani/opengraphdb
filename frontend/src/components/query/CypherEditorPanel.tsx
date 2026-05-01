import { lazy, Suspense, useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type { DbSchema } from '@neo4j-cypher/language-support'
import { Loader2, Play } from 'lucide-react'
import { useSchemaQuery } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { useQueryHistoryStore } from '@/stores/queryHistory'
import { useQueryStore } from '@/stores/query'
import { resolveTheme } from '@/components/layout/theme-utils'
import { prepareCypherQuery } from './query-utils'
import { SaveQueryDialog } from './SaveQueryDialog'

// H1: defer-load the cypher editor + 8.3 MB lintWorker chunk until first
// interaction. Cold playground load no longer pays the worker cost.
const CypherEditorLazy = lazy(() =>
  import('@neo4j-cypher/react-codemirror').then((m) => ({ default: m.CypherEditor })),
)

interface CypherEditorPanelProps {
  onRunQuery: (query: string) => void
  isRunning?: boolean
}

function useSchemaAsDbSchema(): DbSchema | undefined {
  const { data } = useSchemaQuery()

  return useMemo(() => {
    if (!data) return undefined

    return {
      labels: data.labels ?? [],
      relationshipTypes: data.relationshipTypes ?? [],
      propertyKeys: data.propertyKeys ?? [],
    }
  }, [data])
}

function subscribePrefersDark(notify: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', notify)
  return () => mq.removeEventListener('change', notify)
}

function getPrefersDarkSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getServerSnapshot(): boolean {
  return false
}

function useResolvedEditorTheme(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme)
  const isSystemDark = useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    getServerSnapshot,
  )
  return resolveTheme(theme, isSystemDark)
}

export function CypherEditorPanel({ onRunQuery, isRunning = false }: CypherEditorPanelProps) {
  const currentQuery = useQueryStore((s) => s.currentQuery)
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)
  const resultLimit = useSettingsStore((s) => s.resultLimit)
  const history = useQueryHistoryStore((s) => s.history)
  const addToHistory = useQueryHistoryStore((s) => s.addToHistory)

  const schema = useSchemaAsDbSchema()
  const resolvedTheme = useResolvedEditorTheme()
  const [editorActivated, setEditorActivated] = useState(false)

  const handleExecute = useCallback(
    (cmd: string) => {
      const finalQuery = prepareCypherQuery(cmd, resultLimit)
      if (!finalQuery) return

      addToHistory(cmd.trim())
      onRunQuery(finalQuery)
    },
    [addToHistory, onRunQuery, resultLimit]
  )

  return (
    <div className="border-b bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div
          className="flex-1 overflow-hidden rounded-md border border-input"
          onPointerDown={() => setEditorActivated(true)}
          onFocusCapture={() => setEditorActivated(true)}
        >
          {editorActivated ? (
            <Suspense
              fallback={
                <textarea
                  data-testid="cypher-editor-fallback"
                  aria-label="Cypher query editor"
                  className="min-h-[80px] w-full resize-none bg-background p-2 text-sm font-mono outline-none"
                  value={currentQuery}
                  onChange={(event) => setCurrentQuery(event.target.value)}
                  placeholder="Enter a Cypher query..."
                />
              }
            >
              <CypherEditorLazy
                value={currentQuery}
                onChange={(value) => setCurrentQuery(value)}
                onExecute={handleExecute}
                history={history}
                schema={schema}
                theme={resolvedTheme}
                lint={true}
                placeholder="Enter a Cypher query... e.g., MATCH (n) RETURN n LIMIT 25"
                ariaLabel="Cypher query editor"
                className="min-h-[80px] max-h-[200px]"
              />
            </Suspense>
          ) : (
            <textarea
              data-testid="cypher-editor-placeholder"
              aria-label="Cypher query editor"
              className="min-h-[80px] w-full resize-none bg-background p-2 text-sm font-mono outline-none"
              value={currentQuery}
              onChange={(event) => {
                setCurrentQuery(event.target.value)
                setEditorActivated(true)
              }}
              placeholder="Enter a Cypher query... e.g., MATCH (n) RETURN n LIMIT 25"
            />
          )}
        </div>

        <div className="flex gap-1 sm:flex-col sm:self-end">
          <Button
            onClick={() => handleExecute(currentQuery)}
            disabled={isRunning || !currentQuery.trim()}
            className="flex-1 sm:flex-none"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="ml-1.5">Run</span>
          </Button>
          <SaveQueryDialog />
        </div>
      </div>
    </div>
  )
}
