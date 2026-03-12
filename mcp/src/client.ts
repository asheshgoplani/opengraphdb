export interface SchemaResponse {
  labels: string[];
  edge_types: string[];
  property_keys: string[];
}

export interface MetricsResponse {
  node_count: number;
  edge_count: number;
  page_count: number;
  wal_size_bytes: number;
  [key: string]: unknown;
}

export interface QueryResponse {
  columns: string[];
  rows: unknown[][];
  // May also contain node/edge objects depending on query
  [key: string]: unknown;
}

export class OpenGraphDBClient {
  constructor(private baseUrl: string) {
    // Strip trailing slash
    if (this.baseUrl.endsWith("/")) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
  }

  async health(): Promise<{ status: string }> {
    return this.get("/health");
  }

  async schema(): Promise<SchemaResponse> {
    return this.get("/schema");
  }

  async metrics(): Promise<MetricsResponse> {
    return this.get("/metrics");
  }

  async query(cypher: string): Promise<QueryResponse> {
    return this.post("/query", { query: cypher });
  }

  async exportData(filters?: {
    label?: string;
    edge_type?: string;
  }): Promise<{ nodes: unknown[]; edges: unknown[] }> {
    return this.post("/export", filters ?? {});
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OpenGraphDB HTTP ${response.status}: ${response.statusText}${text ? ` — ${text}` : ""}`
      );
    }
    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OpenGraphDB HTTP ${response.status}: ${response.statusText}${text ? ` — ${text}` : ""}`
      );
    }
    return response.json() as Promise<T>;
  }
}
