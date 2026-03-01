import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useGraphStore } from '@/stores/graph'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'

interface PropertyPanelProps {
  graphData: GraphData | null
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function PropertyPanel({ graphData }: PropertyPanelProps) {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId)
  const clearSelection = useGraphStore((s) => s.clearSelection)

  const isOpen = selectedNodeId !== null || selectedEdgeId !== null

  const selectedNode: GraphNode | undefined = selectedNodeId !== null
    ? graphData?.nodes.find((n) => n.id === selectedNodeId)
    : undefined

  const selectedEdge: GraphEdge | undefined = selectedEdgeId !== null
    ? graphData?.links.find((e) => {
        const edgeId = typeof e.id !== 'undefined' ? e.id : null
        return edgeId === selectedEdgeId
      })
    : undefined

  const element = selectedNode || selectedEdge
  const isNode = !!selectedNode
  const properties = element?.properties || {}
  const hasProperties = Object.keys(properties).length > 0

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && clearSelection()}>
      <SheetContent
        side="right"
        className="w-[360px] overflow-y-auto border-l bg-card/85 backdrop-blur-md sm:max-w-md"
      >
        <SheetHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={isNode ? 'default' : 'outline'}
              className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide"
            >
              {isNode ? 'Node' : 'Edge'}
            </Badge>
            {isNode
              ? selectedNode?.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="rounded-full">
                    {label}
                  </Badge>
                ))
              : selectedEdge ? <Badge variant="secondary">{selectedEdge.type}</Badge> : null}
          </div>
          <SheetTitle className="text-base">Properties</SheetTitle>
          <SheetDescription>
            Inspect key-value metadata for the currently selected element.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-3">
          {!element ? (
            <div
              className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
            >
              Click a node or edge to view properties
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-background/40">
              <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-4 py-3 text-sm">
                <span className="font-medium text-muted-foreground">ID</span>
                <span className="break-all text-foreground">{element.id}</span>
              </div>
              {Object.entries(properties).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[120px_1fr] gap-3 border-b px-4 py-3 text-sm last:border-b-0"
                >
                  <span className="truncate font-medium text-muted-foreground">{key}</span>
                  <span className="break-all text-foreground">{formatValue(value)}</span>
                </div>
              ))}
              {!hasProperties ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  No properties available.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
