import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

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

const ACCOUNT_SEEDS = [
  { id: 'acc-001', holder: 'Nora Adams', balance: 4200, riskScore: 0.21 },
  { id: 'acc-002', holder: 'Liam Patel', balance: 1780, riskScore: 0.27 },
  { id: 'acc-003', holder: 'Sofia Reed', balance: 960, riskScore: 0.83 },
  { id: 'acc-004', holder: 'Owen Brooks', balance: 1120, riskScore: 0.78 },
  { id: 'acc-005', holder: 'Mia Turner', balance: 6810, riskScore: 0.49 },
  { id: 'acc-006', holder: 'Ethan Collins', balance: 2450, riskScore: 0.58 },
  { id: 'acc-007', holder: 'Priya Shah', balance: 3020, riskScore: 0.61 },
  { id: 'acc-008', holder: 'Jordan Miles', balance: 910, riskScore: 0.72 },
  { id: 'acc-009', holder: 'Hazel Price', balance: 1340, riskScore: 0.67 },
  { id: 'acc-010', holder: 'Caleb Ward', balance: 5080, riskScore: 0.65 },
  { id: 'acc-011', holder: 'Naomi Bell', balance: 740, riskScore: 0.89 },
  { id: 'acc-012', holder: 'Victor Cruz', balance: 2830, riskScore: 0.54 },
  { id: 'acc-013', holder: 'Ariana Moss', balance: 1210, riskScore: 0.86 },
  { id: 'acc-014', holder: 'Devin Price', balance: 4600, riskScore: 0.59 },
  { id: 'acc-015', holder: 'Milo Ross', balance: 980, riskScore: 0.81 },
]

const TRANSACTION_SEEDS = [
  { id: 'txn-101', amount: 240, timestamp: '2026-02-27T09:15:00Z', status: 'completed' },
  { id: 'txn-102', amount: 1750, timestamp: '2026-02-27T10:22:00Z', status: 'completed' },
  { id: 'txn-103', amount: 4990, timestamp: '2026-02-27T11:04:00Z', status: 'flagged' },
  { id: 'txn-104', amount: 890, timestamp: '2026-02-27T12:41:00Z', status: 'completed' },
  { id: 'txn-105', amount: 3560, timestamp: '2026-02-27T14:09:00Z', status: 'flagged' },
  { id: 'txn-106', amount: 430, timestamp: '2026-02-27T15:02:00Z', status: 'completed' },
  { id: 'txn-107', amount: 1290, timestamp: '2026-02-27T15:14:00Z', status: 'completed' },
  { id: 'txn-108', amount: 2100, timestamp: '2026-02-27T15:20:00Z', status: 'pending' },
  { id: 'txn-109', amount: 680, timestamp: '2026-02-27T15:44:00Z', status: 'completed' },
  { id: 'txn-110', amount: 5210, timestamp: '2026-02-27T16:01:00Z', status: 'flagged' },
  { id: 'txn-111', amount: 740, timestamp: '2026-02-27T16:18:00Z', status: 'completed' },
  { id: 'txn-112', amount: 3980, timestamp: '2026-02-27T16:37:00Z', status: 'flagged' },
  { id: 'txn-113', amount: 520, timestamp: '2026-02-27T17:05:00Z', status: 'completed' },
  { id: 'txn-114', amount: 1680, timestamp: '2026-02-27T17:22:00Z', status: 'completed' },
  { id: 'txn-115', amount: 4510, timestamp: '2026-02-27T17:49:00Z', status: 'flagged' },
]

const DEVICE_SEEDS = [
  { id: 'dev-iphone-14', type: 'mobile', os: 'iOS 17' },
  { id: 'dev-pixel-8', type: 'mobile', os: 'Android 15' },
  { id: 'dev-macbook-pro', type: 'laptop', os: 'macOS 14' },
  { id: 'dev-thinkpad-x1', type: 'laptop', os: 'Windows 11' },
  { id: 'dev-ipad-pro', type: 'tablet', os: 'iPadOS 18' },
]

const IP_SEEDS = [
  { id: 'ip-1', address: '192.168.1.24', country: 'US' },
  { id: 'ip-2', address: '10.0.0.56', country: 'US' },
  { id: 'ip-3', address: '172.16.0.9', country: 'RU' },
  { id: 'ip-4', address: '203.0.113.78', country: 'NL' },
  { id: 'ip-5', address: '198.51.100.42', country: 'SG' },
]

const BASE_LINKS: GraphEdge[] = [
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
]

interface LinkSeed {
  source: string
  target: string
  type: string
  properties?: Record<string, unknown>
}

const ADDITIONAL_LINK_SEEDS: LinkSeed[] = [
  { source: 'acc-007', target: 'txn-106', type: 'SENT_TO' },
  { source: 'acc-008', target: 'txn-107', type: 'SENT_TO' },
  { source: 'acc-009', target: 'txn-108', type: 'SENT_TO' },
  { source: 'acc-010', target: 'txn-109', type: 'SENT_TO' },
  { source: 'acc-011', target: 'txn-110', type: 'SENT_TO' },
  { source: 'acc-012', target: 'txn-111', type: 'SENT_TO' },
  { source: 'acc-013', target: 'txn-112', type: 'SENT_TO' },
  { source: 'acc-014', target: 'txn-113', type: 'SENT_TO' },
  { source: 'acc-015', target: 'txn-114', type: 'SENT_TO' },
  { source: 'acc-003', target: 'txn-115', type: 'SENT_TO' },

  { source: 'acc-008', target: 'txn-106', type: 'RECEIVED' },
  { source: 'acc-009', target: 'txn-107', type: 'RECEIVED' },
  { source: 'acc-010', target: 'txn-108', type: 'RECEIVED' },
  { source: 'acc-011', target: 'txn-109', type: 'RECEIVED' },
  { source: 'acc-012', target: 'txn-110', type: 'RECEIVED' },
  { source: 'acc-013', target: 'txn-111', type: 'RECEIVED' },
  { source: 'acc-014', target: 'txn-112', type: 'RECEIVED' },
  { source: 'acc-015', target: 'txn-113', type: 'RECEIVED' },
  { source: 'acc-007', target: 'txn-114', type: 'RECEIVED' },
  { source: 'acc-004', target: 'txn-115', type: 'RECEIVED' },

  { source: 'acc-007', target: 'dev-thinkpad-x1', type: 'USED_DEVICE' },
  { source: 'acc-008', target: 'dev-ipad-pro', type: 'USED_DEVICE' },
  { source: 'acc-009', target: 'dev-iphone-14', type: 'USED_DEVICE' },
  { source: 'acc-010', target: 'dev-pixel-8', type: 'USED_DEVICE' },
  { source: 'acc-011', target: 'dev-thinkpad-x1', type: 'USED_DEVICE' },
  { source: 'acc-012', target: 'dev-ipad-pro', type: 'USED_DEVICE' },
  { source: 'acc-013', target: 'dev-macbook-pro', type: 'USED_DEVICE' },
  { source: 'acc-014', target: 'dev-thinkpad-x1', type: 'USED_DEVICE' },
  { source: 'acc-015', target: 'dev-pixel-8', type: 'USED_DEVICE' },

  { source: 'acc-007', target: 'ip-4', type: 'LOGGED_FROM' },
  { source: 'acc-008', target: 'ip-5', type: 'LOGGED_FROM' },
  { source: 'acc-009', target: 'ip-1', type: 'LOGGED_FROM' },
  { source: 'acc-010', target: 'ip-2', type: 'LOGGED_FROM' },
  { source: 'acc-011', target: 'ip-4', type: 'LOGGED_FROM' },
  { source: 'acc-012', target: 'ip-5', type: 'LOGGED_FROM' },
  { source: 'acc-013', target: 'ip-3', type: 'LOGGED_FROM' },
  { source: 'acc-014', target: 'ip-4', type: 'LOGGED_FROM' },
  { source: 'acc-015', target: 'ip-2', type: 'LOGGED_FROM' },

  {
    source: 'txn-110',
    target: 'acc-011',
    type: 'FLAGGED',
    properties: { reason: 'high velocity transfers + shared laptop cluster' },
  },
  {
    source: 'txn-112',
    target: 'acc-013',
    type: 'FLAGGED',
    properties: { reason: 'cross-border amount spike with risky device reuse' },
  },
  {
    source: 'txn-115',
    target: 'acc-003',
    type: 'FLAGGED',
    properties: { reason: 'repeat high amount within suspicious session' },
  },
]

const ADDITIONAL_LINKS: GraphEdge[] = ADDITIONAL_LINK_SEEDS.map((seed, index) => ({
  id: BASE_LINKS.length + index + 1,
  source: seed.source,
  target: seed.target,
  type: seed.type,
  properties: seed.properties ?? {},
}))

export const FRAUD_SAMPLE: GraphData = {
  nodes: [
    ...ACCOUNT_SEEDS.map((account) => ({
      id: account.id,
      labels: [ACCOUNT_LABEL],
      properties: { holder: account.holder, balance: account.balance, riskScore: account.riskScore },
      label: ACCOUNT_LABEL,
    })),
    ...TRANSACTION_SEEDS.map((transaction) => ({
      id: transaction.id,
      labels: [TRANSACTION_LABEL],
      properties: {
        amount: transaction.amount,
        timestamp: transaction.timestamp,
        status: transaction.status,
      },
      label: TRANSACTION_LABEL,
    })),
    ...DEVICE_SEEDS.map((device) => ({
      id: device.id,
      labels: [DEVICE_LABEL],
      properties: { type: device.type, os: device.os },
      label: DEVICE_LABEL,
    })),
    ...IP_SEEDS.map((ip) => ({
      id: ip.id,
      labels: [IP_LABEL],
      properties: { address: ip.address, country: ip.country },
      label: IP_LABEL,
    })),
  ],
  links: [...BASE_LINKS, ...ADDITIONAL_LINKS],
}

export const FRAUD_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'Full network',
    description: 'All accounts, transactions, and devices',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: FRAUD_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  {
    key: 'transactions',
    label: 'Money flow',
    description: 'Transaction paths between accounts',
    cypher:
      'MATCH (a:Account)-[:SENT_TO]->(t:Transaction) RETURN a.holder AS account, t.amount AS txnId, PROPERTIES(a) AS acctProps, PROPERTIES(t) AS txnProps',
    expectedResultCount: FRAUD_SAMPLE.links.filter((link) => link.type === 'SENT_TO').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['SENT_TO']),
    category: 'Explore',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'account', propsCol: 'acctProps', label: 'Account' },
        { nameCol: 'txnId', propsCol: 'txnProps', label: 'Transaction' },
      ],
      edgeDescriptors: [{ srcCol: 'account', dstCol: 'txnId', type: 'SENT_TO' }],
    },
  },
  {
    key: 'devices',
    label: 'Device sharing',
    description: 'Which accounts share devices',
    cypher:
      'MATCH (a:Account)-[:USED_DEVICE]->(d:Device) RETURN a.holder AS account, d.type AS device, PROPERTIES(a) AS acctProps, PROPERTIES(d) AS devProps',
    expectedResultCount: FRAUD_SAMPLE.links.filter((link) => link.type === 'USED_DEVICE').length,
    filterFn: (data) => filterByRelationshipTypes(data, ['USED_DEVICE']),
    category: 'Traverse',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'account', propsCol: 'acctProps', label: 'Account' },
        { nameCol: 'device', propsCol: 'devProps', label: 'Device' },
      ],
      edgeDescriptors: [{ srcCol: 'account', dstCol: 'device', type: 'USED_DEVICE' }],
    },
  },
  {
    key: 'suspicious',
    label: 'Suspicious patterns',
    description: 'Accounts sharing devices or IPs',
    cypher:
      'MATCH (a1:Account)-[:USED_DEVICE]->(d:Device)<-[:USED_DEVICE]-(a2:Account) WHERE a1.holder < a2.holder RETURN a1.holder AS account1, a2.holder AS account2, d.type AS device, PROPERTIES(a1) AS a1Props, PROPERTIES(a2) AS a2Props, PROPERTIES(d) AS devProps',
    expectedResultCount: suspiciousPatternSubgraph(FRAUD_SAMPLE).links.length,
    filterFn: (data) => suspiciousPatternSubgraph(data),
    category: 'Analyze',
    liveDescriptor: {
      nodeColumns: [
        { nameCol: 'account1', propsCol: 'a1Props', label: 'Account' },
        { nameCol: 'account2', propsCol: 'a2Props', label: 'Account' },
        { nameCol: 'device', propsCol: 'devProps', label: 'Device' },
      ],
      edgeDescriptors: [{ srcCol: 'account1', dstCol: 'account2', type: 'SHARED_DEVICE' }],
    },
  },
]
