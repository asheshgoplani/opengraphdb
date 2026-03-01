import { AppShell } from '@/components/layout/AppShell'

function App() {
  return (
    <AppShell>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground text-lg">Run a query to see results</p>
          <code className="text-sm bg-muted px-3 py-1.5 rounded-md text-muted-foreground">
            MATCH (n) RETURN n LIMIT 25
          </code>
        </div>
      </div>
    </AppShell>
  )
}

export default App
