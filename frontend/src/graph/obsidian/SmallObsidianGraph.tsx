import { useEffect, useMemo, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import { forceCollide } from 'd3-force'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import {
  EDGE_COLOR_DARK,
  colorForLabel,
  warmColorForLabel,
} from './colors'
import { type LabelBox, rectsOverlap, tuneForces } from './layout'

interface Props {
  graphData: GraphData
  width: number
  height: number
  showLabels?: boolean
  reducedMotion?: boolean
  className?: string
  /** decorative mode: no labels, no edges hover, dimmer dots */
  decorative?: boolean
  /** restrict node colours to warm/amber-only entries (landing illustrative) */
  amberOnly?: boolean
}

type RfgNode = GraphNode & { x?: number; y?: number }
type RfgLink = GraphEdge & { source: string | number | RfgNode; target: string | number | RfgNode }

const NODE_RADIUS = 4
const HALO_RADIUS = 12
const LABEL_FONT_SIZE = 11
const LABEL_PAD_X = 4
const LABEL_PAD_Y = 2
const LABEL_OFFSET_Y = 9
const MAX_LABEL_CHARS = 14

function truncate(s: string): string {
  return s.length > MAX_LABEL_CHARS ? `${s.slice(0, MAX_LABEL_CHARS - 1)}…` : s
}

// Standalone obsidian-style force-graph for landing illustrative + decorative
// uses. Always renders against the AMBER-TERMINAL palette.
export function SmallObsidianGraph({
  graphData,
  width,
  height,
  showLabels = true,
  reducedMotion = false,
  className,
  decorative = false,
  amberOnly = false,
}: Props) {
  const pickColor = (label: string | undefined) =>
    amberOnly ? warmColorForLabel(label) : colorForLabel(label, true)
  const fgRef = useRef<ForceGraphMethods<RfgNode, RfgLink> | undefined>(undefined)
  const tuning = useMemo(() => tuneForces(graphData.nodes.length), [graphData.nodes.length])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const charge = fg.d3Force('charge') as
      | (ReturnType<typeof fg.d3Force> & { strength?: (s: number) => unknown })
      | undefined
    charge?.strength?.(tuning.chargeStrength)
    const link = fg.d3Force('link') as
      | (ReturnType<typeof fg.d3Force> & { distance?: (d: number) => unknown })
      | undefined
    link?.distance?.(tuning.linkDistance)
    fg.d3Force('collide', forceCollide(tuning.collideRadius))
    fg.d3ReheatSimulation?.()
  }, [tuning])

  const drawNode = (node: RfgNode, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0
    const y = node.y ?? 0
    const color = pickColor(node.labels?.[0])
    ctx.save()
    ctx.globalAlpha = decorative ? 0.85 : 1
    const grad = ctx.createRadialGradient(x, y, 0, x, y, HALO_RADIUS)
    grad.addColorStop(0, color)
    grad.addColorStop(0.6, color.replace(/\)$/, ' / 0.22)').replace('hsl', 'hsla'))
    grad.addColorStop(1, color.replace(/\)$/, ' / 0)').replace('hsl', 'hsla'))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, HALO_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const drawLink = (link: RfgLink, ctx: CanvasRenderingContext2D) => {
    const src = link.source
    const tgt = link.target
    if (typeof src !== 'object' || typeof tgt !== 'object') return
    ctx.save()
    ctx.strokeStyle = EDGE_COLOR_DARK
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(src.x ?? 0, src.y ?? 0)
    ctx.lineTo(tgt.x ?? 0, tgt.y ?? 0)
    ctx.stroke()
    ctx.restore()
  }

  const drawLabels = (ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!showLabels || decorative) return
    const placed: LabelBox[] = []
    const fontSize = LABEL_FONT_SIZE / globalScale
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const node of graphData.nodes as RfgNode[]) {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const raw = (node.label ?? node.labels?.[0] ?? String(node.id)) as string
      const text = truncate(raw)
      const metrics = ctx.measureText(text)
      const w = metrics.width + LABEL_PAD_X * 2
      const h = fontSize + LABEL_PAD_Y * 2
      const lx = x - w / 2
      const ly = y + LABEL_OFFSET_Y / globalScale
      const box: LabelBox = { x: lx, y: ly, w, h, id: node.id }
      if (placed.some((p) => rectsOverlap(p, box))) continue
      ctx.save()
      ctx.fillStyle = 'hsla(20 18% 6% / 0.6)'
      const radius = Math.min(4 / globalScale, h / 2)
      const rx = lx
      const ry = ly
      ctx.beginPath()
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
      ctx.fillStyle = 'hsl(40 30% 96%)'
      ctx.fillText(text, x, ly + LABEL_PAD_Y)
      ctx.restore()
      placed.push(box)
    }
    if (typeof window !== 'undefined') {
      const w = window as Window & {
        __smallObsidianLabelBounds?: () => LabelBox[]
      }
      w.__smallObsidianLabelBounds = () => placed.slice()
    }
  }

  return (
    <div className={className} style={{ width, height }} aria-hidden={decorative ? true : undefined}>
      <ForceGraph2D<RfgNode, RfgLink>
        ref={fgRef}
        graphData={graphData as { nodes: RfgNode[]; links: RfgLink[] }}
        width={width}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={NODE_RADIUS}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={drawLink}
        linkCanvasObjectMode={() => 'replace'}
        onRenderFramePost={drawLabels}
        cooldownTicks={reducedMotion ? 60 : 200}
        d3AlphaDecay={reducedMotion ? 0.05 : 0.02}
        d3VelocityDecay={0.35}
        warmupTicks={40}
        enableNodeDrag={false}
        enableZoomInteraction={false}
        enablePanInteraction={false}
      />
    </div>
  )
}
