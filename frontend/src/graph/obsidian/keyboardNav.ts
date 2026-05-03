import type { GraphData, GraphNode } from '@/types/graph'

// Phase-4 A11Y — keyboard nav helpers + ARIA live announcer.
//
// Pure module (no React, no DOM globals at import) so it stays SSR-safe
// and unit-testable. ObsidianGraph wires the returned helpers into real
// DOM listeners.

export interface NeighbourLookup {
  next: (
    fromId: string | number,
    direction: 'up' | 'down' | 'left' | 'right',
  ) => string | number | null
  search: (query: string) => GraphNode | null
}

export function buildNeighbourLookup(graphData: GraphData): NeighbourLookup {
  const nodesById = new Map<string | number, GraphNode>()
  for (const n of graphData.nodes) nodesById.set(n.id, n)

  const adjacency = new Map<string | number, Array<string | number>>()
  for (const l of graphData.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source
    const t = typeof l.target === 'object' ? l.target.id : l.target
    if (s == null || t == null) continue
    if (!adjacency.has(s)) adjacency.set(s, [])
    if (!adjacency.has(t)) adjacency.set(t, [])
    adjacency.get(s)!.push(t)
    adjacency.get(t)!.push(s)
  }

  const next: NeighbourLookup['next'] = (fromId, direction) => {
    const from = nodesById.get(fromId)
    const neighbours = adjacency.get(fromId)
    if (!neighbours || neighbours.length === 0) return null
    if (
      !from ||
      typeof from.x !== 'number' ||
      typeof from.y !== 'number'
    ) {
      return neighbours[0] ?? null
    }
    let best: string | number | null = null
    let bestScore = -Infinity
    for (const id of neighbours) {
      const n = nodesById.get(id)
      if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') continue
      const dx = n.x - from.x
      const dy = n.y - from.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const ux = dx / len
      const uy = dy / len
      let score = 0
      if (direction === 'right') score = ux
      else if (direction === 'left') score = -ux
      else if (direction === 'down') score = uy
      else if (direction === 'up') score = -uy
      if (score > bestScore) {
        bestScore = score
        best = id
      }
    }
    return best ?? neighbours[0] ?? null
  }

  const search: NeighbourLookup['search'] = (query) => {
    if (!query) return null
    const q = query.trim().toLowerCase()
    if (!q) return null
    let best: GraphNode | null = null
    let bestRank = Infinity
    for (const n of graphData.nodes) {
      const candidates = [
        n.label,
        ...(n.labels ?? []),
        String(n.id),
        ...Object.values(n.properties ?? {}).map((v) =>
          v == null ? '' : String(v),
        ),
      ]
      for (const raw of candidates) {
        if (!raw) continue
        const lower = String(raw).toLowerCase()
        const idx = lower.indexOf(q)
        if (idx < 0) continue
        const rank = idx
        if (rank < bestRank) {
          bestRank = rank
          best = n
        }
      }
    }
    return best
  }

  return { next, search }
}

export function formatFocusAnnouncement(
  node: GraphNode | null,
  degree: number,
): string {
  if (!node) return ''
  const label = (node.label ?? node.labels?.[0] ?? String(node.id)) as string
  const type = node.labels?.[0] ?? '(untyped)'
  const connections =
    degree === 1 ? '1 connection' : `${degree} connections`
  return `Selected: ${label}. Type: ${type}. ${connections}.`
}

export function createDebouncedAnnouncer(
  region: HTMLElement,
  windowMs = 600,
): {
  announce: (text: string) => void
  flush: () => void
  clear: () => void
} {
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastEmit = 0

  const emit = () => {
    if (pending == null) return
    region.textContent = pending
    lastEmit = Date.now()
    pending = null
    timer = null
  }

  const announce = (text: string) => {
    pending = text
    const now = Date.now()
    const elapsed = now - lastEmit
    if (elapsed >= windowMs) {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
      emit()
      return
    }
    if (timer == null) {
      timer = setTimeout(emit, windowMs - elapsed)
    }
  }

  const flush = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    emit()
  }

  const clear = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    pending = null
  }

  return { announce, flush, clear }
}
