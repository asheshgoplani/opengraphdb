import type { GraphEdge } from '@/types/graph'

// Assign a curvature offset to each link based on how many parallel
// (source↔target) edges share the same endpoints. Without this, multiple
// relationships between the same pair of nodes stack on top of each other
// and read as a single thick line.
//
// Algorithm (Vasturiano-canonical):
//   - Group links by undirected key `min(s,t)|max(s,t)`.
//   - For a group of k links, assign curvatures evenly spaced in [-C, +C]
//     so that even-count groups straddle the straight line and odd-count
//     groups put the middle link on the straight line.
//   - Self-loops (s === t) get a single fixed loop curvature.
export function assignParallelCurvatures<L extends GraphEdge>(
  links: L[],
  baseCurvature = 0.18,
): Array<L & { curvature: number }> {
  const groups = new Map<string, L[]>()
  for (const link of links) {
    const s = typeof link.source === 'object' ? link.source.id : link.source
    const t = typeof link.target === 'object' ? link.target.id : link.target
    const a = String(s)
    const b = String(t)
    const key = a === b ? `self|${a}` : a < b ? `${a}|${b}` : `${b}|${a}`
    const arr = groups.get(key) ?? []
    arr.push(link)
    groups.set(key, arr)
  }
  const out: Array<L & { curvature: number }> = []
  for (const arr of groups.values()) {
    const k = arr.length
    arr.forEach((link, i) => {
      let curvature: number
      const s = typeof link.source === 'object' ? link.source.id : link.source
      const t = typeof link.target === 'object' ? link.target.id : link.target
      if (s === t) {
        curvature = 0.6
      } else if (k === 1) {
        curvature = 0
      } else {
        const half = (k - 1) / 2
        curvature = ((i - half) / Math.max(1, half)) * baseCurvature
      }
      out.push({ ...link, curvature })
    })
  }
  return out
}
