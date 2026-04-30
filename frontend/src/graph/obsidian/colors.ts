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

export function colorForLabel(label: string | undefined, isDark: boolean): string {
  const palette = isDark ? NODE_PALETTE_DARK : NODE_PALETTE_LIGHT
  if (!label) return palette[0]
  let h = 0
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

export const EDGE_COLOR_DARK = 'hsla(36 30% 60% / 0.35)'
export const EDGE_COLOR_LIGHT = 'hsla(24 25% 30% / 0.35)'
export const EDGE_HOVER_DARK = 'hsl(40 95% 75%)'
export const EDGE_HOVER_LIGHT = 'hsl(36 92% 45%)'
