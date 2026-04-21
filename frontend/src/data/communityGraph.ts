import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

// Synthetic 4-cluster graph to showcase the canvas at real density.
// Clusters use distinct node labels and distinct edge types so the viewer
// sees both label-color variety and edge-type palette variety.

const CLUSTERS = [
  {
    key: 'tech',
    label: 'Person',
    seed: ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Guido'],
  },
  {
    key: 'film',
    label: 'Character',
    seed: ['Arwen', 'Frodo', 'Aragorn', 'Legolas', 'Gimli', 'Gandalf', 'Boromir', 'Sam'],
  },
  {
    key: 'geo',
    label: 'City',
    seed: ['Kyoto', 'Reykjavik', 'Porto', 'Prague', 'Quito', 'Lima', 'Oslo', 'Dakar'],
  },
  {
    key: 'biz',
    label: 'Company',
    seed: ['Helix', 'Nimbus', 'Tesseract', 'Lumen', 'Quill', 'Aster', 'Borealis', 'Vireo'],
  },
] as const

const NODES_PER_CLUSTER = 60
const INTER_CLUSTER_BRIDGES = 20

const INTRA_EDGE_TYPES: Record<string, string> = {
  tech: 'KNOWS',
  film: 'INTERACTS',
  geo: 'NEAR',
  biz: 'WORKS_AT',
}

const BRIDGE_EDGE_TYPES = ['LIVES_IN', 'LIKES', 'OWNS', 'RATED']

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(0xC0FFEE)

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length]
}

function buildCommunityGraph(): GraphData {
  const nodes: GraphNode[] = []
  const links: GraphEdge[] = []

  const clusterNodeIds: string[][] = []
  let edgeId = 1

  for (const cluster of CLUSTERS) {
    const ids: string[] = []
    for (let i = 0; i < NODES_PER_CLUSTER; i += 1) {
      const id = `cg-${cluster.key}-${i}`
      const seedName = cluster.seed[i % cluster.seed.length]
      const name = `${seedName} ${Math.floor(i / cluster.seed.length) + 1}`
      nodes.push({
        id,
        labels: [cluster.label],
        label: cluster.label,
        properties: {
          name,
          cluster: cluster.key,
          _label: cluster.label,
        },
      })
      ids.push(id)
    }
    clusterNodeIds.push(ids)

    // Intra-cluster connectivity: ring + a few random chords for community feel.
    const edgeType = INTRA_EDGE_TYPES[cluster.key]
    for (let i = 0; i < ids.length; i += 1) {
      const next = (i + 1) % ids.length
      links.push({
        id: `cg-e-${edgeId++}`,
        source: ids[i],
        target: ids[next],
        type: edgeType,
        properties: { weight: 1 },
      })
    }
    const chordCount = Math.floor(ids.length * 0.7)
    for (let c = 0; c < chordCount; c += 1) {
      const a = Math.floor(rng() * ids.length)
      let b = Math.floor(rng() * ids.length)
      if (a === b) b = (b + 1) % ids.length
      links.push({
        id: `cg-e-${edgeId++}`,
        source: ids[a],
        target: ids[b],
        type: edgeType,
        properties: { weight: 1 + Math.floor(rng() * 3) },
      })
    }
  }

  // Inter-cluster bridges using varied edge types — these produce visible
  // long edges when the force simulation spreads clusters apart.
  for (let i = 0; i < INTER_CLUSTER_BRIDGES; i += 1) {
    const ca = Math.floor(rng() * CLUSTERS.length)
    let cb = Math.floor(rng() * CLUSTERS.length)
    if (ca === cb) cb = (cb + 1) % CLUSTERS.length
    const srcIds = clusterNodeIds[ca]
    const dstIds = clusterNodeIds[cb]
    const src = srcIds[Math.floor(rng() * srcIds.length)]
    const dst = dstIds[Math.floor(rng() * dstIds.length)]
    links.push({
      id: `cg-b-${edgeId++}`,
      source: src,
      target: dst,
      type: pick(BRIDGE_EDGE_TYPES, rng()),
      properties: { weight: 1 },
    })
  }

  return { nodes, links }
}

export const COMMUNITY_SAMPLE: GraphData = buildCommunityGraph()

function cloneGraphData(data: GraphData): GraphData {
  return {
    nodes: data.nodes.map((n) => ({ ...n, labels: [...n.labels], properties: { ...n.properties } })),
    links: data.links.map((l) => ({
      ...l,
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      properties: { ...l.properties },
    })),
  }
}

function filterByClusterLabel(label: string) {
  return (data: GraphData): GraphData => {
    const nodes = data.nodes.filter((n) => n.labels?.[0] === label)
    const ids = new Set(nodes.map((n) => n.id))
    const links = data.links.filter((l) => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      return ids.has(s) && ids.has(t)
    })
    return {
      nodes: nodes.map((n) => ({ ...n, labels: [...n.labels], properties: { ...n.properties } })),
      links: links.map((l) => ({
        ...l,
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target,
        properties: { ...l.properties },
      })),
    }
  }
}

function filterBridgeEdges(data: GraphData): GraphData {
  const bridgeTypes = new Set(['LIVES_IN', 'LIKES', 'OWNS', 'RATED'])
  const links = data.links.filter((l) => bridgeTypes.has(l.type))
  const nodeIds = new Set<string | number>()
  for (const l of links) {
    nodeIds.add(typeof l.source === 'object' ? l.source.id : l.source)
    nodeIds.add(typeof l.target === 'object' ? l.target.id : l.target)
  }
  return {
    nodes: data.nodes
      .filter((n) => nodeIds.has(n.id))
      .map((n) => ({ ...n, labels: [...n.labels], properties: { ...n.properties } })),
    links: links.map((l) => ({
      ...l,
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      properties: { ...l.properties },
    })),
  }
}

export const COMMUNITY_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All communities',
    description: '4 clusters, dense intra-links, rare bridges',
    cypher: 'MATCH (n)-[r]-() RETURN n, r LIMIT 2000',
    expectedResultCount: COMMUNITY_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'people-cluster',
    label: 'Tech community',
    description: 'Person-labelled nodes and their KNOWS edges',
    cypher: 'MATCH (p:Person)-[r:KNOWS]-(q:Person) RETURN p, r, q',
    expectedResultCount: 60,
    filterFn: filterByClusterLabel('Person'),
    category: 'Explore',
  },
  {
    key: 'bridges',
    label: 'Cross-cluster bridges',
    description: 'Only the rare inter-cluster bridge edges',
    cypher:
      'MATCH (a)-[r:LIVES_IN|LIKES|OWNS|RATED]->(b) WHERE a.cluster <> b.cluster RETURN a, r, b',
    expectedResultCount: 20,
    filterFn: filterBridgeEdges,
    category: 'Traverse',
  },
]
