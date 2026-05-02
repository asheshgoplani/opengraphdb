// Bold-redesign palette: three categorical hues (Movie cream, Genre purple,
// Person teal) override the per-label hash routing for the curated triple,
// while the residual palette slots stay in the warm/amber neighbourhood for
// unknown labels (one-off ontologies the user imports). Cycle-12 routed all
// labels through a tonal-amber palette, which collapsed the three primary
// node types onto neighbouring tans on the dark backdrop.

// The three named categorical hexes the brief calls out. Listed first in
// the palette so callers using `paletteHash` for unknown labels still pick
// up the categorical hues for the common case (Movie/Genre/Person datasets).
export const NODE_PALETTE_DARK = [
  '#F5E6C8', // Movie — cream (warm-bg friendly foreground)
  '#9B6BFF', // Genre — saturated purple
  '#5FD3C6', // Person — saturated teal
  'hsl(20 92% 64%)',
  'hsl(50 95% 68%)',
  'hsl(282 72% 72%)',
] as const

export const NODE_PALETTE_LIGHT = [
  '#A8884E', // Movie — darkened cream for light-mode contrast
  '#5B33C7', // Genre — darker purple
  '#2F8B82', // Person — darker teal
  'hsl(20 82% 40%)',
  'hsl(50 80% 38%)',
  'hsl(282 60% 42%)',
] as const

// Curated label → categorical-hex map. Lookup is case-sensitive on the
// PRIMARY label; ontologies that use lowercase / pluralised variants fall
// through to the hash-fallback (which is fine — the *named* hue separation
// only matters for the canonical Movie/Genre/Person trio that ships in
// every demo dataset).
export const KNOWN_LABEL_COLORS_DARK: ReadonlyMap<string, string> = new Map([
  ['Movie', '#F5E6C8'],
  ['Genre', '#9B6BFF'],
  ['Person', '#5FD3C6'],
])
export const KNOWN_LABEL_COLORS_LIGHT: ReadonlyMap<string, string> = new Map([
  ['Movie', '#A8884E'],
  ['Genre', '#5B33C7'],
  ['Person', '#2F8B82'],
])

// Warm-only subset for surfaces that must read as pure AMBER-TERMINAL —
// landing illustrative / decorative graphs where 2-3 labels would otherwise
// land on cyan/teal entries and break palette cohesion.
export const WARM_PALETTE_DARK = [
  'hsl(40 95% 62%)',
  'hsl(20 85% 65%)',
  'hsl(50 90% 70%)',
  'hsl(30 90% 60%)',
] as const

function paletteHash(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) | 0
  return Math.abs(h)
}

// `labelIndex` (when supplied) is the deterministic-by-dataset label→index
// map computed once per render of the playground graph. Routing through it
// guarantees that each *distinct* label in the dataset gets a *distinct*
// palette slot up to palette length, instead of being subject to hash
// collisions in `paletteHash`.
//
// Categorical override: known labels (Movie/Genre/Person) bypass the
// palette routing entirely and return their named hex. This is the visible
// delta vs cycle-12 — those three labels now read as cream/purple/teal
// regardless of dataset ordering.
export function colorForLabel(
  label: string | undefined,
  isDark: boolean,
  labelIndex?: Map<string, number>,
): string {
  const palette = isDark ? NODE_PALETTE_DARK : NODE_PALETTE_LIGHT
  const fallback = palette[0] ?? 'hsl(0 0% 50%)'
  if (!label) return fallback
  const knownMap = isDark ? KNOWN_LABEL_COLORS_DARK : KNOWN_LABEL_COLORS_LIGHT
  const known = knownMap.get(label)
  if (known) return known
  const idx = labelIndex?.get(label)
  if (typeof idx === 'number') {
    return palette[idx % palette.length] ?? fallback
  }
  return palette[paletteHash(label) % palette.length] ?? fallback
}

export function warmColorForLabel(label: string | undefined): string {
  const fallback = WARM_PALETTE_DARK[0] ?? 'hsl(40 95% 62%)'
  if (!label) return fallback
  return WARM_PALETTE_DARK[paletteHash(label) % WARM_PALETTE_DARK.length] ?? fallback
}

// Edge stroke colors. Bold-redesign value: rgba(255,180,120,0.55) — warm
// orange at 0.55 alpha so edges read as connective tissue at first paint.
// Cycle-12 was hsla(36 35% 65% / 0.5), which presented as a near-invisible
// haze against the playground backdrop.
export const EDGE_COLOR_DARK = 'rgba(255,180,120,0.55)'
export const EDGE_COLOR_LIGHT = 'hsla(24 28% 32% / 0.45)'
export const EDGE_HOVER_DARK = 'hsl(40 95% 75%)'
export const EDGE_HOVER_LIGHT = 'hsl(36 92% 45%)'

// Stroke widths. Bold-redesign bump 1.7 → 2.8 so default edges read as
// connective tissue, not hairline. Focus stroke widens further so the
// focused subgraph stands out at a glance even before the alpha tiering.
export const EDGE_WIDTH_BASE = 2.8
export const EDGE_WIDTH_FOCUS = 3.6

// Subtle blur halo (px) applied ONLY on edges connected to the focused
// node. Globally-applied shadowBlur is the most expensive 2D-canvas op
// and would smear the entire graph; gating it on focus is the brief's
// explicit ask.
export const EDGE_HALO_BLUR_PX = 2

// Pure helper extracted from the ObsidianGraph drawLink callback so the
// stroke + halo contract is unit-testable with a mock CanvasRenderingContext.
// `isFocusEdge` true → FOCUS width + blur halo + hover color.
// `isFocusEdge` false → BASE width + zero halo + base color.
export function applyEdgeStrokeStyle(
  ctx: CanvasRenderingContext2D,
  opts: { isFocusEdge: boolean; isDark: boolean },
): void {
  const baseColor = opts.isDark ? EDGE_COLOR_DARK : EDGE_COLOR_LIGHT
  const hoverColor = opts.isDark ? EDGE_HOVER_DARK : EDGE_HOVER_LIGHT
  if (opts.isFocusEdge) {
    ctx.strokeStyle = hoverColor
    ctx.lineWidth = EDGE_WIDTH_FOCUS
    ctx.shadowColor = hoverColor
    ctx.shadowBlur = EDGE_HALO_BLUR_PX
  } else {
    ctx.strokeStyle = baseColor
    ctx.lineWidth = EDGE_WIDTH_BASE
    // Explicitly clear shadowBlur — without this, a leftover from a prior
    // focus-edge draw would smear non-focus edges.
    ctx.shadowBlur = 0
  }
}

// Apply alpha to either a hex (#RRGGBB) or hsl(...) color string. Used
// by the focused-node halo gradient — cycle-12 string-replaced 'hsl' →
// 'hsla' to inject alpha, which silently no-ops for hex palette entries.
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const expanded =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex
    const n = parseInt(expanded, 16)
    const r = (n >> 16) & 0xff
    const g = (n >> 8) & 0xff
    const b = n & 0xff
    return `rgba(${r},${g},${b},${alpha})`
  }
  if (color.startsWith('hsl(')) {
    return color.replace(/^hsl\(/, 'hsla(').replace(/\)$/, ` / ${alpha})`)
  }
  if (color.startsWith('rgb(')) {
    return color.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `, ${alpha})`)
  }
  return color
}
