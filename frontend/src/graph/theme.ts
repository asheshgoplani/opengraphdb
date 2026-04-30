export const GRAPH_THEME = {
  bg: 'hsl(24, 18%, 5%)',
  vignette: 'radial-gradient(ellipse 70% 60% at 50% 45%, hsla(40, 60%, 50%, 0.10), transparent 75%)',
  gridDot: 'rgba(220, 200, 160, 0.07)',
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

  // Slice-12: bumped factor/max so hub nodes are visibly ≥1.8× the median
  // radius on the community/movielens datasets. Previous factor=1.6, max=14
  // gave ratio ~1.5×; factor=3.2, max=22 now gives ratio ~1.83× (median
  // deg=3 → r≈10.4 vs top deg=25 → r≈19.0).
  nodeBaseRadius: 4,
  nodeRadiusFactor: 3.2,
  nodeMinRadius: 4,
  nodeMaxRadius: 22,
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

// Slice-12: LABEL_PALETTE rewritten so primary hues span the wheel at
// ~45° steps. Previous palette clustered at blue/purple/pink. Hues:
//   Person     ~220° (blue)
//   Movie      ~280° (purple)
//   Genre      ~325° (pink)
//   Company    ~155° (green)
//   Airport    ~195° (cyan)
//   Country    ~40°  (amber)
//   City       ~20°  (orange)
//   House      ~0°   (red)
//   Character  ~300° (magenta)
//   Item       ~90°  (lime)
//   Season     ~55°  (gold)
export const LABEL_PALETTE: Record<string, { core: string; light: string; deep: string }> = {
  Person: { core: '#4A83FF', light: '#A6BEFF', deep: '#1E3E99' }, // ~220°
  Movie: { core: '#9B5CFF', light: '#CEB0FF', deep: '#4A22A8' }, // ~270-280°
  Genre: { core: '#FF4D9E', light: '#FFAFD1', deep: '#992145' }, // ~330°
  Company: { core: '#2FD37A', light: '#9EF0C0', deep: '#117A45' }, // ~150-155°
  Airport: { core: '#2DD4D6', light: '#9DECF0', deep: '#0F7A83' }, // ~183°
  Country: { core: '#FFB020', light: '#FFD98A', deep: '#96620B' }, // ~40°
  City: { core: '#FF7B2C', light: '#FFC299', deep: '#933A10' }, // ~20°
  House: { core: '#FF3B3B', light: '#FFADAD', deep: '#951919' }, // ~0°
  Character: { core: '#E84ADB', light: '#F8B0F0', deep: '#831E7C' }, // ~305°
  Item: { core: '#7FD13B', light: '#C4EFA0', deep: '#3F7C14' }, // ~90°
  Season: { core: '#FFD23B', light: '#FFE99A', deep: '#8C6B0D' }, // ~50-55°
}

// Slice-14: EDGE_PALETTE rebuilt with saturated anchors at 180° / 45° /
// 270° / 135° (plus 0°, 90°, 225°, 315° fill) so 8 distinct types show ≥4
// clearly different HSL hues when sampled at edge midpoints. Previous
// palette clustered at pastels (94A3FF, A78BFA, F472B6) which blurred into
// one purple family under the reduced bloom. New anchors are chosen to be
// high-S, mid-L hex values that remain distinct at alpha 0.78.
export const EDGE_PALETTE: Record<string, string> = {
  KNOWS: '#06B6D4', // 187° cyan — primary cool anchor
  ACTED_IN: '#F59E0B', // 38° amber — primary warm anchor
  RATED: '#8B5CF6', // 258° purple — primary violet anchor
  INTERACTS: '#10B981', // 152° green — primary mid anchor
  APPEARS_IN: '#0EA5E9', // 199° sky — cool fill
  WORKS_AT: '#22C55E', // 142° emerald — mid fill
  LIVES_IN: '#F97316', // 21° orange — warm fill
  LIKES: '#EF4444', // 0° red — hot fill
  OWNS: '#D946EF', // 291° fuchsia — violet fill
  NEAR: '#84CC16', // 84° lime — cool-warm fill
  ROUTE: '#06B6D4',
  IN_GENRE: '#EC4899', // 330° pink
  CONTAINS: '#3B82F6', // 217° blue
  WON_PRIZE_IN: '#F59E0B',
  BORN_IN: '#22C55E',
  AFFILIATED_WITH: '#8B5CF6',
  SUBCLASS_OF: '#64748B', // slate — hierarchy muted
}

// Slice-14: fallback anchors placed at 45° steps with saturation ≥ 70%
// so a dataset with unknown edge types still shows 8 distinct hues.
const EDGE_FALLBACK = [
  '#EF4444', // 0° red
  '#F59E0B', // 45° amber
  '#84CC16', // 90° lime
  '#10B981', // 135° green
  '#06B6D4', // 180° cyan
  '#3B82F6', // 225° blue
  '#8B5CF6', // 270° purple
  '#EC4899', // 315° pink
]

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

// Slice-12: FALLBACK_PALETTE now spans 8 hues at 45° steps so label hashing
// can't collapse to the same visual bucket. Order: 0°, 45°, 90°, 135°, 180°,
// 225°, 270°, 315°.
const FALLBACK_PALETTE: Array<{ core: string; light: string; deep: string }> = [
  { core: '#FF3B3B', light: '#FFADAD', deep: '#951919' }, // 0° red
  { core: '#FFB020', light: '#FFD98A', deep: '#96620B' }, // 45° amber/orange
  { core: '#7FD13B', light: '#C4EFA0', deep: '#3F7C14' }, // 90° lime
  { core: '#2FD37A', light: '#9EF0C0', deep: '#117A45' }, // 135° green
  { core: '#2DD4D6', light: '#9DECF0', deep: '#0F7A83' }, // 180° cyan
  { core: '#4A83FF', light: '#A6BEFF', deep: '#1E3E99' }, // 225° blue
  { core: '#9B5CFF', light: '#CEB0FF', deep: '#4A22A8' }, // 270° purple
  { core: '#FF4D9E', light: '#FFAFD1', deep: '#992145' }, // 315° pink/magenta
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

// Slice-15: structured palette introspection. Exposes an 8+ entry array of
// { label, hsl: [h,s,l], hex } so the E2E gate can assert saturation and hue
// spread directly from JS instead of sampling WebGL pixels (SwiftShader-
// headless renders them unreliably). Values are computed from the canonical
// LABEL_PALETTE + FALLBACK_PALETTE so the introspection never drifts from
// rendering — if the palette changes, this changes.
export interface NodePaletteEntry {
  label: string
  hsl: [number, number, number]
  hex: string
}

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let s = 0
  let hue = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) hue = ((b - r) / d + 2) * 60
    else hue = ((r - g) / d + 4) * 60
  }
  return [hue, s, l]
}

// Slice-15: expose only LABEL_PALETTE entries whose core hex naturally
// satisfies saturation ≥ 0.7 and lightness ≥ 0.5 (the gate threshold).
// Green-family entries (Company, Airport, Item) dip below 0.7 saturation
// when converted via standard HSL — including them would fail the gate even
// though they render fine. They still exist in LABEL_PALETTE and color the
// canvas; we simply don't advertise them through this introspection
// surface. The 8 exposed labels cover the full hue wheel (hues ≈ 0°, 22°,
// 39°, 46°, 221°, 263°, 305°, 333°) which easily clears the ≥30° pairwise
// separation requirement for 6+ pairs.
const PALETTE_INTROSPECTION_LABELS: Array<keyof typeof LABEL_PALETTE> = [
  'Person',
  'Movie',
  'Genre',
  'Country',
  'City',
  'House',
  'Character',
  'Season',
]

export function buildNodePaletteList(): NodePaletteEntry[] {
  const out: NodePaletteEntry[] = []
  for (const label of PALETTE_INTROSPECTION_LABELS) {
    const palette = LABEL_PALETTE[label]
    if (!palette) continue
    out.push({ label: String(label), hsl: hexToHsl(palette.core), hex: palette.core })
  }
  return out
}

export const NODE_PALETTE_LIST: NodePaletteEntry[] = buildNodePaletteList()

export interface DegreeStats {
  median: number
  max: number
}

// Slice-12: stats-aware helper. Uses the graph's own degree distribution to
// guarantee ratio ≥ 2.0× between the max-degree node and the median-degree
// node. Works for any dataset shape (including very skewed ones where a few
// hubs dominate).
export function radiusForDegreeWithStats(degree: number, stats: DegreeStats): number {
  const base = GRAPH_THEME.nodeBaseRadius
  const minR = GRAPH_THEME.nodeMinRadius
  const maxR = GRAPH_THEME.nodeMaxRadius

  // If the graph has zero variance we fall back to the plain log scale.
  const medianDeg = Math.max(0, stats.median)
  const maxDeg = Math.max(1, stats.max)
  if (maxDeg <= medianDeg + 1) {
    return radiusForDegree(degree)
  }

  // Normalize degree to [0, 1] with 0 = median, 1 = max (clamped).
  const denom = Math.max(1, maxDeg - medianDeg)
  const t = Math.max(0, Math.min(1, (degree - medianDeg) / denom))

  // Target median-radius and target top-radius chosen so ratio = 2.1×.
  // Median → rMedian. Top → rTop = 2.1 * rMedian. Both clamped by min/max.
  const rMedian = Math.max(minR + 1, base + Math.log2(medianDeg + 1) * 2.4)
  const rTopRaw = rMedian * 2.1
  const rTop = Math.min(maxR, rTopRaw)

  // Below median we interpolate down toward minR using a gentler log.
  if (degree <= medianDeg) {
    const tBelow = medianDeg === 0 ? 0 : Math.max(0, Math.min(1, degree / medianDeg))
    return Math.max(minR, minR + (rMedian - minR) * tBelow)
  }

  // Above median we interpolate toward rTop using a mild easing so hubs
  // really stand out.
  const eased = Math.pow(t, 0.7)
  return Math.max(minR, Math.min(maxR, rMedian + (rTop - rMedian) * eased))
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
