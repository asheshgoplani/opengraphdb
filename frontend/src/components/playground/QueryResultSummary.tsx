import { cn } from '@/lib/utils'

interface QueryResultSummaryProps {
  /** null when no query has been run yet (showing the raw dataset). */
  rowCount: number | null
  /** Total nodes currently rendered in the canvas (after filters/slices). */
  visibleNodes: number
  /** Total edges currently rendered. */
  visibleEdges: number
  /** Human-readable label for the most-recent query (a guided-query name or
   * a snippet of the Cypher). */
  queryLabel: string | null
  error?: string | null
}

// Small strip that renders "Query returned N rows. Showing nodes X..Y in the
// canvas." — the user was confused about the relationship between a query's
// row count and what's drawn on the graph, and this line says it in words.
//
// Placement: just under the canvas' top-left tab bar so it's always visible
// when a query has been run, and degrades to a friendly empty-state hint
// when no query has been executed (covers "pick a guided query" placeholder).
export function QueryResultSummary({
  rowCount,
  visibleNodes,
  visibleEdges,
  queryLabel,
  error,
}: QueryResultSummaryProps) {
  if (error) {
    const suggestion = suggestionForError(error)
    return (
      <section
        data-testid="query-result-summary"
        data-state="error"
        role="alert"
        className="mx-3 mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive"
      >
        <p className="font-serif text-[12px] leading-tight text-destructive-foreground">Query failed</p>
        <p className="mt-1 text-[10px] leading-snug text-destructive">{error}</p>
        {suggestion && (
          <p className="mt-2 text-[10px] leading-snug text-destructive-foreground">
            <span className="text-destructive/80">Try:</span>{' '}
            <code className="rounded bg-destructive/15 px-1 py-[1px] text-destructive-foreground">{suggestion}</code>
          </p>
        )}
      </section>
    )
  }

  if (rowCount == null) {
    return (
      <section
        data-testid="query-result-summary"
        data-state="idle"
        className="mx-3 mt-2 rounded-md border border-border/60 bg-background/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
      >
        Type Cypher or pick a guided query — then we'll tell you how many rows
        came back and which nodes are drawn.
      </section>
    )
  }

  const upper = Math.min(visibleNodes, rowCount)
  const lowerLabel = visibleNodes === 0 ? '0' : '1'
  const line =
    visibleNodes === 0
      ? `Query returned ${rowCount.toLocaleString()} rows · canvas empty (result contained no projectable nodes).`
      : `Query returned ${rowCount.toLocaleString()} rows. Showing nodes ${lowerLabel}..${upper.toLocaleString()} in the canvas (${visibleEdges.toLocaleString()} edges).`

  return (
    <section
      data-testid="query-result-summary"
      data-state="ok"
      data-row-count={rowCount}
      data-visible-nodes={visibleNodes}
      className={cn(
        'mx-3 mt-2 rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-[11px] text-foreground/85',
      )}
    >
      <span className="tabular-nums text-accent-foreground">{line}</span>
      {queryLabel && (
        <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          · {queryLabel}
        </span>
      )}
    </section>
  )
}

// Maps common Cypher/backend error strings to a concrete next query the user
// can copy. Kept deliberately small — anything we don't recognize shows the
// raw error with no hint rather than bluffing a suggestion.
function suggestionForError(err: string): string | null {
  const lower = err.toLowerCase()
  if (lower.includes('syntax') || lower.includes('unexpected') || lower.includes('parse')) {
    return 'MATCH (n) RETURN n LIMIT 10'
  }
  if (lower.includes('unknown') && lower.includes('function')) {
    return 'MATCH (n:Movie) RETURN n.title LIMIT 5'
  }
  if (lower.includes('no such label') || lower.includes('label not found')) {
    return 'MATCH (n) RETURN DISTINCT labels(n) LIMIT 10'
  }
  if (lower.includes('no such property') || lower.includes('property not found')) {
    return 'MATCH (n) RETURN keys(n) LIMIT 10'
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return 'Add LIMIT or narrow your MATCH (e.g. MATCH (n:Movie) RETURN n LIMIT 25)'
  }
  return null
}
