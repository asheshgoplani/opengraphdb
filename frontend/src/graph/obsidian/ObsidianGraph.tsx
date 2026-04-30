import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import { Compass } from 'lucide-react'
import type { GraphData, GraphNode } from '@/types/graph'
import { Button } from '@/components/ui/button'
import {
  EDGE_COLOR_DARK,
  EDGE_COLOR_LIGHT,
  EDGE_HOVER_DARK,
  EDGE_HOVER_LIGHT,
  colorForLabel,
} from './colors'
import { neighborSet, seedPositions } from './layout'

interface Props {
  graphData: GraphData
  onNodeClick?: (n: GraphNode) => void
  onNodeHover?: (n: GraphNode | null) => void
  onBackgroundClick?: () => void
  hoveredNodeId?: string | number | null
  selectedNodeId?: string | number | null
}

type RfgNode = GraphNode & { x?: number; y?: number }
type RfgLink = {
  id?: string | number
  source: string | number | RfgNode
  target: string | number | RfgNode
  [k: string]: unknown
}

export function ObsidianGraph({
  graphData,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
  hoveredNodeId,
  selectedNodeId,
}: Props) {
  const fgRef = useRef<ForceGraphMethods<RfgNode, RfgLink> | undefined>(undefined)
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')),
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const seeded = useMemo(() => {
    const seed = seedPositions(graphData)
    const nodes: RfgNode[] = graphData.nodes.map((n) => ({
      ...n,
      x: seed.get(n.id)?.x,
      y: seed.get(n.id)?.y,
    }))
    const links: RfgLink[] = graphData.links.map((l) => ({
      id: l.id,
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      type: l.type,
      properties: l.properties,
    }))
    return { nodes, links }
  }, [graphData])

  const focused = hoveredNodeId ?? selectedNodeId ?? null
  const focusNeighbors = useMemo(
    () => (focused != null ? neighborSet(graphData, focused) : null),
    [focused, graphData],
  )

  // Test hooks for E2E. __obsidianDimmedCount is derived from the most recent
  // hover index synchronously (not from React state) so the test can read it
  // immediately after calling __obsidianHoverNode without waiting for a render.
  const lastHoverIdxRef = useRef<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      __obsidianGraphReady?: boolean
      __obsidianHoverNode?: (idx: number) => void
      __obsidianDimmedCount?: () => number
    }
    w.__obsidianGraphReady = true
    w.__obsidianHoverNode = (idx) => {
      lastHoverIdxRef.current = idx
      onNodeHover?.(seeded.nodes[idx] as GraphNode)
    }
    w.__obsidianDimmedCount = () => {
      const idx = lastHoverIdxRef.current
      if (idx != null) {
        const node = seeded.nodes[idx]
        if (!node) return 0
        const ns = neighborSet(graphData, node.id)
        return seeded.nodes.length - ns.size
      }
      return focusNeighbors ? seeded.nodes.length - focusNeighbors.size : 0
    }
    return () => {
      delete w.__obsidianGraphReady
      delete w.__obsidianHoverNode
      delete w.__obsidianDimmedCount
    }
  }, [onNodeHover, seeded.nodes, focusNeighbors, graphData])

  const drawNode = useCallback(
    (node: RfgNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const isFaded = focusNeighbors != null && !focusNeighbors.has(node.id)
      const alpha = isFaded ? 0.18 : 1
      ctx.save()
      ctx.globalAlpha = alpha
      const color = colorForLabel(node.labels?.[0], isDark)
      const haloR = 14
      const grad = ctx.createRadialGradient(x, y, 0, x, y, haloR)
      grad.addColorStop(0, color)
      grad.addColorStop(0.6, color.replace(/\)$/, ' / 0.25)').replace('hsl', 'hsla'))
      grad.addColorStop(1, color.replace(/\)$/, ' / 0)').replace('hsl', 'hsla'))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, haloR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
      const label = (node.label ?? node.labels?.[0] ?? String(node.id)) as string
      if (globalScale > 1.4 || focused === node.id) {
        ctx.font = `${focused === node.id ? 12 : 10}px Inter, system-ui, sans-serif`
        ctx.fillStyle = isDark ? 'hsl(40 30% 96%)' : 'hsl(24 25% 11%)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, x, y + 9)
      }
      ctx.restore()
    },
    [focusNeighbors, focused, isDark],
  )

  const drawLink = useCallback(
    (link: RfgLink, ctx: CanvasRenderingContext2D) => {
      const src = link.source
      const tgt = link.target
      if (typeof src !== 'object' || typeof tgt !== 'object') return
      const sId = src.id
      const tId = tgt.id
      const isFaded =
        focusNeighbors != null &&
        sId != null &&
        tId != null &&
        !(focusNeighbors.has(sId) && focusNeighbors.has(tId))
      ctx.save()
      ctx.globalAlpha = isFaded ? 0.06 : 1
      ctx.strokeStyle =
        focused != null && (sId === focused || tId === focused)
          ? isDark
            ? EDGE_HOVER_DARK
            : EDGE_HOVER_LIGHT
          : isDark
            ? EDGE_COLOR_DARK
            : EDGE_COLOR_LIGHT
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(src.x ?? 0, src.y ?? 0)
      ctx.lineTo(tgt.x ?? 0, tgt.y ?? 0)
      ctx.stroke()
      ctx.restore()
    },
    [focusNeighbors, focused, isDark],
  )

  const onResetView = () => fgRef.current?.zoomToFit(400, 40)

  const containerRef = useRef<HTMLDivElement | null>(null)
  // react-force-graph doesn't expose a way to set attributes on its <canvas>,
  // so we tag it via DOM query after each render for E2E selectors.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const tag = () => {
      const el = root.querySelector('canvas')
      if (el && !el.dataset.graph) el.dataset.graph = 'obsidian'
    }
    tag()
    const obs = new MutationObserver(tag)
    obs.observe(root, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ForceGraph2D<RfgNode, RfgLink>
        ref={fgRef}
        graphData={seeded}
        nodeRelSize={5}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={drawLink}
        linkCanvasObjectMode={() => 'replace'}
        cooldownTime={4000}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
        warmupTicks={50}
        onNodeClick={(n) => onNodeClick?.(n as GraphNode)}
        onNodeHover={(n) => onNodeHover?.((n as GraphNode | null) ?? null)}
        onBackgroundClick={() => onBackgroundClick?.()}
        backgroundColor="transparent"
      />
      <div className="pointer-events-none absolute right-3 top-3 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Reset view"
          onClick={onResetView}
          className="pointer-events-auto h-8 w-8 p-0"
        >
          <Compass className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
