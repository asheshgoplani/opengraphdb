import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

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

const USER_SEEDS = [
  { id: 'u1', name: 'Alice Chen', joinedYear: 2019 },
  { id: 'u2', name: 'Bob Martinez', joinedYear: 2020 },
  { id: 'u3', name: 'Carol Johnson', joinedYear: 2018 },
  { id: 'u4', name: 'David Kim', joinedYear: 2021 },
  { id: 'u5', name: 'Eva Williams', joinedYear: 2017 },
  { id: 'u6', name: 'Frank Brown', joinedYear: 2022 },
  { id: 'u7', name: 'Grace Lee', joinedYear: 2020 },
  { id: 'u8', name: 'Henry Zhang', joinedYear: 2019 },
  { id: 'u9', name: 'Ivy Walker', joinedYear: 2021 },
  { id: 'u10', name: 'Jack Rivera', joinedYear: 2022 },
  { id: 'u11', name: 'Kara Singh', joinedYear: 2018 },
  { id: 'u12', name: 'Leo Murphy', joinedYear: 2023 },
  { id: 'u13', name: 'Maya Brooks', joinedYear: 2020 },
  { id: 'u14', name: 'Noah Stewart', joinedYear: 2021 },
  { id: 'u15', name: 'Olivia Diaz', joinedYear: 2019 },
  { id: 'u16', name: 'Parker Reed', joinedYear: 2022 },
  { id: 'u17', name: 'Quinn Foster', joinedYear: 2020 },
  { id: 'u18', name: 'Riley Chen', joinedYear: 2021 },
  { id: 'u19', name: 'Sasha Patel', joinedYear: 2017 },
  { id: 'u20', name: 'Tyler Evans', joinedYear: 2024 },
  { id: 'u21', name: 'Uma Bennett', joinedYear: 2023 },
  { id: 'u22', name: 'Victor Hall', joinedYear: 2019 },
  { id: 'u23', name: 'Wesley Young', joinedYear: 2018 },
  { id: 'u24', name: 'Xena Cole', joinedYear: 2022 },
  { id: 'u25', name: 'Yara Price', joinedYear: 2020 },
  { id: 'u26', name: 'Zane Foster', joinedYear: 2021 },
  { id: 'u27', name: 'Ari Monroe', joinedYear: 2024 },
  { id: 'u28', name: 'Bianca Scott', joinedYear: 2023 },
]

const POST_SEEDS = [
  { id: 'p1', title: 'GraphDB Best Practices', likes: 128 },
  { id: 'p2', title: 'Intro to Cypher', likes: 94 },
  { id: 'p3', title: 'Building Knowledge Graphs', likes: 76 },
  { id: 'p4', title: 'Graph Algorithms 101', likes: 143 },
  { id: 'p5', title: 'Event-driven APIs in Rust', likes: 89 },
  { id: 'p6', title: 'Scaling Social Graphs', likes: 132 },
  { id: 'p7', title: 'Data Lineage Playbook', likes: 67 },
  { id: 'p8', title: 'How to Debug Distributed Systems', likes: 118 },
  { id: 'p9', title: 'Monitoring Neo4j in Production', likes: 74 },
  { id: 'p10', title: 'Zero-downtime Schema Migrations', likes: 155 },
  { id: 'p11', title: 'When to Use CQRS', likes: 63 },
  { id: 'p12', title: 'Realtime Analytics Pipelines', likes: 111 },
  { id: 'p13', title: 'Designing Graph APIs', likes: 97 },
  { id: 'p14', title: 'Incident Review Template', likes: 58 },
  { id: 'p15', title: 'Cloud Native Data Layers', likes: 102 },
  { id: 'p16', title: 'Access Patterns for Social Apps', likes: 86 },
  { id: 'p17', title: 'Rate Limiting Deep Dive', likes: 93 },
  { id: 'p18', title: 'Practical Backpressure', likes: 72 },
]

const GROUP_SEEDS = [
  { id: 'g1', name: 'Graph Enthusiasts', memberCount: 54 },
  { id: 'g2', name: 'Database Engineers', memberCount: 41 },
  { id: 'g3', name: 'Open Source Contributors', memberCount: 67 },
  { id: 'g4', name: 'Rust Developers', memberCount: 48 },
  { id: 'g5', name: 'Cloud Architects', memberCount: 52 },
  { id: 'g6', name: 'AI Researchers', memberCount: 39 },
  { id: 'g7', name: 'Security Analysts', memberCount: 44 },
]

const BASE_LINKS: GraphEdge[] = [
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
]

interface LinkSeed {
  source: string
  target: string
  type: string
  properties?: Record<string, unknown>
}

const ADDITIONAL_LINK_SEEDS: LinkSeed[] = [
  { source: 'u9', target: 'u10', type: 'FOLLOWS' },
  { source: 'u10', target: 'u11', type: 'FOLLOWS' },
  { source: 'u11', target: 'u12', type: 'FOLLOWS' },
  { source: 'u12', target: 'u9', type: 'FOLLOWS' },
  { source: 'u13', target: 'u1', type: 'FOLLOWS' },
  { source: 'u14', target: 'u3', type: 'FOLLOWS' },
  { source: 'u15', target: 'u6', type: 'FOLLOWS' },
  { source: 'u16', target: 'u8', type: 'FOLLOWS' },
  { source: 'u17', target: 'u9', type: 'FOLLOWS' },
  { source: 'u18', target: 'u10', type: 'FOLLOWS' },
  { source: 'u19', target: 'u2', type: 'FOLLOWS' },
  { source: 'u20', target: 'u5', type: 'FOLLOWS' },
  { source: 'u21', target: 'u4', type: 'FOLLOWS' },
  { source: 'u22', target: 'u7', type: 'FOLLOWS' },
  { source: 'u23', target: 'u11', type: 'FOLLOWS' },
  { source: 'u24', target: 'u12', type: 'FOLLOWS' },
  { source: 'u25', target: 'u13', type: 'FOLLOWS' },
  { source: 'u26', target: 'u14', type: 'FOLLOWS' },
  { source: 'u27', target: 'u15', type: 'FOLLOWS' },
  { source: 'u28', target: 'u16', type: 'FOLLOWS' },
  { source: 'u9', target: 'u1', type: 'FOLLOWS' },
  { source: 'u10', target: 'u2', type: 'FOLLOWS' },
  { source: 'u11', target: 'u3', type: 'FOLLOWS' },
  { source: 'u12', target: 'u4', type: 'FOLLOWS' },
  { source: 'u21', target: 'u22', type: 'FOLLOWS' },
  { source: 'u22', target: 'u23', type: 'FOLLOWS' },
  { source: 'u23', target: 'u24', type: 'FOLLOWS' },
  { source: 'u24', target: 'u21', type: 'FOLLOWS' },

  { source: 'u9', target: 'p5', type: 'CREATED' },
  { source: 'u10', target: 'p6', type: 'CREATED' },
  { source: 'u11', target: 'p7', type: 'CREATED' },
  { source: 'u12', target: 'p8', type: 'CREATED' },
  { source: 'u13', target: 'p9', type: 'CREATED' },
  { source: 'u14', target: 'p10', type: 'CREATED' },
  { source: 'u15', target: 'p11', type: 'CREATED' },
  { source: 'u16', target: 'p12', type: 'CREATED' },
  { source: 'u17', target: 'p13', type: 'CREATED' },
  { source: 'u18', target: 'p14', type: 'CREATED' },
  { source: 'u19', target: 'p15', type: 'CREATED' },
  { source: 'u20', target: 'p16', type: 'CREATED' },
  { source: 'u21', target: 'p17', type: 'CREATED' },
  { source: 'u22', target: 'p18', type: 'CREATED' },

  { source: 'u23', target: 'p5', type: 'LIKED' },
  { source: 'u24', target: 'p6', type: 'LIKED' },
  { source: 'u25', target: 'p7', type: 'LIKED' },
  { source: 'u26', target: 'p8', type: 'LIKED' },
  { source: 'u27', target: 'p9', type: 'LIKED' },
  { source: 'u28', target: 'p10', type: 'LIKED' },
  { source: 'u9', target: 'p11', type: 'LIKED' },
  { source: 'u10', target: 'p12', type: 'LIKED' },
  { source: 'u11', target: 'p13', type: 'LIKED' },
  { source: 'u12', target: 'p14', type: 'LIKED' },
  { source: 'u13', target: 'p15', type: 'LIKED' },
  { source: 'u14', target: 'p16', type: 'LIKED' },
  { source: 'u15', target: 'p17', type: 'LIKED' },
  { source: 'u16', target: 'p18', type: 'LIKED' },
  { source: 'u17', target: 'p2', type: 'LIKED' },
  { source: 'u18', target: 'p3', type: 'LIKED' },
  { source: 'u19', target: 'p4', type: 'LIKED' },
  { source: 'u20', target: 'p1', type: 'LIKED' },

  { source: 'p5', target: 'g4', type: 'POSTED_IN' },
  { source: 'p6', target: 'g5', type: 'POSTED_IN' },
  { source: 'p7', target: 'g2', type: 'POSTED_IN' },
  { source: 'p8', target: 'g3', type: 'POSTED_IN' },
  { source: 'p9', target: 'g4', type: 'POSTED_IN' },
  { source: 'p10', target: 'g5', type: 'POSTED_IN' },
  { source: 'p11', target: 'g6', type: 'POSTED_IN' },
  { source: 'p12', target: 'g6', type: 'POSTED_IN' },
  { source: 'p13', target: 'g7', type: 'POSTED_IN' },
  { source: 'p14', target: 'g7', type: 'POSTED_IN' },
  { source: 'p15', target: 'g1', type: 'POSTED_IN' },
  { source: 'p16', target: 'g2', type: 'POSTED_IN' },
  { source: 'p17', target: 'g5', type: 'POSTED_IN' },
  { source: 'p18', target: 'g4', type: 'POSTED_IN' },

  { source: 'u9', target: 'g4', type: 'MEMBER_OF' },
  { source: 'u10', target: 'g4', type: 'MEMBER_OF' },
  { source: 'u11', target: 'g5', type: 'MEMBER_OF' },
  { source: 'u12', target: 'g5', type: 'MEMBER_OF' },
  { source: 'u13', target: 'g1', type: 'MEMBER_OF' },
  { source: 'u14', target: 'g2', type: 'MEMBER_OF' },
  { source: 'u15', target: 'g3', type: 'MEMBER_OF' },
  { source: 'u16', target: 'g4', type: 'MEMBER_OF' },
  { source: 'u17', target: 'g5', type: 'MEMBER_OF' },
  { source: 'u18', target: 'g6', type: 'MEMBER_OF' },
  { source: 'u19', target: 'g7', type: 'MEMBER_OF' },
  { source: 'u20', target: 'g2', type: 'MEMBER_OF' },
  { source: 'u21', target: 'g6', type: 'MEMBER_OF' },
  { source: 'u22', target: 'g7', type: 'MEMBER_OF' },
  { source: 'u23', target: 'g1', type: 'MEMBER_OF' },
  { source: 'u24', target: 'g3', type: 'MEMBER_OF' },
  { source: 'u25', target: 'g4', type: 'MEMBER_OF' },
  { source: 'u26', target: 'g5', type: 'MEMBER_OF' },
  { source: 'u27', target: 'g6', type: 'MEMBER_OF' },
  { source: 'u28', target: 'g7', type: 'MEMBER_OF' },
]

const ADDITIONAL_LINKS: GraphEdge[] = ADDITIONAL_LINK_SEEDS.map((seed, index) => ({
  id: BASE_LINKS.length + index + 1,
  source: seed.source,
  target: seed.target,
  type: seed.type,
  properties: seed.properties ?? {},
}))

export const SOCIAL_SAMPLE: GraphData = {
  nodes: [
    ...USER_SEEDS.map((user) => ({
      id: user.id,
      labels: [USER_LABEL],
      properties: { name: user.name, joinedYear: user.joinedYear },
      label: USER_LABEL,
    })),
    ...POST_SEEDS.map((post) => ({
      id: post.id,
      labels: [POST_LABEL],
      properties: { title: post.title, likes: post.likes },
      label: POST_LABEL,
    })),
    ...GROUP_SEEDS.map((group) => ({
      id: group.id,
      labels: [GROUP_LABEL],
      properties: { name: group.name, memberCount: group.memberCount },
      label: GROUP_LABEL,
    })),
  ],
  links: [...BASE_LINKS, ...ADDITIONAL_LINKS],
}

export const SOCIAL_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All nodes',
    description: 'Show the complete social network',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: SOCIAL_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'follows',
    label: 'Who follows whom',
    description: 'User follow relationships',
    cypher:
      'MATCH (a:User)-[:FOLLOWS]->(b:User) RETURN a.name AS follower, b.name AS followee, PROPERTIES(a) AS aProps, PROPERTIES(b) AS bProps',
    expectedResultCount: SOCIAL_SAMPLE.links.filter((link) => link.type === 'FOLLOWS').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['FOLLOWS']),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'follower', propsCol: 'aProps', label: 'User' },
        { nameCol: 'followee', propsCol: 'bProps', label: 'User' },
      ],
      edgeDescriptors: [{ srcCol: 'follower', dstCol: 'followee', type: 'FOLLOWS' }],
    },
  },
  {
    key: 'posts',
    label: 'Posts & creators',
    description: 'Who created which posts',
    cypher:
      'MATCH (u:User)-[:CREATED]->(p:Post) RETURN u.name AS user, p.title AS post, PROPERTIES(u) AS userProps, PROPERTIES(p) AS postProps',
    expectedResultCount: SOCIAL_SAMPLE.links.filter((link) => link.type === 'CREATED').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['CREATED']),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'user', propsCol: 'userProps', label: 'User' },
        { nameCol: 'post', propsCol: 'postProps', label: 'Post' },
      ],
      edgeDescriptors: [{ srcCol: 'user', dstCol: 'post', type: 'CREATED' }],
    },
  },
  {
    key: 'groups',
    label: 'Group memberships',
    description: 'Users and their groups',
    cypher:
      'MATCH (u:User)-[:MEMBER_OF]->(g:Group) RETURN u.name AS user, g.name AS grp, PROPERTIES(u) AS userProps, PROPERTIES(g) AS grpProps',
    expectedResultCount: SOCIAL_SAMPLE.links.filter((link) => link.type === 'MEMBER_OF').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['MEMBER_OF']),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'user', propsCol: 'userProps', label: 'User' },
        { nameCol: 'grp', propsCol: 'grpProps', label: 'Group' },
      ],
      edgeDescriptors: [{ srcCol: 'user', dstCol: 'grp', type: 'MEMBER_OF' }],
    },
  },
]
