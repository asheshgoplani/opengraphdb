import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { getLabelColor } from '@/components/graph/NodeRenderer'

const HERO_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

function createHeroGraphData(nodeCount = 10, linkCount = 14): GraphData {
  const nodes: GraphNode[] = Array.from({ length: nodeCount }, (_, index) => {
    const label = HERO_LABELS[index % HERO_LABELS.length]
    return {
      id: `hero-${index}`,
      labels: [label],
      label,
      properties: { name: label },
    }
  })

  const links: GraphEdge[] = []
  const seen = new Set<string>()

  while (links.length < linkCount) {
    const sourceIndex = Math.floor(Math.random() * nodeCount)
    const targetIndex = Math.floor(Math.random() * nodeCount)
    if (sourceIndex === targetIndex) continue

    const key = `${Math.min(sourceIndex, targetIndex)}-${Math.max(sourceIndex, targetIndex)}`
    if (seen.has(key)) continue

    seen.add(key)
    links.push({
      id: `hero-link-${links.length}`,
      source: nodes[sourceIndex].id,
      target: nodes[targetIndex].id,
      type: 'CONNECTS',
      properties: {},
    })
  }

  return { nodes, links }
}

export function HeroGraphBackground() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 960, height: 520 })
  const graphData = useMemo(() => createHeroGraphData(10, 14), [])

  const labelIndex = useMemo(() => {
    const map = new Map<string, number>()
    graphData.nodes.forEach((node) => {
      const label = node.labels?.[0]
      if (label && !map.has(label)) {
        map.set(label, map.size)
      }
    })
    return map
  }, [graphData.nodes])

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width)
      const height = Math.floor(entry.contentRect.height)
      setDimensions({ width: Math.max(width, 320), height: Math.max(height, 320) })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 opacity-20 dark:opacity-[0.15]"
      aria-hidden="true"
    >
      <ForceGraph2D<GraphNode, GraphEdge>
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeRelSize={1}
        linkWidth={0.5}
        linkColor={() => 'rgba(100, 116, 139, 0.32)'}
        nodeCanvasObject={(node, ctx) => {
          const x = node.x ?? 0
          const y = node.y ?? 0
          const nodeColor = getLabelColor(node.labels?.[0] ?? 'default', labelIndex)

          ctx.save()
          ctx.shadowColor = nodeColor
          ctx.shadowBlur = 10
          ctx.globalAlpha = 0.9
          ctx.beginPath()
          ctx.arc(x, y, 3.8, 0, 2 * Math.PI)
          ctx.fillStyle = nodeColor
          ctx.fill()
          ctx.restore()
        }}
        nodeCanvasObjectMode={() => 'replace'}
        d3AlphaDecay={0.005}
        d3AlphaMin={0.001}
        d3VelocityDecay={0.15}
        enableNodeDrag={false}
        enableZoomInteraction={false}
        enablePanInteraction={false}
      />
    </div>
  )
}
