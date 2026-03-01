# Graph Database + AI Integration: Research Findings

**Date:** 2026-02-05
**Purpose:** Investigate the intersection of graph databases with AI agents, MCP, CLI tools, and coding assistants.

---

## 1. Graph Databases with MCP Server Implementations

The MCP ecosystem has grown rapidly since Anthropic launched the protocol in late 2024. As of early 2026, the following graph databases have official or community MCP servers:

### Tier 1: Official/Mature MCP Support

| Database | MCP Server | Repo/Source | Notes |
|----------|-----------|-------------|-------|
| **Neo4j** | mcp-neo4j (Labs) | [neo4j-contrib/mcp-neo4j](https://github.com/neo4j-contrib/mcp-neo4j) | Multiple servers: Cypher, Memory, Aura management. Most mature. |
| **Memgraph** | Official MCP Server | [memgraph.com/blog](https://memgraph.com/blog/introducing-memgraph-mcp-server) | In-memory, Cypher-compatible. Up to 120x faster than Neo4j on certain queries. |
| **SurrealDB** | SurrealMCP | [surrealdb.com/mcp](https://surrealdb.com/mcp) | Multi-model DB (graph + document + relational). Full agentic pipeline support inside DB. |
| **NebulaGraph** | NebulaGraph MCP Server | [nebula-graph.io](https://www.nebula-graph.io/posts/Announcing_the_Open_Source_Release_of_NebulaGraph_MCP_Server) | Open-source, distributed graph DB. MCP exposes graph exploration tools to LLMs. |
| **TigerGraph** | tigergraph-mcp | [PyPI: tigergraph-mcp](https://pypi.org/project/tigergraph-mcp/) | Enterprise graph analytics. LangGraph recommended as interface. |
| **FalkorDB** | Via Graphiti MCP | [FalkorDB/FalkorDB](https://github.com/FalkorDB/FalkorDB) | GraphBLAS-powered. No standalone MCP, but supported via Graphiti and GraphRAG-SDK. |

### Tier 2: Lightweight/Specialized MCP Implementations

| Project | Repo | Notes |
|---------|------|-------|
| **LiteGraph** | [litegraphdb/litegraph](https://github.com/litegraphdb/litegraph) | SQLite-backed graph + vector + MCP. Local-first, edge-friendly. Built-in MCP server. |
| **Dgraph MCP** | [johnymontana/dgraph-mcp-server](https://github.com/johnymontana/dgraph-mcp-server) | MCP for Dgraph using mcp-go library. |
| **Gremlin MCP** | [kpritam/gremlin-mcp](https://github.com/kpritam/gremlin-mcp) | MCP for any TinkerPop/Gremlin DB (Neptune, JanusGraph, etc.). |
| **GraphRAG MCP** | [rileylemm/graphrag_mcp](https://github.com/rileylemm/graphrag_mcp) | Hybrid graph+vector (Neo4j + Qdrant). |

### Tier 3: Memory/Knowledge Graph MCP Servers (Not full DBs)

| Project | Repo | Notes |
|---------|------|-------|
| **Anthropic Knowledge Graph Memory** | [modelcontextprotocol/knowledge-graph-memory](https://www.pulsemcp.com/servers/modelcontextprotocol-knowledge-graph-memory) | Official Anthropic reference implementation. Local JSON-based knowledge graph. |
| **MemoryGraph** | [memory-graph/memory-graph](https://github.com/memory-graph/memory-graph) | Graph DB-based MCP memory for coding agents. SQLite or FalkorDB backend. |
| **Graphiti (Zep)** | [getzep/graphiti](https://github.com/getzep/graphiti) | Temporal knowledge graphs for AI agents. Has dedicated MCP server. Neo4j or FalkorDB backend. |
| **CodeGraphContext** | [CodeGraphContext/CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext) | MCP + CLI that indexes code into graph DB. FalkorDB Lite or Neo4j backend. |
| **mcp-server-codegraph** | [CartographAI/mcp-server-codegraph](https://github.com/CartographAI/mcp-server-codegraph) | Graph representation of codebase for MCP. |

### Databases WITHOUT MCP Support (as of Feb 2026)

- **ArangoDB**: No known MCP server. Rebranding as "Arango" with AI focus but no MCP yet.
- **JanusGraph**: No dedicated MCP (use Gremlin MCP as workaround).
- **Amazon Neptune**: No dedicated MCP (use Gremlin MCP).
- **Kuzu**: Project archived (Oct 2025). No longer maintained.

---

## 2. CLI Tool Landscape

| Database | CLI Tool | Quality |
|----------|----------|---------|
| **Neo4j** | `cypher-shell` | Mature, production-grade. Interactive and scripted modes. |
| **Memgraph** | `mgconsole` | Lightweight C++ console for Cypher queries. |
| **SurrealDB** | `surreal` CLI | Excellent. Start server, run queries, import/export all from CLI. First-class citizen. |
| **FalkorDB** | `redis-cli` (Redis-based) | Uses Redis protocol. Not graph-native CLI experience. |
| **NebulaGraph** | `nebula-console` | Interactive CLI with Cypher-like nGQL. |
| **TigerGraph** | `gsql` | Proprietary query language. Steep learning curve. |
| **ArangoDB** | `arangosh` | JavaScript-based shell. Powerful but verbose. |
| **ENAPSO** | `enapso-graphdb-cli` | [innotrade/enapso-graphdb-cli](https://github.com/innotrade/enapso-graphdb-cli). Node.js CLI for RDF/SPARQL graph databases. |
| **LiteGraph** | Docker CLI + SDK | No standalone CLI. API and SDK driven. |
| **CodeGraphContext** | `cgc` CLI | Standalone CLI + MCP. Indexes code into graph. 12 languages. |

**Key insight:** SurrealDB has the most CLI-first design philosophy. Neo4j's cypher-shell is the most battle-tested. Most graph DBs treat CLI as secondary to GUI/API.

---

## 3. Graph Databases Used with AI Coding Agents

### Direct integration with coding assistants (Claude Code, Cursor, Copilot, etc.)

| Solution | Used With | How |
|----------|-----------|-----|
| **Neo4j + MCP** | Claude Desktop, Claude Code, Cursor | MCP server for Cypher queries, schema exploration, knowledge graph building |
| **MemoryGraph** | Claude Code | `claude mcp add memorygraph` for persistent coding memory |
| **CodeGraphContext** | VS Code, Cursor, Windsurf, Claude Desktop | MCP + CLI to index codebase into graph for AI context |
| **Graphiti** | Claude, Cursor, any MCP client | Temporal knowledge graph memory across sessions |
| **mcp-server-codegraph** | Claude, Cursor | Codebase-as-graph for AI navigation |

### Integration with AI agent frameworks

| Framework | Graph DB Support |
|-----------|-----------------|
| **LangChain/LangGraph** | Neo4j, TigerGraph, FalkorDB, NebulaGraph |
| **LlamaIndex** | Neo4j (KnowledgeGraphIndex), property graph stores |
| **AG2 (AutoGen)** | FalkorDB (FalkorGraphRagCapability) |
| **CrewAI** | Neo4j via MCP tools |
| **Pydantic.AI / ADK** | MCP-based access to any graph DB |

---

## 4. Knowledge Graph Solutions for AI/RAG

### GraphRAG Approaches

| Solution | Description | Source |
|----------|-------------|--------|
| **Microsoft GraphRAG** | Entity extraction + community summarization. Uses LLM to build knowledge graph from text. | [graphrag.com](https://graphrag.com/concepts/intro-to-graphrag/) |
| **Neo4j GraphRAG** | Tight integration with LangChain. Vector + graph hybrid retrieval. | [neo4j.com](https://neo4j.com/blog/developer/graphrag-and-agentic-architecture-with-neoconverse/) |
| **FalkorDB GraphRAG-SDK** | Domain-specific knowledge graph agents with orchestrator pattern. | [FalkorDB/GraphRAG-SDK](https://github.com/FalkorDB/GraphRAG-SDK) |
| **Graphiti (Zep)** | Temporal knowledge graphs. Real-time incremental updates. Bi-temporal model. | [getzep/graphiti](https://github.com/getzep/graphiti) |
| **ApeRAG** | Production GraphRAG with multi-modal indexing, AI agents, MCP support, K8s deployment. | GitHub |
| **Flexible-GraphRAG** | Open-source, supports FalkorDB backend. | [integratedsemantics.org](https://integratedsemantics.org/2025/09/09/flexible-graphrag-performance-improvements-falkordb-graph-database-support-added/) |

### Key differentiator: Graphiti
Graphiti (by Zep) stands out as the most agent-native knowledge graph framework:
- **Temporal awareness**: Tracks when facts were true, not just what facts exist (bi-temporal model)
- **Incremental updates**: No full recomputation needed
- **MCP server**: Built-in, works with Claude, Cursor, any MCP client
- **Multi-backend**: Neo4j or FalkorDB
- **Purpose-built**: Designed for AI agent memory, not retrofitted

---

## 5. Neo4j's AI Ecosystem (Deep Dive)

Neo4j has the most comprehensive AI integration ecosystem:

### MCP Servers
1. **mcp-neo4j-cypher**: Schema extraction + Cypher query generation/execution
2. **mcp-neo4j-memory**: Entity/relationship storage as knowledge graph
3. **mcp-neo4j-aura**: Manage Neo4j Aura instances via chat

### Framework Integrations
- **LangChain**: Neo4jGraph, Neo4jVector, GraphCypherQAChain
- **LlamaIndex**: KnowledgeGraphIndex, Neo4jPropertyGraphStore
- **Google MCP Toolbox**: Official Neo4j integration (collaboration with LangChain)

### AI Features
- Built-in vector search (since Neo4j 5.11)
- GenAI plugin for embedding generation
- NeoConverse: Agentic RAG architecture demo

### Strengths and Weaknesses
- **Strength**: Largest ecosystem, most tools, most documentation, most MCP servers
- **Weakness**: Heavy infrastructure, not embeddable, enterprise pricing, slower than in-memory alternatives

---

## 6. Emerging Graph Databases Targeting AI Agent Workflows

### FalkorDB
- **Focus**: Fastest graph DB for AI. Uses GraphBLAS (sparse matrix linear algebra).
- **AI angle**: Purpose-built for GraphRAG, low-latency agent loops
- **Ecosystem**: GraphRAG-SDK, Graphiti support, AG2 integration
- **Note**: Redis-compatible protocol (formerly RedisGraph fork)
- **GitHub**: [FalkorDB/FalkorDB](https://github.com/FalkorDB/FalkorDB)

### SurrealDB
- **Focus**: Multi-model (graph + document + key-value + relational) with AI-native features
- **AI angle**: Full agentic pipelines inside the database, ACID guarantees, built-in ML functions
- **MCP**: Official SurrealMCP server
- **CLI**: Excellent developer experience, single binary
- **Website**: [surrealdb.com](https://surrealdb.com/solutions/agentic-and-gen-ai)

### LiteGraph
- **Focus**: Lightweight, local-first graph + vector DB
- **AI angle**: Built-in MCP server, designed for knowledge/AI persistence
- **Backend**: SQLite (no external infra needed)
- **Best for**: Edge computing, privacy-sensitive AI, embedded use cases
- **GitHub**: [litegraphdb/litegraph](https://github.com/litegraphdb/litegraph)

### Kuzu (Archived)
- **Status**: Archived Oct 2025, read-only, no longer maintained
- **Was**: Embeddable property graph DBMS with excellent analytical performance
- **Migration**: FalkorDB positioned as replacement

### Memgraph
- **Focus**: In-memory, real-time graph analytics
- **AI angle**: MCP server, AI Toolkit, up to 120x faster than Neo4j
- **Cypher-compatible**: Drop-in replacement potential for Neo4j
- **Website**: [memgraph.com](https://memgraph.com/blog/introducing-memgraph-mcp-server)

---

## 7. Gaps in the Market for Agent-Friendly Graph Databases

Based on this research, the following gaps are clear:

### Gap 1: No Graph DB is Truly CLI-First + AI-Native
- SurrealDB comes closest (great CLI, MCP support, multi-model) but its graph capabilities are secondary to its document model
- Neo4j has the best ecosystem but is heavy and enterprise-focused
- No graph DB offers a `sqlite3`-like experience where you can spin up a graph, query it, and pipe results to an AI agent in one command

### Gap 2: Embeddable Graph DB for AI Agents is Underserved
- Kuzu was the best embeddable graph DB but is now archived
- LiteGraph fills some of this space but is C#/.NET focused
- FalkorDB requires Redis. Memgraph requires a server process.
- **Opportunity**: A lightweight, embeddable graph DB with built-in MCP, vector search, and a great CLI

### Gap 3: Code-Aware Graph DBs are Nascent
- CodeGraphContext and mcp-server-codegraph are early-stage
- No graph DB natively understands code structure (ASTs, call graphs, dependency trees)
- **Opportunity**: Graph DB designed specifically for codebase knowledge graphs

### Gap 4: Agent Memory Infrastructure is Fragmented
- Graphiti (Zep) is the best but requires Neo4j or FalkorDB
- Anthropic's knowledge-graph-memory is a toy JSON implementation
- MemoryGraph is SQLite-based but limited in graph capabilities
- **Opportunity**: Self-contained agent memory graph DB that works offline, embeds anywhere, and speaks MCP natively

### Gap 5: No Unified Graph + Vector + Document Store with Great DX
- SurrealDB attempts this but graph is not its primary model
- ArangoDB has all three but no MCP and poor AI integration
- **Opportunity**: A database that combines graph, vector, and document with MCP-first design and outstanding CLI/developer experience

### Gap 6: Temporal/Versioned Graph DBs
- Graphiti adds temporal awareness as a layer, but no graph DB has native temporal versioning
- **Opportunity**: A graph DB where time-travel queries are first-class citizens (critical for agent memory that needs to track "what changed when")

---

## 8. Summary Matrix

| Database | MCP | CLI | AI/RAG | Embeddable | Open Source | Agent Memory |
|----------|-----|-----|--------|------------|-------------|-------------|
| Neo4j | Yes (3 servers) | cypher-shell | Excellent | No | Community Ed. | Via Graphiti |
| Memgraph | Yes | mgconsole | Good | No | Yes (BSL) | Via MCP |
| SurrealDB | Yes | Excellent | Good | Partial | Yes | Via MCP |
| FalkorDB | Via Graphiti | redis-cli | Excellent | No | Yes | Via Graphiti |
| NebulaGraph | Yes | nebula-console | Basic | No | Yes | No |
| TigerGraph | Yes | gsql | Good | No | No | No |
| LiteGraph | Yes (built-in) | No CLI | Good | Yes (SQLite) | Yes | Basic |
| ArangoDB | No | arangosh | Basic | No | Yes (Apache 2) | No |
| Dgraph | Yes (community) | dgraph CLI | Basic | No | Yes | No |

---

## 9. Sources

### MCP and Protocol
- [Neo4j MCP Developer Guide](https://neo4j.com/developer/genai-ecosystem/model-context-protocol-mcp/)
- [Neo4j MCP Blog Post](https://neo4j.com/blog/developer/model-context-protocol/)
- [neo4j-contrib/mcp-neo4j (GitHub)](https://github.com/neo4j-contrib/mcp-neo4j)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [One Year of MCP Blog](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/)

### Graph Databases
- [FalkorDB](https://www.falkordb.com/) | [GitHub](https://github.com/FalkorDB/FalkorDB)
- [SurrealDB MCP](https://surrealdb.com/mcp) | [Agentic AI](https://surrealdb.com/solutions/agentic-and-gen-ai)
- [NebulaGraph MCP Announcement](https://www.nebula-graph.io/posts/Announcing_the_Open_Source_Release_of_NebulaGraph_MCP_Server)
- [TigerGraph MCP (PyPI)](https://pypi.org/project/tigergraph-mcp/)
- [LiteGraph](https://github.com/litegraphdb/litegraph)
- [Memgraph MCP Server](https://memgraph.com/blog/introducing-memgraph-mcp-server)

### AI Agent Memory and GraphRAG
- [Graphiti (Zep)](https://github.com/getzep/graphiti) | [Neo4j Blog](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/)
- [FalkorDB GraphRAG-SDK](https://github.com/FalkorDB/GraphRAG-SDK)
- [GraphRAG Intro](https://graphrag.com/concepts/intro-to-graphrag/)
- [Databricks Knowledge Graph RAG](https://www.databricks.com/blog/building-improving-and-deploying-knowledge-graph-rag-systems-databricks)

### Code Intelligence
- [CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext)
- [mcp-server-codegraph](https://github.com/CartographAI/mcp-server-codegraph)

### Agent Memory MCP Servers
- [MemoryGraph](https://github.com/memory-graph/memory-graph)
- [knowall-ai/mcp-neo4j-agent-memory](https://github.com/knowall-ai/mcp-neo4j-agent-memory)
- [Anthropic Knowledge Graph Memory](https://www.pulsemcp.com/servers/modelcontextprotocol-knowledge-graph-memory)
- [Gremlin MCP](https://github.com/kpritam/gremlin-mcp)
- [Dgraph MCP](https://github.com/johnymontana/dgraph-mcp-server)

### Coding Assistants + Graphs
- [Building Knowledge Graphs with Claude and Neo4j](https://neo4j.com/blog/developer/knowledge-graphs-claude-neo4j-mcp/)
- [Building AI Copilot with Knowledge Graphs](https://medium.com/@dan.avila7/building-a-brilliant-ai-copilot-using-knowledge-graphs-as-a-codebase-7b8c701b6763)
- [AG2 + FalkorDB GraphRAG](https://docs.ag2.ai/latest/docs/use-cases/notebooks/notebooks/agentchat_graph_rag_falkordb/)
