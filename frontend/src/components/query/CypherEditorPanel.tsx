import { useCallback, useEffect, useMemo, useState } from 'react'
import { CypherEditor } from '@neo4j-cypher/react-codemirror'
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

function useResolvedEditorTheme(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme)
  const [isSystemDark, setIsSystemDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setIsSystemDark(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      setIsSystemDark(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

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
        <div className="flex-1 overflow-hidden rounded-md border border-input">
          <CypherEditor
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
