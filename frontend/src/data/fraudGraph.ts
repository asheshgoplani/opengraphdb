import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './socialGraph.js'

const ACCOUNT_LABEL = 'Account'
const TRANSACTION_LABEL = 'Transaction'
const DEVICE_LABEL = 'Device'
const IP_LABEL = 'IP'

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

function suspiciousPatternSubgraph(data: GraphData): GraphData {
  const usedDeviceLinks = data.links.filter((link) => link.type === 'USED_DEVICE')
  const loggedFromLinks = data.links.filter((link) => link.type === 'LOGGED_FROM')

  const deviceAccounts = new Map<string | number, Set<string | number>>()
  for (const link of usedDeviceLinks) {
    const accountId = toNodeId(link.source)
    const deviceId = toNodeId(link.target)
    const accounts = deviceAccounts.get(deviceId) ?? new Set<string | number>()
    accounts.add(accountId)
    deviceAccounts.set(deviceId, accounts)
  }

  const ipAccounts = new Map<string | number, Set<string | number>>()
  for (const link of loggedFromLinks) {
    const accountId = toNodeId(link.source)
    const ipId = toNodeId(link.target)
    const accounts = ipAccounts.get(ipId) ?? new Set<string | number>()
    accounts.add(accountId)
    ipAccounts.set(ipId, accounts)
  }

  const sharedDeviceIds = new Set<string | number>()
  const sharedIpIds = new Set<string | number>()
  const suspiciousAccountIds = new Set<string | number>()

  for (const [deviceId, accounts] of deviceAccounts.entries()) {
    if (accounts.size > 1) {
      sharedDeviceIds.add(deviceId)
      for (const accountId of accounts) suspiciousAccountIds.add(accountId)
    }
  }

  for (const [ipId, accounts] of ipAccounts.entries()) {
    if (accounts.size > 1) {
      sharedIpIds.add(ipId)
      for (const accountId of accounts) suspiciousAccountIds.add(accountId)
    }
  }

  const links = data.links.filter((link) => {
    if (link.type === 'USED_DEVICE') {
      return sharedDeviceIds.has(toNodeId(link.target))
    }
    if (link.type === 'LOGGED_FROM') {
      return sharedIpIds.has(toNodeId(link.target))
    }
    if (link.type === 'SENT_TO' || link.type === 'RECEIVED') {
      return suspiciousAccountIds.has(toNodeId(link.source))
    }
    if (link.type === 'FLAGGED') {
      return suspiciousAccountIds.has(toNodeId(link.target))
    }
    return false
  })

  return buildSubgraph(data, links)
}

export const FRAUD_SAMPLE: GraphData = {
  nodes: [
    { id: 'acc-001', labels: [ACCOUNT_LABEL], properties: { holder: 'Nora Adams', balance: 4200, riskScore: 0.21 }, label: ACCOUNT_LABEL },
    { id: 'acc-002', labels: [ACCOUNT_LABEL], properties: { holder: 'Liam Patel', balance: 1780, riskScore: 0.27 }, label: ACCOUNT_LABEL },
    { id: 'acc-003', labels: [ACCOUNT_LABEL], properties: { holder: 'Sofia Reed', balance: 960, riskScore: 0.83 }, label: ACCOUNT_LABEL },
    { id: 'acc-004', labels: [ACCOUNT_LABEL], properties: { holder: 'Owen Brooks', balance: 1120, riskScore: 0.78 }, label: ACCOUNT_LABEL },
    { id: 'acc-005', labels: [ACCOUNT_LABEL], properties: { holder: 'Mia Turner', balance: 6810, riskScore: 0.49 }, label: ACCOUNT_LABEL },
    { id: 'acc-006', labels: [ACCOUNT_LABEL], properties: { holder: 'Ethan Collins', balance: 2450, riskScore: 0.58 }, label: ACCOUNT_LABEL },
    {
      id: 'txn-101',
      labels: [TRANSACTION_LABEL],
      properties: { amount: 240, timestamp: '2026-02-27T09:15:00Z', status: 'completed' },
      label: TRANSACTION_LABEL,
    },
    {
      id: 'txn-102',
      labels: [TRANSACTION_LABEL],
      properties: { amount: 1750, timestamp: '2026-02-27T10:22:00Z', status: 'completed' },
      label: TRANSACTION_LABEL,
    },
    {
      id: 'txn-103',
      labels: [TRANSACTION_LABEL],
      properties: { amount: 4990, timestamp: '2026-02-27T11:04:00Z', status: 'flagged' },
      label: TRANSACTION_LABEL,
    },
    {
      id: 'txn-104',
      labels: [TRANSACTION_LABEL],
      properties: { amount: 890, timestamp: '2026-02-27T12:41:00Z', status: 'completed' },
      label: TRANSACTION_LABEL,
    },
    {
      id: 'txn-105',
      labels: [TRANSACTION_LABEL],
      properties: { amount: 3560, timestamp: '2026-02-27T14:09:00Z', status: 'flagged' },
      label: TRANSACTION_LABEL,
    },
    { id: 'dev-iphone-14', labels: [DEVICE_LABEL], properties: { type: 'mobile', os: 'iOS 17' }, label: DEVICE_LABEL },
    { id: 'dev-pixel-8', labels: [DEVICE_LABEL], properties: { type: 'mobile', os: 'Android 15' }, label: DEVICE_LABEL },
    { id: 'dev-macbook-pro', labels: [DEVICE_LABEL], properties: { type: 'laptop', os: 'macOS 14' }, label: DEVICE_LABEL },
    { id: 'ip-1', labels: [IP_LABEL], properties: { address: '192.168.1.24', country: 'US' }, label: IP_LABEL },
    { id: 'ip-2', labels: [IP_LABEL], properties: { address: '10.0.0.56', country: 'US' }, label: IP_LABEL },
    { id: 'ip-3', labels: [IP_LABEL], properties: { address: '172.16.0.9', country: 'RU' }, label: IP_LABEL },
  ],
  links: [
    { id: 1, source: 'acc-001', target: 'txn-101', type: 'SENT_TO', properties: {} },
    { id: 2, source: 'acc-002', target: 'txn-102', type: 'SENT_TO', properties: {} },
    { id: 3, source: 'acc-003', target: 'txn-103', type: 'SENT_TO', properties: {} },
    { id: 4, source: 'acc-004', target: 'txn-104', type: 'SENT_TO', properties: {} },
    { id: 5, source: 'acc-005', target: 'txn-105', type: 'SENT_TO', properties: {} },
    { id: 6, source: 'acc-002', target: 'txn-101', type: 'RECEIVED', properties: {} },
    { id: 7, source: 'acc-005', target: 'txn-102', type: 'RECEIVED', properties: {} },
    { id: 8, source: 'acc-006', target: 'txn-103', type: 'RECEIVED', properties: {} },
    { id: 9, source: 'acc-001', target: 'txn-104', type: 'RECEIVED', properties: {} },
    { id: 10, source: 'acc-003', target: 'txn-105', type: 'RECEIVED', properties: {} },
    { id: 11, source: 'acc-001', target: 'dev-iphone-14', type: 'USED_DEVICE', properties: {} },
    { id: 12, source: 'acc-002', target: 'dev-iphone-14', type: 'USED_DEVICE', properties: {} },
    { id: 13, source: 'acc-003', target: 'dev-pixel-8', type: 'USED_DEVICE', properties: {} },
    { id: 14, source: 'acc-004', target: 'dev-pixel-8', type: 'USED_DEVICE', properties: {} },
    { id: 15, source: 'acc-005', target: 'dev-macbook-pro', type: 'USED_DEVICE', properties: {} },
    { id: 16, source: 'acc-006', target: 'dev-macbook-pro', type: 'USED_DEVICE', properties: {} },
    { id: 17, source: 'acc-001', target: 'ip-1', type: 'LOGGED_FROM', properties: {} },
    { id: 18, source: 'acc-002', target: 'ip-1', type: 'LOGGED_FROM', properties: {} },
    { id: 19, source: 'acc-003', target: 'ip-2', type: 'LOGGED_FROM', properties: {} },
    { id: 20, source: 'acc-004', target: 'ip-2', type: 'LOGGED_FROM', properties: {} },
    { id: 21, source: 'acc-005', target: 'ip-3', type: 'LOGGED_FROM', properties: {} },
    { id: 22, source: 'acc-006', target: 'ip-3', type: 'LOGGED_FROM', properties: {} },
    { id: 23, source: 'txn-103', target: 'acc-003', type: 'FLAGGED', properties: { reason: 'high amount + shared device' } },
    { id: 24, source: 'txn-103', target: 'acc-004', type: 'FLAGGED', properties: { reason: 'shared IP + rapid transfer' } },
    { id: 25, source: 'txn-105', target: 'acc-005', type: 'FLAGGED', properties: { reason: 'cross-border burst pattern' } },
  ],
}

export const FRAUD_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'Full network',
    description: 'All accounts, transactions, and devices',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: FRAUD_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
  },
  {
    key: 'transactions',
    label: 'Money flow',
    description: 'Transaction paths between accounts',
    cypher: 'MATCH (a:Account)-[:SENT_TO]->(t:Transaction) RETURN a, t',
    expectedResultCount: FRAUD_SAMPLE.links.filter((link) => link.type === 'SENT_TO' || link.type === 'RECEIVED').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['SENT_TO', 'RECEIVED']),
  },
  {
    key: 'devices',
    label: 'Device sharing',
    description: 'Which accounts share devices',
    cypher: 'MATCH (a:Account)-[:USED_DEVICE]->(d:Device) RETURN a, d',
    expectedResultCount: FRAUD_SAMPLE.links.filter((link) => link.type === 'USED_DEVICE').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['USED_DEVICE']),
  },
  {
    key: 'suspicious',
    label: 'Suspicious patterns',
    description: 'Accounts sharing devices or IPs',
    cypher: 'MATCH (a1:Account)-[:USED_DEVICE]->(d)<-[:USED_DEVICE]-(a2:Account) RETURN a1, d, a2',
    expectedResultCount: suspiciousPatternSubgraph(FRAUD_SAMPLE).links.length,
    filterFn: (data) => suspiciousPatternSubgraph(data),
  },
]
