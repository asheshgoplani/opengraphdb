import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'

const USER_LABEL = 'User'
const POST_LABEL = 'Post'
const GROUP_LABEL = 'Group'

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

function buildSubgraph(data: GraphData, links: GraphEdge[]): GraphData {
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

function filterByRelationshipTypes(data: GraphData, relationshipTypes: string[]): GraphData {
  const typeSet = new Set(relationshipTypes)
  const links = data.links.filter((link) => typeSet.has(link.type))
  return buildSubgraph(data, links)
}

export interface GuidedQuery {
  key: string
  label: string
  description: string
  cypher: string
  expectedResultCount: number
  filterFn: (data: GraphData) => GraphData
}

export const SOCIAL_SAMPLE: GraphData = {
  nodes: [
    { id: 'u1', labels: [USER_LABEL], properties: { name: 'Alice Chen', joinedYear: 2019 }, label: USER_LABEL },
    { id: 'u2', labels: [USER_LABEL], properties: { name: 'Bob Martinez', joinedYear: 2020 }, label: USER_LABEL },
    { id: 'u3', labels: [USER_LABEL], properties: { name: 'Carol Johnson', joinedYear: 2018 }, label: USER_LABEL },
    { id: 'u4', labels: [USER_LABEL], properties: { name: 'David Kim', joinedYear: 2021 }, label: USER_LABEL },
    { id: 'u5', labels: [USER_LABEL], properties: { name: 'Eva Williams', joinedYear: 2017 }, label: USER_LABEL },
    { id: 'u6', labels: [USER_LABEL], properties: { name: 'Frank Brown', joinedYear: 2022 }, label: USER_LABEL },
    { id: 'u7', labels: [USER_LABEL], properties: { name: 'Grace Lee', joinedYear: 2020 }, label: USER_LABEL },
    { id: 'u8', labels: [USER_LABEL], properties: { name: 'Henry Zhang', joinedYear: 2019 }, label: USER_LABEL },
    { id: 'p1', labels: [POST_LABEL], properties: { title: 'GraphDB Best Practices', likes: 128 }, label: POST_LABEL },
    { id: 'p2', labels: [POST_LABEL], properties: { title: 'Intro to Cypher', likes: 94 }, label: POST_LABEL },
    { id: 'p3', labels: [POST_LABEL], properties: { title: 'Building Knowledge Graphs', likes: 76 }, label: POST_LABEL },
    { id: 'p4', labels: [POST_LABEL], properties: { title: 'Graph Algorithms 101', likes: 143 }, label: POST_LABEL },
    { id: 'g1', labels: [GROUP_LABEL], properties: { name: 'Graph Enthusiasts', memberCount: 54 }, label: GROUP_LABEL },
    { id: 'g2', labels: [GROUP_LABEL], properties: { name: 'Database Engineers', memberCount: 41 }, label: GROUP_LABEL },
    { id: 'g3', labels: [GROUP_LABEL], properties: { name: 'Open Source Contributors', memberCount: 67 }, label: GROUP_LABEL },
  ],
  links: [
    { id: 1, source: 'u1', target: 'u2', type: 'FOLLOWS', properties: {} },
    { id: 2, source: 'u2', target: 'u3', type: 'FOLLOWS', properties: {} },
    { id: 3, source: 'u3', target: 'u1', type: 'FOLLOWS', properties: {} },
    { id: 4, source: 'u4', target: 'u1', type: 'FOLLOWS', properties: {} },
    { id: 5, source: 'u5', target: 'u4', type: 'FOLLOWS', properties: {} },
    { id: 6, source: 'u6', target: 'u5', type: 'FOLLOWS', properties: {} },
    { id: 7, source: 'u7', target: 'u2', type: 'FOLLOWS', properties: {} },
    { id: 8, source: 'u8', target: 'u6', type: 'FOLLOWS', properties: {} },
    { id: 9, source: 'u1', target: 'p1', type: 'CREATED', properties: {} },
    { id: 10, source: 'u3', target: 'p2', type: 'CREATED', properties: {} },
    { id: 11, source: 'u5', target: 'p3', type: 'CREATED', properties: {} },
    { id: 12, source: 'u7', target: 'p4', type: 'CREATED', properties: {} },
    { id: 13, source: 'u2', target: 'p1', type: 'LIKED', properties: {} },
    { id: 14, source: 'u4', target: 'p1', type: 'LIKED', properties: {} },
    { id: 15, source: 'u1', target: 'p2', type: 'LIKED', properties: {} },
    { id: 16, source: 'u6', target: 'p3', type: 'LIKED', properties: {} },
    { id: 17, source: 'u8', target: 'p4', type: 'LIKED', properties: {} },
    { id: 18, source: 'u3', target: 'p4', type: 'LIKED', properties: {} },
    { id: 19, source: 'p1', target: 'g1', type: 'POSTED_IN', properties: {} },
    { id: 20, source: 'p2', target: 'g1', type: 'POSTED_IN', properties: {} },
    { id: 21, source: 'p3', target: 'g2', type: 'POSTED_IN', properties: {} },
    { id: 22, source: 'p4', target: 'g3', type: 'POSTED_IN', properties: {} },
    { id: 23, source: 'u1', target: 'g1', type: 'MEMBER_OF', properties: {} },
    { id: 24, source: 'u2', target: 'g1', type: 'MEMBER_OF', properties: {} },
    { id: 25, source: 'u3', target: 'g2', type: 'MEMBER_OF', properties: {} },
    { id: 26, source: 'u4', target: 'g2', type: 'MEMBER_OF', properties: {} },
    { id: 27, source: 'u5', target: 'g3', type: 'MEMBER_OF', properties: {} },
    { id: 28, source: 'u6', target: 'g1', type: 'MEMBER_OF', properties: {} },
    { id: 29, source: 'u7', target: 'g3', type: 'MEMBER_OF', properties: {} },
    { id: 30, source: 'u8', target: 'g2', type: 'MEMBER_OF', properties: {} },
  ],
}

export const SOCIAL_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All nodes',
    description: 'Show the complete social network',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: SOCIAL_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
  },
  {
    key: 'follows',
    label: 'Who follows whom',
    description: 'User follow relationships',
    cypher: 'MATCH (a:User)-[:FOLLOWS]->(b:User) RETURN a, b',
    expectedResultCount: SOCIAL_SAMPLE.links.filter((link) => link.type === 'FOLLOWS').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['FOLLOWS']),
  },
  {
    key: 'posts',
    label: 'Posts & creators',
    description: 'Who created which posts',
    cypher: 'MATCH (u:User)-[:CREATED]->(p:Post) RETURN u, p',
    expectedResultCount: SOCIAL_SAMPLE.links.filter((link) => link.type === 'CREATED').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['CREATED']),
  },
  {
    key: 'groups',
    label: 'Group memberships',
    description: 'Users and their groups',
    cypher: 'MATCH (u:User)-[:MEMBER_OF]->(g:Group) RETURN u, g',
    expectedResultCount: SOCIAL_SAMPLE.links.filter((link) => link.type === 'MEMBER_OF').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['MEMBER_OF']),
  },
]
