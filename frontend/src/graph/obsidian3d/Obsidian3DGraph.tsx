// Obsidian3DGraph — productionised C14 react-force-graph-3d renderer.
//
// This is the "category-jump" replacement for the 2D ObsidianGraph: same
// data contract, same UX guarantees, different medium. The rendering shifts
// from canvas-2D + d3-force CPU to three.js + WebGL with depth, lighting,
// and a cinematic camera.
//
// What's preserved from the bold-redesign 2D component (per .planning/
// c14-graph-tech-deep/EVAL.md):
//   * Categorical Movie/Genre/Person hues (palette transferred to 0xRRGGBB
//     ints in `visuals.ts`).
//   * Degree-scaled node radius (`1 + log2(1+deg) * 1.4`) — same formula as
//     the 2D renderer, applied to `THREE.SphereGeometry` radius.
//   * 3-tier k-hop fade (focus + 1-hop = 1.0; 2-hop = 0.5; rest = 0.18) —
//     applied via `material.opacity` per-node, mutated on focus change by
//     traversing the THREE scene rather than rebuilding nodes.
//   * Top-N hub labels always-on at first paint — rendered as `SpriteText`
//     children of the per-node Group so they billboard towards the camera.
//   * Focused-node halo — second translucent additive-blend Mesh child,
//     toggled visible/invisible on focus change (replaces the canvas
//     radial-gradient halo).
//   * Tooltip overlay (DOM, not WebGL) — picks the same curated property
//     keys via `pickTooltipProps`, mirrors the 2D positioning logic.
//   * Entry dolly into the top-1 hub on first cool — uses RFG3D's
//     `cameraPosition({x,y,z}, lookAt, durationMs)` for a GPU-interpolated
//     camera move (smoother than the 2D `centerAt + zoom` pair).
//   * E2E hooks on `window.__obsidian3d*` — parallel to the 2D
//     `__obsidian*` surface so playwright specs can drive the renderer
//     without relying on visual assertions.
//
// What's new (3D-only):
//   * `THREE.AmbientLight` + `THREE.DirectionalLight` for proper depth-cue
//     shading on Lambert spheres.
//   * Background colour swaps with the system theme (warm dark for `dark`,
//     warm cream for `light`).
//   * The canvas surface tag flips from `data-graph="obsidian"` to
//     `data-graph="obsidian3d"` so playwright can disambiguate selectors.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { Compass } from 'lucide-react'
import type { GraphData, GraphNode } from '@/types/graph'
import { Button } from '@/components/ui/button'
import {
  ENTRY_DURATION_MS,
  TOP_HUB_LABELS_DEFAULT,
  degreeMap,
  kHopNeighbors,
  selectEntryFocusNodeId,
  topHubsByDegree,
} from '@/graph/obsidian/layout'
import { pickTooltipProps } from '@/graph/obsidian/tooltip'
import { colorForLabel3D, opacityForHop } from './visuals'

interface Props {
  graphData: GraphData
  onNodeClick?: (n: GraphNode) => void
  onNodeHover?: (n: GraphNode | null) => void
  onBackgroundClick?: () => void
  hoveredNodeId?: string | number | null
  selectedNodeId?: string | number | null
  labelIndex?: Map<string, number>
}

interface Node3D {
  id: string | number
  label: string
  labels?: string[]
  properties?: Record<string, unknown>
  __degree: number
  __radius: number
  __color: number
  __isHub: boolean
  // Mutated by RFG3D as the simulation runs.
  x?: number
  y?: number
  z?: number
}

interface Link3D {
  source: string | number
  target: string | number
}

const NODE_RADIUS_BASE = 4
const HALO_MULTIPLIER = 1.6
const ENTRY_CAMERA_OFFSET = 220 // distance behind/above the focus node
const TAP_RECENTER_OFFSET = 180
const TAP_RECENTER_DURATION_MS = 600
const ROTATE_HINT_STORAGE_KEY = 'obsidian3d-rotate-hint-seen'
const ROTATE_HINT_DURATION_MS = 8_000

const BG_DARK = 'rgba(20,16,11,1)'
const BG_LIGHT = 'rgba(252,246,236,1)'
const EDGE_COLOR_DARK = 'rgba(255,180,120,0.55)'
const EDGE_COLOR_LIGHT = 'rgba(112,82,46,0.45)'

function radiusForDegree(deg: number): number {
  return NODE_RADIUS_BASE * (1 + Math.log2(1 + deg) * 0.6)
}

export function Obsidian3DGraph({
  graphData,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
  hoveredNodeId,
  selectedNodeId,
  labelIndex,
}: Props) {
  // RFG3D's TS surface is loose — use any-cast for the ref because we touch
  // .scene(), .cameraPosition(), .refresh() which aren't enumerated by
  // its declaration. Encapsulate the cast so call sites stay clean.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const [tooltip, setTooltip] = useState<{ node: Node3D; x: number; y: number } | null>(null)
  const [stickyFocusId, setStickyFocusId] = useState<string | number | null>(null)
  // Touch-device gating — coarse pointers (phones, tablets) get the
  // orbit-lock + tap-to-recenter UX from the eval's S3 slice. Detected
  // once at mount via matchMedia so we don't recompute on every render.
  const isCoarsePointer = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(pointer: coarse)').matches
  }, [])
  // Initial value baked in at mount (no setState-in-effect): show the
  // rotate hint to desktop visitors who haven't dismissed it this
  // session. Touch users skip the hint entirely (they don't rotate).
  const [showRotateHint, setShowRotateHint] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    if (window.matchMedia?.('(pointer: coarse)').matches) return false
    try {
      return window.sessionStorage.getItem(ROTATE_HINT_STORAGE_KEY) !== '1'
    } catch {
      // sessionStorage blocked (private-mode Safari, etc.) — soft-show.
      return true
    }
  })
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

  const degrees = useMemo(() => degreeMap(graphData), [graphData])

  // Top-N highest-degree node ids — rendered with always-on SpriteText
  // labels so the first frame shows a labelled hero set, not a fog of dots.
  const hubIds = useMemo(
    () => new Set(topHubsByDegree(graphData, degrees, TOP_HUB_LABELS_DEFAULT)),
    [graphData, degrees],
  )

  // Project the GraphData into the augmented Node3D / Link3D shape RFG3D
  // expects. Computing colour + radius once here lets `nodeThreeObject`
  // stay a stable callback (no per-render closure on `degrees` etc.),
  // which prevents RFG3D from rebuilding every node mesh on every focus
  // change.
  const data3d = useMemo(() => {
    const nodes: Node3D[] = graphData.nodes.map((n) => {
      const label = (n.label ?? n.labels?.[0] ?? String(n.id)) as string
      const deg = degrees.get(n.id) ?? 0
      return {
        id: n.id,
        label,
        labels: n.labels,
        properties: n.properties,
        __degree: deg,
        __radius: radiusForDegree(deg),
        __color: colorForLabel3D(n.labels?.[0], isDark, labelIndex),
        __isHub: hubIds.has(n.id),
      }
    })
    const links: Link3D[] = graphData.links.map((l) => ({
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
    }))
    return { nodes, links }
  }, [graphData, degrees, hubIds, isDark, labelIndex])

  // Build per-node THREE.Group: main sphere mesh + halo mesh + optional
  // SpriteText hub label. Marked with userData tags so the focus-update
  // effect can find them by traversal without re-keying.
  const nodeThreeObject = useCallback((raw: unknown): THREE.Object3D => {
    const node = raw as Node3D
    const r = node.__radius
    const group = new THREE.Group()

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 16),
      new THREE.MeshLambertMaterial({
        color: node.__color,
        transparent: true,
        opacity: 1,
      }),
    )
    mesh.userData.role = 'node-mesh'
    group.add(mesh)

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(r * HALO_MULTIPLIER, 16, 16),
      new THREE.MeshBasicMaterial({
        color: node.__color,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    halo.userData.role = 'node-halo'
    halo.visible = false
    group.add(halo)

    if (node.__isHub) {
      const text = new SpriteText(node.label.slice(0, 24))
      text.color = '#ffffff'
      text.backgroundColor = 'rgba(0,0,0,0.55)'
      text.padding = 2
      text.borderRadius = 3
      text.fontFace = 'Inter, system-ui, sans-serif'
      text.fontWeight = '600'
      text.textHeight = 4.2
      text.position.set(0, r + 5, 0)
      text.userData.role = 'hub-label'
      group.add(text)
    }

    group.userData.nodeId = node.id
    return group
  }, [])

  // Focus computation — same priority order as the 2D component:
  // explicit hover > parent-driven selection > internal sticky-tap.
  const focused = hoveredNodeId ?? selectedNodeId ?? stickyFocusId ?? null
  const focusHops = useMemo(
    () => (focused != null ? kHopNeighbors(graphData, focused, 2) : null),
    [focused, graphData],
  )

  // Focus → scene mutation. We DON'T rebuild nodes on focus change —
  // instead, traverse the existing scene and update each group's mesh
  // opacity + halo visibility. This is the 3D analogue of the 2D
  // drawNode's α tiering, but applied once per focus change instead of
  // every frame.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const scene = fg.scene?.()
    if (!scene) return
    scene.traverse((obj: THREE.Object3D) => {
      const id = obj.userData?.nodeId
      if (id == null) return
      const op = opacityForHop(focusHops, id)
      const isFocus = focused === id
      obj.children.forEach((child) => {
        const role = child.userData?.role
        if (role === 'node-mesh') {
          const m = (child as THREE.Mesh).material as THREE.MeshLambertMaterial
          m.opacity = op
          m.needsUpdate = true
        } else if (role === 'node-halo') {
          ;(child as THREE.Mesh).visible = isFocus
        } else if (role === 'hub-label') {
          // Hub label opacity follows the same fade tiering so far-away
          // labels don't shout over the focus neighbourhood.
          const sprite = child as THREE.Sprite
          ;(sprite.material as THREE.SpriteMaterial).opacity = op
        }
      })
    })
  }, [focused, focusHops])

  const handleNodeHover = useCallback(
    (raw: unknown) => {
      const n = raw as Node3D | null
      onNodeHover?.((n as unknown as GraphNode) ?? null)
      if (!n || lastPointerRef.current == null) {
        setTooltip(null)
        return
      }
      setTooltip({ node: n, x: lastPointerRef.current.x, y: lastPointerRef.current.y })
    },
    [onNodeHover],
  )

  const handleNodeClick = useCallback(
    (raw: unknown) => {
      const n = raw as Node3D
      setStickyFocusId(n.id)
      // Touch-only tap-to-recenter (eval S3): on a coarse-pointer device
      // a tap is the user's primary navigation gesture, so dolly the
      // camera to the tapped node so they don't have to two-finger-pan
      // through 3D space afterwards. Desktop click intentionally does NOT
      // move the camera — the user can already orbit freely with the
      // mouse, and a click-jump would be disorienting.
      if (isCoarsePointer) {
        const fg = fgRef.current
        if (fg && typeof n.x === 'number' && typeof n.y === 'number') {
          const tx = n.x
          const ty = n.y
          const tz = n.z ?? 0
          fg.cameraPosition?.(
            { x: tx + TAP_RECENTER_OFFSET, y: ty + TAP_RECENTER_OFFSET * 0.6, z: tz + TAP_RECENTER_OFFSET },
            { x: tx, y: ty, z: tz },
            TAP_RECENTER_DURATION_MS,
          )
        }
      }
      onNodeClick?.(n as unknown as GraphNode)
    },
    [isCoarsePointer, onNodeClick],
  )

  const handleBackgroundClick = useCallback(() => {
    setStickyFocusId(null)
    setTooltip(null)
    onBackgroundClick?.()
  }, [onBackgroundClick])

  // Pointer position for tooltip placement (same pattern as 2D).
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    lastPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  // Entry dolly — first onEngineStop dollies the camera into the top-1
  // hub at a slight offset so the first frame reads as "look at this
  // particular cluster" rather than "fit-everything-at-once."
  const hasFittedRef = useRef(false)
  const fitCountRef = useRef(0)
  const entryFocusIdRef = useRef<string | number | null>(null)
  const onEngineStop = useCallback(() => {
    const fg = fgRef.current
    if (!fg) return
    fitCountRef.current += 1
    if (hasFittedRef.current) return
    hasFittedRef.current = true
    const targetId = selectEntryFocusNodeId(graphData, degrees)
    entryFocusIdRef.current = targetId
    if (targetId == null) {
      // Empty graph fallback — let RFG3D's default fit behaviour rule.
      fg.zoomToFit?.(ENTRY_DURATION_MS, 60)
      return
    }
    const target = data3d.nodes.find((n) => n.id === targetId)
    if (
      !target ||
      typeof target.x !== 'number' ||
      typeof target.y !== 'number'
    ) {
      fg.zoomToFit?.(ENTRY_DURATION_MS, 60)
      return
    }
    const tx = target.x
    const ty = target.y
    const tz = target.z ?? 0
    fg.cameraPosition?.(
      { x: tx + ENTRY_CAMERA_OFFSET, y: ty + ENTRY_CAMERA_OFFSET * 0.6, z: tz + ENTRY_CAMERA_OFFSET },
      { x: tx, y: ty, z: tz },
      ENTRY_DURATION_MS,
    )
  }, [data3d.nodes, degrees, graphData])

  // Tag the underlying WebGL canvas so playwright can target it (the
  // RFG3D component doesn't accept arbitrary canvas attributes).
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const tag = () => {
      const el = root.querySelector('canvas')
      if (el && !el.dataset.graph) el.dataset.graph = 'obsidian3d'
    }
    tag()
    const obs = new MutationObserver(tag)
    obs.observe(root, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  // E2E harness — the surface mirrors the 2D `__obsidian*` hooks so the
  // playwright spec parallels the existing `obsidian-graph-quality.spec.ts`
  // shape one-to-one.
  const lastHoverIdxRef = useRef<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      __obsidian3dGraphReady?: boolean
      __obsidian3dHoverNode?: (idx: number) => void
      __obsidian3dDimmedCount?: () => number
      __obsidian3dFitCount?: () => number
      __obsidian3dEntryAnimated?: () => boolean
      __obsidian3dEntryFocusId?: () => string | number | null
      __obsidian3dHubLabelIds?: () => Array<string | number>
      __obsidian3dHasWebGL?: () => boolean
    }
    w.__obsidian3dGraphReady = true
    w.__obsidian3dHoverNode = (idx) => {
      lastHoverIdxRef.current = idx
      const node = data3d.nodes[idx]
      if (!node) {
        handleNodeHover(null)
        return
      }
      handleNodeHover(node as unknown)
    }
    w.__obsidian3dDimmedCount = () => {
      // Count nodes whose opacity-tier puts them outside the focus
      // neighbourhood — same definition as the 2D harness.
      if (focusHops == null) return 0
      let dim = 0
      for (const n of data3d.nodes) {
        if (opacityForHop(focusHops, n.id) < 1) dim += 1
      }
      return dim
    }
    w.__obsidian3dFitCount = () => fitCountRef.current
    w.__obsidian3dEntryAnimated = () => hasFittedRef.current
    w.__obsidian3dEntryFocusId = () => entryFocusIdRef.current
    w.__obsidian3dHubLabelIds = () => Array.from(hubIds)
    w.__obsidian3dHasWebGL = () => {
      const fg = fgRef.current
      const r = fg?.renderer?.()
      return r != null && typeof r.getContext === 'function'
    }
    return () => {
      delete w.__obsidian3dGraphReady
      delete w.__obsidian3dHoverNode
      delete w.__obsidian3dDimmedCount
      delete w.__obsidian3dFitCount
      delete w.__obsidian3dEntryAnimated
      delete w.__obsidian3dEntryFocusId
      delete w.__obsidian3dHubLabelIds
      delete w.__obsidian3dHasWebGL
    }
  }, [data3d.nodes, focusHops, handleNodeHover, hubIds])

  // Scene lighting — RFG3D's stock scene has only an ambient pass that
  // makes Lambert materials read as flat shaded polygons. Adding a low-
  // intensity ambient + one directional light gives the spheres
  // depth-cue shading without the post-processing complexity of bloom.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const scene = fg.scene?.()
    if (!scene) return
    // Only add lights once per scene — re-runs would compound luminance.
    if (scene.userData.obsidian3dLit) return
    scene.userData.obsidian3dLit = true
    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 0.55)
    dir.position.set(150, 200, 100)
    scene.add(dir)
  }, [])

  // Touch-mode orbit-lock — on coarse-pointer devices, kill OrbitControls'
  // rotate gesture so single-finger drag pans instead of spinning. This
  // is the eval's primary mitigation for "3D disorients on touch": the
  // user can still pinch-zoom and tap-to-recenter, but accidentally
  // tumbling the scene with a stray finger is no longer possible. We
  // poll-on-mount because RFG3D wires controls asynchronously inside
  // its first effect; reading on the same tick returns undefined.
  useEffect(() => {
    if (!isCoarsePointer) return
    let cancelled = false
    const tryDisableRotate = () => {
      if (cancelled) return
      const fg = fgRef.current
      const ctrls = fg?.controls?.()
      if (!ctrls) {
        setTimeout(tryDisableRotate, 60)
        return
      }
      ctrls.enableRotate = false
      // OrbitControls in pan-only mode wants `mouseButtons.LEFT = PAN`
      // so a left-drag pans rather than no-ops; THREE constants live
      // on `THREE.MOUSE` but we don't rely on it because the relevant
      // code path is touch-only, where `touches.ONE` is the gesture.
      if (ctrls.touches) {
        ctrls.touches.ONE = 2 // THREE.TOUCH.PAN === 2
      }
    }
    tryDisableRotate()
    return () => {
      cancelled = true
    }
  }, [isCoarsePointer])

  // Auto-dismiss the desktop rotate hint after ROTATE_HINT_DURATION_MS
  // even if the user never interacts. Initial visibility is decided by
  // the useState initializer above, so the only side-effect this runs
  // is a clearable timer (no setState-in-effect).
  useEffect(() => {
    if (!showRotateHint) return
    const t = setTimeout(() => setShowRotateHint(false), ROTATE_HINT_DURATION_MS)
    return () => clearTimeout(t)
    // Only run once per visible-cycle: when the hint dismisses, the
    // effect re-runs with showRotateHint=false and short-circuits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissRotateHint = useCallback(() => {
    setShowRotateHint(false)
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ROTATE_HINT_STORAGE_KEY, '1')
      }
    } catch {
      // sessionStorage unavailable — best-effort dismiss for this view.
    }
  }, [])

  const onResetView = useCallback(() => {
    fgRef.current?.zoomToFit?.(600, 80)
  }, [])

  // RFG3D's TS surface doesn't enumerate the Lambert/Sprite augmentations
  // we pass on each node — cast through Record<string, unknown> like the
  // proto branch so we don't widen the rest of the codebase.
  const FG = ForceGraph3D as unknown as React.ComponentType<Record<string, unknown>>

  const tooltipBody = tooltip
    ? (() => {
        const props = pickTooltipProps(tooltip.node.properties)
        return {
          labelText: tooltip.node.label,
          deg: tooltip.node.__degree,
          props,
        }
      })()
    : null

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onPointerMove={onPointerMove}
      onPointerDown={dismissRotateHint}
    >
      <FG
        ref={fgRef}
        graphData={data3d}
        nodeLabel="label"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={() => (isDark ? EDGE_COLOR_DARK : EDGE_COLOR_LIGHT)}
        linkWidth={0.6}
        linkOpacity={0.55}
        backgroundColor={isDark ? BG_DARK : BG_LIGHT}
        warmupTicks={80}
        cooldownTime={5000}
        showNavInfo={false}
        onEngineStop={onEngineStop}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
      />
      {tooltipBody ? (
        <div
          role="tooltip"
          data-testid="obsidian3d-node-tooltip"
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
      {showRotateHint ? (
        <div
          data-testid="obsidian3d-rotate-hint"
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-background/85 px-3 py-1 text-[11px] text-muted-foreground shadow-md backdrop-blur"
        >
          drag to rotate · scroll to zoom
        </div>
      ) : null}
    </div>
  )
}
