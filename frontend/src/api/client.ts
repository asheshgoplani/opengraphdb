import { ApiError, type HealthStatus, type QueryResponse } from '@/types/api'

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
      const body = await res.json().catch(() => ({ message: res.statusText }))
      throw new ApiError(body.message || res.statusText, res.status, body)
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

  async schema(): Promise<unknown> {
    return this.request<unknown>('/schema')
  }
}
