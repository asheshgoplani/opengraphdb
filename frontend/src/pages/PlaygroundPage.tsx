import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { Button } from '@/components/ui/button'
import {
  MOVIES_SAMPLE,
  runPlaygroundQuery,
  type PlaygroundQueryKey,
} from '@/data/sampleGraph'
import type { GraphData } from '@/types/graph'

const GUIDED_QUERIES: Array<{ key: PlaygroundQueryKey; label: string; cypher: string }> = [
  {
    key: 'all',
    label: 'All nodes',
    cypher: 'MATCH (n) RETURN n LIMIT 50',
  },
  {
    key: 'acted-in',
    label: 'Actors & movies',
    cypher: 'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p, m',
  },
  {
    key: 'directed',
    label: 'Directors',
    cypher: 'MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p, m',
  },
  {
    key: 'movies-only',
    label: 'Movies only',
    cypher: 'MATCH (m:Movie) RETURN m',
  },
]

export default function PlaygroundPage() {
  const [activeKey, setActiveKey] = useState<PlaygroundQueryKey>('all')
  const [graphData, setGraphData] = useState<GraphData>(() => runPlaygroundQuery('all'))

  const activeQuery = GUIDED_QUERIES.find((query) => query.key === activeKey) ?? GUIDED_QUERIES[0]

  const runGuidedQuery = (key: PlaygroundQueryKey) => {
    setActiveKey(key)
    setGraphData(runPlaygroundQuery(key))
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/" className="inline-flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <h1 className="text-base font-semibold sm:text-lg">Playground</h1>
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">
            Sample dataset: {MOVIES_SAMPLE.nodes.length} nodes, {MOVIES_SAMPLE.links.length} links
          </p>
        </div>
      </header>

      <div className="border-b bg-muted/40">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap gap-2">
            {GUIDED_QUERIES.map((query) => (
              <Button
                key={query.key}
                variant={activeKey === query.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => runGuidedQuery(query.key)}
              >
                {query.label}
              </Button>
            ))}
          </div>
          <p className="hidden font-mono text-xs text-muted-foreground md:block">
            {activeQuery.cypher}
          </p>
        </div>
      </div>

      <main className="flex-1 overflow-hidden">
        <GraphCanvas graphData={graphData} />
      </main>
    </div>
  )
}
