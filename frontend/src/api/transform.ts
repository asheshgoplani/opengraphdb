import type { QueryResponse } from '@/types/api'
import type { BackendQueryResponse } from '@/types/api'
import type { GraphData, GraphNode, GraphEdge } from '@/types/graph'

// Descriptor that tells transformLiveResponse how to reconstruct graph data from rows.
export interface NodeColumnDescriptor {
  nameCol: string
  propsCol: string
  label: string
}

export interface EdgeDescriptor {
  srcCol: string
  dstCol: string
  type: string
}

export interface GraphQueryDescriptor {
  nodeColumns: NodeColumnDescriptor[]
  edgeDescriptors?: EdgeDescriptor[]
}

// Legacy transform for old {nodes, relationships} format - kept for compatibility.
export function transformQueryResponse(response: QueryResponse): GraphData {
  const nodes: GraphNode[] = (response.nodes ?? []).map((n) => ({
    id: n.id,
    labels: n.labels,
    properties: n.properties,
    label: n.labels[0] || String(n.id),
  }))

  const links: GraphEdge[] = (response.relationships ?? []).map((r) => ({
    id: r.id,
    source: r.startNode,
    target: r.endNode,
    type: r.type,
    properties: r.properties,
  }))

  return { nodes, links }
}

// Live transform: converts backend's {columns, rows, row_count} to GraphData.
export function transformLiveResponse(
  response: BackendQueryResponse,
  descriptor: GraphQueryDescriptor
): GraphData {
  const nodeMap = new Map<string, GraphNode>()
  const edgeSet = new Set<string>()
  const links: GraphEdge[] = []

  for (const row of response.rows) {
    for (const { nameCol, propsCol, label } of descriptor.nodeColumns) {
      const name = row[nameCol]
      if (name == null || name === '') continue
      const nameStr = String(name)
      const key = `${label}:${nameStr}`

      if (!nodeMap.has(key)) {
        const props = (row[propsCol] as Record<string, unknown>) ?? {}
        nodeMap.set(key, {
          id: key,
          labels: [label],
          properties: { ...props, _label: label },
          label,
        })
      }
    }

    if (!descriptor.edgeDescriptors) continue

    for (const { srcCol, dstCol, type } of descriptor.edgeDescriptors) {
      const srcName = row[srcCol]
      const dstName = row[dstCol]
      if (srcName == null || dstName == null) continue

      const srcNameStr = String(srcName)
      const dstNameStr = String(dstName)
      if (!srcNameStr || !dstNameStr) continue

      const srcLabel = descriptor.nodeColumns.find((column) => column.nameCol === srcCol)?.label ?? ''
      const dstLabel = descriptor.nodeColumns.find((column) => column.nameCol === dstCol)?.label ?? ''

      if (!srcLabel || !dstLabel) continue

      const srcKey = `${srcLabel}:${srcNameStr}`
      const dstKey = `${dstLabel}:${dstNameStr}`
      const edgeId = `${srcKey}--${type}--${dstKey}`

      if (edgeSet.has(edgeId)) continue
      edgeSet.add(edgeId)
      links.push({
        id: edgeId,
        source: srcKey,
        target: dstKey,
        type,
        properties: {},
      })
    }
  }

  return { nodes: Array.from(nodeMap.values()), links }
}
