# AI-Native Features: Ideas & Design Notes

**Status:** Brainstorming (not yet in ARCHITECTURE.md or SPEC.md)
**Date:** 2026-02-26

This document captures the AI-native feature ideas for OpenGraphDB. These are features that make the database genuinely useful for AI agents, developers building AI apps, and anyone who wants their data to be deeply searchable and contextual.

---

## Core Thesis

OpenGraphDB's differentiator is not "graph + vector + text search" (PostgreSQL, Neo4j, SurrealDB can all do pieces of that). The differentiator is:

1. **Embeddable, zero-config**: single `mydb.ogdb` file, no server, no JVM, no Docker
2. **AI-native from day one**: MCP built into the binary, agent memory patterns, auto-embedding
3. **Unified query planning**: the planner sees graph + vector + text together, not three separate extensions

The positioning: **"The graph database you embed directly in your AI agent, with vector and text search that just works."**

---

## Feature 1: Auto-Embedding System

### What
When you store text in OpenGraphDB, it becomes semantically searchable automatically. Configure an embedding provider once, mark properties for auto-embedding, done.

### Configuration

```toml
# opengraphdb.toml
[embedding]
provider = "openai"              # openai | cohere | voyage | ollama | custom
api_key_env = "OPENAI_API_KEY"   # reads from env var (never stored in DB)
model = "text-embedding-3-small" # provider-specific model name
dimensions = 1536                # output dimensions
```

```bash
# Or via CLI
opengraphdb config set embedding.provider openai
opengraphdb config set embedding.model text-embedding-3-small
opengraphdb config set embedding.api_key_env OPENAI_API_KEY
```

### Index Creation

```cypher
-- Standard Cypher CREATE INDEX with OPTIONS (no invented syntax)
CREATE INDEX review_text_embedding FOR (r:Review) ON (r.text)
OPTIONS {type: 'vector', embedding: true}
```

### Querying (Functions, Not Custom Operators)

No new operators. No invented syntax standards. Just functions, which Cypher already supports:

```cypher
-- Semantic search: pass natural language, DB handles embedding
MATCH (r:Review)
WHERE semantic_distance(r.text, 'good wifi quiet for working') < 0.3
RETURN r.text, semantic_distance(r.text, 'good wifi quiet for working') AS score
ORDER BY score ASC LIMIT 10

-- Raw vector search: pass a vector directly
MATCH (r:Review)
WHERE vector_distance(r.embedding, $my_vector) < 0.3
RETURN r.text

-- Full-text keyword search
MATCH (n:Article)
WHERE text_search(n.content, 'graph database performance')
RETURN n.title, text_score(n.content, 'graph database performance') AS relevance
```

### Design Decisions

- **Functions, not operators**: `semantic_distance()`, `vector_distance()`, `text_search()`, `text_score()` are regular Cypher functions. No parser changes for new operators.
- **External API providers only**: OpenAI, Cohere, Voyage, Ollama, etc. via HTTP. No bundled models (keeps binary small).
- **Provider trait**: `EmbeddingProvider` trait so users can implement custom providers.
- **Batch embedding**: on import, batches text into bulk API calls (not one-by-one).
- **Caching**: identical text doesn't re-embed.
- **Background re-embedding**: if you change the model, re-embeds asynchronously.
- **Multiple providers**: different properties can use different providers/models.

### Example: The Review Search Use Case

```cypher
-- "Find cafes in Chiang Mai good for remote work"
MATCH (p:Place {city: "Chiang Mai"})-[:HAS_REVIEW]->(r:Review)
WHERE semantic_distance(r.text, 'reliable wifi quiet laptop friendly power outlets') < 0.4
WITH p, count(r) AS matching_reviews, avg(semantic_distance(r.text, 'reliable wifi quiet laptop friendly power outlets')) AS avg_relevance
WHERE matching_reviews >= 3    -- multiple reviews agree
RETURN p.name, matching_reviews, avg_relevance
ORDER BY avg_relevance ASC
```

---

## Feature 2: Agent Memory Patterns

### What
OpenGraphDB natively understands how AI agents store and retrieve knowledge. Convenience layer over the graph that makes common agent patterns one-liners.

### Three Memory Types

| Type | What It Stores | Example |
|------|---------------|---------|
| **Entity memory** | Facts about things and their relationships | "Sarah Chen leads Project Alpha" |
| **Episodic memory** | What happened, when, in what context | "User asked about graph databases on Feb 26" |
| **Semantic memory** | Knowledge retrievable by meaning | "The cafe on Nimman Road has good wifi" → findable by "work-friendly places" |

### Via Cypher (Library/Embedded)

```cypher
-- Store an entity with observations
MERGE (e:Entity {name: 'Sarah Chen', type: 'Person'})
SET e.observations = e.observations + ['Leads Project Alpha', 'Joined 2024']
MERGE (p:Entity {name: 'Project Alpha', type: 'Project'})
MERGE (e)-[:LEADS]->(p)

-- Store an episode
CREATE (ep:Episode {
  content: 'User asked about graph databases',
  agent_id: 'agent-1',
  session_id: 'sess-abc',
  timestamp: datetime()
})

-- Recall by meaning (uses auto-embedding)
MATCH (e:Entity)
WHERE semantic_distance(e.observations, 'who runs the alpha project') < 0.4
RETURN e.name, e.observations
```

### Via CLI

```bash
# Store entity
opengraphdb memory store mydb.ogdb \
  --entity "Sarah Chen" \
  --type Person \
  --observe "Leads Project Alpha" \
  --relate "LEADS:Project Alpha"

# Store episode
opengraphdb memory log mydb.ogdb \
  --agent agent-1 \
  --session sess-abc \
  --content "User asked about graph databases"

# Recall by meaning
opengraphdb memory recall mydb.ogdb "who runs the alpha project"

# Recall with filters
opengraphdb memory recall mydb.ogdb "recent discussions" \
  --agent agent-1 \
  --since 2026-02-01 \
  --limit 10

# Forget an entity
opengraphdb memory forget mydb.ogdb --entity "Old Project"

# List all entities of a type
opengraphdb memory list mydb.ogdb --type Person

# Show entity with full context (observations + relationships)
opengraphdb memory show mydb.ogdb "Sarah Chen"
```

### Via MCP

```json
// ogdb_memory_store
{
  "entity": "Sarah Chen",
  "type": "Person",
  "observations": ["Leads Project Alpha", "Joined 2024"],
  "relations": [
    {"type": "LEADS", "target": "Project Alpha", "target_type": "Project"}
  ]
}

// ogdb_memory_recall
{
  "query": "who runs the alpha project",
  "limit": 5,
  "filters": {"type": "Person", "since": "2026-01-01"}
}

// ogdb_memory_log
{
  "content": "User discussed migration from Neo4j",
  "agent_id": "agent-1",
  "session_id": "sess-abc",
  "tags": ["neo4j", "migration"]
}

// ogdb_memory_forget
{
  "entity": "Old Project"
}
```

### What's Happening Under the Hood

These are NOT special storage primitives. They are convenience layers over regular graph operations:

- `memory store` → `MERGE` node + `SET` observations + `MERGE` relationships
- `memory recall` → `semantic_distance()` search + graph traversal for context
- `memory log` → `CREATE` Episode node with timestamp
- `memory forget` → `DETACH DELETE` the entity and its relationships

The data is regular graph data. You can always bypass the memory API and use raw Cypher.

---

## Feature 3: MCP Tool Design

### Core Tools (Always Loaded, 3 Tools)

| Tool | Purpose | Read/Write |
|------|---------|-----------|
| `ogdb_query` | Execute read-only Cypher | Read |
| `ogdb_mutate` | Execute write Cypher | Write |
| `ogdb_schema` | Inspect graph schema | Read |

#### ogdb_query

```json
// Request
{
  "cypher": "MATCH (p:Place)-[:HAS_REVIEW]->(r:Review) WHERE p.city = 'Chiang Mai' RETURN p.name, r.text LIMIT 20",
  "params": {},
  "format": "concise"   // concise (default) | detailed | raw
}

// Response for small results (< 50 rows): inline
{
  "rows": [...],
  "columns": ["p.name", "r.text"],
  "count": 20,
  "execution_ms": 4
}

// Response for large results (> 50 rows): preview + ResourceLink
{
  "preview": ["... first 20 rows ..."],
  "total_count": 15000,
  "columns": ["p.name", "r.text"],
  "execution_ms": 42,
  "full_results": {
    "uri": "ogdb://results/a1b2c3",
    "description": "Full result set (15,000 rows)"
  }
}
```

#### ogdb_schema

```json
// Request
{"filter": "Review"}   // optional: focus on specific label

// Response
{
  "labels": {
    "Place": {"count": 5200, "properties": {"name": "string", "city": "string", "rating": "f64"}},
    "Review": {"count": 48000, "properties": {"text": "string", "rating": "i64", "timestamp": "datetime"}}
  },
  "relationships": {
    "HAS_REVIEW": {"from": "Place", "to": "Review", "count": 48000}
  },
  "indexes": [
    {"on": "Review.text", "type": "vector", "embedding": true},
    {"on": "Place.city", "type": "btree"}
  ]
}
```

### Deferred Tools (Discovered On Demand)

Registered with `defer_loading: true` (Anthropic's tool search). Agent discovers them when needed:

| Tool | Purpose |
|------|---------|
| `ogdb_memory_store` | Store entity/observations/relations |
| `ogdb_memory_recall` | Semantic recall from knowledge graph |
| `ogdb_memory_log` | Store episodic memory |
| `ogdb_memory_forget` | Remove entity and relations |
| `ogdb_vector_search` | Direct semantic search on a property |
| `ogdb_text_search` | Full-text keyword search |
| `ogdb_explain` | Query plan + cost estimate without executing |
| `ogdb_import` | Import CSV/JSON/RDF data |
| `ogdb_export` | Export data in various formats |
| `ogdb_subgraph` | Extract neighborhood around a node |
| `ogdb_shortest_path` | Find path between two nodes |
| `ogdb_stats` | Database statistics and metrics |
| `ogdb_algorithms` | Run graph algorithms (PageRank, community detection, etc.) |

### Programmatic Tool Calling Support

Works with Anthropic's programmatic tool calling where Claude writes Python that calls tools in a sandbox. Intermediate results stay out of context window:

```python
# Agent writes this internally, results stay in sandbox
schema = ogdb_schema()
places = ogdb_query(
    cypher="MATCH (p:Place) WHERE p.city = 'Chiang Mai' AND p.category = 'cafe' RETURN p.name, p.id",
    format="raw"
)

results = []
for place in places["rows"]:
    reviews = ogdb_vector_search(
        label="Review",
        property="text",
        query="good wifi quiet laptop friendly",
        filter=f"MATCH (p)-[:HAS_REVIEW]->(r:Review) WHERE p.id = '{place['p.id']}' RETURN r",
        limit=5
    )
    if len(reviews["matches"]) >= 2:
        results.append({
            "name": place["p.name"],
            "matching_reviews": len(reviews["matches"]),
            "top_review": reviews["matches"][0]["text"]
        })

# Only this final print enters the context window
print(json.dumps(sorted(results, key=lambda x: -x["matching_reviews"])[:10]))
```

### Tool Annotations (MCP 2025-11-25)

```json
{
  "name": "ogdb_query",
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true
  }
}

{
  "name": "ogdb_mutate",
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,
    "idempotentHint": false
  }
}
```

### MCP Tasks for Long-Running Operations

Graph algorithms, bulk imports, and re-embedding jobs return a task handle:

```json
// Request
{"tool": "ogdb_algorithms", "params": {"algorithm": "pagerank", "label": "Entity"}}

// Immediate response
{"task_id": "task-xyz", "status": "working", "estimated_seconds": 30}

// Agent polls or gets notified when done
{"task_id": "task-xyz", "status": "completed", "result": {"top_nodes": [...]}}
```

### Elicitation for Destructive Operations

```json
// Agent calls: ogdb_mutate({cypher: "MATCH (n) DETACH DELETE n"})
// MCP server responds with elicitation:
{
  "type": "elicitation",
  "message": "This will delete all 53,200 nodes and 148,000 relationships. Confirm?",
  "schema": {
    "type": "object",
    "properties": {
      "confirm": {"type": "boolean", "description": "Delete all data?"}
    }
  }
}
```

---

## Feature 4: Context-Window-Aware Results

### What
The DB knows that AI agents have token limits. It automatically adjusts result formatting based on size.

### Rules

- **< 50 rows**: return everything inline
- **50-500 rows**: return preview (first 20 rows) + metadata + ResourceLink to full results
- **> 500 rows**: return statistical summary + sample rows + ResourceLink
- **Graph results**: compact notation for paths (not fully expanded JSON for every node/edge)
- **`format` parameter**: `concise` (AI-optimized, default), `detailed` (human-readable), `raw` (full data)

---

## Feature 5: Schema Introspection for AI

### What
Schema tools designed specifically for how AI agents need to understand data, not just for human DBAs.

### Capabilities

- `ogdb_schema()`: compact representation of labels, relationship types, property keys, cardinality estimates
- `ogdb_schema(filter="Review")`: focus on specific parts of the schema
- Schema includes cardinality estimates so agents can reason about query cost
- `ogdb_explain()`: machine-readable query plans with cost estimates (not just human-readable text)

---

## Feature 6: Safe-by-Default Execution

### What
Separate read and write tools. Destructive operations require confirmation.

### Rules

- `ogdb_query` is read-only. Cannot modify data.
- `ogdb_mutate` is required for writes. Annotated as destructive.
- Bulk deletes, DROP operations trigger MCP elicitation (user confirmation).
- Query timeout parameter available on all tools.
- Transaction support: `ogdb_mutate` can accept `transaction_id` for multi-statement transactions.

---

## Competitive Position

### What exists today that does pieces of this

| Database | Graph | Vector | Text | Embedded | MCP | Agent Memory | Auto-Embed |
|----------|-------|--------|------|----------|-----|-------------|------------|
| PostgreSQL + pgvector + AGE | via extension | via extension | built-in | No (server) | via wrapper | No | No |
| Neo4j | native | since 5.11 | Lucene | No (JVM server) | community server | No | No |
| SurrealDB 3.0 | multi-model | planned | partial | Yes | official | focus area | No |
| MongoDB Atlas | $graphLookup | Atlas Vector | built-in | No (server) | via wrapper | No | No |
| DuckDB | No | VSS extension | No | Yes | MotherDuck | No | No |
| **OpenGraphDB** | **native** | **native** | **native** | **Yes** | **built-in** | **native** | **native** |

### Where we win

- **Embeddable**: PostgreSQL/Neo4j/MongoDB will never be a library you `cargo add`
- **Unified planner**: pgvector/AGE are separate extensions, planner can't optimize across them
- **AI-native**: MCP + agent memory + auto-embedding + context-aware results in one binary
- **Cypher**: SurrealDB uses proprietary SurrealQL, AI models already know Cypher
- **Single file**: `mydb.ogdb` = application data + agent memory + vector index + text index

### Where we don't compete

- **Scale**: not trying to beat PostgreSQL/Neo4j at billion-node cluster deployments
- **SQL**: not a relational database, don't try to be one
- **Feature completeness**: Neo4j has 15 years of features, we have focused essentials

---

## MCP Spec Compliance Notes

Target: MCP 2025-11-25 specification (current, under Linux Foundation)

| MCP Feature | Our Usage |
|-------------|-----------|
| stdio transport | Embedded/CLI mode: `opengraphdb mcp --db mydb.ogdb` |
| Streamable HTTP | Server mode: `opengraphdb serve --port 7687` |
| Tools with annotations | All tools have readOnly/destructive/idempotent hints |
| Deferred tool loading | 3 core tools always loaded, rest discovered on demand |
| Resources + ResourceLink | Large query results returned as ResourceLinks |
| Tasks | Long-running graph algorithms, bulk imports, re-embedding jobs |
| Elicitation | Confirmation for destructive mutations |
| Output schemas | All tools have JSON Schema return types |

---

## Open Questions

- [ ] Should `ogdb_memory_*` tools enforce a specific schema (Entity/Episode labels) or be configurable?
- [ ] How to handle embedding provider rate limits and failures gracefully?
- [ ] Should the `format: "concise"` mode strip internal IDs and just return human-readable property names?
- [ ] How to handle multi-model embedding (different properties using different providers/dimensions)?
- [ ] Should there be a `ogdb_natural_language` tool that translates English to Cypher? Or is that the AI's job?
