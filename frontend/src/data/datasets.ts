import type { GraphQueryDescriptor } from '@/api/transform'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { MOVIELENS_SAMPLE, MOVIELENS_QUERIES } from './movieLensGraph.js'
import { AIR_ROUTES_SAMPLE, AIR_ROUTES_QUERIES } from './airRoutesGraph.js'
import { GOT_SAMPLE, GOT_QUERIES } from './gotGraph.js'
import { WIKIDATA_SAMPLE, WIKIDATA_QUERIES } from './wikidataGraph.js'

export type { GraphQueryDescriptor }

export interface GuidedQuery {
  key: string
  label: string
  description: string
  cypher: string
  expectedResultCount: number
  filterFn: (data: GraphData) => GraphData
  liveDescriptor?: GraphQueryDescriptor
  category?: 'Explore' | 'Traverse' | 'Analyze'
}

export type DatasetKey = 'movielens' | 'airroutes' | 'got' | 'wikidata'

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

export const DATASETS: Record<DatasetKey, DatasetEntry> = {
  movielens: {
    data: MOVIELENS_SAMPLE,
    queries: MOVIELENS_QUERIES,
    meta: buildDatasetMeta(
      'movielens',
      'MovieLens 25M',
      'Industry-standard movie recommendation dataset with 8,000 movies and genre classifications from GroupLens Research',
      MOVIELENS_SAMPLE
    ),
  },
  airroutes: {
    data: AIR_ROUTES_SAMPLE,
    queries: AIR_ROUTES_QUERIES,
    meta: buildDatasetMeta(
      'airroutes',
      'Air Routes Network',
      'Global airport network with 3,500 airports and 50,000 routes from Kelvin Lawrence\'s Practical Gremlin dataset',
      AIR_ROUTES_SAMPLE
    ),
  },
  got: {
    data: GOT_SAMPLE,
    queries: GOT_QUERIES,
    meta: buildDatasetMeta(
      'got',
      'Game of Thrones',
      'Character interaction network across 8 seasons with weighted relationships from Andrew Beveridge\'s research',
      GOT_SAMPLE
    ),
  },
  wikidata: {
    data: WIKIDATA_SAMPLE,
    queries: WIKIDATA_QUERIES,
    meta: buildDatasetMeta(
      'wikidata',
      'Nobel Prize Knowledge Graph',
      'Nobel Prize laureates connected to countries, institutions, and prize categories from the Nobel Prize Foundation API',
      WIKIDATA_SAMPLE
    ),
  },
}

function cloneGuidedQuery(query: GuidedQuery): GuidedQuery {
  return {
    ...query,
    liveDescriptor: query.liveDescriptor
      ? {
          nodeColumns: query.liveDescriptor.nodeColumns.map((nodeColumn) => ({ ...nodeColumn })),
          edgeDescriptors: query.liveDescriptor.edgeDescriptors?.map((edgeDescriptor) => ({ ...edgeDescriptor })),
        }
      : undefined,
  }
}

export function getDatasetList(): DatasetMeta[] {
  return (Object.keys(DATASETS) as DatasetKey[]).map((key) => ({ ...DATASETS[key].meta, labels: [...DATASETS[key].meta.labels] }))
}

export function getDatasetQueries(key: DatasetKey): GuidedQuery[] {
  return DATASETS[key].queries.map(cloneGuidedQuery)
}

export function runDatasetQuery(datasetKey: DatasetKey, queryKey: string): GraphData {
  const dataset = DATASETS[datasetKey]
  const query = dataset.queries.find((candidate) => candidate.key === queryKey)
  if (!query) {
    return cloneGraphData(dataset.data)
  }

  return query.filterFn(dataset.data)
}
