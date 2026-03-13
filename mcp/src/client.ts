export interface CommunitySummaryResponse {
  community_id: number;
  node_count: number;
  edge_count: number;
  description: string;
  label_distribution: Record<string, number>;
  level: number;
  parent_community_id: number | null;
}

export interface DrillResultResponse {
  SubCommunities?: CommunitySummaryResponse[];
  Members?: Array<{
    node_id: number;
    labels: string[];
    properties: Record<string, unknown>;
  }>;
}

export interface EnrichedRagResultResponse {
  node_id: number;
  score: number;
  community_id: number | null;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface IngestResultResponse {
  document_node_id: number;
  section_count: number;
  content_count: number;
  reference_count: number;
  text_indexed: boolean;
  vector_indexed: boolean;
}

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

  async ragBrowseCommunities(resolutions?: number[]): Promise<CommunitySummaryResponse[]> {
    return this.post("/rag/communities", resolutions ? { resolutions } : {});
  }

  async ragDrillIntoCommunity(communityId: number, resolutions?: number[]): Promise<DrillResultResponse> {
    return this.post("/rag/drill", {
      community_id: communityId,
      ...(resolutions ? { resolutions } : {}),
    });
  }

  async ragHybridSearch(
    query: string,
    options?: {
      embedding?: number[];
      k?: number;
      community_id?: number;
    }
  ): Promise<EnrichedRagResultResponse[]> {
    return this.post("/rag/search", {
      query,
      ...options,
    });
  }

  async ragIngestDocument(
    title: string,
    content: string,
    options?: {
      format?: "Markdown" | "PlainText" | "Pdf";
      content_base64?: string;
      source_uri?: string;
    }
  ): Promise<IngestResultResponse> {
    const body: Record<string, unknown> = { title };
    if (options?.content_base64) {
      body.content_base64 = options.content_base64;
    } else {
      body.content = content;
    }
    if (options?.format) body.format = options.format;
    if (options?.source_uri) body.source_uri = options.source_uri;
    return this.post("/rag/ingest", body);
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
