// Per-label color rotation in the AMBER-TERMINAL palette neighborhood.
// All hues kept in the warm/amber/cyan-accent ranges so the canvas reads
// as a cohesive identity, not a rainbow. Saturations and lightnesses are
// tuned so the six slots read with comparable visual punch — earlier
// palette versions left the teal (160°) and violet (280°) slots looking
// muted next to the amber (40°) and cyan (195°) slots, which collapsed
// the perceived hue separation in dense graphs.
export const NODE_PALETTE_DARK = [
  'hsl(40 95% 62%)',
  'hsl(195 92% 66%)',
  'hsl(20 92% 64%)',
  'hsl(160 78% 58%)',
  'hsl(282 72% 72%)',
  'hsl(50 95% 68%)',
] as const

export const NODE_PALETTE_LIGHT = [
  'hsl(36 92% 38%)',
  'hsl(195 82% 36%)',
  'hsl(20 82% 40%)',
  'hsl(160 70% 32%)',
  'hsl(282 60% 42%)',
  'hsl(50 80% 38%)',
] as const

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
// collisions in `paletteHash`. Falls back to the hash when no index is
// available (callers that don't have one, e.g. landing decorative graphs).
export function colorForLabel(
  label: string | undefined,
  isDark: boolean,
  labelIndex?: Map<string, number>,
): string {
  const palette = isDark ? NODE_PALETTE_DARK : NODE_PALETTE_LIGHT
  const fallback = palette[0] ?? 'hsl(0 0% 50%)'
  if (!label) return fallback
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

export const EDGE_COLOR_DARK = 'hsla(36 30% 60% / 0.35)'
export const EDGE_COLOR_LIGHT = 'hsla(24 25% 30% / 0.35)'
export const EDGE_HOVER_DARK = 'hsl(40 95% 75%)'
export const EDGE_HOVER_LIGHT = 'hsl(36 92% 45%)'
