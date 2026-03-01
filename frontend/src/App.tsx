import { useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PropertyPanel } from '@/components/layout/PropertyPanel'
import { QueryInput } from '@/components/query/QueryInput'
import { QueryError } from '@/components/query/QueryError'
import { ResultsView } from '@/components/results/ResultsView'
import { ResultsBanner } from '@/components/results/ResultsBanner'
import { useCypherQuery } from '@/api/queries'
import { transformQueryResponse } from '@/api/transform'
import { useSettingsStore } from '@/stores/settings'

function App() {
  const mutation = useCypherQuery()
  const resultLimit = useSettingsStore((s) => s.resultLimit)

  const graphData = useMemo(() => {
    if (!mutation.data) return null
    return transformQueryResponse(mutation.data)
  }, [mutation.data])

  const nodeCount = graphData?.nodes.length ?? 0
  const edgeCount = graphData?.links.length ?? 0
  const isLimited = nodeCount >= resultLimit || edgeCount >= resultLimit

  return (
    <AppShell>
      <QueryInput />
      <QueryError error={mutation.error} />

      {graphData ? (
        <>
          <ResultsBanner
            nodeCount={nodeCount}
            edgeCount={edgeCount}
            isLimited={isLimited}
            resultLimit={resultLimit}
          />
          <ResultsView graphData={graphData} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-lg">
              Run a query to see results
            </p>
            <code className="text-sm bg-muted px-3 py-1.5 rounded-md text-muted-foreground">
              MATCH (n) RETURN n LIMIT 25
            </code>
          </div>
        </div>
      )}

      <PropertyPanel graphData={graphData} />
    </AppShell>
  )
}

export default App
