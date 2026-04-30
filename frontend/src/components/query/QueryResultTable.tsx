import { useMemo } from 'react'
import type { BackendQueryResponse } from '@/types/api'

export interface QueryResultTableProps {
  response: BackendQueryResponse | null
  error?: string | null
  isLoading?: boolean
}

// Renders the columns + rows shape the backend returns from POST /query.
// Purpose: prove end-to-end that a Power-mode Cypher execution returned real
// data from the Rust engine. Kept deliberately plain so the F5 spec can assert
// row count without chasing style.
export function QueryResultTable({ response, error, isLoading }: QueryResultTableProps) {
  const hasRows = Boolean(response && response.row_count > 0)
  const columns = response?.columns ?? []

  const safeRows = useMemo(() => {
    if (!response) return []
    return response.rows.slice(0, 50)
  }, [response])

  if (isLoading) {
    return (
      <div
        data-testid="power-query-result-loading"
        className="border-t border-border/60 bg-background/60 px-4 py-3 font-mono text-[11px] text-muted-foreground"
      >
        executing against real backend…
      </div>
    )
  }

  if (error) {
    return (
      <div
        data-testid="power-query-result-error"
        className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 font-mono text-[11px] text-destructive"
      >
        power mode error · {error}
      </div>
    )
  }

  if (!response) return null

  return (
    <section
      data-testid="power-query-result"
      data-row-count={response.row_count}
      className="border-t border-border/60 bg-background/70 px-3 py-2"
    >
      <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>
          POST /query · <span data-testid="power-query-result-row-count">{response.row_count}</span>{' '}
          row{response.row_count === 1 ? '' : 's'}
        </span>
        <span>columns: {columns.length}</span>
      </div>
      {!hasRows ? (
        <p
          data-testid="power-query-result-empty"
          className="py-1 font-mono text-[11px] text-muted-foreground"
        >
          backend returned 0 rows — try seeding data first (see /api/rdf/import)
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-[11px]">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="border-b border-border/60 px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  data-testid="power-query-result-row"
                  className="border-b border-border/40 last:border-0"
                >
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="px-2 py-1 align-top font-mono text-[11px] text-foreground/85"
                    >
                      {renderCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {response.row_count > safeRows.length && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
              showing {safeRows.length} of {response.row_count} rows
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
