import type { QueryResponse } from '@/types/api'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'

export function transformQueryResponse(response: QueryResponse): GraphData {
  const nodes: GraphNode[] = response.nodes.map((n) => ({
    id: n.id,
    labels: n.labels,
    properties: n.properties,
    label: n.labels[0] || String(n.id),
  }))

  const links: GraphEdge[] = response.relationships.map((r) => ({
    id: r.id,
    source: r.startNode,
    target: r.endNode,
    type: r.type,
    properties: r.properties,
  }))

  return { nodes, links }
}
