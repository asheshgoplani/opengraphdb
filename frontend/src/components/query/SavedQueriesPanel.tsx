import { Bookmark, Play, Trash2 } from 'lucide-react'
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

export function SavedQueriesPanel() {
  const savedQueries = useQueryHistoryStore((s) => s.savedQueries)
  const removeSavedQuery = useQueryHistoryStore((s) => s.removeSavedQuery)
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)

  const handleLoadQuery = (query: string) => {
    setCurrentQuery(query)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Saved queries">
          <Bookmark className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[350px] sm:w-[400px]">
        <div className="flex h-full flex-col gap-4 pt-4">
          <SheetHeader>
            <SheetTitle>Saved Queries</SheetTitle>
            <SheetDescription>Your bookmarked queries.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            {savedQueries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No saved queries
              </div>
            ) : (
              <div className="space-y-1">
                {savedQueries.map((savedQuery) => (
                  <div
                    key={savedQuery.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{savedQuery.name}</p>
                      <code className="line-clamp-1 text-xs text-muted-foreground">
                        {savedQuery.query}
                      </code>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Load query"
                      onClick={() => handleLoadQuery(savedQuery.query)}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Delete saved query"
                      onClick={() => removeSavedQuery(savedQuery.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
