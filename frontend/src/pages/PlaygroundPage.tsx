import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowLeft, Database, Network, Search, Sparkles, Wrench, Zap } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiClient } from '@/api/client'
import { transformLiveResponse, transformQueryResponse } from '@/api/transform'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { ConnectionBadge } from '@/components/playground/ConnectionBadge'
import { DatasetSwitcher } from '@/components/playground/DatasetSwitcher'
import { LiveModeToggle } from '@/components/playground/LiveModeToggle'
import { PerfStrip } from '@/components/playground/PerfStrip'
import { PowerModeToggle } from '@/components/playground/PowerModeToggle'
import { QueryCard } from '@/components/playground/QueryCard'
import { StatsPanel } from '@/components/playground/StatsPanel'
import { SemanticSearchPanel } from '@/components/playground/SemanticSearchPanel'
import { MCPToolGallery } from '@/components/mcp/MCPToolGallery'
import { SchemaBrowser } from '@/components/playground/SchemaBrowser'
import { RDFDropzone } from '@/components/playground/RDFDropzone'
import { TimeSlider } from '@/components/playground/TimeSlider'
import { CypherEditorPanel } from '@/components/query/CypherEditorPanel'
import { StatusBar } from '@/components/layout/StatusBar'
import { PANEL_MOTION, PANEL_TRANSITION } from '@/components/ui/motion'
import { PanelState } from '@/components/ui/PanelState'
import { applyTimeCutoff, getTemporalRange, isTemporalDataset } from '@/data/temporal'
import { cn } from '@/lib/utils'
import type { SearchHit } from '@/data/semanticSearch'
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
  const setTrace = useGraphStore((s) => s.setTrace)
  const advanceTrace = useGraphStore((s) => s.advanceTrace)
  const setSemanticHighlights = useGraphStore((s) => s.setSemanticHighlights)
  const setSemanticHoverId = useGraphStore((s) => s.setSemanticHoverId)
  const clearSemanticHighlights = useGraphStore((s) => s.clearSemanticHighlights)
  const selectNode = useGraphStore((s) => s.selectNode)
  const [isTraceMode, setIsTraceMode] = useState(false)
  const [isPowerMode, setIsPowerMode] = useState(false)
  const [powerError, setPowerError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'graph' | 'semantic' | 'temporal' | 'schema' | 'mcp'>(
    'graph',
  )
  const timeCutoff = useGraphStore((s) => s.timeCutoff)
  const setTimeCutoff = useGraphStore((s) => s.setTimeCutoff)
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [schemaFilterLabel, setSchemaFilterLabel] = useState<string | null>(null)
  const [ontologyMode, setOntologyMode] = useState(false)
  const [importedGraph, setImportedGraph] = useState<{
    data: GraphData
    filename: string
    dbPath: string | null
    source: 'live' | 'preview'
  } | null>(null)
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
    setTimeCutoff(null)
    const start = performance.now()
    setGraphData(runDatasetQuery(key, 'all'))
    setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
    setSearchParams({ dataset: key })
  }

  const handleModeChange = (nextLiveMode: boolean) => {
    setIsLiveMode(nextLiveMode)
    setLiveError(null)

    if (!nextLiveMode) {
      const start = performance.now()
      setGraphData(runDatasetQuery(activeDataset, activeQueryKey))
      setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
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
      setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))

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
        setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
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
    setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
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

  const temporalRange = useMemo(
    () => (importedGraph ? null : getTemporalRange(activeDataset, baseGraphData)),
    [activeDataset, baseGraphData, importedGraph],
  )

  const displayedGraphData = useMemo(() => {
    return applyTimeCutoff(schemaFilteredGraphData, activeDataset, timeCutoff)
  }, [schemaFilteredGraphData, activeDataset, timeCutoff])

  const totalGraphNodeCount = baseGraphData.nodes.length

  const labelCount = useMemo(() => {
    return new Set(displayedGraphData.nodes.flatMap((node) => node.labels)).size
  }, [displayedGraphData.nodes])

  const isGeographic = Boolean(
    DATASETS[activeDataset]?.meta.isGeographic && !schemaFilterLabel && !importedGraph,
  )
  const highlightedIds = useMemo(
    () => new Set(searchHits.map((hit) => hit.item.id)),
    [searchHits],
  )
  const isSemanticTabAvailable = activeDataset === 'movielens'
  const isTemporalTabAvailable = isTemporalDataset(activeDataset) && !importedGraph

  useEffect(() => {
    if (activeTab === 'semantic' && !isSemanticTabAvailable) {
      setActiveTab('graph')
    }
  }, [activeTab, isSemanticTabAvailable])

  useEffect(() => {
    if (activeTab === 'semantic') return
    clearSemanticHighlights()
    setSearchHits((prev) => (prev.length === 0 ? prev : []))
  }, [activeTab, clearSemanticHighlights])

  useEffect(() => {
    // Clear cutoff when leaving temporal view so other tabs see the unfiltered graph.
    if (activeTab !== 'temporal' && timeCutoff != null) {
      setTimeCutoff(null)
    }
  }, [activeTab, timeCutoff, setTimeCutoff])

  const handlePowerQuery = async (cypher: string) => {
    if (!cypher.trim()) return
    setPowerError(null)
    setIsLiveLoading(true)
    const start = performance.now()
    try {
      const response = await apiClient.query(cypher)
      const nextGraphData = transformQueryResponse(response)
      setGraphData(nextGraphData)
      setQueryTimeMs(Math.max(0.05, +(performance.now() - start).toFixed(2)))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Power-mode query failed'
      setPowerError(message)
      setLiveError(message)
    } finally {
      setIsLiveLoading(false)
    }
  }

  const handleSearchResults = (hits: SearchHit[]) => {
    setSearchHits(hits)
    setSemanticHighlights(hits.map((hit) => hit.item.id))
  }

  const handleFocusHit = (id: string | number) => {
    selectNode(id)
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
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
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
          <MCPToolGallery />
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
              >
                <CypherEditorPanel
                  onRunQuery={(cypher) => {
                    void handlePowerQuery(cypher)
                  }}
                  isRunning={isLiveLoading}
                />
                {powerError && (
                  <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-red-300/85">
                    power mode error · {powerError}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

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
              active={activeTab === 'semantic'}
              onClick={() => isSemanticTabAvailable && setActiveTab('semantic')}
              disabled={!isSemanticTabAvailable}
              icon={Search}
              label="Semantic"
              blurb={
                isSemanticTabAvailable
                  ? 'Vector · full-text · hybrid RRF'
                  : 'MovieLens only in this demo'
              }
            />
            <TabPill
              active={activeTab === 'temporal'}
              onClick={() => isTemporalTabAvailable && setActiveTab('temporal')}
              disabled={!isTemporalTabAvailable}
              icon={Zap}
              label="Temporal"
              blurb={
                isTemporalTabAvailable
                  ? 'Time travel · valid_from · compact'
                  : 'MovieLens or GoT only'
              }
            />
            <TabPill
              active={activeTab === 'schema'}
              onClick={() => setActiveTab('schema')}
              icon={Database}
              label="Schema"
              blurb="Labels · edges · properties"
            />
            <TabPill
              active={activeTab === 'mcp'}
              onClick={() => setActiveTab('mcp')}
              icon={Wrench}
              label="MCP"
              blurb="Agent tool surface"
            />
          </div>

          <AnimatePresence initial={false}>
            {activeTab === 'temporal' && (
              <motion.div
                key="temporal-slider"
                initial={PANEL_MOTION.initial}
                animate={PANEL_MOTION.animate}
                exit={PANEL_MOTION.exit}
                transition={PANEL_TRANSITION}
                className="border-b border-white/10 bg-muted/15 px-3 py-2"
              >
                <TimeSlider
                  range={temporalRange}
                  cutoff={timeCutoff}
                  onCutoffChange={setTimeCutoff}
                  onReset={() => setTimeCutoff(null)}
                  graph={baseGraphData}
                  isLive={isLiveMode}
                  visibleNodeCount={displayedGraphData.nodes.length}
                  totalNodeCount={totalGraphNodeCount}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <main className="relative min-h-[55vh] flex-1 overflow-hidden md:min-h-0">
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === 'graph' || activeTab === 'temporal' ? (
                <motion.div
                  key={`canvas-${activeTab}`}
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
              ) : activeTab === 'schema' ? (
                <motion.div
                  key="schema-main"
                  initial={PANEL_MOTION.initial}
                  animate={PANEL_MOTION.animate}
                  exit={PANEL_MOTION.exit}
                  transition={PANEL_TRANSITION}
                  className="absolute inset-0 overflow-y-auto bg-background/60"
                  data-testid="schema-main-panel"
                >
                  <div className="mx-auto max-w-3xl px-6 py-8">
                    <h2 className="font-display text-2xl mb-4">Schema browser</h2>
                    <p className="mb-6 text-[12px] leading-relaxed text-white/55">
                      Explore the dataset's labels, relationships, and property keys. Click a
                      label to filter the graph canvas; flip on Ontology to render
                      rdfs:Class hubs and property-as-edge layouts.
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
              ) : activeTab === 'mcp' ? (
                <motion.div
                  key="mcp-main"
                  initial={PANEL_MOTION.initial}
                  animate={PANEL_MOTION.animate}
                  exit={PANEL_MOTION.exit}
                  transition={PANEL_TRANSITION}
                  className="absolute inset-0 overflow-y-auto bg-background/60"
                  data-testid="mcp-main-panel"
                >
                  <div className="mx-auto max-w-3xl px-6 py-8">
                    <h2 className="font-display text-2xl mb-4">MCP tool gallery</h2>
                    <p className="mb-6 text-[12px] leading-relaxed text-white/55">
                      Model Context Protocol surface — every card here is a JSON-RPC tool any
                      AI agent (Claude, Cursor, Copilot) can invoke against this database.
                    </p>
                    <MCPToolGallery />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="semantic-split"
                  initial={PANEL_MOTION.initial}
                  animate={PANEL_MOTION.animate}
                  exit={PANEL_MOTION.exit}
                  transition={PANEL_TRANSITION}
                  className="absolute inset-0 flex flex-col overflow-hidden md:flex-row"
                >
                  <div className="flex min-h-0 w-full min-w-0 flex-col border-b border-white/10 md:w-[55%] md:border-b-0 md:border-r">
                    <SemanticSearchPanel
                      highlightedIds={highlightedIds}
                      onHoverHit={setSemanticHoverId}
                      onFocusHit={handleFocusHit}
                      onResultsChange={handleSearchResults}
                    />
                  </div>
                  <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.25)] backdrop-blur-sm">
                      {searchHits.length > 0
                        ? `${searchHits.length} hit${searchHits.length === 1 ? '' : 's'} glowing on graph`
                        : 'Graph overlay · cyan = retrieved'}
                    </div>
                    <GraphCanvas
                      graphData={displayedGraphData}
                      isGeographic={isGeographic}
                      ontologyMode={ontologyMode}
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
          <div
            data-testid="mobile-panels"
            className="space-y-3 overflow-y-auto border-t border-white/10 bg-muted/15 p-3 md:hidden"
          >
            <DatasetSwitcher activeDataset={activeDataset} onSwitch={handleDatasetSwitch} />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
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
                    <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
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
              nodeCount={displayedGraphData.nodes.length}
              edgeCount={displayedGraphData.links.length}
              labelCount={labelCount}
            />
          </div>
          <StatusBar
            nodeCount={displayedGraphData.nodes.length}
            edgeCount={displayedGraphData.links.length}
            labelCount={labelCount}
            datasetLabel={DATASETS[activeDataset]?.meta.name ?? activeDataset}
            isLive={isLiveMode}
            timeCutoffLabel={
              timeCutoff != null && temporalRange
                ? temporalRange.unit === 'season'
                  ? `S${timeCutoff}`
                  : String(timeCutoff)
                : null
            }
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
