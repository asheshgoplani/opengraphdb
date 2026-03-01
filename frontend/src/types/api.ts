export interface HealthStatus {
  connected: boolean
}

// Raw response from backend POST /query
export interface BackendQueryResponse {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
}

// Kept for backward compat - not used for live graph rendering
export interface QueryResponse {
  nodes: Array<{
    id: string | number
    labels: string[]
    properties: Record<string, unknown>
  }>
  relationships: Array<{
    id: string | number
    type: string
    startNode: string | number
    endNode: string | number
    properties: Record<string, unknown>
  }>
}

// Frontend-facing schema (normalized field names)
export interface SchemaResponse {
  labels: string[]
  relationshipTypes: string[]
  propertyKeys: string[]
}

// Raw backend /schema response
export interface BackendSchemaResponse {
  labels: string[]
  edge_types: string[]
  property_keys: string[]
}

// Individual trace step delivered via SSE from POST /query/trace
export interface TraceStepEvent {
  nodeId: string | number
  stepIndex: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
