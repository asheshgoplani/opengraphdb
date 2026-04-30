import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import { forceCollide } from 'd3-force'
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
import {
  type LabelBox,
  degreeMap,
  neighborSet,
  rectsOverlap,
  seedPositions,
  tuneForces,
} from './layout'
import { assignParallelCurvatures } from './parallelEdges'

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

const NODE_RADIUS = 5
const HALO_RADIUS = 14
const LABEL_FONT_SIZE = 11
const LABEL_FONT_SIZE_FOCUS = 13
const LABEL_PAD_X = 4
const LABEL_PAD_Y = 2
const LABEL_OFFSET_Y = 9
const MAX_LABEL_CHARS = 18

function truncate(s: string): string {
  return s.length > MAX_LABEL_CHARS ? `${s.slice(0, MAX_LABEL_CHARS - 1)}…` : s
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
    const baseLinks = graphData.links.map((l) => ({
      id: l.id,
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      type: l.type,
      properties: l.properties,
    }))
    // Parallel-edge curvature: fan out multi-edges between same endpoints.
    const links = assignParallelCurvatures(baseLinks) as unknown as RfgLink[]
    return { nodes, links }
  }, [graphData])

  const tuning = useMemo(() => tuneForces(graphData.nodes.length), [graphData.nodes.length])
  const degrees = useMemo(() => degreeMap(graphData), [graphData])

  // Drive d3 forces from our tuning. The ref is set after the first render,
  // so this effect runs after react-force-graph has wired its simulation.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const charge = fg.d3Force('charge') as
      | (ReturnType<typeof fg.d3Force> & {
          strength?: (s: number) => unknown
          distanceMax?: (d: number) => unknown
        })
      | undefined
    charge?.strength?.(tuning.chargeStrength)
    charge?.distanceMax?.(tuning.chargeDistanceMax)
    const link = fg.d3Force('link') as
      | (ReturnType<typeof fg.d3Force> & {
          distance?: (d: number) => unknown
          strength?: (s: (l: RfgLink) => number) => unknown
        })
      | undefined
    link?.distance?.(tuning.linkDistance)
    // Strength inversely proportional to min-degree of endpoints — high-
    // degree hubs pull less strongly so the layout doesn't collapse.
    link?.strength?.((l: RfgLink) => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source
      const tId = typeof l.target === 'object' ? l.target.id : l.target
      const sd = degrees.get(sId) ?? 1
      const td = degrees.get(tId) ?? 1
      return 1 / Math.max(1, Math.min(sd, td))
    })
    fg.d3Force('collide', forceCollide(tuning.collideRadius).strength(0.9).iterations(2))
    fg.d3ReheatSimulation?.()
  }, [tuning, degrees])

  const focused = hoveredNodeId ?? selectedNodeId ?? null
  const focusNeighbors = useMemo(
    () => (focused != null ? neighborSet(graphData, focused) : null),
    [focused, graphData],
  )

  // Each render frame we rebuild the visible-label list via collision pass.
  // The ref is published to window for E2E.
  const lastLabelBoxesRef = useRef<LabelBox[]>([])

  const lastHoverIdxRef = useRef<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      __obsidianGraphReady?: boolean
      __obsidianHoverNode?: (idx: number) => void
      __obsidianDimmedCount?: () => number
      __obsidianLabelBounds?: () => LabelBox[]
      __obsidianNodePositions?: () => Array<{ id: string | number; x: number; y: number }>
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
    w.__obsidianLabelBounds = () => lastLabelBoxesRef.current.slice()
    w.__obsidianNodePositions = () =>
      seeded.nodes
        .filter((n) => typeof n.x === 'number' && typeof n.y === 'number')
        .map((n) => ({ id: n.id, x: n.x as number, y: n.y as number }))
    return () => {
      delete w.__obsidianGraphReady
      delete w.__obsidianHoverNode
      delete w.__obsidianDimmedCount
      delete w.__obsidianLabelBounds
      delete w.__obsidianNodePositions
    }
  }, [onNodeHover, seeded.nodes, focusNeighbors, graphData])

  // Pass 1: nodes — radius scales with degree (log2(1+deg)); halos are
  // drawn only on hover/selection (Obsidian draws halos on focus only — this
  // is also a ~3× speedup vs glowing every node every frame).
  const drawNode = useCallback(
    (node: RfgNode, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const isFaded = focusNeighbors != null && !focusNeighbors.has(node.id)
      const isFocus = focused === node.id
      const alpha = isFaded ? 0.18 : 1
      ctx.save()
      ctx.globalAlpha = alpha
      const color = colorForLabel(node.labels?.[0], isDark)
      const deg = degrees.get(node.id) ?? 0
      const r = NODE_RADIUS + Math.min(7, Math.log2(1 + deg) * 1.6)
      if (isFocus) {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, HALO_RADIUS)
        grad.addColorStop(0, color)
        grad.addColorStop(0.55, color.replace(/\)$/, ' / 0.32)').replace('hsl', 'hsla'))
        grad.addColorStop(1, color.replace(/\)$/, ' / 0)').replace('hsl', 'hsla'))
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, HALO_RADIUS, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    },
    [degrees, focusNeighbors, focused, isDark],
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
      const sx = src.x ?? 0
      const sy = src.y ?? 0
      const tx = tgt.x ?? 0
      const ty = tgt.y ?? 0
      const curvature = (link as RfgLink & { curvature?: number }).curvature ?? 0
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
      ctx.moveTo(sx, sy)
      if (curvature === 0) {
        ctx.lineTo(tx, ty)
      } else {
        // Quadratic bezier with control point offset perpendicular to the
        // chord by `curvature * chord-length`.
        const mx = (sx + tx) / 2
        const my = (sy + ty) / 2
        const dx = tx - sx
        const dy = ty - sy
        const len = Math.sqrt(dx * dx + dy * dy) || 1
        const nx = -dy / len
        const ny = dx / len
        const cx = mx + nx * curvature * len
        const cy = my + ny * curvature * len
        ctx.quadraticCurveTo(cx, cy, tx, ty)
      }
      ctx.stroke()
      ctx.restore()
    },
    [focusNeighbors, focused, isDark],
  )

  // Pass 2: labels with collision detection. Highest-degree (and focused)
  // nodes get priority; later candidates that would overlap an already-placed
  // box are skipped. This is what gives the canvas the calm, Obsidian look.
  const drawLabels = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      const placed: LabelBox[] = []
      const nodes = seeded.nodes
      // Order: focused first, then highest-degree, then deterministic by id.
      const priority = [...nodes].sort((a, b) => {
        const fa = focused === a.id ? 1 : 0
        const fb = focused === b.id ? 1 : 0
        if (fa !== fb) return fb - fa
        const da = degrees.get(a.id) ?? 0
        const db = degrees.get(b.id) ?? 0
        if (da !== db) return db - da
        return String(a.id).localeCompare(String(b.id))
      })
      const fontFocus = LABEL_FONT_SIZE_FOCUS / globalScale
      const fontBase = LABEL_FONT_SIZE / globalScale
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const fillBase = isDark ? 'hsl(40 30% 96%)' : 'hsl(24 25% 11%)'
      const haloBase = isDark ? 'hsla(20 18% 6% / 0.55)' : 'hsla(40 25% 96% / 0.7)'
      for (const node of priority) {
        const isFocus = focused === node.id
        const isNeighborOfFocus = focusNeighbors?.has(node.id) === true && !isFocus
        // When a node is hovered, only draw labels of the focus + its neighbors.
        if (focused != null && !isFocus && !isNeighborOfFocus) continue
        const x = node.x ?? 0
        const y = node.y ?? 0
        const raw = (node.label ?? node.labels?.[0] ?? String(node.id)) as string
        const text = isFocus ? raw : truncate(raw)
        const font = isFocus ? fontFocus : fontBase
        ctx.font = `${font}px Inter, system-ui, sans-serif`
        const metrics = ctx.measureText(text)
        const w = metrics.width + LABEL_PAD_X * 2
        const h = font + LABEL_PAD_Y * 2
        const lx = x - w / 2
        const ly = y + LABEL_OFFSET_Y / globalScale
        const box: LabelBox = { x: lx, y: ly, w, h, id: node.id }
        // Skip if it would collide with anything already placed.
        if (!isFocus && placed.some((p) => rectsOverlap(p, box))) continue
        // Soft halo behind text for readability against edges/nodes.
        ctx.save()
        ctx.globalAlpha = focused != null && !isFocus && !isNeighborOfFocus ? 0.4 : 1
        ctx.fillStyle = haloBase
        ctx.beginPath()
        const radius = Math.min(4 / globalScale, h / 2)
        const rx = lx
        const ry = ly
        ctx.moveTo(rx + radius, ry)
        ctx.lineTo(rx + w - radius, ry)
        ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + radius)
        ctx.lineTo(rx + w, ry + h - radius)
        ctx.quadraticCurveTo(rx + w, ry + h, rx + w - radius, ry + h)
        ctx.lineTo(rx + radius, ry + h)
        ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - radius)
        ctx.lineTo(rx, ry + radius)
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry)
        ctx.fill()
        ctx.fillStyle = fillBase
        ctx.fillText(text, x, ly + LABEL_PAD_Y)
        ctx.restore()
        placed.push(box)
      }
      lastLabelBoxesRef.current = placed
    },
    [degrees, focusNeighbors, focused, isDark, seeded.nodes],
  )

  const onResetView = () => fgRef.current?.zoomToFit(400, 60)

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

  // Auto-fit once the simulation cools so the user doesn't see clipped nodes.
  const onEngineStop = useCallback(() => {
    fgRef.current?.zoomToFit(600, 60)
  }, [])

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ForceGraph2D<RfgNode, RfgLink>
        ref={fgRef}
        graphData={seeded}
        nodeRelSize={NODE_RADIUS}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={drawLink}
        linkCanvasObjectMode={() => 'replace'}
        linkCurvature={(l) => (l as RfgLink & { curvature?: number }).curvature ?? 0}
        cooldownTime={tuning.cooldownTime}
        cooldownTicks={200}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.35}
        warmupTicks={60}
        onEngineStop={onEngineStop}
        onRenderFramePost={drawLabels}
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
