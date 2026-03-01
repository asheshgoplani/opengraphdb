import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Link } from 'react-router-dom'
import { getLabelColor } from '@/components/graph/NodeRenderer'
import { useGraphColors } from '@/components/graph/useGraphColors'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DatasetKey } from '@/data/datasets'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'

interface ShowcaseCardProps {
  datasetKey: DatasetKey
  name: string
  description: string
  nodeCount: number
  linkCount: number
  labels: string[]
  graphData: GraphData
}

interface HoveredNodeState {
  id: string | number
  title: string
  subtitle: string
}

function toNodeId(value: GraphEdge['source']): string | number | null {
  if (typeof value === 'object' && value !== null) {
    return value.id
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }
  return null
}

function pickNodeText(node: GraphNode): HoveredNodeState {
  const id = node.id
  const titleCandidate = node.properties?.name ?? node.properties?.title ?? node.properties?.holder
  const title = typeof titleCandidate === 'string' && titleCandidate.trim().length > 0 ? titleCandidate : String(node.id)
  const subtitle = node.labels?.[0] ?? node.label ?? 'Node'
  return { id, title, subtitle }
}

export function ShowcaseCard({
  datasetKey,
  name,
  description,
  nodeCount,
  linkCount,
  labels,
  graphData,
}: ShowcaseCardProps) {
  const colors = useGraphColors()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 420, height: 200 })
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeState | null>(null)
  const [cursor, setCursor] = useState({ x: 16, y: 16 })

  const labelIndex = useMemo(() => {
    const map = new Map<string, number>()
    labels.forEach((label, index) => {
      map.set(label, index)
    })
    return map
  }, [labels])

  const connections = useMemo(() => {
    const counts = new Map<string | number, number>()
    for (const link of graphData.links) {
      const sourceId = toNodeId(link.source)
      const targetId = toNodeId(link.target)

      if (sourceId !== null) {
        counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1)
      }
      if (targetId !== null) {
        counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
      }
    }
    return counts
  }, [graphData.links])

  const highlightedIds = useMemo(() => {
    if (!hoveredNode) {
      return { nodes: new Set<string | number>(), links: new Set<string | number>() }
    }

    const nodes = new Set<string | number>([hoveredNode.id])
    const links = new Set<string | number>()

    for (const link of graphData.links) {
      const sourceId = toNodeId(link.source)
      const targetId = toNodeId(link.target)
      if (sourceId === null || targetId === null) continue

      if (sourceId === hoveredNode.id || targetId === hoveredNode.id) {
        nodes.add(sourceId)
        nodes.add(targetId)
        links.add(link.id)
      }
    }

    return { nodes, links }
  }, [graphData.links, hoveredNode])

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width)
      setDimensions({ width: Math.max(width, 260), height: 200 })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node ? pickNodeText(node) : null)
  }, [])

  return (
    <Link
      to={`/playground?dataset=${datasetKey}`}
      className="group block focus-visible:outline-none"
      data-testid="showcase-card"
    >
      <Card className="h-full overflow-hidden border-border/80 transition-transform duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/10">
        <div
          ref={containerRef}
          className="relative h-[200px] border-b border-border/80 bg-gradient-to-b from-muted/30 via-muted/10 to-transparent"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setCursor({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            })
          }}
        >
          <ForceGraph2D<GraphNode, GraphEdge>
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="transparent"
            d3AlphaDecay={0.008}
            d3VelocityDecay={0.22}
            d3AlphaMin={0.003}
            enableNodeDrag={false}
            enableZoomInteraction={false}
            enablePanInteraction={false}
            nodeRelSize={1}
            linkWidth={1}
            linkColor={(link) => {
              if (!hoveredNode) return colors.edge
              return highlightedIds.links.has(link.id) ? 'rgba(99, 102, 241, 0.9)' : 'rgba(148, 163, 184, 0.25)'
            }}
            nodeCanvasObject={(node, ctx) => {
              const baseLabel = node.labels?.[0] ?? 'default'
              const nodeColor = getLabelColor(baseLabel, labelIndex)
              const connectionCount = connections.get(node.id) ?? 0
              const radius = 4 + Math.min(connectionCount * 0.2, 2)
              const x = node.x ?? 0
              const y = node.y ?? 0
              const isFocused = highlightedIds.nodes.has(node.id)

              ctx.save()
              if (hoveredNode && !isFocused) {
                ctx.globalAlpha = 0.35
              }

              ctx.beginPath()
              ctx.arc(x, y, radius, 0, 2 * Math.PI)
              ctx.fillStyle = nodeColor
              ctx.fill()
              ctx.shadowColor = nodeColor
              ctx.shadowBlur = 8
              ctx.fill()

              if (isFocused) {
                ctx.beginPath()
                ctx.arc(x, y, radius + 2.5, 0, 2 * Math.PI)
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)'
                ctx.lineWidth = 1.2
                ctx.stroke()
              }

              ctx.restore()
            }}
            nodeCanvasObjectMode={() => 'replace'}
            onNodeHover={handleNodeHover}
          />

          {hoveredNode ? (
            <div
              className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border border-border/60 bg-background/95 px-2.5 py-2 text-xs shadow-lg"
              style={{
                left: Math.min(cursor.x + 14, Math.max(dimensions.width - 220, 8)),
                top: Math.max(cursor.y - 14, 8),
              }}
            >
              <p className="font-medium text-foreground">{hoveredNode.title}</p>
              <p className="text-muted-foreground">{hoveredNode.subtitle}</p>
            </div>
          ) : null}
        </div>

        <CardHeader className="space-y-3 pb-3">
          <CardTitle className="text-xl">{name}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {nodeCount} nodes · {linkCount} relationships
          </p>

          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="gap-1.5 rounded-full px-2.5 py-1 text-[11px]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: getLabelColor(label, labelIndex) }}
                />
                {label}
              </Badge>
            ))}
          </div>

          <p className="inline-flex items-center text-sm font-medium text-primary transition-transform duration-200 group-hover:translate-x-1">
            Explore in Playground →
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
