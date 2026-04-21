export const GRAPH_THEME = {
  bg: 'hsl(240, 32%, 5%)',
  vignette: 'radial-gradient(ellipse 70% 60% at 50% 45%, hsla(226, 60%, 50%, 0.10), transparent 75%)',
  gridDot: 'rgba(120, 130, 200, 0.07)',
  gridSize: 28,

  edge: 'rgba(148, 163, 255, 0.32)',
  edgeHover: 'rgba(180, 200, 255, 0.85)',
  edgeArrow: 'rgba(180, 200, 255, 0.55)',
  edgeLabel: 'rgba(220, 230, 255, 0.78)',
  edgeLabelBg: 'rgba(8, 10, 22, 0.85)',
  edgeCurvature: 0.16,
  particleColor: 'rgba(180, 200, 255, 0.78)',
  particleSpeed: 0.0035,

  labelFont: '500 12px "Fraunces", "Source Serif 4", Georgia, serif',
  labelFontSmall: '500 10px "Fraunces", "Source Serif 4", Georgia, serif',
  labelColor: 'rgba(255, 255, 255, 0.92)',
  labelHaloColor: 'rgba(0, 0, 0, 0.85)',
  labelMinScale: 0.55,

  selectionRingColor: 'rgba(255, 255, 255, 0.95)',
  hoverRingColor: 'rgba(255, 255, 255, 0.55)',

  nodeBaseRadius: 5,
  nodeRadiusFactor: 1.6,
  nodeMinRadius: 4,
  nodeMaxRadius: 14,
  nodeStrokeAlpha: 0.55,

  glowBaseBlur: 14,
  glowHoverBlur: 24,
  glowSelectBlur: 32,

  // d3 force tuning
  alphaDecay: 0.02,
  velocityDecay: 0.28,
  cooldownTicks: 200,
  chargeStrength: -260,
  linkDistanceBase: 70,
  collideRadiusFactor: 1.4,
} as const

export const LABEL_PALETTE: Record<string, { core: string; light: string; deep: string }> = {
  Person: { core: '#7AA2FF', light: '#B7CCFF', deep: '#3553B8' },
  Movie: { core: '#A78BFA', light: '#D6C8FF', deep: '#5836B7' },
  Genre: { core: '#F472B6', light: '#FBC1DD', deep: '#9B2D6C' },
  Company: { core: '#34D399', light: '#A7F3D0', deep: '#0F805F' },
  Airport: { core: '#22D3EE', light: '#A5F3FC', deep: '#0E7490' },
  Country: { core: '#FBBF24', light: '#FDE68A', deep: '#A66B07' },
  City: { core: '#FB923C', light: '#FED7AA', deep: '#9A3D0E' },
  House: { core: '#F87171', light: '#FECACA', deep: '#9C2A2A' },
  Character: { core: '#E879F9', light: '#F5C8FB', deep: '#86259A' },
  Item: { core: '#A3E635', light: '#D9F99D', deep: '#4D7A07' },
  Season: { core: '#F59E0B', light: '#FCD34D', deep: '#78350F' },
}

// Per-edge-type palette. Keys are Cypher relationship type strings.
// Colors are hex — consumers convert to RGBA.
export const EDGE_PALETTE: Record<string, string> = {
  KNOWS: '#22D3EE', // cyan
  ACTED_IN: '#FBBF24', // amber
  RATED: '#A78BFA', // purple
  INTERACTS: '#F472B6', // rose
  APPEARS_IN: '#94A3FF', // soft indigo
  WORKS_AT: '#34D399', // emerald
  LIVES_IN: '#FB923C', // orange
  LIKES: '#F87171', // red
  OWNS: '#E879F9', // fuchsia
  NEAR: '#A3E635', // lime
  ROUTE: '#22D3EE',
  IN_GENRE: '#F472B6',
  CONTAINS: '#7AA2FF',
  WON_PRIZE_IN: '#FBBF24',
  BORN_IN: '#34D399',
  AFFILIATED_WITH: '#A78BFA',
}

const EDGE_FALLBACK = ['#94A3FF', '#22D3EE', '#F472B6', '#34D399', '#FBBF24', '#FB923C', '#A3E635', '#A78BFA']

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function paletteForEdgeType(type: string | undefined | null): string {
  if (!type) return EDGE_FALLBACK[0]
  const explicit = EDGE_PALETTE[type]
  if (explicit) return explicit
  return EDGE_FALLBACK[hashString(type) % EDGE_FALLBACK.length]
}

const FALLBACK_PALETTE: Array<{ core: string; light: string; deep: string }> = [
  { core: '#7AA2FF', light: '#B7CCFF', deep: '#3553B8' },
  { core: '#A78BFA', light: '#D6C8FF', deep: '#5836B7' },
  { core: '#34D399', light: '#A7F3D0', deep: '#0F805F' },
  { core: '#F472B6', light: '#FBC1DD', deep: '#9B2D6C' },
  { core: '#FBBF24', light: '#FDE68A', deep: '#A66B07' },
  { core: '#22D3EE', light: '#A5F3FC', deep: '#0E7490' },
  { core: '#A3E635', light: '#D9F99D', deep: '#4D7A07' },
  { core: '#FB923C', light: '#FED7AA', deep: '#9A3D0E' },
]

function hashLabel(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i += 1) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0
  }
  return h
}

export function paletteForLabel(label: string | undefined | null) {
  if (!label) return FALLBACK_PALETTE[0]
  const explicit = LABEL_PALETTE[label]
  if (explicit) return explicit
  const idx = hashLabel(label) % FALLBACK_PALETTE.length
  return FALLBACK_PALETTE[idx]
}

export function radiusForDegree(degree: number): number {
  const r =
    GRAPH_THEME.nodeBaseRadius +
    Math.log2(degree + 1) * GRAPH_THEME.nodeRadiusFactor
  return Math.min(GRAPH_THEME.nodeMaxRadius, Math.max(GRAPH_THEME.nodeMinRadius, r))
}

export function paintGraphNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  options: {
    label?: string | null
    displayText?: string | null
    degree?: number
    globalScale?: number
    state?: 'default' | 'hover' | 'selected'
    drawLabel?: boolean
  }
) {
  const palette = paletteForLabel(options.label)
  const radius = radiusForDegree(options.degree ?? 0)
  const globalScale = options.globalScale ?? 1
  const state = options.state ?? 'default'
  const drawLabel = options.drawLabel !== false

  ctx.save()

  const blur =
    state === 'selected'
      ? GRAPH_THEME.glowSelectBlur
      : state === 'hover'
        ? GRAPH_THEME.glowHoverBlur
        : GRAPH_THEME.glowBaseBlur
  ctx.shadowColor = palette.core
  ctx.shadowBlur = blur

  const grad = ctx.createRadialGradient(
    x - radius * 0.4,
    y - radius * 0.4,
    radius * 0.1,
    x,
    y,
    radius
  )
  grad.addColorStop(0, palette.light)
  grad.addColorStop(0.55, palette.core)
  grad.addColorStop(1, palette.deep)

  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.shadowBlur = 0

  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.lineWidth = 0.6
  ctx.strokeStyle = `rgba(255,255,255,${GRAPH_THEME.nodeStrokeAlpha * 0.5})`
  ctx.stroke()

  if (state === 'selected') {
    ctx.beginPath()
    ctx.arc(x, y, radius + 4, 0, 2 * Math.PI)
    ctx.lineWidth = 1.6 / globalScale
    ctx.strokeStyle = GRAPH_THEME.selectionRingColor
    ctx.stroke()
  } else if (state === 'hover') {
    ctx.beginPath()
    ctx.arc(x, y, radius + 3, 0, 2 * Math.PI)
    ctx.lineWidth = 1.2 / globalScale
    ctx.strokeStyle = GRAPH_THEME.hoverRingColor
    ctx.stroke()
  }

  if (drawLabel && options.displayText && globalScale >= GRAPH_THEME.labelMinScale) {
    const txt = options.displayText.length > 22
      ? options.displayText.slice(0, 19) + '…'
      : options.displayText
    const isSmall = globalScale < 1
    ctx.font = isSmall ? GRAPH_THEME.labelFontSmall : GRAPH_THEME.labelFont
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = GRAPH_THEME.labelHaloColor
    ctx.shadowBlur = 6
    ctx.fillStyle = GRAPH_THEME.labelColor
    ctx.fillText(txt, x, y + radius + 4)
    ctx.shadowBlur = 0
  }

  ctx.restore()
}
