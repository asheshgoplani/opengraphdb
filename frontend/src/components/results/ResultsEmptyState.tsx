import { Workflow } from 'lucide-react'

export const DEFAULT_EMPTY_QUERY = 'MATCH (n) RETURN n LIMIT 25'

export function ResultsEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="animate-fade-in animate-fill-both rounded-xl border bg-card/70 p-8 text-center shadow-sm backdrop-blur-sm">
        <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Workflow className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-medium text-foreground">Run a query to see results</h2>
        <p className="mt-1 text-sm text-muted-foreground">Try the example below</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-muted px-4 py-2 text-left font-mono text-sm text-muted-foreground">
          <code>{DEFAULT_EMPTY_QUERY}</code>
        </pre>
      </div>
    </div>
  )
}
