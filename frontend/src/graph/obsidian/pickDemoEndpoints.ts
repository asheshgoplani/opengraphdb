// Phase-3 STORY — demo path picker.
//
// Extracted from DemoPathButton.tsx so the component file exports only
// React components (react-refresh requirement). Picks the densest Genre
// + densest Movie connected by 1+ hops; falls back to the two
// highest-degree connected nodes when those labels aren't present.

import type { GraphData } from '@/types/graph'

function buildAdjacency(graphData: GraphData): Map<string | number, Set<string | number>> {
  const adj = new Map<string | number, Set<string | number>>()
  for (const link of graphData.links) {
    const sId = typeof link.source === 'object' ? link.source.id : link.source
    const tId = typeof link.target === 'object' ? link.target.id : link.target
    if (sId == null || tId == null) continue
    if (!adj.has(sId)) adj.set(sId, new Set())
    if (!adj.has(tId)) adj.set(tId, new Set())
    adj.get(sId)!.add(tId)
    adj.get(tId)!.add(sId)
  }
  return adj
}

function bfsPath(
  adj: Map<string | number, Set<string | number>>,
  from: string | number,
  to: string | number,
): Array<string | number> | null {
  if (from === to) return [from]
  const visited = new Set<string | number>([from])
  const parent = new Map<string | number, string | number>()
  const queue: Array<string | number> = [from]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur === to) {
      const path: Array<string | number> = [to]
      let p: string | number | undefined = parent.get(to)
      while (p != null) {
        path.unshift(p)
        if (p === from) break
        p = parent.get(p)
      }
      return path
    }
    const neighbors = adj.get(cur)
    if (!neighbors) continue
    for (const n of neighbors) {
      if (visited.has(n)) continue
      visited.add(n)
      parent.set(n, cur)
      queue.push(n)
    }
  }
  return null
}

function densestOfLabel(
  graphData: GraphData,
  adj: Map<string | number, Set<string | number>>,
  label: string,
): string | number | null {
  let best: string | number | null = null
  let bestDeg = -1
  for (const n of graphData.nodes) {
    if (n.labels?.[0] !== label) continue
    const deg = adj.get(n.id)?.size ?? 0
    if (deg > bestDeg || (deg === bestDeg && best != null && String(n.id) < String(best))) {
      best = n.id
      bestDeg = deg
    }
  }
  return best
}

export function pickDemoEndpoints(graphData: GraphData): Array<string | number> | null {
  if (graphData.nodes.length < 2 || graphData.links.length === 0) return null
  const adj = buildAdjacency(graphData)

  const genre = densestOfLabel(graphData, adj, 'Genre')
  const movie = densestOfLabel(graphData, adj, 'Movie')
  if (genre != null && movie != null && genre !== movie) {
    const p = bfsPath(adj, genre, movie)
    if (p && p.length >= 2) return p
  }

  const ranked = [...graphData.nodes].sort(
    (a, b) => (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0),
  )
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < Math.min(ranked.length, i + 6); j += 1) {
      const a = ranked[i]
      const b = ranked[j]
      if (!a || !b) continue
      const p = bfsPath(adj, a.id, b.id)
      if (p && p.length >= 2) return p
    }
  }
  return null
}
