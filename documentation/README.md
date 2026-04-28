# OpenGraphDB Public Documentation

Everything in this folder is intended for users of OpenGraphDB. For internal contributor docs see `../docs/` and `../CONTRIBUTING.md`.

## Guides

- **[BENCHMARKS.md](BENCHMARKS.md)** — competitive baseline (N=5 medians) versus Neo4j, Memgraph, KuzuDB, with reproducibility notes and an honest wins/losses scorecard.
- **[COOKBOOK.md](COOKBOOK.md)** — seven runnable AI-agent recipes (MCP, hybrid retrieval, doc → KG, time-travel, skill-quality eval, Neo4j migration, CI regression). Every snippet is exercised by e2e tests on every PR.
- **[MIGRATION-FROM-NEO4J.md](MIGRATION-FROM-NEO4J.md)** — three differences that matter, Cypher-by-Cypher mapping, and where the latency comes from.
- **[AI-NATIVE-FEATURES.md](AI-NATIVE-FEATURES.md)** — overview of the AI-native surface: MCP server, hybrid retrieval, graph-feature reranking, time-travel, multi-agent shared KG.

## AI Integration Patterns

Compact runnable patterns for wiring an LLM agent against OpenGraphDB:

- **[ai-integration/llm-to-cypher.md](ai-integration/llm-to-cypher.md)** — hand the LLM your schema, get back a Cypher query, execute it.
- **[ai-integration/embeddings-hybrid-rrf.md](ai-integration/embeddings-hybrid-rrf.md)** — vector + full-text fused via Reciprocal Rank Fusion in one round-trip.
- **[ai-integration/cosmos-mcp-tool.md](ai-integration/cosmos-mcp-tool.md)** — wrap the cosmos.gl renderer as an MCP tool so any agent can request a PNG of a graph slice.
- **[ai-integration/multi-agent-shared-kg.md](ai-integration/multi-agent-shared-kg.md)** — three agents on the same `.ogdb` file with MVCC snapshot isolation.

## Evaluation Runs

Historical baseline JSONs (raw `EvaluationRun` arrays) for transparency and longitudinal regression analysis live in [`evaluation-runs/`](evaluation-runs/). The schema is documented in `crates/ogdb-eval/src/types.rs`.
