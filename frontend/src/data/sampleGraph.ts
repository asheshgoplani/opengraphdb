import type { GraphData, GraphNode } from '@/types/graph'

export type PlaygroundQueryKey = 'all' | 'movies-only' | 'actors-only' | 'acted-in' | 'directed'

const MOVIE_LABEL = 'Movie'
const PERSON_LABEL = 'Person'

function cloneNode(node: GraphNode): GraphNode {
  return {
    ...node,
    labels: [...node.labels],
    properties: { ...node.properties },
  }
}

function cloneGraphData(graphData: GraphData): GraphData {
  return {
    nodes: graphData.nodes.map(cloneNode),
    links: graphData.links.map((link) => ({
      ...link,
      properties: { ...link.properties },
    })),
  }
}

export const MOVIES_SAMPLE: GraphData = {
  nodes: [
    { id: 1, labels: [MOVIE_LABEL], properties: { title: 'The Matrix', released: 1999 }, label: MOVIE_LABEL },
    { id: 2, labels: [MOVIE_LABEL], properties: { title: 'The Matrix Reloaded', released: 2003 }, label: MOVIE_LABEL },
    { id: 3, labels: [MOVIE_LABEL], properties: { title: 'The Matrix Revolutions', released: 2003 }, label: MOVIE_LABEL },
    { id: 4, labels: [MOVIE_LABEL], properties: { title: 'Jerry Maguire', released: 1996 }, label: MOVIE_LABEL },
    { id: 5, labels: [MOVIE_LABEL], properties: { title: 'Top Gun', released: 1986 }, label: MOVIE_LABEL },
    { id: 6, labels: [MOVIE_LABEL], properties: { title: 'A Few Good Men', released: 1992 }, label: MOVIE_LABEL },
    { id: 7, labels: [PERSON_LABEL], properties: { name: 'Keanu Reeves', born: 1964 }, label: PERSON_LABEL },
    { id: 8, labels: [PERSON_LABEL], properties: { name: 'Laurence Fishburne', born: 1961 }, label: PERSON_LABEL },
    { id: 9, labels: [PERSON_LABEL], properties: { name: 'Carrie-Anne Moss', born: 1967 }, label: PERSON_LABEL },
    { id: 10, labels: [PERSON_LABEL], properties: { name: 'Lana Wachowski', born: 1965 }, label: PERSON_LABEL },
    { id: 11, labels: [PERSON_LABEL], properties: { name: 'Lilly Wachowski', born: 1967 }, label: PERSON_LABEL },
    { id: 12, labels: [PERSON_LABEL], properties: { name: 'Tom Cruise', born: 1962 }, label: PERSON_LABEL },
    { id: 13, labels: [PERSON_LABEL], properties: { name: 'Cuba Gooding Jr.', born: 1968 }, label: PERSON_LABEL },
    { id: 14, labels: [PERSON_LABEL], properties: { name: 'Cameron Crowe', born: 1957 }, label: PERSON_LABEL },
    { id: 15, labels: [PERSON_LABEL], properties: { name: 'Tom Hanks', born: 1956 }, label: PERSON_LABEL },
    { id: 16, labels: [PERSON_LABEL], properties: { name: 'Meg Ryan', born: 1961 }, label: PERSON_LABEL },
    { id: 17, labels: [PERSON_LABEL], properties: { name: 'Tony Scott', born: 1944 }, label: PERSON_LABEL },
    { id: 18, labels: [PERSON_LABEL], properties: { name: 'Rob Reiner', born: 1947 }, label: PERSON_LABEL },
  ],
  links: [
    { id: 1, source: 7, target: 1, type: 'ACTED_IN', properties: { roles: ['Neo'] } },
    { id: 2, source: 7, target: 2, type: 'ACTED_IN', properties: { roles: ['Neo'] } },
    { id: 3, source: 7, target: 3, type: 'ACTED_IN', properties: { roles: ['Neo'] } },
    { id: 4, source: 8, target: 1, type: 'ACTED_IN', properties: { roles: ['Morpheus'] } },
    { id: 5, source: 8, target: 2, type: 'ACTED_IN', properties: { roles: ['Morpheus'] } },
    { id: 6, source: 8, target: 3, type: 'ACTED_IN', properties: { roles: ['Morpheus'] } },
    { id: 7, source: 9, target: 1, type: 'ACTED_IN', properties: { roles: ['Trinity'] } },
    { id: 8, source: 9, target: 2, type: 'ACTED_IN', properties: { roles: ['Trinity'] } },
    { id: 9, source: 9, target: 3, type: 'ACTED_IN', properties: { roles: ['Trinity'] } },
    { id: 10, source: 12, target: 4, type: 'ACTED_IN', properties: { roles: ['Jerry Maguire'] } },
    { id: 11, source: 13, target: 4, type: 'ACTED_IN', properties: { roles: ['Rod Tidwell'] } },
    { id: 12, source: 12, target: 5, type: 'ACTED_IN', properties: { roles: ['Pete Mitchell'] } },
    { id: 13, source: 12, target: 6, type: 'ACTED_IN', properties: { roles: ['Lt. Daniel Kaffee'] } },
    { id: 14, source: 10, target: 1, type: 'DIRECTED', properties: {} },
    { id: 15, source: 10, target: 2, type: 'DIRECTED', properties: {} },
    { id: 16, source: 10, target: 3, type: 'DIRECTED', properties: {} },
    { id: 17, source: 11, target: 1, type: 'DIRECTED', properties: {} },
    { id: 18, source: 11, target: 2, type: 'DIRECTED', properties: {} },
    { id: 19, source: 11, target: 3, type: 'DIRECTED', properties: {} },
    { id: 20, source: 14, target: 4, type: 'DIRECTED', properties: {} },
    { id: 21, source: 17, target: 5, type: 'DIRECTED', properties: {} },
    { id: 22, source: 18, target: 6, type: 'DIRECTED', properties: {} },
    { id: 23, source: 10, target: 1, type: 'WROTE', properties: {} },
    { id: 24, source: 10, target: 2, type: 'WROTE', properties: {} },
    { id: 25, source: 10, target: 3, type: 'WROTE', properties: {} },
    { id: 26, source: 11, target: 1, type: 'WROTE', properties: {} },
    { id: 27, source: 11, target: 2, type: 'WROTE', properties: {} },
    { id: 28, source: 11, target: 3, type: 'WROTE', properties: {} },
    { id: 29, source: 14, target: 4, type: 'WROTE', properties: {} },
    { id: 30, source: 17, target: 5, type: 'WROTE', properties: {} },
    { id: 31, source: 18, target: 6, type: 'WROTE', properties: {} },
  ],
}

function filterByRelationshipType(type: string): GraphData {
  const filteredLinks = MOVIES_SAMPLE.links.filter((link) => link.type === type)
  const referencedNodeIds = new Set<string | number>()

  for (const link of filteredLinks) {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target
    referencedNodeIds.add(sourceId)
    referencedNodeIds.add(targetId)
  }

  return {
    nodes: MOVIES_SAMPLE.nodes
      .filter((node) => referencedNodeIds.has(node.id))
      .map(cloneNode),
    links: filteredLinks.map((link) => ({
      ...link,
      properties: { ...link.properties },
    })),
  }
}

export function runPlaygroundQuery(key: PlaygroundQueryKey): GraphData {
  switch (key) {
    case 'all':
      return cloneGraphData(MOVIES_SAMPLE)
    case 'movies-only':
      return {
        nodes: MOVIES_SAMPLE.nodes.filter((n) => n.labels.includes(MOVIE_LABEL)).map(cloneNode),
        links: [],
      }
    case 'actors-only':
      return {
        nodes: MOVIES_SAMPLE.nodes.filter((n) => n.labels.includes(PERSON_LABEL)).map(cloneNode),
        links: [],
      }
    case 'acted-in':
      return filterByRelationshipType('ACTED_IN')
    case 'directed':
      return filterByRelationshipType('DIRECTED')
    default:
      return cloneGraphData(MOVIES_SAMPLE)
  }
}
