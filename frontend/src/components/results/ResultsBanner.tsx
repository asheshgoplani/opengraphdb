import { Button } from '@/components/ui/button'
import { useQueryStore } from '@/stores/query'
import { LayoutGrid, Network } from 'lucide-react'

interface ResultsBannerProps {
  nodeCount: number
  edgeCount: number
  isLimited: boolean
  resultLimit: number
}

export function ResultsBanner({
  nodeCount,
  edgeCount,
  isLimited,
  resultLimit,
}: ResultsBannerProps) {
  const viewMode = useQueryStore((s) => s.viewMode)
  const setViewMode = useQueryStore((s) => s.setViewMode)

  return (
    <div className="flex items-center justify-between border-b px-3 py-1.5">
      <div className="text-xs text-muted-foreground">
        {isLimited ? (
          <span>
            Showing {resultLimit} results (query returned more)
          </span>
        ) : (
          <span>
            Nodes: {nodeCount} | Edges: {edgeCount}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant={viewMode === 'graph' ? 'default' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewMode('graph')}
          title="Graph view"
        >
          <Network className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={viewMode === 'table' ? 'default' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setViewMode('table')}
          title="Table view"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
