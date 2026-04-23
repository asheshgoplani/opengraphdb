import type { GraphQueryDescriptor } from '@/api/transform'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { MOVIELENS_SAMPLE, MOVIELENS_QUERIES } from './movieLensGraph.js'
import { AIR_ROUTES_SAMPLE, AIR_ROUTES_QUERIES } from './airRoutesGraph.js'
import { GOT_SAMPLE, GOT_QUERIES } from './gotGraph.js'
import { WIKIDATA_SAMPLE, WIKIDATA_QUERIES } from './wikidataGraph.js'
import { COMMUNITY_SAMPLE, COMMUNITY_QUERIES } from './communityGraph.js'

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

export type DatasetKey = 'movielens' | 'airroutes' | 'got' | 'wikidata' | 'community'

export interface DatasetMeta {
  key: DatasetKey
  name: string
  description: string
  nodeCount: number
  linkCount: number
  labels: string[]
  isGeographic?: boolean
  /** Short "origin" string surfaced in the dataset header so users can see
   * where the sample data came from at a glance (e.g. "GroupLens", "Nobel
   * Prize API", "Kelvin Lawrence"). */
  sourceLabel: string
  /** License / usage terms shown beside the source. "Synthetic" for our own
   * fixtures. Kept short so it fits the header strip. */
  license: string
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

function buildDatasetMeta(
  key: DatasetKey,
  name: string,
  description: string,
  data: GraphData,
  sourceLabel: string,
  license: string,
  isGeographic?: boolean,
): DatasetMeta {
  return {
    key,
    name,
    description,
    nodeCount: data.nodes.length,
    linkCount: data.links.length,
    labels: [...new Set(data.nodes.flatMap((node) => node.labels))].sort(),
    sourceLabel,
    license,
    ...(isGeographic !== undefined ? { isGeographic } : {}),
  }
}

export const DATASETS: Record<DatasetKey, DatasetEntry> = {
  movielens: {
    data: MOVIELENS_SAMPLE,
    queries: MOVIELENS_QUERIES,
    meta: buildDatasetMeta(
      'movielens',
      'MovieLens (sample)',
      `In-browser sample: ${MOVIELENS_SAMPLE.nodes.length} nodes / ${MOVIELENS_SAMPLE.links.length} edges (Movie + Genre) — tiny slice of GroupLens MovieLens 25M. Full dataset is in datasets/movielens.json; import via the ogdb CLI, not the browser.`,
      MOVIELENS_SAMPLE,
      'GroupLens / MovieLens 25M',
      'CC BY 4.0 (non-commercial)',
    ),
  },
  airroutes: {
    data: AIR_ROUTES_SAMPLE,
    queries: AIR_ROUTES_QUERIES,
    meta: buildDatasetMeta(
      'airroutes',
      'Air Routes (sample)',
      `In-browser sample: ${AIR_ROUTES_SAMPLE.nodes.length} nodes / ${AIR_ROUTES_SAMPLE.links.length} edges (Airport + Country + Continent) — subset of Kelvin Lawrence's Practical Gremlin Air Routes dataset (full: ~3,500 airports / ~50,000 routes, not loaded in-browser).`,
      AIR_ROUTES_SAMPLE,
      "Kelvin Lawrence's Practical Gremlin",
      'Apache 2.0',
      true,
    ),
  },
  got: {
    data: GOT_SAMPLE,
    queries: GOT_QUERIES,
    meta: buildDatasetMeta(
      'got',
      'Game of Thrones (sample)',
      `In-browser sample: ${GOT_SAMPLE.nodes.length} nodes / ${GOT_SAMPLE.links.length} edges — character-interaction subgraph across 8 seasons from Andrew Beveridge's research.`,
      GOT_SAMPLE,
      'Andrew Beveridge (Macalester)',
      'Research / educational use',
    ),
  },
  wikidata: {
    data: WIKIDATA_SAMPLE,
    queries: WIKIDATA_QUERIES,
    meta: buildDatasetMeta(
      'wikidata',
      'Nobel Prize (sample)',
      `In-browser sample: ${WIKIDATA_SAMPLE.nodes.length} nodes / ${WIKIDATA_SAMPLE.links.length} edges — Nobel laureates linked to countries, institutions, and prize categories from the Nobel Prize API.`,
      WIKIDATA_SAMPLE,
      'Nobel Prize API',
      'CC0 1.0 public domain',
    ),
  },
  community: {
    data: COMMUNITY_SAMPLE,
    queries: COMMUNITY_QUERIES,
    meta: buildDatasetMeta(
      'community',
      'Community Graph (synthetic)',
      `Synthetic canvas-density demo: ${COMMUNITY_SAMPLE.nodes.length} nodes / ${COMMUNITY_SAMPLE.links.length} edges across 8 clusters with 8 distinct labels and varied edge types. No backend equivalent.`,
      COMMUNITY_SAMPLE,
      'OpenGraphDB (synthetic)',
      'Synthetic — MIT',
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
