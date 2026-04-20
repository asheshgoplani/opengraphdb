import { paletteForLabel } from '@/graph/theme'

export type Rgba = [number, number, number, number]

function parseHex(hex: string): Rgba {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return [r, g, b, 1]
}

export function colorForNode(labels: string[] | undefined, alpha = 1): Rgba {
  const palette = paletteForLabel(labels?.[0])
  const [r, g, b] = parseHex(palette.core)
  return [r, g, b, alpha]
}

export function lightColorForNode(labels: string[] | undefined, alpha = 1): Rgba {
  const palette = paletteForLabel(labels?.[0])
  const [r, g, b] = parseHex(palette.light)
  return [r, g, b, alpha]
}

export const EDGE_COLOR: Rgba = [148, 163, 255, 0.28]
export const EDGE_HOVER_COLOR: Rgba = [200, 215, 255, 0.78]
export const EDGE_TRACE_COLOR: Rgba = [253, 224, 71, 0.9]
