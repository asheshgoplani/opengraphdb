import { useQueryStore } from '@/stores/query'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { TableView } from './TableView'
import type { GraphData } from '@/types/graph'

interface ResultsViewProps {
  graphData: GraphData
}

export function ResultsView({ graphData }: ResultsViewProps) {
  const viewMode = useQueryStore((s) => s.viewMode)

  if (viewMode === 'table') {
    return (
      <div className="flex-1 overflow-hidden">
        <TableView graphData={graphData} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden">
      <GraphCanvas graphData={graphData} />
    </div>
  )
}
