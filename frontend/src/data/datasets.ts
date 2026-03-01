import type { GraphQueryDescriptor } from '@/api/transform'
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import { FRAUD_QUERIES, FRAUD_SAMPLE } from './fraudGraph.js'
import { MOVIES_SAMPLE } from './sampleGraph.js'
import { SOCIAL_QUERIES, SOCIAL_SAMPLE } from './socialGraph.js'

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

function buildActorCollaborationsSubgraph(data: GraphData): GraphData {
  const actedIn = data.links.filter((link) => link.type === 'ACTED_IN')
  const movieToActors = new Map<string | number, Set<string | number>>()

  for (const link of actedIn) {
    const actorId = toNodeId(link.source)
    const movieId = toNodeId(link.target)
    const actors = movieToActors.get(movieId) ?? new Set<string | number>()
    actors.add(actorId)
    movieToActors.set(movieId, actors)
  }

  const pairMap = new Map<string, { actor1: string | number; actor2: string | number; sharedMovies: Set<string | number> }>()

  for (const [movieId, actorIds] of movieToActors.entries()) {
    const sortedActors = [...actorIds].sort((a, b) => String(a).localeCompare(String(b)))
    for (let i = 0; i < sortedActors.length; i += 1) {
      for (let j = i + 1; j < sortedActors.length; j += 1) {
        const actor1 = sortedActors[i]
        const actor2 = sortedActors[j]
        const pairKey = `${actor1}::${actor2}`
        const existing = pairMap.get(pairKey)

        if (existing) {
          existing.sharedMovies.add(movieId)
        } else {
          pairMap.set(pairKey, {
            actor1,
            actor2,
            sharedMovies: new Set([movieId]),
          })
        }
      }
    }
  }

  const actorIds = new Set<string | number>()
  const links: GraphEdge[] = []

  for (const [pairKey, pair] of pairMap.entries()) {
    actorIds.add(pair.actor1)
    actorIds.add(pair.actor2)
    links.push({
      id: `co-star:${pairKey}`,
      source: pair.actor1,
      target: pair.actor2,
      type: 'CO_STARRED',
      properties: {
        sharedMovies: [...pair.sharedMovies],
      },
    })
  }

  return {
    nodes: data.nodes.filter((node) => actorIds.has(node.id)).map(cloneNode),
    links,
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
    description: 'Movies, people, and genres in one view',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: MOVIES_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'all-movies',
    label: 'All movies',
    description: 'Show all movie nodes only',
    cypher: 'MATCH (m:Movie) RETURN m.title AS title, m.released AS year, PROPERTIES(m) AS props',
    expectedResultCount: MOVIES_SAMPLE.nodes.filter((node) => node.labels.includes('Movie')).length,
    filterFn: (data) => ({
      nodes: data.nodes.filter((node) => node.labels.includes('Movie')).map(cloneNode),
      links: [],
    }),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [{ nameCol: 'title', propsCol: 'props', label: 'Movie' }],
    },
  },
  {
    key: 'cast-directory',
    label: 'Cast directory',
    description: 'Actors and the movies they starred in',
    cypher:
      'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name AS person, m.title AS movie, PROPERTIES(p) AS personProps, PROPERTIES(m) AS movieProps',
    expectedResultCount: MOVIES_SAMPLE.links.filter((link) => link.type === 'ACTED_IN').length,
    filterFn: (data) => buildRelationshipSubgraph(data, ['ACTED_IN']),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'person', propsCol: 'personProps', label: 'Person' },
        { nameCol: 'movie', propsCol: 'movieProps', label: 'Movie' },
      ],
      edgeDescriptors: [{ srcCol: 'person', dstCol: 'movie', type: 'ACTED_IN' }],
    },
  },
  {
    key: 'director-filmography',
    label: 'Director filmography',
    description: 'Directors and the movies they directed',
    cypher:
      'MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p.name AS director, m.title AS movie, PROPERTIES(p) AS personProps, PROPERTIES(m) AS movieProps',
    expectedResultCount: MOVIES_SAMPLE.links.filter((link) => link.type === 'DIRECTED').length,
    filterFn: (data) => buildRelationshipSubgraph(data, ['DIRECTED']),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'director', propsCol: 'personProps', label: 'Person' },
        { nameCol: 'movie', propsCol: 'movieProps', label: 'Movie' },
      ],
      edgeDescriptors: [{ srcCol: 'director', dstCol: 'movie', type: 'DIRECTED' }],
    },
  },
  {
    key: 'genre-map',
    label: 'Genre map',
    description: 'Movies grouped by genres',
    cypher:
      'MATCH (m:Movie)-[:IN_GENRE]->(g:Genre) RETURN m.title AS movie, g.name AS genre, PROPERTIES(m) AS movieProps, PROPERTIES(g) AS genreProps',
    expectedResultCount: MOVIES_SAMPLE.links.filter((link) => link.type === 'IN_GENRE').length,
    filterFn: (data) => buildRelationshipSubgraph(data, ['IN_GENRE']),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'movie', propsCol: 'movieProps', label: 'Movie' },
        { nameCol: 'genre', propsCol: 'genreProps', label: 'Genre' },
      ],
      edgeDescriptors: [{ srcCol: 'movie', dstCol: 'genre', type: 'IN_GENRE' }],
    },
  },
  {
    key: 'collaborations',
    label: 'Actor collaborations',
    description: 'Actor pairs that shared screen time',
    cypher:
      'MATCH (a1:Person)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(a2:Person) WHERE a1.name < a2.name RETURN a1.name AS actor1, a2.name AS actor2, m.title AS sharedMovie, PROPERTIES(a1) AS actor1Props, PROPERTIES(a2) AS actor2Props, PROPERTIES(m) AS movieProps',
    expectedResultCount: buildActorCollaborationsSubgraph(MOVIES_SAMPLE).links.length,
    filterFn: (data) => buildActorCollaborationsSubgraph(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'actor1', propsCol: 'actor1Props', label: 'Person' },
        { nameCol: 'actor2', propsCol: 'actor2Props', label: 'Person' },
        { nameCol: 'sharedMovie', propsCol: 'movieProps', label: 'Movie' },
      ],
      edgeDescriptors: [{ srcCol: 'actor1', dstCol: 'actor2', type: 'CO_STARRED' }],
    },
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
