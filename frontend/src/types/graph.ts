export interface GraphNode {
  id: string | number
  labels: string[]
  properties: Record<string, unknown>
  label?: string
  x?: number
  y?: number
  fx?: number
  fy?: number
  __bckgDimensions?: [number, number]
}

export interface GraphEdge {
  id: string | number
  source: string | number | GraphNode
  target: string | number | GraphNode
  type: string
  properties: Record<string, unknown>
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphEdge[]
}

export type ViewMode = 'graph' | 'table'

export interface TraceStep {
  nodeId: string | number
  stepIndex: number
}

export interface TraceData {
  steps: TraceStep[]
}
