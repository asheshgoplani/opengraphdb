import type { MCPInvokeArgs } from '@/api/mcpClient'

export type MCPParamType = 'string' | 'number' | 'boolean'

export interface MCPParamSpec {
  name: string
  type: MCPParamType
  required?: boolean
  default?: string | number | boolean
  placeholder?: string
  description?: string
}

export interface MCPToolSpec {
  name: string
  title: string
  description: string
  category: 'Schema' | 'Query' | 'Graph' | 'Catalog' | 'Search' | 'Mutation' | 'Temporal' | 'RDF'
  params: MCPParamSpec[]
  status: 'real' | 'coming-soon'
  sampleArgs: MCPInvokeArgs
  preview: unknown
}

// Real tools — currently registered in mcp/src/index.ts (5).
export const REAL_MCP_TOOLS: MCPToolSpec[] = [
  {
    name: 'browse_schema',
    title: 'browse_schema',
    description: 'Discover labels, edge types, and property keys from the live dataset.',
    category: 'Schema',
    status: 'real',
    params: [],
    sampleArgs: {},
    preview: {
      labels: ['Movie', 'Person', 'Genre'],
      edge_types: ['ACTED_IN', 'DIRECTED', 'IN_GENRE'],
      property_keys: ['title', 'released', 'name', 'genre'],
    },
  },
  {
    name: 'execute_cypher',
    title: 'execute_cypher',
    description: 'Run an openCypher statement directly against the active dataset.',
    category: 'Query',
    status: 'real',
    params: [
      {
        name: 'query',
        type: 'string',
        required: true,
        default: 'MATCH (n) RETURN n LIMIT 5',
        placeholder: 'MATCH (n) RETURN n LIMIT 5',
      },
    ],
    sampleArgs: { query: 'MATCH (m:Movie) RETURN m.title, m.released LIMIT 5' },
    preview: {
      columns: ['m.title', 'm.released'],
      rows: [
        ['The Matrix', 1999],
        ['Inception', 2010],
        ['Interstellar', 2014],
        ['The Dark Knight', 2008],
        ['Arrival', 2016],
      ],
      stats: { parse_us: 42, plan_us: 187, execute_us: 612 },
    },
  },
  {
    name: 'get_node_neighborhood',
    title: 'get_node_neighborhood',
    description: 'Fetch the k-hop neighborhood around a node — the traversal primitive behind graph-native RAG.',
    category: 'Graph',
    status: 'real',
    params: [
      { name: 'node_id', type: 'string', required: true, default: 'ml-m-1', placeholder: 'ml-m-1' },
      { name: 'depth', type: 'number', default: 1 },
    ],
    sampleArgs: { node_id: 'ml-m-1', depth: 1 },
    preview: {
      center: { id: 'ml-m-1', labels: ['Movie'], properties: { title: 'The Matrix', released: 1999 } },
      neighbors: [
        { id: 'ml-p-keanu', labels: ['Person'], edge: 'ACTED_IN' },
        { id: 'ml-p-laurence', labels: ['Person'], edge: 'ACTED_IN' },
        { id: 'ml-g-action', labels: ['Genre'], edge: 'IN_GENRE' },
      ],
    },
  },
  {
    name: 'search_nodes',
    title: 'search_nodes',
    description: 'Find nodes by label and a property substring — the MCP-safe alternative to raw Cypher.',
    category: 'Search',
    status: 'real',
    params: [
      { name: 'label', type: 'string', default: 'Movie', placeholder: 'Movie' },
      { name: 'query', type: 'string', required: true, default: 'matrix', placeholder: 'matrix' },
      { name: 'limit', type: 'number', default: 5 },
    ],
    sampleArgs: { label: 'Movie', query: 'matrix', limit: 5 },
    preview: {
      hits: [
        { id: 'ml-m-1', label: 'Movie', title: 'The Matrix', score: 0.98 },
        { id: 'ml-m-22', label: 'Movie', title: 'The Matrix Reloaded', score: 0.89 },
      ],
    },
  },
  {
    name: 'list_datasets',
    title: 'list_datasets',
    description: 'List every .ogdb file the embedded runtime has mounted — proves the single-file claim.',
    category: 'Catalog',
    status: 'real',
    params: [],
    sampleArgs: {},
    preview: {
      datasets: [
        { key: 'movielens', file: 'movielens.ogdb', nodes: 142, edges: 360 },
        { key: 'airroutes', file: 'airroutes.ogdb', nodes: 38, edges: 192 },
        { key: 'got', file: 'got.ogdb', nodes: 98, edges: 420 },
        { key: 'wikidata', file: 'wikidata.ogdb', nodes: 64, edges: 228 },
      ],
    },
  },
]

// Coming-soon tools — match SPEC.md §MCP claim #8 (6 not yet registered at stdio transport).
export const COMING_SOON_MCP_TOOLS: MCPToolSpec[] = [
  {
    name: 'upsert_node',
    title: 'upsert_node',
    description: 'Idempotent node merge — insert or update by primary key + labels.',
    category: 'Mutation',
    status: 'coming-soon',
    params: [],
    sampleArgs: {},
    preview: { ok: true, id: 'n-42', mutated: 'inserted' },
  },
  {
    name: 'upsert_edge',
    title: 'upsert_edge',
    description: 'Idempotent edge merge — typed, directional, with MVCC snapshot respect.',
    category: 'Mutation',
    status: 'coming-soon',
    params: [],
    sampleArgs: {},
    preview: { ok: true, from: 'n-42', to: 'n-7', type: 'KNOWS' },
  },
  {
    name: 'vector_search',
    title: 'vector_search',
    description: 'Top-K ANN search on a named HNSW index — cosine, dot, or euclidean.',
    category: 'Search',
    status: 'coming-soon',
    params: [],
    sampleArgs: {},
    preview: {
      index: 'movies_embed',
      metric: 'cosine',
      hits: [
        { id: 'ml-m-14', score: 0.912 },
        { id: 'ml-m-3', score: 0.874 },
      ],
    },
  },
  {
    name: 'text_search',
    title: 'text_search',
    description: 'BM25 full-text hits from the built-in Tantivy index — with fuzzy + snippet.',
    category: 'Search',
    status: 'coming-soon',
    params: [],
    sampleArgs: {},
    preview: {
      index: 'movies_title_fts',
      total: 3,
      hits: [
        { id: 'ml-m-1', score: 8.14, snippet: '<em>Matrix</em> — 1999 cyberpunk classic' },
      ],
    },
  },
  {
    name: 'temporal_diff',
    title: 'temporal_diff',
    description: 'Bi-temporal diff between two valid-time points — time-travel on the graph.',
    category: 'Temporal',
    status: 'coming-soon',
    params: [],
    sampleArgs: {},
    preview: {
      from: '2023-01-01',
      to: '2024-01-01',
      added: 14,
      removed: 3,
      changed: 7,
    },
  },
  {
    name: 'import_rdf',
    title: 'import_rdf',
    description: 'Stream .ttl / .nt / .rdf files into the live graph with URI round-trip preserved.',
    category: 'RDF',
    status: 'coming-soon',
    params: [],
    sampleArgs: {},
    preview: { source: 'ontology.ttl', triples_ingested: 4021, duration_ms: 814 },
  },
]

export const ALL_MCP_TOOLS: MCPToolSpec[] = [...REAL_MCP_TOOLS, ...COMING_SOON_MCP_TOOLS]
