import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Sparkles, Zap } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiClient } from '@/api/client'
import { transformLiveResponse } from '@/api/transform'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { ConnectionBadge } from '@/components/playground/ConnectionBadge'
import { DatasetSwitcher } from '@/components/playground/DatasetSwitcher'
import { LiveModeToggle } from '@/components/playground/LiveModeToggle'
import { QueryCard } from '@/components/playground/QueryCard'
import { StatsPanel } from '@/components/playground/StatsPanel'
import { Button } from '@/components/ui/button'
import { AIChatPanel } from '@/components/ai/AIChatPanel'
import { useAIChatStore } from '@/stores/ai-chat'
import { useAIChat } from '@/hooks/useAIChat'
import {
  DATASETS,
  getDatasetQueries,
  runDatasetQuery,
  type DatasetKey,
  type GuidedQuery,
} from '@/data/datasets'
import { useGraphStore } from '@/stores/graph'
import { useSettingsStore } from '@/stores/settings'
import type { BackendQueryResponse } from '@/types/api'
import type { GraphData } from '@/types/graph'

const DATASET_KEYS: DatasetKey[] = ['movielens', 'airroutes', 'got', 'wikidata']
export const QUERY_CATEGORIES = ['Explore', 'Traverse', 'Analyze'] as const
type QueryCategory = (typeof QUERY_CATEGORIES)[number]

function toDatasetKey(value: string | null): DatasetKey {
  if (value && DATASET_KEYS.includes(value as DatasetKey)) {
    return value as DatasetKey
  }
  return 'movielens'
}

export function groupQueriesByCategory(
  queries: GuidedQuery[],
): Record<QueryCategory, GuidedQuery[]> {
  const grouped: Record<QueryCategory, GuidedQuery[]> = {
    Explore: [],
    Traverse: [],
    Analyze: [],
  }

  for (const query of queries) {
    grouped[query.category ?? 'Explore'].push(query)
  }

  return grouped
}

export default function PlaygroundPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialDataset = toDatasetKey(searchParams.get('dataset'))
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const apiClient = useMemo(() => new ApiClient(serverUrl), [serverUrl])
  const [activeDataset, setActiveDataset] = useState<DatasetKey>(initialDataset)
  const [activeQueryKey, setActiveQueryKey] = useState<string>('all')
  const [graphData, setGraphData] = useState<GraphData>(() => runDatasetQuery(initialDataset, 'all'))
  const [queryTimeMs, setQueryTimeMs] = useState<number>(0)
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [isLiveLoading, setIsLiveLoading] = useState(false)
  const setTrace = useGraphStore((s) => s.setTrace)
  const advanceTrace = useGraphStore((s) => s.advanceTrace)
  const [isTraceMode, setIsTraceMode] = useState(false)
  const isAIOpen = useAIChatStore((s) => s.isOpen)
  const setIsAIOpen = useAIChatStore((s) => s.setIsOpen)
  const { sendMessage, runCypherFromAI } = useAIChat()

  const liveQueryMutation = useMutation({
    mutationFn: (cypher: string) => apiClient.query(cypher),
  })

  const queries = useMemo(() => getDatasetQueries(activeDataset), [activeDataset])
  const queriesByCategory = useMemo(() => groupQueriesByCategory(queries), [queries])

  const handleDatasetSwitch = (key: DatasetKey) => {
    setActiveDataset(key)
    setActiveQueryKey('all')
    setLiveError(null)
    setIsLiveLoading(false)
    const start = performance.now()
    setGraphData(runDatasetQuery(key, 'all'))
    setQueryTimeMs(Math.round(performance.now() - start))
    setSearchParams({ dataset: key })
  }

  const handleModeChange = (nextLiveMode: boolean) => {
    setIsLiveMode(nextLiveMode)
    setLiveError(null)

    if (!nextLiveMode) {
      const start = performance.now()
      setGraphData(runDatasetQuery(activeDataset, activeQueryKey))
      setQueryTimeMs(Math.round(performance.now() - start))
    }
  }

  const handleTraceQuery = async (queryKey: string) => {
    const query = queries.find((q) => q.key === queryKey)
    if (!query || !query.liveDescriptor) return

    setIsLiveLoading(true)
    setLiveError(null)
    const start = performance.now()

    try {
      const collectedSteps: Array<{ nodeId: string | number; stepIndex: number }> = []

      const response = await apiClient.queryWithTrace(
        query.cypher,
        (step) => {
          collectedSteps.push(step)
          if (collectedSteps.length === 1) {
            setTrace([], 1)
          }
          advanceTrace(step.nodeId, step.stepIndex)
        }
      )

      const nextGraphData = transformLiveResponse(
        response as unknown as BackendQueryResponse,
        query.liveDescriptor
      )
      setGraphData(nextGraphData)
      setQueryTimeMs(Math.round(performance.now() - start))

      if (collectedSteps.length > 0) {
        setTrace(collectedSteps.map(s => ({
          nodeId: s.nodeId,
          stepIndex: s.stepIndex,
        })))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Trace query failed'
      setLiveError(message)
      setQueryTimeMs(0)
    } finally {
      setIsLiveLoading(false)
    }
  }

  const handleQueryRun = async (queryKey: string) => {
    if (isLiveLoading) {
      return
    }

    const query = queries.find((candidate) => candidate.key === queryKey)
    if (!query) {
      return
    }

    setActiveQueryKey(queryKey)
    setLiveError(null)

    if (isLiveMode && isTraceMode && query.liveDescriptor) {
      await handleTraceQuery(queryKey)
      return
    }

    if (isLiveMode && query.liveDescriptor) {
      setIsLiveLoading(true)
      const start = performance.now()
      try {
        const response = (await liveQueryMutation.mutateAsync(query.cypher)) as unknown as BackendQueryResponse
        const nextGraphData = transformLiveResponse(response, query.liveDescriptor)
        setGraphData(nextGraphData)
        setQueryTimeMs(Math.round(performance.now() - start))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Query failed'
        setLiveError(message)
        setQueryTimeMs(0)
      } finally {
        setIsLiveLoading(false)
      }
      return
    }

    const start = performance.now()
    setGraphData(runDatasetQuery(activeDataset, queryKey))
    setQueryTimeMs(Math.round(performance.now() - start))
  }

  const labelCount = useMemo(() => {
    return new Set(graphData.nodes.flatMap((node) => node.labels)).size
  }, [graphData.nodes])

  const isGeographic = DATASETS[activeDataset]?.meta.isGeographic ?? false

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
          <div className="flex items-center gap-2">
            <LiveModeToggle isLive={isLiveMode} onChange={handleModeChange} disabled={isLiveLoading} />
            {isLiveMode && (
              <Button
                variant={isTraceMode ? 'default' : 'outline'}
                size="sm"
                className={isTraceMode ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/30' : ''}
                onClick={() => setIsTraceMode(!isTraceMode)}
              >
                <Zap className="h-3.5 w-3.5 mr-1" />
                Trace
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAIOpen(!isAIOpen)}
              title="AI Assistant"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              AI
            </Button>
            <ConnectionBadge queryTimeMs={queryTimeMs} isLive={isLiveMode} liveError={liveError} />
          </div>
        </div>
      </header>
      <AIChatPanel onRunQuery={runCypherFromAI} onSendMessage={sendMessage} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-[320px] shrink-0 space-y-4 overflow-y-auto border-r bg-muted/20 p-4 md:block">
          <DatasetSwitcher activeDataset={activeDataset} onSwitch={handleDatasetSwitch} />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Guided Queries
            </p>
            <div className="space-y-3">
              {QUERY_CATEGORIES.map((category) => {
                const categoryQueries = queriesByCategory[category]
                if (categoryQueries.length === 0) {
                  return null
                }

                return (
                  <div key={category}>
                    <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
                      {category}
                    </p>
                    <div className="space-y-1.5">
                      {categoryQueries.map((query) => (
                        <QueryCard
                          key={query.key}
                          query={query}
                          isActive={activeQueryKey === query.key}
                          resultCount={
                            activeQueryKey === query.key ? graphData.nodes.length : query.expectedResultCount
                          }
                          onClick={() => {
                            void handleQueryRun(query.key)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
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
            <div className="space-y-2">
              {QUERY_CATEGORIES.map((category) => {
                const categoryQueries = queriesByCategory[category]
                if (categoryQueries.length === 0) {
                  return null
                }

                return (
                  <div key={category}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {category}
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {categoryQueries.map((query) => (
                        <Button
                          key={query.key}
                          variant={activeQueryKey === query.key ? 'default' : 'outline'}
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            void handleQueryRun(query.key)
                          }}
                        >
                          {query.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <StatsPanel
              nodeCount={graphData.nodes.length}
              edgeCount={graphData.links.length}
              labelCount={labelCount}
            />
          </div>

          <main className="relative min-h-0 flex-1 overflow-hidden">
            <GraphCanvas graphData={graphData} isGeographic={isGeographic} />
            {isLiveLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-xs">Querying live database...</span>
                </div>
              </div>
            ) : null}
            {isLiveMode && liveError ? (
              <div className="absolute left-4 top-4 z-10 max-w-md rounded-lg border border-red-300/70 bg-red-50/90 px-3 py-2 text-xs text-red-800 shadow-sm backdrop-blur-sm dark:border-red-700/60 dark:bg-red-950/80 dark:text-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Live query failed</p>
                    <p>{liveError}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}
