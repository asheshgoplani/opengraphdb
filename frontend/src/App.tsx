import { useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PropertyPanel } from '@/components/layout/PropertyPanel'
import { CypherEditorPanel } from '@/components/query/CypherEditorPanel'
import { QueryError } from '@/components/query/QueryError'
import { ResultsView } from '@/components/results/ResultsView'
import { ResultsBanner } from '@/components/results/ResultsBanner'
import { ResultsEmptyState } from '@/components/results/ResultsEmptyState'
import { DisconnectedState } from '@/components/results/DisconnectedState'
import { useCypherQuery, useHealthCheck } from '@/api/queries'
import { transformQueryResponse } from '@/api/transform'
import { useSettingsStore } from '@/stores/settings'

function App() {
  const mutation = useCypherQuery()
  const resultLimit = useSettingsStore((s) => s.resultLimit)
  const { data: health, isLoading: healthLoading } = useHealthCheck()
  const isConnected = health?.connected === true

  const graphData = useMemo(() => {
    if (!mutation.data) return null
    return transformQueryResponse(mutation.data)
  }, [mutation.data])

  const nodeCount = graphData?.nodes.length ?? 0
  const edgeCount = graphData?.links.length ?? 0
  const isLimited = nodeCount >= resultLimit || edgeCount >= resultLimit
  const showDisconnected = !isConnected && !healthLoading && !graphData

  return (
    <AppShell>
      <CypherEditorPanel
        onRunQuery={(cypher) => mutation.mutate(cypher)}
        isRunning={mutation.isPending}
      />
      <QueryError error={mutation.error} />

      <div className="min-h-0 flex-1 transition-all duration-200">
        {graphData ? (
          <div className="flex h-full min-h-0 flex-col animate-in fade-in-0 duration-200">
            <ResultsBanner
              nodeCount={nodeCount}
              edgeCount={edgeCount}
              isLimited={isLimited}
              resultLimit={resultLimit}
              queryResponse={mutation.data}
            />
            <ResultsView graphData={graphData} />
          </div>
        ) : showDisconnected ? (
          <DisconnectedState />
        ) : (
          <ResultsEmptyState />
        )}
      </div>

      <PropertyPanel graphData={graphData} />
    </AppShell>
  )
}

export default App
