import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'

const PALETTE = ['#7AA2FF', '#8B5CF6', '#22D3EE', '#F472B6', '#34D399', '#FBBF24']

function pseudoRandom(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function createHeroGraphData(nodeCount = 22, linkCount = 32): GraphData {
  const rand = pseudoRandom(1729)
  const nodes: GraphNode[] = Array.from({ length: nodeCount }, (_, index) => {
    const groupIdx = Math.floor(rand() * PALETTE.length)
    const label = String.fromCharCode(65 + groupIdx)
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
    const sourceIndex = Math.floor(rand() * nodeCount)
    const targetIndex = Math.floor(rand() * nodeCount)
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

function colorFor(label?: string) {
  if (!label) return PALETTE[0]
  const code = label.charCodeAt(0) - 65
  return PALETTE[Math.abs(code) % PALETTE.length]
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function HeroGraphBackground() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 720 })
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const graphData = useMemo(() => createHeroGraphData(reducedMotion ? 14 : 22, reducedMotion ? 18 : 32), [reducedMotion])

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
      className="hero-radial-mask pointer-events-none absolute inset-0 opacity-[0.85] animate-hero-shimmer motion-reduce:animate-none motion-reduce:opacity-60"
      aria-hidden="true"
    >
      <ForceGraph2D<GraphNode, GraphEdge>
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={1}
        linkWidth={0.6}
        linkColor={() => 'rgba(148, 163, 255, 0.28)'}
        linkDirectionalParticles={reducedMotion ? 0 : 1}
        linkDirectionalParticleWidth={1.4}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={() => 'rgba(180, 200, 255, 0.55)'}
        nodeCanvasObject={(node, ctx) => {
          const x = node.x ?? 0
          const y = node.y ?? 0
          const color = colorFor(node.labels?.[0])
          ctx.save()
          ctx.shadowColor = color
          ctx.shadowBlur = 18
          ctx.globalAlpha = 0.92
          ctx.beginPath()
          ctx.arc(x, y, 4.2, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.globalAlpha = 0.5
          ctx.beginPath()
          ctx.arc(x, y, 7.8, 0, 2 * Math.PI)
          ctx.strokeStyle = color
          ctx.lineWidth = 0.6
          ctx.stroke()
          ctx.restore()
        }}
        nodeCanvasObjectMode={() => 'replace'}
        d3AlphaDecay={reducedMotion ? 0.05 : 0.005}
        d3AlphaMin={0.001}
        d3VelocityDecay={0.2}
        cooldownTime={reducedMotion ? 1500 : 14000}
        enableNodeDrag={false}
        enableZoomInteraction={false}
        enablePanInteraction={false}
      />
    </div>
  )
}
