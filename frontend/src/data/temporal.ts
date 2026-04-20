import type { GraphData, GraphNode } from '@/types/graph'
import type { DatasetKey } from './datasets'

export interface TemporalRange {
  min: number
  max: number
  unit: 'year' | 'season'
  label: string
  ticks: TemporalTick[]
}

export interface TemporalTick {
  value: number
  label: string
}

const MOVIELENS_FALLBACK_YEAR = 1957
const GOT_FALLBACK_SEASON = 1

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function gotFirstSeason(node: GraphNode): number | null {
  if (node.labels?.includes('Season')) {
    return toNum(node.properties?.number) ?? GOT_FALLBACK_SEASON
  }
  if (!node.labels?.includes('Character')) return null
  const idStr = String(node.id)
  // Synthesized below from APPEARS_IN edges; see precomputeGotValidFrom.
  return GOT_PRECOMPUTED.get(idStr) ?? GOT_FALLBACK_SEASON
}

const GOT_PRECOMPUTED = new Map<string, number>()

export function precomputeGotValidFrom(graph: GraphData): void {
  if (GOT_PRECOMPUTED.size > 0) return
  const seasonByNode = new Map<string, number>()
  for (const node of graph.nodes) {
    if (node.labels?.includes('Season')) {
      const num = toNum(node.properties?.number)
      if (num != null) seasonByNode.set(String(node.id), num)
    }
  }
  for (const link of graph.links) {
    if (link.type !== 'APPEARS_IN') continue
    const src = typeof link.source === 'object' ? link.source.id : link.source
    const tgt = typeof link.target === 'object' ? link.target.id : link.target
    const seasonNum = seasonByNode.get(String(tgt))
    if (seasonNum == null) continue
    const charKey = String(src)
    const existing = GOT_PRECOMPUTED.get(charKey)
    if (existing == null || seasonNum < existing) {
      GOT_PRECOMPUTED.set(charKey, seasonNum)
    }
  }
}

export function getValidFrom(node: GraphNode, dataset: DatasetKey): number | null {
  if (dataset === 'movielens') {
    if (node.labels?.includes('Movie')) {
      return toNum(node.properties?.released) ?? MOVIELENS_FALLBACK_YEAR
    }
    if (node.labels?.includes('Genre')) {
      return MOVIELENS_FALLBACK_YEAR
    }
    return null
  }
  if (dataset === 'got') {
    return gotFirstSeason(node)
  }
  return null
}

const MOVIELENS_TICKS: TemporalTick[] = [
  { value: 1957, label: '1957' },
  { value: 1980, label: '1980' },
  { value: 1995, label: '1995' },
  { value: 2008, label: '2008' },
  { value: 2019, label: 'now' },
]

const GOT_TICKS: TemporalTick[] = [
  { value: 1, label: 'S1' },
  { value: 2, label: 'S2' },
  { value: 3, label: 'S3' },
  { value: 4, label: 'S4' },
  { value: 5, label: 'S5' },
  { value: 6, label: 'S6' },
  { value: 7, label: 'S7' },
  { value: 8, label: 'S8' },
]

export function getTemporalRange(dataset: DatasetKey, graph: GraphData): TemporalRange | null {
  if (dataset === 'movielens') {
    const years = graph.nodes
      .map((n) => getValidFrom(n, dataset))
      .filter((v): v is number => v != null)
    const min = years.length ? Math.min(...years) : MOVIELENS_FALLBACK_YEAR
    const max = years.length ? Math.max(...years) : 2019
    return { min, max, unit: 'year', label: 'Release year', ticks: MOVIELENS_TICKS }
  }
  if (dataset === 'got') {
    precomputeGotValidFrom(graph)
    return { min: 1, max: 8, unit: 'season', label: 'Season', ticks: GOT_TICKS }
  }
  return null
}

export function isTemporalDataset(dataset: DatasetKey): boolean {
  return dataset === 'movielens' || dataset === 'got'
}

// Apply the cutoff: keep nodes whose valid_from <= cutoff, drop links whose endpoints disappear.
export function applyTimeCutoff(
  graph: GraphData,
  dataset: DatasetKey,
  cutoff: number | null,
): GraphData {
  if (cutoff == null) return graph
  if (!isTemporalDataset(dataset)) return graph
  if (dataset === 'got') precomputeGotValidFrom(graph)

  const survivingIds = new Set<string | number>()
  const survivingNodes = graph.nodes.filter((node) => {
    const validFrom = getValidFrom(node, dataset)
    if (validFrom == null) {
      survivingIds.add(node.id)
      return true
    }
    if (validFrom <= cutoff) {
      survivingIds.add(node.id)
      return true
    }
    return false
  })
  const survivingLinks = graph.links.filter((link) => {
    const src = typeof link.source === 'object' ? link.source.id : link.source
    const tgt = typeof link.target === 'object' ? link.target.id : link.target
    return survivingIds.has(src) && survivingIds.has(tgt)
  })
  return { nodes: survivingNodes, links: survivingLinks }
}

export interface CompactDiff {
  beforeBytes: number
  afterBytes: number
  versionsBefore: number
  versionsAfter: number
  reclaimedPct: number
}

// Synthesize a believable compact diff from the dataset size. Real wiring would call
// ogdb-core::compact_temporal_versions and read the .ogdb file size before/after.
export function simulateCompactHistory(graph: GraphData, range: TemporalRange | null): CompactDiff {
  const versionsPerNode = range ? Math.max(2, Math.round((range.max - range.min) / 4) + 2) : 4
  const versionsBefore = graph.nodes.length * versionsPerNode
  const versionsAfter = graph.nodes.length
  const beforeBytes = versionsBefore * 168 + graph.links.length * 96
  const afterBytes = versionsAfter * 168 + graph.links.length * 96
  const reclaimedPct = beforeBytes > 0 ? Math.round(((beforeBytes - afterBytes) / beforeBytes) * 100) : 0
  return { beforeBytes, afterBytes, versionsBefore, versionsAfter, reclaimedPct }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
