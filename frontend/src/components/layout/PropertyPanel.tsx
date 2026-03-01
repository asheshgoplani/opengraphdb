import {
  Sheet,
  SheetContent,
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && clearSelection()}>
      <SheetContent side="right" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isNode ? (
              <>
                <span className="text-muted-foreground text-sm">Node</span>
                {selectedNode?.labels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
              </>
            ) : selectedEdge ? (
              <>
                <span className="text-muted-foreground text-sm">Edge</span>
                <Badge variant="outline">{selectedEdge.type}</Badge>
              </>
            ) : null}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-1">
          <div className="grid grid-cols-[120px_1fr] gap-1 text-sm">
            <span className="text-muted-foreground font-medium">ID</span>
            <span className="break-all">{element?.id}</span>
          </div>
          {Object.entries(properties).map(([key, value]) => (
            <div
              key={key}
              className="grid grid-cols-[120px_1fr] gap-1 text-sm border-t pt-1"
            >
              <span className="text-muted-foreground font-medium truncate">
                {key}
              </span>
              <span className="break-all">{formatValue(value)}</span>
            </div>
          ))}
          {Object.keys(properties).length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No properties
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
