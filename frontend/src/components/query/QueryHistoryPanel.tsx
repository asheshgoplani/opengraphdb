import { Clock, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useQueryHistoryStore } from '@/stores/queryHistory'
import { useQueryStore } from '@/stores/query'

export function QueryHistoryPanel() {
  const history = useQueryHistoryStore((s) => s.history)
  const clearHistory = useQueryHistoryStore((s) => s.clearHistory)
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)

  const handleLoadQuery = (query: string) => {
    setCurrentQuery(query)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Query history">
          <Clock className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[350px] sm:w-[400px]">
        <div className="flex h-full flex-col gap-4 pt-4">
          <SheetHeader>
            <SheetTitle>Query History</SheetTitle>
            <SheetDescription>
              Recent queries, newest first. Click to load into editor.
            </SheetDescription>
          </SheetHeader>

          {history.length > 0 ? (
            <Button variant="outline" size="sm" onClick={clearHistory}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear History
            </Button>
          ) : null}

          <div className="flex-1 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No queries yet
              </div>
            ) : (
              <div className="space-y-1">
                {history.map((query, index) => (
                  <div
                    key={`${query}-${index}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <code className="line-clamp-2 flex-1 text-xs text-muted-foreground">
                      {query}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Load query"
                      onClick={() => handleLoadQuery(query)}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
