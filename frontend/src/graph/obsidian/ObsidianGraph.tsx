import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import { forceCollide } from 'd3-force'
import { Compass } from 'lucide-react'
import type { GraphData, GraphNode } from '@/types/graph'
import { Button } from '@/components/ui/button'
import { applyEdgeStrokeStyle, colorForLabel } from './colors'
import { drawGlowHalo, GLOW_RADIUS_MULT_BASE, pickGlowTier } from './glow'
import {
  type LabelBox,
  HUB_LABEL_BG_RGBA,
  HUB_LABEL_FG,
  HUB_LABEL_FONT_SIZE,
  HUB_LABEL_PAD_X,
  HUB_LABEL_PAD_Y,
  HUB_LABEL_RADIUS,
  TOP_HUB_LABELS_DEFAULT,
  compareLabelPriority,
  degreeMap,
  kHopNeighbors,
  neighborSet,
  rectsOverlap,
  seedPositions,
  topHubsByDegree,
  tuneForces,
} from './layout'
import { assignParallelCurvatures } from './parallelEdges'
import { pickTooltipProps } from './tooltip'
import {
  EASE_STANDARD,
  ENTRY_DOLLY_MS,
  ENTRY_DOLLY_OVERZOOM_OUT,
  heartbeatScale,
  prefersReducedMotion,
} from './tween'

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
  // Phase-1 GLOW — top-N hub set drives the always-on accent halo. The
  // set is precomputed once per dataset / degree change so `pickGlowTier`
  // can do an O(1) hub-membership check per draw call. Reuses the same
  // TOP_HUB_LABELS_DEFAULT count as the always-on hub-label pinning so
  // "what glows by default" matches "what is labelled by default".
  const glowHubSet = useMemo(() => {
    const ids = topHubsByDegree(graphData, degrees, TOP_HUB_LABELS_DEFAULT)
    return new Set<string | number>(ids)
  }, [graphData, degrees])

  // Each render frame we rebuild the visible-label list via collision pass.
  // The ref is published to window for E2E.
  const lastLabelBoxesRef = useRef<LabelBox[]>([])
  // Pointer position relative to the container (POLISH #2). Declared here
  // so the harness hook below can also place the tooltip.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)

  // Phase-2 PULSE — heartbeat / dolly / drift state. Refs (not state) so
  // the RAF loops mutate without re-rendering the whole graph.
  const heartbeatStartRef = useRef<number | null>(null)
  const dollyActiveRef = useRef<boolean>(false)
  const driftActiveRef = useRef<boolean>(false)

  const lastHoverIdxRef = useRef<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      __obsidianGraphReady?: boolean
      __obsidianHoverNode?: (idx: number) => void
      __obsidianFocusNode?: (idx: number | null) => void
      __obsidianDimmedCount?: () => number
      __obsidianLabelBounds?: () => LabelBox[]
      __obsidianNodePositions?: () => Array<{ id: string | number; x: number; y: number }>
      __obsidianFitCount?: () => number
      __obsidianEntryAnimated?: () => boolean
      __obsidianEntryFocusId?: () => string | number | null
      __obsidianCameraScale?: () => number | null
      __obsidianFocusedHaloRadius?: () => number | null
      __obsidianDollyActive?: () => boolean
      __obsidianDriftActive?: () => boolean
      __obsidianGraphToScreen?: (x: number, y: number) => { x: number; y: number } | null
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
    // Phase-2 harness: drive the focus-tier (sticky) state from tests so
    // the heartbeat pulse fires without needing a synthesised click.
    w.__obsidianFocusNode = (idx) => {
      if (idx == null) {
        setStickyFocusId(null)
        return
      }
      const node = seeded.nodes[idx]
      if (node) setStickyFocusId(node.id)
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
    w.__obsidianFitCount = () => fitCountRef.current
    w.__obsidianEntryAnimated = () => hasFittedRef.current
    // Phase-2 replaces the hub-focus entry dolly with auto-fit-to-viewport,
    // so no entry hub is selected. The harness still exists for callers that
    // sniff the previous behaviour; it now reports null.
    w.__obsidianEntryFocusId = () => null
    // Phase-2 PULSE harness — read the current camera zoom (so a test can
    // sample two values across the dolly window and assert progression),
    // and the current halo radius for the focused node (so the heartbeat
    // can be observed without pixel-sampling the canvas).
    w.__obsidianCameraScale = () => fgRef.current?.zoom() ?? null
    w.__obsidianFocusedHaloRadius = () => {
      const focusId = selectedNodeId ?? stickyFocusId ?? null
      if (focusId == null) return null
      const node = seeded.nodes.find((n) => n.id === focusId)
      if (!node) return null
      const deg = degrees.get(node.id) ?? 0
      const r = NODE_RADIUS + Math.min(7, Math.log2(1 + deg) * 1.6)
      const baseHalo = r * GLOW_RADIUS_MULT_BASE
      if (prefersReducedMotion()) return baseHalo
      const start = heartbeatStartRef.current
      if (start == null) return baseHalo
      return baseHalo * heartbeatScale(performance.now() - start)
    }
    w.__obsidianDollyActive = () => dollyActiveRef.current
    w.__obsidianDriftActive = () => driftActiveRef.current
    // World→screen helper (delegates to react-force-graph's internal
    // transform). Phase-2 PULSE moves the entry camera off the top hub
    // and onto the graph centroid, so existing pixel-sampling tests
    // can no longer assume a haloed node at canvas centre — they look
    // up the focused node's screen position via this hook instead.
    w.__obsidianGraphToScreen = (x: number, y: number) => {
      const fg = fgRef.current
      if (!fg) return null
      return fg.graph2ScreenCoords(x, y)
    }
    return () => {
      delete w.__obsidianGraphReady
      delete w.__obsidianHoverNode
      delete w.__obsidianFocusNode
      delete w.__obsidianDimmedCount
      delete w.__obsidianLabelBounds
      delete w.__obsidianNodePositions
      delete w.__obsidianFitCount
      delete w.__obsidianEntryAnimated
      delete w.__obsidianEntryFocusId
      delete w.__obsidianCameraScale
      delete w.__obsidianFocusedHaloRadius
      delete w.__obsidianDollyActive
      delete w.__obsidianDriftActive
      delete w.__obsidianGraphToScreen
    }
  }, [
    onNodeHover,
    seeded.nodes,
    focusNeighbors,
    graphData,
    degrees,
    selectedNodeId,
    stickyFocusId,
  ])

  // Pass 1: nodes — radius scales with degree (log2(1+deg)); halos are
  // selective per Phase-1 GLOW: focus / hover / top-N hub light up,
  // leaves stay matte. The 'lighter' composite inside drawGlowHalo means
  // overlapping halos additively brighten instead of overpainting.
  // Phase-2 PULSE: the focus-tier halo radius is scaled by a 1Hz sine
  // (heartbeatScale) so the focused hub appears to breathe.
  const drawNode = useCallback(
    (node: RfgNode, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
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
      const tier = pickGlowTier({
        id: node.id,
        // Phase-1 splits "focus" (selected/sticky/entry-target) from
        // "hover" so the two halo intensities (1.0 vs 0.85) are
        // distinguishable. We treat selectedNodeId / stickyFocusId as
        // focus and the live hover id as hover; if a node is both
        // (e.g. user hovers their already-selected node), pickGlowTier
        // resolves to the brighter 'focus' tier.
        focusId: selectedNodeId ?? stickyFocusId ?? null,
        hoverId: hoveredNodeId ?? null,
        hubIds: glowHubSet,
      })
      // Heartbeat scales the halo's effective node-radius for the focus
      // tier only — hover / hub / leaf are unchanged. drawGlowHalo
      // multiplies nodeRadius by GLOW_RADIUS_MULT_BASE internally, so
      // passing r * heartbeatScale yields halo radius = (r × 3) × scale.
      let haloNodeRadius = r
      if (
        tier === 'focus' &&
        !prefersReducedMotion() &&
        heartbeatStartRef.current != null
      ) {
        const elapsed = performance.now() - heartbeatStartRef.current
        haloNodeRadius = r * heartbeatScale(elapsed)
      }
      drawGlowHalo(ctx, { x, y, nodeRadius: haloNodeRadius, color, tier })
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    },
    [
      degrees,
      focusHops,
      glowHubSet,
      hoveredNodeId,
      isDark,
      labelIndex,
      selectedNodeId,
      stickyFocusId,
    ],
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
      // Stroke + halo come from the shared helper — same contract the
      // canvas-mock unit test pins. shadowBlur is set to 0 on the
      // non-focus branch so a stale halo from a previous focus-edge
      // draw can't smear into baseline edges (shadowBlur is sticky on
      // the same ctx across draw calls).
      applyEdgeStrokeStyle(ctx, { isFocusEdge, isDark })
      ctx.lineCap = 'round'
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
      const fontHub = HUB_LABEL_FONT_SIZE / globalScale
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const fillBase = isDark ? 'hsl(40 30% 96%)' : 'hsl(24 25% 11%)'
      const haloBase = isDark ? 'hsla(20 18% 6% / 0.55)' : 'hsla(40 25% 96% / 0.7)'
      // Hub style (bold-redesign change 4): white text on a dark pill,
      // 13px font and 4px radius/4px horizontal padding. Used only for
      // the always-on top-5 pinned-hub branch — survives over busy edge
      // regions because the pill is solid rgba(0,0,0,0.45).
      const drawOne = (
        node: RfgNode,
        opts: { skipCollision: boolean; isHub?: boolean },
      ) => {
        const isFocus = focused === node.id
        const isHub = opts.isHub === true
        const x = node.x ?? 0
        const y = node.y ?? 0
        const raw = (node.label ?? node.labels?.[0] ?? String(node.id)) as string
        const text = isFocus ? raw : truncate(raw)
        const font = isFocus ? fontFocus : isHub ? fontHub : fontBase
        ctx.font = `${font}px Inter, system-ui, sans-serif`
        const metrics = ctx.measureText(text)
        const padX = isHub ? HUB_LABEL_PAD_X : LABEL_PAD_X
        const padY = isHub ? HUB_LABEL_PAD_Y : LABEL_PAD_Y
        const w = metrics.width + padX * 2
        const h = font + padY * 2
        const lx = x - w / 2
        const ly = y + LABEL_OFFSET_Y / globalScale
        const box: LabelBox = { x: lx, y: ly, w, h, id: node.id }
        if (!opts.skipCollision && placed.some((p) => rectsOverlap(p, box))) {
          return
        }
        ctx.save()
        ctx.fillStyle = isHub ? HUB_LABEL_BG_RGBA : haloBase
        ctx.beginPath()
        const radius = Math.min(
          (isHub ? HUB_LABEL_RADIUS : 4) / globalScale,
          h / 2,
        )
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
        ctx.fillStyle = isHub ? HUB_LABEL_FG : fillBase
        ctx.fillText(text, x, ly + padY)
        ctx.restore()
        placed.push(box)
      }
      // 1) Focused label first, unconditional — never hidden by collisions.
      // 1') When no node is focused, force the top-N hubs (highest degree,
      // tie-broken by id) onto the canvas unconditionally — cycle C: the
      // playground graph used to render with zero default labels (visibility
      // gated entirely on focus), leaving the user to hunt for principal
      // vertices. With this branch the most connected nodes are always
      // labelled at first paint.
      const pinned = new Set<string | number>()
      if (focused != null) {
        const focusedNode = nodes.find((n) => n.id === focused)
        if (focusedNode) {
          drawOne(focusedNode, { skipCollision: true })
          pinned.add(focusedNode.id)
        }
      } else {
        const hubIds = topHubsByDegree(
          { nodes, links: [] } as never,
          degrees,
          TOP_HUB_LABELS_DEFAULT,
        )
        for (const id of hubIds) {
          const node = nodes.find((n) => n.id === id)
          if (node) {
            drawOne(node, { skipCollision: true, isHub: true })
            pinned.add(node.id)
          }
        }
      }
      // 2) Remaining labels in priority order. When a focus exists, only
      // draw labels of focus + its 1-hop neighbours (2-hop stays unlabelled
      // to keep the focus neighbourhood readable). Otherwise we fill in
      // additional non-hub labels by collision.
      for (const node of priority) {
        if (pinned.has(node.id)) continue
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

  // Phase-2 PULSE — auto-fit-to-viewport entry dolly. First cool snaps
  // to fit-bounds (gives us the target zoom), then a custom RAF tweens
  // from fitZ / 1.4 (zoomed out) to fitZ over 1500ms with the standard
  // cubic-bezier ease. Reduced-motion users get the snap directly.
  const hasFittedRef = useRef(false)
  const fitCountRef = useRef(0)
  const dollyRafRef = useRef<number | null>(null)
  const onEngineStop = useCallback(() => {
    const fg = fgRef.current
    if (!fg) return
    // Refs are mutated outside render; the harness effect's closures
    // re-read .current on each invocation so there's no captured-stale-
    // value bug. Disable the immutability rule narrowly here.
    // eslint-disable-next-line react-hooks/immutability
    fitCountRef.current += 1
    if (!hasFittedRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      hasFittedRef.current = true
      // Snap to fit first to learn the target zoom level. Then either
      // cut (reduced-motion) or kick off the dolly tween.
      fg.zoomToFit(0, 60)
      const fitZ = fg.zoom()
      if (prefersReducedMotion()) {
        return
      }
      const startZ = fitZ / ENTRY_DOLLY_OVERZOOM_OUT
      fg.zoom(startZ, 0)
      const start = performance.now()
      dollyActiveRef.current = true
      const step = () => {
        const elapsed = performance.now() - start
        const t = Math.min(1, elapsed / ENTRY_DOLLY_MS)
        const eased = EASE_STANDARD(t)
        const z = startZ + (fitZ - startZ) * eased
        const fgNow = fgRef.current
        if (fgNow) fgNow.zoom(z, 0)
        if (t < 1) {
          dollyRafRef.current = requestAnimationFrame(step)
        } else {
          dollyActiveRef.current = false
          dollyRafRef.current = null
        }
      }
      dollyRafRef.current = requestAnimationFrame(step)
      return
    }
    // Subsequent cools (e.g. dataset switches): keep the existing short
    // re-fit. No dolly — only the first mount earns the cinematic intro.
    fg.zoomToFit(400, 60)
  }, [])

  // Cancel an in-flight dolly on unmount so the RAF doesn't keep ticking
  // against a torn-down ForceGraph2D instance.
  useEffect(() => {
    return () => {
      if (dollyRafRef.current != null) {
        cancelAnimationFrame(dollyRafRef.current)
        dollyRafRef.current = null
      }
    }
  }, [])

  // Phase-2 PULSE — heartbeat trigger. Setting heartbeatStartRef stamps
  // a baseline; drawNode reads `performance.now() - start` on every
  // canvas frame to compute the 1Hz scale. Clearing the ref (no focus)
  // turns the heartbeat off without an explicit RAF teardown.
  useEffect(() => {
    const focusId = selectedNodeId ?? stickyFocusId ?? null
    if (focusId == null || prefersReducedMotion()) {
      heartbeatStartRef.current = null
      return
    }
    heartbeatStartRef.current = performance.now()
  }, [selectedNodeId, stickyFocusId])

  // Phase-2 PULSE — idle drift. After the engine first stops we capture
  // each node's settled position into a base map, then run a slow
  // phase-staggered sine perturbation around that base. The amplitude
  // (≈1.5px) is the visual analogue of a 0.05× force tick — enough to
  // register motion against a still scene, small enough not to disturb
  // edge geometry. Drift suspends while ANY node is hover/focus engaged.
  // ForceGraph2D reads node.x / node.y on every canvas frame, so direct
  // mutation works without explicit redraw plumbing (the
  // `autoPauseRedraw={false}` prop on the graph keeps frames flowing).
  // Reduced-motion gate disables the entire drift loop.
  const focusedRef = useRef<string | number | null>(null)
  useEffect(() => {
    focusedRef.current = focused
  }, [focused])
  useEffect(() => {
    if (prefersReducedMotion()) {
      driftActiveRef.current = false
      return
    }
    let raf = 0
    const baseMap = new Map<string | number, { x: number; y: number }>()
    let captured = false
    const tick = () => {
      // Wait for the engine to first cool — until then the simulation
      // is moving nodes faster than our drift would.
      if (!captured && hasFittedRef.current) {
        for (const n of seeded.nodes) {
          if (typeof n.x === 'number' && typeof n.y === 'number') {
            baseMap.set(n.id, { x: n.x, y: n.y })
          }
        }
        captured = true
      }
      if (captured && focusedRef.current == null && !dollyActiveRef.current) {
        driftActiveRef.current = true
        const now = performance.now()
        seeded.nodes.forEach((n, i) => {
          const base = baseMap.get(n.id)
          if (!base) return
          const phase = i * 0.73
          const t = now / 1800
          n.x = base.x + Math.cos(t + phase) * 1.5
          n.y = base.y + Math.sin(t * 0.7 + phase) * 1.5
        })
      } else {
        driftActiveRef.current = false
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      driftActiveRef.current = false
    }
  }, [seeded.nodes])

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
        // Phase-2 PULSE: keep the canvas redrawing every frame so the
        // heartbeat halo (per-frame elapsed-time read) and idle drift
        // (per-frame node-position mutation) actually paint. The default
        // `autoPauseRedraw=true` would freeze the canvas after the
        // engine cools and skip both effects.
        autoPauseRedraw={false}
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
