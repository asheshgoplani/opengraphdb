import { ApiError, type BackendQueryResponse, type BackendSchemaResponse, type HealthStatus, type QueryResponse, type SchemaResponse, type TraceStepEvent } from '@/types/api'
import { extractErrorMessage } from './error-message'

export class ApiClient {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
    if (!res.ok) {
      // QA bug #4 (2026-04-30): see error-message.ts for the contract —
      // we now prefer body.error (what ogdb returns) over body.message.
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(extractErrorMessage(body, res.statusText), res.status, body)
    }
    return res.json()
  }

  async health(): Promise<HealthStatus> {
    try {
      await this.request<unknown>('/health', {
        signal: AbortSignal.timeout(3000),
      })
      return { connected: true }
    } catch {
      return { connected: false }
    }
  }

  async query(cypher: string): Promise<QueryResponse> {
    return this.request<QueryResponse>('/query', {
      method: 'POST',
      body: JSON.stringify({ query: cypher }),
    })
  }

  async schema(): Promise<SchemaResponse> {
    const raw = await this.request<BackendSchemaResponse>('/schema')
    return {
      labels: raw.labels ?? [],
      relationshipTypes: raw.edge_types ?? [],
      propertyKeys: raw.property_keys ?? [],
    }
  }

  async queryWithTrace(
    cypher: string,
    onTraceStep: (step: TraceStepEvent) => void,
  ): Promise<BackendQueryResponse> {
    const response = await fetch(`${this.baseUrl}/query/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cypher }),
    })

    if (!response.ok) {
      throw new Error(`Trace query failed: ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let resultData: BackendQueryResponse | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events from buffer (events are separated by double newlines)
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? '' // keep incomplete last chunk

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue
        const lines = eventBlock.split('\n')
        let eventType = ''
        let data = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            data = line.slice(6)
          }
        }

        if (eventType === 'trace' && data) {
          const step = JSON.parse(data) as TraceStepEvent
          onTraceStep(step)
        } else if (eventType === 'result' && data) {
          resultData = JSON.parse(data) as BackendQueryResponse
        }
      }
    }

    if (!resultData) {
      throw new Error('Trace query completed without result event')
    }
    return resultData
  }
}
