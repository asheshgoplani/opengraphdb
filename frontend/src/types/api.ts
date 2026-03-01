export interface HealthStatus {
  connected: boolean
}

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
  columns?: string[]
  rows?: unknown[][]
}

export interface SchemaResponse {
  labels: string[]
  relationshipTypes: string[]
  propertyKeys: string[]
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
