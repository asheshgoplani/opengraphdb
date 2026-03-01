import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { ConnectionBadge } from '@/components/playground/ConnectionBadge'
import { DatasetSwitcher } from '@/components/playground/DatasetSwitcher'
import { QueryCard } from '@/components/playground/QueryCard'
import { StatsPanel } from '@/components/playground/StatsPanel'
import { Button } from '@/components/ui/button'
import { getDatasetQueries, runDatasetQuery, type DatasetKey } from '@/data/datasets'
import type { GraphData } from '@/types/graph'

const DATASET_KEYS: DatasetKey[] = ['movies', 'social', 'fraud']

function toDatasetKey(value: string | null): DatasetKey {
  if (value && DATASET_KEYS.includes(value as DatasetKey)) {
    return value as DatasetKey
  }
  return 'movies'
}

export default function PlaygroundPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialDataset = toDatasetKey(searchParams.get('dataset'))
  const [activeDataset, setActiveDataset] = useState<DatasetKey>(initialDataset)
  const [activeQueryKey, setActiveQueryKey] = useState<string>('all')
  const [graphData, setGraphData] = useState<GraphData>(() => runDatasetQuery(initialDataset, 'all'))
  const [queryTimeMs, setQueryTimeMs] = useState<number>(0)

  const queries = useMemo(() => getDatasetQueries(activeDataset), [activeDataset])

  const handleDatasetSwitch = (key: DatasetKey) => {
    setActiveDataset(key)
    setActiveQueryKey('all')
    const start = performance.now()
    setGraphData(runDatasetQuery(key, 'all'))
    setQueryTimeMs(Math.round(performance.now() - start))
    setSearchParams({ dataset: key })
  }

  const handleQueryRun = (queryKey: string) => {
    setActiveQueryKey(queryKey)
    const start = performance.now()
    setGraphData(runDatasetQuery(activeDataset, queryKey))
    setQueryTimeMs(Math.round(performance.now() - start))
  }

  const labelCount = useMemo(() => {
    return new Set(graphData.nodes.flatMap((node) => node.labels)).size
  }, [graphData.nodes])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/" className="inline-flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <h1 className="text-base font-semibold">Playground</h1>
          </div>
          <ConnectionBadge queryTimeMs={queryTimeMs} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-[320px] shrink-0 space-y-4 overflow-y-auto border-r bg-muted/20 p-4 md:block">
          <DatasetSwitcher activeDataset={activeDataset} onSwitch={handleDatasetSwitch} />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Guided Queries
            </p>
            <div className="space-y-2">
              {queries.map((query) => (
                <QueryCard
                  key={query.key}
                  query={query}
                  isActive={activeQueryKey === query.key}
                  resultCount={
                    activeQueryKey === query.key ? graphData.nodes.length : query.expectedResultCount
                  }
                  onClick={() => handleQueryRun(query.key)}
                />
              ))}
            </div>
          </div>
          <StatsPanel
            nodeCount={graphData.nodes.length}
            edgeCount={graphData.links.length}
            labelCount={labelCount}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="space-y-3 border-b bg-muted/15 p-3 md:hidden">
            <DatasetSwitcher activeDataset={activeDataset} onSwitch={handleDatasetSwitch} />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Guided Queries
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {queries.map((query) => (
                <Button
                  key={query.key}
                  variant={activeQueryKey === query.key ? 'default' : 'outline'}
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleQueryRun(query.key)}
                >
                  {query.label}
                </Button>
              ))}
            </div>
            <StatsPanel
              nodeCount={graphData.nodes.length}
              edgeCount={graphData.links.length}
              labelCount={labelCount}
            />
          </div>

          <main className="min-h-0 flex-1 overflow-hidden">
            <GraphCanvas graphData={graphData} />
          </main>
        </div>
      </div>
    </div>
  )
}
