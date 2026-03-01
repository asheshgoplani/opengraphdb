import { useCallback, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useQueryStore } from '@/stores/query'
import { useSettingsStore } from '@/stores/settings'
import { Loader2, Play } from 'lucide-react'
import { prepareCypherQuery } from './query-utils'

interface QueryInputProps {
  onRunQuery: (query: string) => void
  isRunning?: boolean
}

export function QueryInput({ onRunQuery, isRunning = false }: QueryInputProps) {
  const currentQuery = useQueryStore((s) => s.currentQuery)
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)
  const resultLimit = useSettingsStore((s) => s.resultLimit)

  const executeQuery = useCallback(() => {
    const finalQuery = prepareCypherQuery(currentQuery, resultLimit)
    if (!finalQuery) return
    onRunQuery(finalQuery)
  }, [currentQuery, onRunQuery, resultLimit])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        executeQuery()
      }
    },
    [executeQuery]
  )

  return (
    <div className="border-b bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={currentQuery}
          onChange={(e) => setCurrentQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter a Cypher query... e.g., MATCH (n) RETURN n LIMIT 25"
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          rows={3}
        />
        <Button
          onClick={executeQuery}
          disabled={isRunning || !currentQuery.trim()}
          className="w-full sm:w-auto sm:self-end"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="ml-1.5">Run</span>
        </Button>
      </div>
    </div>
  )
}
