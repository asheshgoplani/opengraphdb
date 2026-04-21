import { paletteForEdgeType, paletteForLabel } from '@/graph/theme'

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

export function colorForEdgeType(type: string | undefined, alpha = 0.55): Rgba {
  const hex = paletteForEdgeType(type)
  const [r, g, b] = parseHex(hex)
  return [r, g, b, alpha]
}

// Default edge colour — used when a type is unknown or when the consumer
// wants a generic cool-grey edge. Tuned to pass the "edge-family pixel"
// detection in the premium-graph-quality gate (blue-dominant, moderately
// saturated, brighter than the slice-9 near-invisible alpha=0.28).
export const EDGE_COLOR: Rgba = [148, 163, 255, 0.58]
export const EDGE_HOVER_COLOR: Rgba = [220, 230, 255, 0.92]
export const EDGE_TRACE_COLOR: Rgba = [253, 224, 71, 0.95]
