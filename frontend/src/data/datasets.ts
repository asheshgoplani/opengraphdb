import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { FRAUD_QUERIES, FRAUD_SAMPLE } from './fraudGraph.js'
import { MOVIES_SAMPLE } from './sampleGraph.js'
import { SOCIAL_QUERIES, SOCIAL_SAMPLE, type GuidedQuery } from './socialGraph.js'

export type { GuidedQuery }

export type DatasetKey = 'movies' | 'social' | 'fraud'

export interface DatasetMeta {
  key: DatasetKey
  name: string
  description: string
  nodeCount: number
  linkCount: number
  labels: string[]
}

interface DatasetEntry {
  data: GraphData
  queries: GuidedQuery[]
  meta: DatasetMeta
}

function toNodeId(value: string | number | GraphNode): string | number {
  return typeof value === 'object' ? value.id : value
}

function cloneNode(node: GraphNode): GraphNode {
  return {
    ...node,
    labels: [...node.labels],
    properties: { ...node.properties },
  }
}

function cloneLink(link: GraphEdge): GraphEdge {
  return {
    ...link,
    source: toNodeId(link.source),
    target: toNodeId(link.target),
    properties: { ...link.properties },
  }
}

function cloneGraphData(data: GraphData): GraphData {
  return {
    nodes: data.nodes.map(cloneNode),
    links: data.links.map(cloneLink),
  }
}

function buildRelationshipSubgraph(data: GraphData, relationshipTypes: string[]): GraphData {
  const typeSet = new Set(relationshipTypes)
  const links = data.links.filter((link) => typeSet.has(link.type))
  const referencedNodeIds = new Set<string | number>()

  for (const link of links) {
    referencedNodeIds.add(toNodeId(link.source))
    referencedNodeIds.add(toNodeId(link.target))
  }

  return {
    nodes: data.nodes.filter((node) => referencedNodeIds.has(node.id)).map(cloneNode),
    links: links.map(cloneLink),
  }
}

function buildDatasetMeta(key: DatasetKey, name: string, description: string, data: GraphData): DatasetMeta {
  return {
    key,
    name,
    description,
    nodeCount: data.nodes.length,
    linkCount: data.links.length,
    labels: [...new Set(data.nodes.flatMap((node) => node.labels))].sort(),
  }
}

const MOVIES_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All graph data',
    description: 'Movies and people in one view',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: MOVIES_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
  },
  {
    key: 'movies-only',
    label: 'Movies only',
    description: 'Show only Movie nodes',
    cypher: 'MATCH (m:Movie) RETURN m',
    expectedResultCount: MOVIES_SAMPLE.nodes.filter((node) => node.labels.includes('Movie')).length,
    filterFn: (data) => ({
      nodes: data.nodes.filter((node) => node.labels.includes('Movie')).map(cloneNode),
      links: [],
    }),
  },
  {
    key: 'actors-only',
    label: 'People only',
    description: 'Show only Person nodes',
    cypher: 'MATCH (p:Person) RETURN p',
    expectedResultCount: MOVIES_SAMPLE.nodes.filter((node) => node.labels.includes('Person')).length,
    filterFn: (data) => ({
      nodes: data.nodes.filter((node) => node.labels.includes('Person')).map(cloneNode),
      links: [],
    }),
  },
  {
    key: 'acted-in',
    label: 'Acted in',
    description: 'Actors and the movies they acted in',
    cypher: 'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p, m',
    expectedResultCount: MOVIES_SAMPLE.links.filter((link) => link.type === 'ACTED_IN').length,
    filterFn: (data) => buildRelationshipSubgraph(data, ['ACTED_IN']),
  },
  {
    key: 'directed',
    label: 'Directed',
    description: 'Directors and the movies they directed',
    cypher: 'MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p, m',
    expectedResultCount: MOVIES_SAMPLE.links.filter((link) => link.type === 'DIRECTED').length,
    filterFn: (data) => buildRelationshipSubgraph(data, ['DIRECTED']),
  },
]

export const DATASETS: Record<DatasetKey, DatasetEntry> = {
  movies: {
    data: MOVIES_SAMPLE,
    queries: MOVIES_QUERIES,
    meta: buildDatasetMeta(
      'movies',
      'Movies Knowledge Graph',
      'Classic movie graph with people and relationships',
      MOVIES_SAMPLE
    ),
  },
  social: {
    data: SOCIAL_SAMPLE,
    queries: SOCIAL_QUERIES,
    meta: buildDatasetMeta('social', 'Social Network', 'Community graph of users, posts, and groups', SOCIAL_SAMPLE),
  },
  fraud: {
    data: FRAUD_SAMPLE,
    queries: FRAUD_QUERIES,
    meta: buildDatasetMeta(
      'fraud',
      'Fraud Detection Network',
      'Financial graph linking accounts, transactions, devices, and IPs',
      FRAUD_SAMPLE
    ),
  },
}

export function getDatasetList(): DatasetMeta[] {
  return (Object.keys(DATASETS) as DatasetKey[]).map((key) => ({ ...DATASETS[key].meta, labels: [...DATASETS[key].meta.labels] }))
}

export function getDatasetQueries(key: DatasetKey): GuidedQuery[] {
  return DATASETS[key].queries.map((query) => ({ ...query }))
}

export function runDatasetQuery(datasetKey: DatasetKey, queryKey: string): GraphData {
  const dataset = DATASETS[datasetKey]
  const query = dataset.queries.find((candidate) => candidate.key === queryKey)
  if (!query) {
    return cloneGraphData(dataset.data)
  }

  return query.filterFn(dataset.data)
}
