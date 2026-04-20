import { embed, cosine } from '@/data/embeddings/movielensEmbeddings'
import { MOVIELENS_SAMPLE } from '@/data/movieLensGraph'
import type { GraphNode } from '@/types/graph'

export type SearchMode = 'fulltext' | 'vector' | 'hybrid'

export interface SearchCorpusItem {
  id: string | number
  title: string
  genre: string
  label: string
  node: GraphNode
  tokens: string[]
  embedding: number[]
  centrality: number
}

export interface SearchHit {
  item: SearchCorpusItem
  bm25: number
  cosine: number
  graphBoost: number
  rrf: number
  rankBm25: number | null
  rankVector: number | null
  finalScore: number
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function buildMovieLensCorpus(): SearchCorpusItem[] {
  const data = MOVIELENS_SAMPLE
  const movies: GraphNode[] = data.nodes.filter((node: GraphNode) =>
    node.labels.includes('Movie'),
  )
  const maxRating = movies.reduce(
    (acc: number, node: GraphNode) =>
      Math.max(acc, Number(node.properties?.ratingCount ?? 0)),
    1,
  )

  return movies.map((node: GraphNode) => {
    const title = String(node.properties?.title ?? node.id)
    const genre = String(node.properties?.genres ?? '')
    const ratingCount = Number(node.properties?.ratingCount ?? 0)
    const tokens = tokenize(`${title} ${genre}`)
    return {
      id: node.id,
      title,
      genre,
      label: genre,
      node,
      tokens,
      embedding: embed(title, genre),
      centrality: ratingCount / maxRating,
    }
  })
}

let cachedCorpus: SearchCorpusItem[] | null = null

export function getMovieLensCorpus(): SearchCorpusItem[] {
  if (!cachedCorpus) cachedCorpus = buildMovieLensCorpus()
  return cachedCorpus
}

interface Bm25Opts {
  k1?: number
  b?: number
}

function bm25Scores(corpus: SearchCorpusItem[], queryTokens: string[], opts: Bm25Opts = {}): number[] {
  const k1 = opts.k1 ?? 1.5
  const b = opts.b ?? 0.75
  const N = corpus.length
  const avgDl = corpus.reduce((acc, item) => acc + item.tokens.length, 0) / Math.max(1, N)

  const df = new Map<string, number>()
  for (const item of corpus) {
    const seen = new Set(item.tokens)
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1)
  }

  return corpus.map((item) => {
    const tfMap = new Map<string, number>()
    for (const t of item.tokens) tfMap.set(t, (tfMap.get(t) ?? 0) + 1)
    const dl = item.tokens.length

    let score = 0
    for (const qt of queryTokens) {
      const tf = tfMap.get(qt) ?? 0
      if (tf === 0) continue
      const n = df.get(qt) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const num = tf * (k1 + 1)
      const denom = tf + k1 * (1 - b + (b * dl) / avgDl)
      score += idf * (num / denom)
    }
    return score
  })
}

function vectorScores(corpus: SearchCorpusItem[], queryVec: number[]): number[] {
  return corpus.map((item) => cosine(item.embedding, queryVec))
}

function rankIndex(scores: number[]): Map<number, number> {
  const order = scores
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
  const map = new Map<number, number>()
  order.forEach((x, rank) => map.set(x.i, rank + 1))
  return map
}

const RRF_K = 60

export function runSearch(
  query: string,
  mode: SearchMode,
  topK = 5,
): SearchHit[] {
  const corpus = getMovieLensCorpus()
  const queryTokens = tokenize(query)
  const queryVec = embed(query)

  const bm25 = bm25Scores(corpus, queryTokens)
  const vec = vectorScores(corpus, queryVec)

  const bm25Ranks = rankIndex(bm25)
  const vecRanks = rankIndex(vec)

  const hits: SearchHit[] = corpus.map((item, i) => {
    const bm25r = bm25Ranks.get(i) ?? null
    const vecr = vecRanks.get(i) ?? null
    const graphBoost = item.centrality

    let rrf = 0
    if (bm25r != null) rrf += 1 / (RRF_K + bm25r)
    if (vecr != null) rrf += 1 / (RRF_K + vecr)
    // Graph boost — small RRF-scale contribution from popularity (proxy for graph centrality)
    rrf += graphBoost * (1 / (RRF_K + 1)) * 0.35

    let finalScore = 0
    if (mode === 'fulltext') finalScore = bm25[i]
    else if (mode === 'vector') finalScore = vec[i]
    else finalScore = rrf

    return {
      item,
      bm25: bm25[i],
      cosine: vec[i],
      graphBoost,
      rrf,
      rankBm25: bm25r,
      rankVector: vecr,
      finalScore,
    }
  })

  const sorted = hits
    .filter((h) => {
      if (mode === 'fulltext') return h.bm25 > 0
      if (mode === 'vector') return h.cosine > 0
      return h.bm25 > 0 || h.cosine > 0
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topK)

  return sorted
}
