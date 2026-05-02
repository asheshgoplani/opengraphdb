import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
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
  EDGE_WIDTH_BASE,
  EDGE_WIDTH_FOCUS,
  colorForLabel,
} from './colors'
import {
  type LabelBox,
  compareLabelPriority,
  degreeMap,
  kHopNeighbors,
  neighborSet,
  rectsOverlap,
  seedPositions,
  tuneForces,
} from './layout'
import { assignParallelCurvatures } from './parallelEdges'
import { pickTooltipProps } from './tooltip'

interface Props {
  graphData: GraphData
  onNodeClick?: (n: GraphNode) => void
  onNodeHover?: (n: GraphNode | null) => void
  onBackgroundClick?: () => void
  hoveredNodeId?: string | number | null
  selectedNodeId?: string | number | null
  // Deterministic-by-dataset label→index map. When supplied, distinct
  // labels are guaranteed distinct palette slots up to palette length —
  // eliminating hash collisions that previously left e.g. Movie + Person
  // landing on the same amber slot.
  labelIndex?: Map<string, number>
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
// Zoom clamps (POLISH #4). Lower bound prevents over-zoom-out past ~2× the
// fitted bounding box (a fully-fitted graph sits around scale ≈ 1; 0.4 lets
// the user zoom out a bit for context but not so far the graph is a speck).
// Upper bound caps over-zoom — past 8× a single node fills the viewport and
// labels start clipping. Both are pointer-event clamps in RFG2 (does not
// affect programmatic `zoomToFit` calls).
const MIN_ZOOM = 0.4
const MAX_ZOOM = 8

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
  labelIndex,
}: Props) {
  const fgRef = useRef<ForceGraphMethods<RfgNode, RfgLink> | undefined>(undefined)
  // Tooltip overlay state (POLISH #2). Tracks node + screen-space coords.
  const [tooltip, setTooltip] = useState<{
    node: RfgNode
    x: number
    y: number
  } | null>(null)
  // Internal sticky-focus id (POLISH #3). Set on tap/click so the
  // neighbourhood fade persists on touch devices even when the parent
  // doesn't wire `selectedNodeId`. Cleared on background tap.
  const [stickyFocusId, setStickyFocusId] = useState<string | number | null>(null)
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

  const focused = hoveredNodeId ?? selectedNodeId ?? stickyFocusId ?? null
  const focusNeighbors = useMemo(
    () => (focused != null ? neighborSet(graphData, focused) : null),
    [focused, graphData],
  )
  // 2-hop tier: descending opacity from focus → 1-hop → 2-hop → rest
  // (POLISH #5). BFS computed once per focus change.
  const focusHops = useMemo(
    () => (focused != null ? kHopNeighbors(graphData, focused, 2) : null),
    [focused, graphData],
  )

  // Each render frame we rebuild the visible-label list via collision pass.
  // The ref is published to window for E2E.
  const lastLabelBoxesRef = useRef<LabelBox[]>([])
  // Pointer position relative to the container (POLISH #2). Declared here
  // so the harness hook below can also place the tooltip.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)

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
      const node = seeded.nodes[idx]
      onNodeHover?.(node as GraphNode)
      // Mirror the React handler: also drive the tooltip overlay from the
      // harness. If pointer position isn't known (no preceding mousemove),
      // place the tooltip at the canvas centre via fallback so E2E tests
      // can observe its presence.
      if (node) {
        const p = lastPointerRef.current ?? { x: 0, y: 0 }
        setTooltip({ node, x: p.x, y: p.y })
      } else {
        setTooltip(null)
      }
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
      const isFocus = focused === node.id
      // 3-tier fade: 1.0 (focus + 1-hop) / 0.5 (2-hop) / 0.18 (rest).
      // Binary fade was too abrupt; the middle tier reads as topology.
      let alpha = 1
      if (focusHops != null) {
        const hop = focusHops.get(node.id)
        if (hop == null) alpha = 0.18
        else if (hop === 2) alpha = 0.5
      }
      ctx.save()
      ctx.globalAlpha = alpha
      const color = colorForLabel(node.labels?.[0], isDark, labelIndex)
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
    [degrees, focusHops, focused, isDark, labelIndex],
  )

  const drawLink = useCallback(
    (link: RfgLink, ctx: CanvasRenderingContext2D) => {
      const src = link.source
      const tgt = link.target
      if (typeof src !== 'object' || typeof tgt !== 'object') return
      const sId = src.id
      const tId = tgt.id
      // 3-tier edge fade: 1.0 if both endpoints are focus/1-hop;
      // 0.3 if both endpoints are within 2-hop (the "ripple" tier);
      // 0.06 otherwise. Bridging exactly one boundary still fades to keep
      // the focus neighbourhood visually distinct.
      let edgeAlpha = 1
      if (focusHops != null && sId != null && tId != null) {
        const sh = focusHops.get(sId)
        const th = focusHops.get(tId)
        if (sh == null || th == null) {
          edgeAlpha = 0.06
        } else if (Math.max(sh, th) >= 2) {
          edgeAlpha = 0.3
        }
      }
      const sx = src.x ?? 0
      const sy = src.y ?? 0
      const tx = tgt.x ?? 0
      const ty = tgt.y ?? 0
      const curvature = (link as RfgLink & { curvature?: number }).curvature ?? 0
      ctx.save()
      ctx.globalAlpha = edgeAlpha
      const isFocusEdge = focused != null && (sId === focused || tId === focused)
      ctx.strokeStyle = isFocusEdge
        ? isDark
          ? EDGE_HOVER_DARK
          : EDGE_HOVER_LIGHT
        : isDark
          ? EDGE_COLOR_DARK
          : EDGE_COLOR_LIGHT
      ctx.lineWidth = isFocusEdge ? EDGE_WIDTH_FOCUS : EDGE_WIDTH_BASE
      ctx.lineCap = 'round'
      // Subtle glow on focus edges (canvas shadowBlur). Skipped for
      // non-focus edges — shadowBlur is the single most expensive 2D
      // canvas op and we redraw every link every frame.
      if (isFocusEdge) {
        ctx.shadowColor = isDark ? EDGE_HOVER_DARK : EDGE_HOVER_LIGHT
        ctx.shadowBlur = 4
      }
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
    [focusHops, focused, isDark],
  )

  // Pass 2: labels with collision detection. Priority order is
  // focused → highest-degree → deterministic-by-id (POLISH #1, via
  // `compareLabelPriority`). The focused label is always placed first AND
  // its placement skips the collision check, so a hub label that arrived
  // earlier in priority order can never hide it.
  const drawLabels = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      const placed: LabelBox[] = []
      const nodes = seeded.nodes
      const priority = [...nodes].sort((a, b) =>
        compareLabelPriority(a, b, focused, degrees),
      )
      const fontFocus = LABEL_FONT_SIZE_FOCUS / globalScale
      const fontBase = LABEL_FONT_SIZE / globalScale
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const fillBase = isDark ? 'hsl(40 30% 96%)' : 'hsl(24 25% 11%)'
      const haloBase = isDark ? 'hsla(20 18% 6% / 0.55)' : 'hsla(40 25% 96% / 0.7)'
      const drawOne = (node: RfgNode, opts: { skipCollision: boolean }) => {
        const isFocus = focused === node.id
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
        if (!opts.skipCollision && placed.some((p) => rectsOverlap(p, box))) {
          return
        }
        ctx.save()
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
      // 1) Focused label first, unconditional — never hidden by collisions.
      if (focused != null) {
        const focusedNode = nodes.find((n) => n.id === focused)
        if (focusedNode) drawOne(focusedNode, { skipCollision: true })
      }
      // 2) Remaining labels in priority order. When a focus exists, only
      // draw labels of focus + its 1-hop neighbours (2-hop stays unlabelled
      // to keep the focus neighbourhood readable).
      for (const node of priority) {
        if (focused != null && node.id === focused) continue
        const isNeighborOfFocus = focusNeighbors?.has(node.id) === true
        if (focused != null && !isNeighborOfFocus) continue
        drawOne(node, { skipCollision: false })
      }
      lastLabelBoxesRef.current = placed
    },
    [degrees, focused, focusNeighbors, isDark, seeded.nodes],
  )

  const onResetView = () => fgRef.current?.zoomToFit(400, 60)

  // Tooltip + sticky-touch handlers (POLISH #2 + #3).
  // RFG2's `onNodeHover` second arg is the previously-hovered node; the
  // pointer position is read from the latest mousemove on the container.
  const containerRefSetTooltip = useCallback(
    (n: RfgNode | null) => {
      if (!n || lastPointerRef.current == null) {
        setTooltip(null)
        return
      }
      setTooltip({ node: n, x: lastPointerRef.current.x, y: lastPointerRef.current.y })
    },
    [],
  )
  const handleNodeHover = useCallback(
    (n: RfgNode | null) => {
      onNodeHover?.((n as GraphNode | null) ?? null)
      containerRefSetTooltip(n)
    },
    [onNodeHover, containerRefSetTooltip],
  )
  const handleNodeClick = useCallback(
    (n: RfgNode) => {
      // Set internal sticky-focus so touch tap-and-release persists fade
      // even when the parent doesn't wire `selectedNodeId`.
      setStickyFocusId(n.id)
      onNodeClick?.(n as GraphNode)
    },
    [onNodeClick],
  )
  const handleBackgroundClick = useCallback(() => {
    setStickyFocusId(null)
    setTooltip(null)
    onBackgroundClick?.()
  }, [onBackgroundClick])

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

  // Track pointer position for the tooltip + ensure tap-and-release on
  // touch (no preceding `mousemove`) still positions the tooltip.
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    lastPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  // Tooltip body. Picks 1–2 properties from a curated key list so we
  // never dump arbitrary internal keys (e.g. `__seed`, `cluster`) at the user.
  const tooltipBody = tooltip
    ? (() => {
        const n = tooltip.node
        const labelText = (n.label ?? n.labels?.[0] ?? String(n.id)) as string
        const deg = degrees.get(n.id) ?? 0
        const props = pickTooltipProps(n.properties)
        return { labelText, deg, props }
      })()
    : null

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onPointerMove={onPointerMove}
    >
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
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onEngineStop={onEngineStop}
        onRenderFramePost={drawLabels}
        onNodeClick={(n) => handleNodeClick(n as RfgNode)}
        onNodeHover={(n) => handleNodeHover((n as RfgNode | null) ?? null)}
        onBackgroundClick={handleBackgroundClick}
        backgroundColor="transparent"
      />
      {tooltipBody ? (
        <div
          role="tooltip"
          data-testid="obsidian-node-tooltip"
          className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border border-border/60 bg-background/95 px-2.5 py-1.5 text-xs shadow-md backdrop-blur"
          style={{
            left: Math.round(tooltip!.x + 12),
            top: Math.round(tooltip!.y + 12),
          }}
        >
          <div className="font-medium text-foreground">{tooltipBody.labelText}</div>
          <div className="text-muted-foreground">degree: {tooltipBody.deg}</div>
          {tooltipBody.props.map(([k, v]) => (
            <div key={k} className="truncate text-muted-foreground">
              <span className="font-mono">{k}</span>: {v}
            </div>
          ))}
        </div>
      ) : null}
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
