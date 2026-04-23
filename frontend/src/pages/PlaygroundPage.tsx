import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowLeft, Database, Network } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiClient } from '@/api/client'
import { transformLiveResponse } from '@/api/transform'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { ConnectionBadge } from '@/components/playground/ConnectionBadge'
import { DatasetSwitcher } from '@/components/playground/DatasetSwitcher'
import { LiveModeToggle } from '@/components/playground/LiveModeToggle'
import { PerfStrip } from '@/components/playground/PerfStrip'
import { PowerModeToggle } from '@/components/playground/PowerModeToggle'
import { QueryCard } from '@/components/playground/QueryCard'
import { StatsPanel } from '@/components/playground/StatsPanel'
import { BackendSchemaStrip } from '@/components/playground/BackendSchemaStrip'
import { DatasetHeader } from '@/components/playground/DatasetHeader'
import { QueryResultSummary } from '@/components/playground/QueryResultSummary'
import { SchemaBrowser } from '@/components/playground/SchemaBrowser'
import { RDFDropzone } from '@/components/playground/RDFDropzone'
import { CypherEditorPanel } from '@/components/query/CypherEditorPanel'
import { QueryResultTable } from '@/components/query/QueryResultTable'
import { StatusBar } from '@/components/layout/StatusBar'
import { PANEL_MOTION, PANEL_TRANSITION } from '@/components/ui/motion'
import { PanelState } from '@/components/ui/PanelState'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DATASETS,
  getDatasetQueries,
  runDatasetQuery,
  type DatasetKey,
  type GuidedQuery,
} from '@/data/datasets'
import { useSettingsStore } from '@/stores/settings'
import type { BackendQueryResponse } from '@/types/api'
import type { GraphData } from '@/types/graph'

const DATASET_KEYS: DatasetKey[] = ['movielens', 'airroutes', 'got', 'wikidata', 'community']
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
  const [isPowerMode, setIsPowerMode] = useState(false)
  const [powerError, setPowerError] = useState<string | null>(null)
  const [powerResponse, setPowerResponse] = useState<BackendQueryResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'graph' | 'schema'>('graph')
  const [schemaFilterLabel, setSchemaFilterLabel] = useState<string | null>(null)
  const [ontologyMode, setOntologyMode] = useState(false)
  const [importedGraph, setImportedGraph] = useState<{
    data: GraphData
    filename: string
    dbPath: string | null
    source: 'live' | 'preview'
  } | null>(null)
  // Last query summary: rowCount is what the query returned, visibleNodes is
  // what actually got drawn (can differ when the query returns primitive
  // values like counts, or when a filterFn drops unprojectable rows).
  const [lastQueryResult, setLastQueryResult] = useState<{
    rowCount: number
    visibleNodes: number
    visibleEdges: number
    label: string
  } | null>(null)
  const liveQueryMutation = useMutation({
    mutationFn: (cypher: string) => apiClient.query(cypher),
  })

  const queries = useMemo(() => getDatasetQueries(activeDataset), [activeDataset])
  const visibleQueries = useMemo(
    () => (isLiveMode ? queries.filter((query) => query.liveDescriptor) : queries),
    [queries, isLiveMode],
  )
  const queriesByCategory = useMemo(() => groupQueriesByCategory(visibleQueries), [visibleQueries])

  const handleDatasetSwitch = (key: DatasetKey) => {
    setActiveDataset(key)
    const nextQueries = getDatasetQueries(key)
    const nextKey = isLiveMode ? nextQueries.find((query) => query.liveDescriptor)?.key ?? 'all' : 'all'
    setActiveQueryKey(nextKey)
    setLiveError(null)
    setIsLiveLoading(false)
    const start = performance.now()
    setGraphData(runDatasetQuery(key, 'all'))
    setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
    setSearchParams({ dataset: key })
  }

  const handleModeChange = (nextLiveMode: boolean) => {
    setIsLiveMode(nextLiveMode)
    setLiveError(null)

    if (nextLiveMode) {
      const liveQuery = queries.find((query) => query.liveDescriptor)
      if (liveQuery && !queries.find((q) => q.key === activeQueryKey)?.liveDescriptor) {
        setActiveQueryKey(liveQuery.key)
      }
      return
    }

    const start = performance.now()
    setGraphData(runDatasetQuery(activeDataset, activeQueryKey))
    setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
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

    if (isLiveMode && query.liveDescriptor) {
      setIsLiveLoading(true)
      const start = performance.now()
      try {
        const response = (await liveQueryMutation.mutateAsync(query.cypher)) as unknown as BackendQueryResponse
        const nextGraphData = transformLiveResponse(response, query.liveDescriptor)
        setGraphData(nextGraphData)
        setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
        setLastQueryResult({
          rowCount: response.row_count ?? nextGraphData.nodes.length,
          visibleNodes: nextGraphData.nodes.length,
          visibleEdges: nextGraphData.links.length,
          label: query.label,
        })
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
    const nextGraphData = runDatasetQuery(activeDataset, queryKey)
    setGraphData(nextGraphData)
    setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
    setLastQueryResult({
      rowCount: nextGraphData.nodes.length,
      visibleNodes: nextGraphData.nodes.length,
      visibleEdges: nextGraphData.links.length,
      label: query.label,
    })
  }

  const baseGraphData = useMemo(
    () => (importedGraph ? importedGraph.data : graphData),
    [importedGraph, graphData],
  )

  const schemaFilteredGraphData = useMemo(() => {
    if (!schemaFilterLabel) return baseGraphData
    const nodes = baseGraphData.nodes.filter((n) => n.labels?.[0] === schemaFilterLabel)
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links = baseGraphData.links.filter((l) => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      return nodeIds.has(s) && nodeIds.has(t)
    })
    return { nodes, links }
  }, [baseGraphData, schemaFilterLabel])

  const displayedGraphData = schemaFilteredGraphData

  const labelCount = useMemo(() => {
    return new Set(displayedGraphData.nodes.flatMap((node) => node.labels)).size
  }, [displayedGraphData.nodes])

  const isGeographic = Boolean(
    DATASETS[activeDataset]?.meta.isGeographic && !schemaFilterLabel && !importedGraph,
  )

  const handlePowerQuery = async (cypher: string) => {
    if (!cypher.trim()) return
    setPowerError(null)
    setIsLiveLoading(true)
    const start = performance.now()
    try {
      const response = (await apiClient.query(cypher)) as unknown as BackendQueryResponse
      setPowerResponse(response)
      setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
      setLastQueryResult({
        rowCount: response.row_count ?? 0,
        visibleNodes: displayedGraphData.nodes.length,
        visibleEdges: displayedGraphData.links.length,
        label: cypher.length > 40 ? cypher.slice(0, 37) + '…' : cypher,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Power-mode query failed'
      setPowerError(message)
      setLiveError(message)
      setPowerResponse(null)
    } finally {
      setIsLiveLoading(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/" className="inline-flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <h1 className="font-serif text-[17px] leading-none tracking-tight text-foreground">Playground</h1>
          </div>
          <div className="flex items-center gap-2">
            <PowerModeToggle isActive={isPowerMode} onToggle={setIsPowerMode} />
            <LiveModeToggle isLive={isLiveMode} onChange={handleModeChange} disabled={isLiveLoading} />
            <ConnectionBadge queryTimeMs={queryTimeMs} isLive={isLiveMode} liveError={liveError} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-[320px] shrink-0 space-y-4 overflow-y-auto border-r bg-muted/20 p-4 md:block">
          <DatasetSwitcher activeDataset={activeDataset} onSwitch={handleDatasetSwitch} />
          <div>
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Guided Queries
            </p>
            <div className="space-y-3">
              {visibleQueries.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/15 px-3 py-2 text-[11px] leading-snug text-white/55">
                  No Cypher-backed queries for this dataset in Live mode. Switch to a dataset with backend queries, or turn Live mode off to use the static sample.
                </p>
              ) : (
                QUERY_CATEGORIES.map((category) => {
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
                })
              )}
            </div>
          </div>
          <StatsPanel
            nodeCount={displayedGraphData.nodes.length}
            edgeCount={displayedGraphData.links.length}
            labelCount={labelCount}
          />
          <RDFDropzone
            onImport={(data, source) => {
              if (source.kind === 'live') {
                setImportedGraph({
                  data,
                  filename: source.filename,
                  dbPath: source.dbPath,
                  source: 'live',
                })
              } else {
                setImportedGraph({
                  data,
                  filename: source.filename,
                  dbPath: null,
                  source: 'preview',
                })
              }
              setSchemaFilterLabel(null)
              const start = performance.now()
              setGraphData(data)
              setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
            }}
          />
          {importedGraph && (
            <section className="rounded-lg border border-cyan-400/30 bg-cyan-500/5 px-3 py-2 text-[11px] text-cyan-100/90">
              <p className="font-serif text-[12px] text-white">
                {importedGraph.source === 'live' ? 'Persisted' : 'Preview only'} ·{' '}
                {importedGraph.filename}
              </p>
              {importedGraph.source === 'live' && importedGraph.dbPath && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-200/70">
                  live db: {importedGraph.dbPath}
                </p>
              )}
              {importedGraph.source === 'preview' && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-200/80">
                  not persisted — start <code>ogdb serve --http</code>
                </p>
              )}
              <button
                type="button"
                className="mt-2 rounded border border-white/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/60 hover:border-white/30 hover:text-white"
                onClick={() => {
                  setImportedGraph(null)
                  setSchemaFilterLabel(null)
                  handleDatasetSwitch(activeDataset)
                }}
              >
                Clear import
              </button>
            </section>
          )}
          <SchemaBrowser
            graphData={baseGraphData}
            selectedLabel={schemaFilterLabel}
            ontologyMode={ontologyMode}
            onSelectLabel={setSchemaFilterLabel}
            onToggleOntology={setOntologyMode}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto md:overflow-hidden">
          <AnimatePresence initial={false}>
            {isPowerMode && (
              <motion.div
                key="power-mode-editor"
                initial={PANEL_MOTION.initial}
                animate={PANEL_MOTION.animate}
                exit={PANEL_MOTION.exit}
                transition={PANEL_TRANSITION}
                className="border-b border-white/10"
                data-testid="power-mode-panel"
              >
                <CypherEditorPanel
                  onRunQuery={(cypher) => {
                    void handlePowerQuery(cypher)
                  }}
                  isRunning={isLiveLoading}
                />
                <QueryResultTable
                  response={powerResponse}
                  error={powerError}
                  isLoading={isLiveLoading && !powerResponse}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <DatasetHeader
            meta={importedGraph ? undefined : DATASETS[activeDataset]?.meta}
            nodeCount={displayedGraphData.nodes.length}
            edgeCount={displayedGraphData.links.length}
            activeRowCount={lastQueryResult?.rowCount ?? null}
            activeQueryLabel={lastQueryResult?.label ?? null}
          />

          <div
            role="tablist"
            aria-label="Playground view"
            className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-muted/20 px-3 py-2"
          >
            <TabPill
              active={activeTab === 'graph'}
              onClick={() => setActiveTab('graph')}
              icon={Network}
              label="Graph"
              blurb="Cypher traversals · canvas"
            />
            <TabPill
              active={activeTab === 'schema'}
              onClick={() => setActiveTab('schema')}
              icon={Database}
              label="Schema"
              blurb="GET /schema · real backend"
            />
          </div>

          <QueryResultSummary
            rowCount={lastQueryResult?.rowCount ?? null}
            visibleNodes={displayedGraphData.nodes.length}
            visibleEdges={displayedGraphData.links.length}
            queryLabel={lastQueryResult?.label ?? null}
            error={liveError || powerError}
          />

          <main className="relative min-h-[55vh] flex-1 overflow-hidden md:min-h-0">
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === 'graph' ? (
                <motion.div
                  key="canvas-graph"
                  initial={PANEL_MOTION.initial}
                  animate={PANEL_MOTION.animate}
                  exit={PANEL_MOTION.exit}
                  transition={PANEL_TRANSITION}
                  className="absolute inset-0"
                >
                  <GraphCanvas
                    graphData={displayedGraphData}
                    isGeographic={isGeographic}
                    ontologyMode={ontologyMode}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="schema-main"
                  initial={PANEL_MOTION.initial}
                  animate={PANEL_MOTION.animate}
                  exit={PANEL_MOTION.exit}
                  transition={PANEL_TRANSITION}
                  className="absolute inset-0 overflow-y-auto"
                  data-testid="schema-main-panel"
                  data-schema-mode="active"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(100,255,180,0.03) 0%, rgba(100,255,180,0.015) 100%), hsla(240, 10%, 8%, 0.6)',
                  }}
                >
                  <div
                    data-testid="schema-browser-header"
                    className="sticky top-0 z-20 border-b border-emerald-300/20 bg-gradient-to-r from-emerald-500/10 via-cyan-500/8 to-emerald-500/10 px-6 py-5 backdrop-blur-sm"
                  >
                    <h1
                      className="font-display tracking-tight text-emerald-50"
                      style={{
                        fontFamily:
                          '"Fraunces", "Source Serif 4", Georgia, serif',
                        fontSize: '32px',
                        fontWeight: 500,
                        letterSpacing: '-0.01em',
                        textShadow:
                          '0 0 20px rgba(100,255,180,0.35), 0 0 40px rgba(100,255,180,0.18)',
                      }}
                    >
                      SCHEMA BROWSER
                    </h1>
                    <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-emerald-200/70">
                      labels · relationships · property keys
                    </p>
                  </div>
                  <div className="mx-auto max-w-3xl px-6 py-8">
                    <BackendSchemaStrip />
                    <p className="mb-6 text-[12px] leading-relaxed text-white/55">
                      Above: labels + edge types + property keys fetched live from
                      <code className="mx-1 rounded bg-white/10 px-1 py-0.5 text-[11px]">GET /schema</code>.
                      Below: schema derived from the currently-visible graph, with label-filter + ontology toggles.
                    </p>
                    <SchemaBrowser
                      graphData={baseGraphData}
                      selectedLabel={schemaFilterLabel}
                      ontologyMode={ontologyMode}
                      onSelectLabel={setSchemaFilterLabel}
                      onToggleOntology={setOntologyMode}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10">
              <div className="pointer-events-auto">
                <PerfStrip
                  queryTimeMs={queryTimeMs}
                  nodeCount={displayedGraphData.nodes.length}
                  edgeCount={displayedGraphData.links.length}
                  isLive={isLiveMode}
                />
              </div>
            </div>
            <AnimatePresence>
              {isLiveLoading && (
                <motion.div
                  key="canvas-loading"
                  initial={PANEL_MOTION.initial}
                  animate={PANEL_MOTION.animate}
                  exit={PANEL_MOTION.exit}
                  transition={PANEL_TRANSITION}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm"
                >
                  <PanelState
                    intent="loading"
                    title="Querying the database"
                    description="Streaming rows over the live bolt adapter — should be instant."
                    hint="traversal · vector · fulltext"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {isLiveMode && liveError && (
                <motion.div
                  key="canvas-error"
                  initial={PANEL_MOTION.initial}
                  animate={PANEL_MOTION.animate}
                  exit={PANEL_MOTION.exit}
                  transition={PANEL_TRANSITION}
                  className="absolute left-4 top-4 z-10 max-w-md"
                >
                  <div className="flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 shadow-lg backdrop-blur-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                    <div>
                      <p className="font-serif text-[13px] leading-tight text-red-100">
                        Live query failed
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-red-300/85">
                        {liveError}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
          <StatusBar
            nodeCount={displayedGraphData.nodes.length}
            edgeCount={displayedGraphData.links.length}
            labelCount={labelCount}
            datasetLabel={DATASETS[activeDataset]?.meta.name ?? activeDataset}
            isLive={isLiveMode}
          />
        </div>
      </div>
    </div>
  )
}

interface TabPillProps {
  active: boolean
  onClick?: () => void
  disabled?: boolean
  icon: typeof Network
  label: string
  blurb: string
}

function TabPill({ active, onClick, disabled, icon: Icon, label, blurb }: TabPillProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors duration-200',
        active
          ? 'border-cyan-400/40 text-foreground'
          : 'border-white/10 bg-transparent text-white/60 hover:border-white/25 hover:bg-muted/30 hover:text-white/80',
        disabled && 'cursor-not-allowed opacity-50 hover:border-white/10 hover:bg-transparent',
      )}
    >
      {active && (
        <motion.span
          layoutId="playground-active-tab"
          aria-hidden
          className="absolute inset-0 -z-0 rounded-md border border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_10px_rgba(34,211,238,0.22)]"
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        />
      )}
      <Icon className={cn('relative h-3.5 w-3.5', active ? 'text-cyan-200' : 'text-white/55')} />
      <div className="relative flex flex-col leading-none">
        <span className="font-serif text-[13px] tracking-tight">{label}</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-white/45">{blurb}</span>
      </div>
    </button>
  )
}
