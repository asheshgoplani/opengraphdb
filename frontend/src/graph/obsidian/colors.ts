// Per-label color rotation in the AMBER-TERMINAL palette neighborhood.
// All hues kept in the warm/amber/cyan-accent ranges so the canvas reads
// as a cohesive identity, not a rainbow.
export const NODE_PALETTE_DARK = [
  'hsl(40 95% 62%)',
  'hsl(195 90% 65%)',
  'hsl(20 85% 65%)',
  'hsl(160 60% 60%)',
  'hsl(280 55% 70%)',
  'hsl(50 90% 70%)',
] as const

export const NODE_PALETTE_LIGHT = [
  'hsl(36 92% 38%)',
  'hsl(195 78% 38%)',
  'hsl(20 75% 42%)',
  'hsl(160 50% 35%)',
  'hsl(280 45% 45%)',
  'hsl(50 75% 42%)',
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

export function colorForLabel(label: string | undefined, isDark: boolean): string {
  const palette = isDark ? NODE_PALETTE_DARK : NODE_PALETTE_LIGHT
  const fallback = palette[0] ?? 'hsl(0 0% 50%)'
  if (!label) return fallback
  let h = 0
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length] ?? fallback
}

export function warmColorForLabel(label: string | undefined): string {
  const fallback = WARM_PALETTE_DARK[0] ?? 'hsl(40 95% 62%)'
  if (!label) return fallback
  let h = 0
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) | 0
  return WARM_PALETTE_DARK[Math.abs(h) % WARM_PALETTE_DARK.length] ?? fallback
}

export const EDGE_COLOR_DARK = 'hsla(36 30% 60% / 0.35)'
export const EDGE_COLOR_LIGHT = 'hsla(24 25% 30% / 0.35)'
export const EDGE_HOVER_DARK = 'hsl(40 95% 75%)'
export const EDGE_HOVER_LIGHT = 'hsl(36 92% 45%)'
