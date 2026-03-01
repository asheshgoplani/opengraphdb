import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useQueryStore } from '@/stores/query'
import { useSettingsStore } from '@/stores/settings'
import { useCypherQuery } from '@/api/queries'
import { Loader2, Play } from 'lucide-react'

export function QueryInput() {
  const currentQuery = useQueryStore((s) => s.currentQuery)
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)
  const resultLimit = useSettingsStore((s) => s.resultLimit)
  const mutation = useCypherQuery()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const executeQuery = useCallback(() => {
    const query = currentQuery.trim()
    if (!query) return

    const hasLimit = /\bLIMIT\b/i.test(query)
    const finalQuery = hasLimit ? query : `${query} LIMIT ${resultLimit}`
    mutation.mutate(finalQuery)
  }, [currentQuery, resultLimit, mutation])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        executeQuery()
      }
    },
    [executeQuery]
  )

  return (
    <div className="border-b bg-card p-3">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={currentQuery}
          onChange={(e) => setCurrentQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter a Cypher query... e.g., MATCH (n) RETURN n LIMIT 25"
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          rows={3}
        />
        <Button
          onClick={executeQuery}
          disabled={mutation.isPending || !currentQuery.trim()}
          className="self-end"
        >
          {mutation.isPending ? (
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
