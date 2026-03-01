# OpenGraphDB Design Rationale: Why Property Graph First, RDF as Interchange

**Research Date:** 2026-02-13
**Purpose:** Comprehensive synthesis of research validating OpenGraphDB's architectural choice of "Cypher-first, property graph core, RDF as import/export." This document consolidates findings from five parallel research streams.

**Related research files:**
- `rdf-vs-property-graph-analysis.md` (detailed PG vs RDF analysis)
- `community-sentiment-reddit-hn.md` (Reddit/HN developer opinions)

---

## Executive Summary

OpenGraphDB's design decision to be **Cypher-first with RDF/TTL as a first-class interchange format** (not query language) is strongly validated by:

1. **Academic benchmarks** showing LLMs comprehend property graph formats better than RDF (KG-LLM-Bench, NAACL 2025)
2. **Query generation accuracy** where Cypher outperforms SPARQL by 10x in zero-shot LLM generation (SM3, NeurIPS 2024)
3. **Industry consensus** where every major AI framework (Microsoft GraphRAG, LlamaIndex, LangChain, Neo4j) uses property graphs, not RDF
4. **Developer experience** data showing property graphs win overwhelmingly on usability
5. **Community sentiment** from practitioners who consistently choose property graphs for new projects
6. **Honest acknowledgment** that RDF has genuine, irreplaceable advantages (global URIs, federated queries, formal reasoning) that OpenGraphDB addresses via import/export interoperability

The approach is not "RDF is bad." The approach is: **property graph for the engine, RDF for the bridges.**

---

## 1. The Core Question

Daniel Davis (TrustGraph co-founder) argues in his "Context Graph Manifesto" that RDF/ontology-driven graphs are superior for AI applications. His claims:

- RDF triples are the natural format for knowledge representation
- Ontologies provide the structure LLMs need
- N-Triples format works best for feeding context to LLMs
- Context graphs (his term) are the "next trillion dollar opportunity"

**Our position:** Property graph core with Cypher queries, treating RDF as a first-class data interchange format for import/export.

**The question:** Is our approach correct, or should we be RDF-first like TrustGraph?

---

## 2. Evidence: LLMs and Structured Formats

### KG-LLM-Bench (NAACL 2025): The Definitive Benchmark

The most rigorous study testing how LLMs comprehend different knowledge graph serialization formats. Tested 5 formats across 7 LLMs and 5 tasks.

**Results (averaged across models and tasks):**

| Format | Avg Accuracy |
|--------|-------------|
| Structured JSON | **0.42** |
| Structured YAML | ~0.40 |
| List-of-Edges (triples) | ~0.39 |
| RDF Turtle | **0.35** |
| JSON-LD | **0.34** |

**Key finding:** RDF Turtle and JSON-LD performed worst. The paper attributes this to "the more complex encoding strategies and use of URIs makes the format more difficult to parse."

**Nuance:** The best format varies by model. Claude 3.5 Sonnet actually performed best with RDF Turtle. But on average, simpler structured formats win.

**Source:** [KG-LLM-Bench (arXiv)](https://arxiv.org/html/2504.07087v1)

### SM3-Text-to-Query (NeurIPS 2024): Cypher vs SPARQL Generation

The definitive multi-language query generation benchmark testing SQL, Cypher, SPARQL, and MQL on the same dataset.

**Zero-shot accuracy:**

| Query Language | Accuracy |
|---------------|----------|
| SQL | 47.05% |
| **Cypher** | **34.45%** |
| MQL | 21.55% |
| **SPARQL** | **3.3%** |

**Cypher outperforms SPARQL by 10x.** Even with 5-shot examples, SPARQL only reaches ~30%, barely matching Cypher's zero-shot baseline. The gap is driven by training data availability: LLMs see vastly more Cypher than SPARQL in their training corpora.

**Source:** [SM3-Text-to-Query (NeurIPS 2024)](https://proceedings.neurips.cc/paper_files/paper/2024/file/a182a8e6ebc91728b6e6b6382c9f7b1e-Paper-Datasets_and_Benchmarks_Track.pdf)

### CypherBench (ACL 2025): Property Graph Views on RDF

Accepted to ACL 2025 main conference. Core argument: "Modern RDF knowledge graphs (Wikidata, Freebase) are less efficient for LLMs due to overly large schemas that far exceed the typical LLM context window, use of resource identifiers, overlapping and ambiguous relation types and lack of normalization."

**Their solution:** Create property graph views on top of RDF knowledge graphs, queried via Cypher. This is essentially what OpenGraphDB does: import RDF, query as property graph.

**Source:** [CypherBench (ACL 2025)](https://aclanthology.org/2025.acl-long.438/)

### Davis's Claim vs Reality

Davis claims "N-Triples works best" for LLM context. **This is contradicted by every rigorous benchmark.** KG-LLM-Bench shows structured JSON beats RDF Turtle. SM3 shows Cypher beats SPARQL 10x. Even TrustGraph's own documentation admits that Cypher-format knowledge statements "work well with most LLMs, outperforming RDF formats like Turtle, which often yield inconsistent results."

---

## 3. Evidence: What Major AI Frameworks Actually Use

| Framework | Format Used | Uses RDF? |
|-----------|-------------|-----------|
| Microsoft GraphRAG | Plain text summaries + JSON metadata | No |
| LlamaIndex PropertyGraphIndex | Property graph JSON, Neo4j integration | No |
| LangChain + Neo4j | Cypher queries, text results | No |
| Neo4j GraphRAG Python | Property graph JSON format | No |
| TrustGraph | RDF internally, Cypher-style for LLM output | Internally yes |
| Graphiti (Zep) | Property graph with temporal edges | No |

**Not a single major AI framework uses RDF for LLM context.** Microsoft explicitly chose property graphs (Fabric only supports LPG, not RDF). LlamaIndex migrated from triples to property graphs. Neo4j's entire GenAI ecosystem is Cypher-native.

TrustGraph stores RDF internally but exports to LLMs in Cypher-style or Markdown format, effectively proving that even RDF advocates convert to property graph representation when talking to LLMs.

---

## 4. Evidence: Developer Experience and Adoption

### Stack Overflow 2025 Developer Survey

- **Neo4j adoption:** 2.6% of all respondents (the only graph DB listed)
- **Top databases:** PostgreSQL (55.6%), MySQL (40.5%), SQLite (37.5%)
- **SPARQL/Cypher/GQL:** Not tracked as separate query language categories
- **Graph databases overall:** Minimal coverage, niche adoption

### Community Sentiment (from 60+ Reddit/HN threads)

**Property graphs win on developer experience; RDF wins on semantic rigor.** The debate is fundamentally about cultural adoption, not technical capability.

Key quotes from practitioners:

> "One of the main reasons GNNs aren't gaining mainstream traction is the perceived (and to some extent, real) difficulty of using graph databases." (r/MachineLearning, +15)

> "There is an acute lack of support and expertise in all fronts. The libraries are scarce and often buggy." (r/semanticweb, on RDF tooling)

> "It feels like LLM search has leapfrogged the Semantic Web." (r/semanticweb, +7)

> "When free to choose, most folks will pick the property graph model for its simplicity and agility." (PuppyGraph)

**The pattern:** Every success story involves a well-defined domain. Generic "build a knowledge graph from anything" approaches consistently disappoint. Property graphs dominate because developers can actually use them.

---

## 5. Where RDF Genuinely Wins (Honest Assessment)

We are not dismissing RDF. Here are the areas where it has genuine, structural advantages that property graphs cannot replicate:

### 5.1 Global Identity via URIs/IRIs
RDF entities have globally unique, web-resolvable identifiers. Property graph IDs are local. For cross-organization data integration, this is irreplaceable. **OpenGraphDB addresses this:** Support URI-based node identifiers for imported RDF data, allowing round-trip fidelity.

### 5.2 Federated Queries (SPARQL SERVICE)
No property graph equivalent exists. A single SPARQL query can pull from Wikidata, DBpedia, and the British Library simultaneously. **OpenGraphDB addresses this:** Not in scope for Phase 1. Future phases could support federated queries via a Cypher extension or SPARQL endpoint layer.

### 5.3 Formal Reasoning/Inference (OWL)
OWL reasoning engines automatically infer new facts from semantic constraints. Property graphs have zero native reasoning. Full OWL reasoning cannot be replicated without rebuilding a reasoner. **OpenGraphDB addresses this:** Explicit non-goal. The spec states: "A thin RDF import layer and a rich Property Graph query engine is more useful than the reverse." Reasoning is left to application code or future plugins.

### 5.4 SHACL Validation
Standardized, declarative, database-agnostic graph validation. No cross-database equivalent for property graphs. **OpenGraphDB addresses this:** Future consideration. PG-Schema is emerging as a native property graph validation standard.

### 5.5 Linked Open Data Ecosystem
Thousands of publicly available RDF datasets (DBpedia, Wikidata, GeoNames, UniProt). No equivalent for property graphs. **OpenGraphDB addresses this:** RDF/TTL import pipeline (via oxrdfio) allows ingesting any Linked Open Data into the property graph engine.

### 5.6 RDF-star Status (February 2026)
RDF-star (being incorporated into RDF 1.2) addresses the reification problem. Missed its 2025 target, still in Working Draft. Multiple implementations already ship it (Jena, GraphDB, Stardog, RDF4J). The W3C charter runs through April 2027.

---

## 6. TrustGraph Analysis

### Product Assessment
- **GitHub:** 1,193 stars, 99 forks, Apache-2.0 license, Python, actively maintained
- **Funding:** None raised (pre-seed, unfunded startup)
- **Architecture:** Containerized pipeline, Cassandra/Neo4j storage, Qdrant vectors, Apache Pulsar messaging
- **Community:** Moderate engagement in niche forums (r/KnowledgeGraph), minimal mainstream visibility

### The "Context Graph" Concept
- **30% substance, 70% marketing.** Real engineering challenges exist in optimizing graphs for LLMs, but the term is more branding than genuine new technology.
- Multiple companies use "context graph" independently (Atlan for data catalogs, Glean for enterprise search, TrustGraph for AI)
- The strongest critic (Julius Hollmann, January 2026): "Context Graphs are nothing new that any well-designed knowledge graph already is."
- The underlying problem (structured context for LLMs) is real. The new category claim is contested.

### TrustGraph vs OpenGraphDB Alignment

| Aspect | TrustGraph | OpenGraphDB |
|--------|-----------|-------------|
| Core model | RDF triples | Property graph |
| Query language | SPARQL (template-driven) | Cypher/GQL |
| Storage | Cassandra/Neo4j/Memgraph | Single-file embedded |
| Architecture | Distributed microservices | Embeddable library |
| Vector search | Qdrant (separate service) | Built-in (USearch/hnsw_rs) |
| Target user | DevOps teams deploying AI pipelines | Developers building apps |
| LLM context format | Cypher-style (ironically) | Native Cypher results |
| License | Apache-2.0 | Apache-2.0 |

**Key insight:** TrustGraph stores RDF but outputs Cypher-style format to LLMs. OpenGraphDB is Cypher-native throughout. Both end up in the same place for the LLM, but OpenGraphDB avoids the RDF translation layer entirely.

---

## 7. "Context Engineering" Validation

The term "context engineering" (replacing "prompt engineering") was popularized by Andrej Karpathy and Tobi Lutke (Shopify CEO) in June 2025. Simon Willison endorsed it. It has been broadly adopted across the industry.

Davis did not coin this term. He borrows credibility from Karpathy/Lutke by associating TrustGraph's "context graphs" with the broader "context engineering" movement. The connection is legitimate (both are about providing structured context to LLMs) but the implication that TrustGraph invented or owns this concept is misleading.

**Community split on the term:** ~50/50 between "meaningful evolution" and "rebranded prompt engineering." Practitioners building multi-agent systems find it meaningful. Individual developers tend to be skeptical.

---

## 8. Counter-Arguments We Considered

### "RDF Won in Bioinformatics" (PLoS ONE Glycan Benchmark)
A 2016 study found RDF triple stores (Blazegraph) outperformed Neo4j for glycan substructure searching. **Why this doesn't apply:** The use case involved searching across disconnected graph fragments, where RDF's indexed entity lookups beat Neo4j's full scans. OpenGraphDB targets connected graph traversal (social networks, knowledge graphs, recommendation engines), where property graphs excel.

### "Property Graphs Lack Global Identifiers"
True. RDF's URI-based identity is structurally superior for cross-organization data integration. **Our mitigation:** OpenGraphDB supports URI-based identifiers on imported RDF data. For single-application use cases (the primary target), local IDs are sufficient. For cross-system interop, the RDF export pipeline preserves URIs.

### "Property Graphs Can't Do Formal Reasoning"
True. OWL reasoning is unique to RDF. **Our position:** This is an explicit non-goal. The spec acknowledges: "A thin RDF import layer and a rich Property Graph query engine is more useful than the reverse." LLM-based reasoning is the practical alternative for most AI applications.

### "RDF Has 20+ Years of Standards"
True. GQL (property graph ISO standard) was published in April 2024. RDF has decades of W3C maturity. **Our position:** Standards maturity matters for enterprise procurement. For developer adoption, ecosystem maturity matters more. Neo4j (property graph) is at $200M ARR. No RDF triplestore vendor has comparable commercial traction.

### "Property Graphs Have Scaling Problems"
True. Neo4j users report difficulty with sharding, write performance at scale, and expensive replication. **Our advantage:** OpenGraphDB is embeddable (single-file, like SQLite), sidestepping distributed scaling entirely for the initial use case. Scaling is a future concern, not a current architectural constraint.

---

## 9. The Convergence Trend

The industry is converging, not diverging:

- **Amazon Neptune** supports both RDF (SPARQL) and property graphs (Gremlin, openCypher) in one service
- **Oracle Database** supports RDF integration with property graph data
- **Neo4j neosemantics (n10s)** plugin enables RDF import/export and SHACL validation
- **CypherBench (ACL 2025)** proposes property graph views on top of RDF knowledge graphs
- **GQL (ISO 39075:2024)** standardizes property graph querying, with adoption by Neo4j, Neptune, Microsoft Fabric, TigerGraph

**OpenGraphDB sits at the right point in this convergence:** native property graph with clean RDF interop bridges. This is the architecture that CypherBench (ACL 2025) literally proposes as the solution.

---

## 10. Final Verdict

### OpenGraphDB's approach is validated by:

| Evidence Type | Supports Our Approach? | Key Data Point |
|--------------|----------------------|----------------|
| LLM format benchmarks | **Yes** | JSON (0.42) > Turtle (0.35) (KG-LLM-Bench) |
| Query generation | **Yes** | Cypher 34.45% vs SPARQL 3.3% (SM3) |
| Industry frameworks | **Yes** | 0/5 major AI frameworks use RDF for LLM context |
| Developer experience | **Yes** | Property graphs win overwhelmingly |
| Community sentiment | **Yes** | Practitioners choose PG for new projects |
| Academic proposals | **Yes** | CypherBench proposes PG views on RDF |
| ISO standardization | **Yes** | GQL (ISO 39075:2024) for property graphs |
| RDF genuine wins | **Addressed** | URI support, RDF import/export pipeline |

### What we must NOT do:
- Dismiss RDF entirely (it has genuine, irreplaceable strengths)
- Ignore the Linked Open Data ecosystem (our RDF import pipeline is critical)
- Pretend we can do formal OWL reasoning (we can't, and that's OK)
- Build SPARQL query support (the benchmarks show it's the wrong investment)

### What we SHOULD do:
- Build excellent RDF/TTL import (via oxrdfio) as specified in DESIGN.md
- Ensure URI-based identifiers survive round-trip through import/export
- Make Cypher queries the primary interface for both humans and AI agents
- Build native MCP server support (this is genuinely differentiating)
- Consider PG-Schema or SHACL-like validation in future phases

---

## Sources Index

### Academic Papers
- [KG-LLM-Bench (NAACL 2025)](https://arxiv.org/html/2504.07087v1)
- [SM3-Text-to-Query (NeurIPS 2024)](https://proceedings.neurips.cc/paper_files/paper/2024/file/a182a8e6ebc91728b6e6b6382c9f7b1e-Paper-Datasets_and_Benchmarks_Track.pdf)
- [CypherBench (ACL 2025)](https://aclanthology.org/2025.acl-long.438/)
- [How Well Do LLMs Speak Turtle? (2023)](https://arxiv.org/abs/2309.17122)
- [TOON Token-Oriented Object Notation (2025)](https://arxiv.org/html/2601.12014)
- [Text2Cypher Pipeline (ScienceDirect 2025)](https://www.sciencedirect.com/science/article/pii/S0306457325002213)
- [PLoS ONE Glycan Benchmark (2016)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0144578)

### Industry
- [Microsoft GraphRAG Architecture](https://microsoft.github.io/graphrag/index/architecture/)
- [LlamaIndex PropertyGraphIndex](https://www.llamaindex.ai/blog/introducing-the-property-graph-index-a-powerful-new-way-to-build-knowledge-graphs-with-llms)
- [Neo4j $200M ARR (2024)](https://neo4j.com/press-releases/neo4j-revenue-milestone-2024/)
- [GQL ISO Standard (2024)](https://www.iso.org/standard/76120.html)
- [TrustGraph GitHub](https://github.com/trustgraph-ai/trustgraph)
- [TrustGraph Context Graph Manifesto](https://trustgraph.ai/news/context-graph-manifesto/)

### W3C Standards
- [RDF 1.2 Working Group](https://www.w3.org/groups/wg/rdf-star/)
- [SPARQL 1.1 Federated Query](https://www.w3.org/TR/sparql11-federated-query/)
- [RDF-star Charter (through April 2027)](https://www.w3.org/2025/04/rdf-star-wg-charter.html)

### Community Analysis
- [r/semanticweb: "Has the semantic web failed?" (Feb 2026)](https://www.reddit.com/r/semanticweb/comments/1qorqt0/honest_question_has_the_semantic_web_failed/)
- [HN: "The semantic web is dead" (Aug 2022)](https://news.ycombinator.com/item?id=32412803)
- [HN: "GraphRAG is now on GitHub" (Jul 2024)](https://news.ycombinator.com/item?id=40857174)
- [Context Graphs Criticism (Julius Hollmann, Jan 2026)](https://medium.com/@juliushollmann/context-graphs-or-just-better-knowledge-graphs-a-reality-check-732e8c7a6af0)
- Full community thread analysis in `community-sentiment-reddit-hn.md`

### Comparison Resources
- [PuppyGraph: Property Graph vs RDF](https://www.puppygraph.com/blog/property-graph-vs-rdf)
- [Wisecube: RDF or Property Graphs?](https://www.wisecube.ai/blog/knowledge-graphs-rdf-or-property-graphs-which-one-should-you-pick/)
- [TigerGraph: RDF vs Property Graph](https://www.tigergraph.com/blog/rdf-vs-property-graph-choosing-the-right-foundation-for-knowledge-graphs/)
- Full analysis with decision matrix in `rdf-vs-property-graph-analysis.md`
