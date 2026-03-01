import { useQueryStore } from '@/stores/query'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { TableView } from './TableView'
import type { GraphData } from '@/types/graph'
import { cn } from '@/lib/utils'
import { LayoutGrid, Network } from 'lucide-react'

interface ResultsViewProps {
  graphData: GraphData
}

export function getResultsViewToggleClass(isActive: boolean): string {
  return isActive
    ? 'bg-primary text-primary-foreground'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
}

export function ResultsView({ graphData }: ResultsViewProps) {
  const viewMode = useQueryStore((s) => s.viewMode)
  const setViewMode = useQueryStore((s) => s.setViewMode)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end border-b bg-background/70 px-4 py-2">
        <div className="inline-flex items-center rounded-lg border bg-background/60 p-1">
          <button
            type="button"
            onClick={() => setViewMode('graph')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              getResultsViewToggleClass(viewMode === 'graph')
            )}
            aria-label="Graph view"
            title="Graph view"
          >
            <Network className="h-3.5 w-3.5" />
            Graph
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              getResultsViewToggleClass(viewMode === 'table')
            )}
            aria-label="Table view"
            title="Table view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Table
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden transition-opacity duration-200">
        {viewMode === 'table' ? (
          <div className="h-full animate-in fade-in-0 duration-200">
            <TableView graphData={graphData} />
          </div>
        ) : (
          <div className="h-full animate-in fade-in-0 duration-200">
            <GraphCanvas graphData={graphData} />
          </div>
        )}
      </div>
    </div>
  )
}
