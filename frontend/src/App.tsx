import { useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { QueryInput } from '@/components/query/QueryInput'
import { QueryError } from '@/components/query/QueryError'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { useCypherQuery } from '@/api/queries'
import { transformQueryResponse } from '@/api/transform'

function App() {
  const mutation = useCypherQuery()

  const graphData = useMemo(() => {
    if (!mutation.data) return null
    return transformQueryResponse(mutation.data)
  }, [mutation.data])

  return (
    <AppShell>
      <QueryInput />
      <QueryError error={mutation.error} />
      {graphData ? (
        <div className="flex-1 overflow-hidden">
          <GraphCanvas graphData={graphData} />
        </div>
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
    </AppShell>
  )
}

export default App
