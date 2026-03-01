# Open-Source Graph Database Research

**Last Updated:** 2026-02-05
**Researcher:** Ashesh Goplani

---

## Table of Contents

1. [Comparison Table](#comparison-table)
2. [Detailed Analysis per Database](#detailed-analysis)
3. [Common Gaps and Limitations](#common-gaps)
4. [Production Readiness at Scale](#production-readiness)
5. [Sources](#sources)

---

## Comparison Table

| Database | License | Language | Query Language(s) | Performance Tier | Max Scalability | GitHub Stars | DB-Engines Rank (Graph) | Active Dev Status |
|----------|---------|----------|-------------------|-----------------|----------------|--------------|------------------------|-------------------|
| **Neo4j Community** | GPLv3 | Java | Cypher, GQL | High (OLTP) | Single node only | ~13k | #1 | Very Active |
| **Neo4j Enterprise** | Commercial | Java | Cypher, GQL | High (OLTP) | Horizontal (Causal Clustering) | N/A | #1 | Very Active |
| **JanusGraph** | Apache 2.0 | Java | Gremlin (TinkerPop) | Medium | Very High (distributed backends) | ~5.3k | #10 | Active |
| **ArangoDB** | Apache 2.0 | C++ | AQL | High (Multi-model) | Horizontal (sharding) | ~13.5k | #4 | Very Active |
| **Dgraph** | Apache 2.0 | Go | DQL, GraphQL | High | Horizontal (predicate sharding) | ~20.5k | #15 | Active (Hypermode/Istari) |
| **Apache TinkerPop** | Apache 2.0 | Java | Gremlin | N/A (Framework) | Depends on provider | ~2k | N/A | Active |
| **TerminusDB** | Apache 2.0 | Rust/Prolog | WOQL, GraphQL, Datalog | Low-Medium | Single node (primary) | ~2.7k | #32 | Moderate (DFRNT) |
| **Memgraph** | BSL 1.1 / Enterprise | C++ | Cypher (openCypher) | Very High (in-memory) | Limited horizontal | ~2k | #8 | Very Active |
| **Apache AGE** | Apache 2.0 | C | openCypher (over PostgreSQL) | Medium | PostgreSQL-level | ~3k | Not ranked separately | Active |
| **Cayley** | Apache 2.0 | Go | Gizmo, GraphQL, MQL | Low-Medium | Limited | ~14.8k | Not ranked | Dormant (last release 2019) |
| **TypeDB** | MPL 2.0 | Rust (v3) / Java (v2) | TypeQL | Medium-High | Single node (v3) | ~3.7k | #13 | Active |

---

## Detailed Analysis

### 1. Neo4j (Community vs Enterprise)

**Overview:** The most mature and widely adopted graph database. Native property graph model with index-free adjacency for O(1) relationship traversal.

**Community Edition:**
- License: GPLv3 (with additional AGPL-like restrictions debated)
- Single-node only, no clustering
- No role-based access control, no online backup
- No hot standby or causal clustering
- Limited to single database (no multi-tenancy)
- Performance: Excellent for single-node OLTP graph workloads
- Suitable for development, small-to-medium production deployments

**Enterprise Edition:**
- License: Commercial (no longer open source since v3.5)
- Causal clustering for horizontal read scalability
- Role-based access control, multi-database, online backup
- Hot standby, advanced monitoring
- Production deployments at companies like eBay, Walmart, NASA

**Performance Benchmarks:**
- Strong single-node OLTP performance for traversals up to 3-4 hops
- TigerGraph benchmark (2024): Neo4j showed degraded performance at deep traversals (6+ hops)
- ArangoDB benchmark (2024): ArangoDB claimed up to 8x faster on graph analytics (wiki-Talk dataset), though this compared ArangoDB's Graph Analytics Engine vs Neo4j's OLTP engine
- TypeDB benchmark (2025): Neo4j outperforms on small datasets but degrades when data exceeds memory

**Key Limitations:**
- Community Edition severely limited for production (no clustering, no RBAC)
- Enterprise is expensive (subscription-based pricing)
- Write scalability is limited even in Enterprise (single writer leader)
- GQL/Cypher is property-graph only, no RDF support natively
- Memory-hungry for large datasets

**Community Size:** Largest graph database community. 100k+ forum users, extensive documentation, Neo4j Aura cloud offering.

---

### 2. JanusGraph

**Overview:** Distributed graph database forked from Titan (2017). Designed for massive graphs using pluggable storage backends (Cassandra, HBase, Bigtable, ScyllaDB) and indexing (Elasticsearch, Solr).

**Performance Benchmarks:**
- Latency higher than native graph DBs due to storage backend overhead
- TigerGraph benchmark: JanusGraph significantly slower than Neo4j/TigerGraph on k-hop queries
- IEEE study (2024): JanusGraph ranked lower in single-query latency but excels in horizontal scalability
- Strengths in batch processing and OLAP-style graph analytics via Spark integration

**Scalability:**
- Truly distributed: can scale to billions of vertices and edges
- Backed by proven distributed storage (Cassandra, HBase)
- Supports multi-datacenter deployments

**Key Limitations:**
- High operational complexity (requires managing Cassandra/HBase + Elasticsearch + JanusGraph)
- Higher per-query latency compared to native graph engines
- Gremlin-only query language (steeper learning curve than Cypher)
- Community is smaller and less active than Neo4j
- No built-in visualization tools
- TinkerPop 3.7.x support in latest version (1.1.x)

**License:** Apache 2.0 (fully open source, Linux Foundation project)

**Community:** ~5.3k GitHub stars. Linux Foundation governance. Active but smaller contributor base.

---

### 3. ArangoDB

**Overview:** Multi-model database supporting graphs, documents, key-value, and search in a single engine with AQL (ArangoDB Query Language).

**Performance Benchmarks:**
- ArangoDB's own benchmark (Dec 2024): Up to 8x faster than Neo4j on graph analytics (PageRank, SSSP, WCC) using wiki-Talk dataset
- TigerGraph benchmark: ArangoDB slower than TigerGraph on deep traversals
- Multi-model advantage: avoids cross-database joins when combining document + graph queries
- ResearchGate study (2024): Competitive with Neo4j on OLTP, stronger on mixed workloads

**Scalability:**
- Horizontal scaling via SmartGraphs (sharded graphs with locality optimization)
- OneShard deployment for single-server-like latency with replication
- Enterprise features: Datacenter-to-Datacenter replication, SatelliteGraphs

**Key Limitations:**
- Graph-specific performance can lag behind dedicated graph DBs for pure traversal workloads
- AQL is unique (not Cypher, not Gremlin), creating vendor lock-in
- Enterprise features (SmartGraphs, DC2DC) require paid license
- Community edition has no encryption at rest, no LDAP
- Less graph-specific optimization compared to native graph databases

**License:** Apache 2.0 (Community), Commercial (Enterprise)

**Community:** ~13.5k GitHub stars. Forrester recognized. Active development with GAE (Graph Analytics Engine) released 2024.

---

### 4. Dgraph

**Overview:** Distributed, horizontally scalable graph database built from the ground up in Go. Uses predicate-based sharding for automatic distribution. Native GraphQL and DQL support.

**Performance Benchmarks:**
- Designed for low-latency queries at scale with billions of edges
- Predicate-based sharding provides automatic horizontal distribution
- Badger (custom LSM-tree key-value store) provides efficient storage
- Community reports: Handles billion-edge graphs but with careful predicate distribution
- Can struggle with "hot predicates" (single predicates with disproportionate data)

**Scalability:**
- Natively distributed with automatic sharding
- Supports multi-tenancy via namespaces (v25+)
- Horizontal scaling by adding more Dgraph Alpha nodes

**Recent History:**
- Dgraph Labs acquired by Hypermode (2023), then Hypermode acquired by Istari Digital (Oct 2025)
- Dgraph v25: All enterprise features now open source under Apache 2.0
- Active development continues under new ownership
- Discussion forum moved to discuss.hypermode.com (read-only mode on old forum)

**Key Limitations:**
- Corporate instability (two acquisitions in two years) raises long-term concerns
- Smaller community compared to Neo4j
- DQL is proprietary query language (GraphQL support helps mitigate)
- Schema management can be complex for large graphs
- Hot predicate issue: single predicates with billions of edges cause imbalanced sharding
- Fewer third-party integrations and tooling than Neo4j

**License:** Apache 2.0 (unified since v25)

**Community:** ~20.5k GitHub stars (one of the highest). Forum activity has declined post-acquisitions.

---

### 5. Apache TinkerPop / Gremlin Ecosystem

**Overview:** Not a database itself, but a graph computing framework. Provides the Gremlin traversal language and a standard API (TinkerPop Provider API) that multiple databases implement.

**Current Status (2025-2026):**
- TinkerPop 3.7.x is current stable; 3.8.0 targeted for release soon
- TinkerPop 4.0.0-beta.2 planned for early 2026
- 31 committers, 16 PMC members
- New: gremlin-mcp (AI tooling integration) in development

**Databases Supporting TinkerPop/Gremlin:**
- JanusGraph (primary open-source option)
- Amazon Neptune
- Azure Cosmos DB (Gremlin API)
- OrientDB
- HugeGraph (Apache incubating)
- TigerGraph (via GSQL, partial Gremlin)
- DataStax Enterprise Graph

**Key Limitations:**
- Gremlin has a steeper learning curve than Cypher
- Performance varies dramatically by provider implementation
- Not a database; requires choosing and managing a provider
- TinkerPop 4.0 has been in development for years (slow progress)
- No standard visualization tooling (depends on provider)

**License:** Apache 2.0

---

### 6. TerminusDB

**Overview:** Document-oriented graph database with "git for data" version control. Supports WOQL (Web Object Query Language), GraphQL, and Datalog. Focus on collaborative data management and knowledge graphs.

**Current Status:**
- Maintained by DFRNT since 2025
- TerminusDB 11: New Rust storage backend for improved performance
- Dashboard component has been discontinued
- Cloud/UI features available via DFRNT Studio (commercial)
- Focus shifted towards enterprise data collaboration rather than pure graph workloads

**Performance:**
- Not designed for high-throughput graph traversals
- Strengths in versioning, diffing, and collaborative data workflows
- Rust backend in v11 improves latency and reduces storage overhead

**Key Limitations:**
- Small community (DB-Engines rank #32 among graph DBs)
- Not suitable for large-scale graph analytics
- Limited horizontal scalability
- WOQL is niche; GraphQL support helps adoption
- Dashboard discontinued, requiring DFRNT commercial product for full UI
- Few production references at scale
- Documentation gaps

**License:** Apache 2.0

**Community:** ~2.7k GitHub stars. Discord community. Small but dedicated user base.

---

### 7. Memgraph

**Overview:** In-memory graph database written in C++, compatible with openCypher. Designed for real-time streaming graph analytics with very low latency.

**Performance Benchmarks:**
- Memgraph's own benchmarks: Up to 120x faster than Neo4j on concurrent mixed workloads (read/write)
- Write performance: Significantly faster than Neo4j due to in-memory architecture and C++ implementation
- PuppyGraph analysis: Excels at low-latency in-memory graph analytics, especially streaming use cases
- MAGE: Graph algorithm library with 30+ pre-built algorithms

**Scalability:**
- Primary-replica replication for read scaling
- Limited horizontal write scaling (single writer)
- Data must fit in memory (plus WAL for durability)
- Not designed for graphs exceeding available RAM

**Key Limitations:**
- BSL 1.1 license (converts to Apache 2.0 after 4 years, but not truly open source during BSL period)
- Data must fit in memory (cost-prohibitive for very large graphs)
- Smaller ecosystem and fewer integrations than Neo4j
- Limited horizontal scaling compared to JanusGraph or Dgraph
- Enterprise features (authentication, audit log, multi-tenancy) require paid license
- Streaming integration (Kafka, Pulsar) is a strength but adds operational complexity

**License:** BSL 1.1 (Business Source License) for core, Enterprise license for advanced features

**Community:** ~2k GitHub stars. Active Discord community. Growing adoption in real-time analytics.

---

### 8. Apache AGE (PostgreSQL Extension)

**Overview:** PostgreSQL extension that adds graph database functionality, enabling openCypher queries alongside standard SQL. Allows combining relational and graph data in a single PostgreSQL instance.

**Current Status:**
- Apache AGE 1.6.0 (latest stable)
- Supported on PostgreSQL 11-16
- Available on Azure Database for PostgreSQL (managed service)
- NOT available on AWS RDS/Aurora (significant limitation for cloud adoption)

**Performance:**
- Graph traversals outperform equivalent PostgreSQL recursive CTEs and multi-JOIN queries
- Microsoft Azure benchmarks: With proper indexing, competitive for moderate graph workloads
- No default indexes created; requires explicit index creation for performance
- Not competitive with native graph databases for deep traversals or large-scale graph analytics

**Key Limitations:**
- Performance ceiling tied to PostgreSQL's relational engine
- Not available on major managed PostgreSQL services (AWS RDS, Aurora)
- openCypher support is subset (not complete Cypher implementation)
- No native graph-specific storage optimizations (uses PostgreSQL tables internally)
- Relatively early in maturity compared to established graph databases
- Limited graph algorithm library
- Documentation is sparse compared to Neo4j

**Scalability:** Inherits PostgreSQL scalability (vertical primarily, read replicas for horizontal reads)

**License:** Apache 2.0

**Community:** ~3k GitHub stars. Active Apache incubator project. Growing contributor base.

---

### 9. Cayley

**Overview:** Open-source graph database inspired by Google's Knowledge Graph (Freebase). Written in Go with pluggable storage backends (LevelDB, Bolt, PostgreSQL, MongoDB).

**Current Status: EFFECTIVELY DORMANT**
- Last release: v0.7.7 (October 2019)
- No significant commits since 2020
- A community fork exists (aperturerobotics/cayley) with minor maintenance
- Original Google developers have moved on

**Performance:**
- Rough benchmarks (2014 hardware): 134M quads in LevelDB, multi-hop queries ~150ms
- RDF/quad-based model, not property graph
- Supports Gizmo (Gremlin-inspired), GraphQL, and MQL query languages

**Key Limitations:**
- Effectively abandoned (no releases in 6+ years)
- Not suitable for production use
- No active community or support
- Limited documentation
- Performance data is severely outdated
- No clustering or horizontal scaling
- Missing modern features (ACID transactions, streaming, etc.)

**License:** Apache 2.0

**Community:** ~14.8k GitHub stars (historical interest, not active usage). Stars reflect past hype around Google association, not current viability.

---

### 10. TypeDB (formerly Grakn)

**Overview:** Polymorphic database with a unique type system. Uses hypergraph data model with entities, relations, and attributes as first-class citizens. TypeQL provides declarative, strongly-typed queries with built-in reasoning.

**TypeDB 3 (2025): Major Rewrite**
- Completely rewritten in Rust (from Java)
- 3-5x performance improvement over TypeDB 2
- More stable performance as data scales beyond memory
- Uses PERA model (Polymorphic Entity-Relation-Attribute)

**Performance Benchmarks (2025):**
- TypeDB 3 benchmarks using TPC-C: Competitive with Neo4j
- Neo4j outperforms on small in-memory datasets
- TypeDB maintains more stable performance when data exceeds memory
- Reasoning engine adds latency but provides inference capabilities not available in other graph DBs

**Key Limitations:**
- TypeQL is entirely unique (not Cypher, not Gremlin, not SQL), creating steep learning curve
- Small community relative to Neo4j or ArangoDB
- No horizontal scaling in current version
- Limited third-party integrations
- Reasoning engine, while powerful, can impact query performance unpredictably
- Company has undergone multiple strategic pivots
- Fewer production references than Neo4j, ArangoDB, or Dgraph

**License:** MPL 2.0 (Mozilla Public License)

**Community:** ~3.7k GitHub stars. Focus areas: cybersecurity, finance, robotics. TypeDB Cloud offering available.

---

## Common Gaps and Limitations Across All Open-Source Graph Databases

### 1. Horizontal Write Scalability
Almost all open-source graph databases struggle with horizontal write scaling. Neo4j Community is single-node. Even Neo4j Enterprise has a single-writer architecture. JanusGraph offers it via Cassandra/HBase but at higher latency. Dgraph is the most horizontally scalable but has hot-predicate issues.

### 2. Standardization Fragmentation
The graph database ecosystem suffers from query language fragmentation: Cypher/openCypher, Gremlin, AQL, DQL, TypeQL, WOQL, GSQL, and now GQL (ISO standard). There is no universally accepted standard comparable to SQL for relational databases. GQL (ISO/IEC 39075) was ratified in 2024 but adoption is still nascent.

### 3. Enterprise Features Behind Paywalls
Most databases gate critical production features (clustering, RBAC, encryption, multi-tenancy) behind commercial licenses: Neo4j, ArangoDB, Memgraph all follow this pattern. Dgraph v25 is a notable exception, open-sourcing all enterprise features.

### 4. Operational Complexity
Distributed graph databases (JanusGraph, Dgraph) require significant operational expertise. JanusGraph requires managing multiple systems (storage backend + index + graph engine). Even "simpler" databases like Neo4j Enterprise require careful tuning for production.

### 5. Benchmarking Bias
Nearly every vendor-published benchmark shows their product winning. ArangoDB claims 8x over Neo4j; Memgraph claims 120x over Neo4j; TigerGraph claims 8000x over everyone. Independent benchmarks (LDBC, IEEE studies) provide more reliable data but are less frequently updated.

### 6. Graph Analytics vs. OLTP
Most graph databases excel at either OLTP (short traversals, real-time) or OLAP (analytics, batch) but not both. Neo4j and Memgraph are OLTP-focused. JanusGraph with Spark is more OLAP-oriented. ArangoDB attempts both via multi-model but compromises on pure graph performance.

### 7. Memory Constraints
In-memory databases (Memgraph) are limited by available RAM. Even disk-based databases (Neo4j) degrade significantly when working sets exceed memory. This is a fundamental challenge for very large graphs (100B+ edges).

---

## Production Readiness at Scale

### Tier 1: Battle-Tested, Production-Ready at Scale
| Database | Evidence |
|----------|----------|
| **Neo4j Enterprise** | Used by eBay, Walmart, NASA, Comcast. Thousands of production deployments. Most mature ecosystem. |
| **JanusGraph** | Used at Uber, IBM, Expero. Proven on billion-edge graphs via Cassandra/HBase backends. Linux Foundation governance. |
| **ArangoDB** | Forrester-recognized. Used in production by multiple enterprises. SmartGraphs enable distributed graph workloads. |

### Tier 2: Production-Ready with Caveats
| Database | Evidence |
|----------|----------|
| **Dgraph** | Handles billion-edge graphs. Corporate instability (two acquisitions) creates risk. All enterprise features now Apache 2.0. |
| **Memgraph** | Production-ready for real-time, in-memory workloads. Not suitable when data exceeds available RAM. BSL license may be a concern. |
| **Neo4j Community** | Suitable for small-to-medium production deployments. Single-node limitation prevents scaling. |

### Tier 3: Maturing, Use with Caution
| Database | Evidence |
|----------|----------|
| **Apache AGE** | Good for adding graph capabilities to existing PostgreSQL deployments. Not a replacement for dedicated graph databases. Cloud availability gaps (no AWS RDS). |
| **TypeDB** | Powerful for knowledge representation and reasoning. TypeDB 3 Rust rewrite is promising but relatively new. Small production footprint. |
| **TerminusDB** | Niche use case (versioned data collaboration). Not suitable for high-throughput graph workloads. Small team/community. |

### Tier 4: Not Recommended for Production
| Database | Evidence |
|----------|----------|
| **Cayley** | Effectively abandoned since 2019. No active maintenance. Historical interest only. |
| **Apache TinkerPop** | Framework, not a database. Production readiness depends entirely on the chosen provider. |

---

## Sources

### Benchmark Reports and Studies
- [ArangoDB vs Neo4j Benchmark (Dec 2024)](https://arangodb.com/2024/12/benchmark-results-arangodb-vs-neo4j-arangodb-up-to-8x-faster-than-neo4j)
- [TigerGraph Multi-DB Benchmark Report](https://info.tigergraph.com/benchmark)
- [IEEE: Scalability and Performance Evaluation of Graph Database Systems (2024)](https://ieeexplore.ieee.org/document/10391694/)
- [Experimental Evaluation: JanusGraph, Nebula Graph, Neo4j, TigerGraph (2023)](https://eg-fr.uc.pt/bitstream/10316/113292/1/Experimental-Evaluation-of-Graph-Databases-JanusGraph-Nebula-Graph-Neo4j-and-TigerGraphApplied-Sciences-Switzerland.pdf)
- [Benchmarking Graph Databases: Neo4j vs Neptune vs ArangoDB (ResearchGate, 2024)](https://www.researchgate.net/publication/389357088_Benchmarking_Graph_Databases_Neo4j_vs_Amazon_Neptune_vs_ArangoDB)
- [Memgraph vs Neo4j Performance Comparison](https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison)
- [Memgraph Write Speed Analysis (2024)](https://memgraph.com/blog/memgraph-or-neo4j-analyzing-write-speed-performance)
- [TypeDB 3 Benchmarks (Sep 2025)](https://typedb.com/blog/first-look-at-typedb-3-benchmarks)

### Database-Specific Sources
- [Neo4j Community Edition Limitations](https://community.neo4j.com/t/neo4j-community-edition-limitations-deep-dive/71005)
- [Neo4j Licensing FAQ](https://neo4j.com/open-core-and-neo4j/)
- [JanusGraph Documentation and Changelog](https://docs.janusgraph.org/changelog/)
- [Dgraph Future Under Hypermode](https://hypermode.com/blog/the-future-of-dgraph-is-open-serverless-and-ai-ready)
- [Dgraph v25 Announcement](https://x.com/hypermodeinc/status/1925884116597080361)
- [Dgraph vs ArangoDB (PuppyGraph)](https://www.puppygraph.com/blog/arangodb-vs-dgraph)
- [Apache TinkerPop Official](https://tinkerpop.apache.org/)
- [Apache TinkerPop Providers](https://tinkerpop.apache.org/providers.html)
- [TerminusDB Official](https://terminusdb.org/)
- [TerminusDB GitHub](https://github.com/terminusdb/terminusdb)
- [Memgraph Benchmarking Docs](https://memgraph.com/docs/deployment/benchmarking-memgraph)
- [Memgraph vs Neo4j (PuppyGraph)](https://www.puppygraph.com/blog/memgraph-vs-neo4j)
- [Apache AGE (DeepWiki)](https://deepwiki.com/apache/age)
- [Apache AGE Performance Best Practices (Azure)](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/generative-ai-age-performance)
- [PostgreSQL vs Apache AGE Comparison](https://medium.com/@sjksingh/postgresql-showdown-complex-joins-vs-native-graph-traversals-with-apache-age-78d65f2fbdaa)
- [Cayley GitHub](https://github.com/cayleygraph/cayley)
- [Cayley Releases (Last: v0.7.7, 2019)](https://github.com/cayleygraph/cayley/releases)
- [TypeDB Features](https://typedb.com/features)
- [TypeDB Knowledge Graphs](https://typedb.com/use-cases/knowledge-graphs)

### Comparison and Ranking Sources
- [DB-Engines: Memgraph vs Neo4j vs TerminusDB](https://db-engines.com/en/system/Memgraph%3BNeo4j%3BTerminusDB)
- [DB-Engines: Dgraph vs Memgraph vs Neo4j](https://db-engines.com/en/system/Dgraph%3BMemgraph%3BNeo4j)
- [DB-Engines: ArangoDB vs Neo4j vs TigerGraph](https://db-engines.com/en/system/ArangoDB%3BNeo4j%3BTigerGraph)
- [Graph Databases & Query Languages in 2025 (Medium)](https://medium.com/@visrow/graph-databases-query-languages-in-2025-a-practical-guide-39cb7a767aed)
- [DGraph vs JanusGraph vs Neo4j Comparison 2026](https://www.index.dev/skill-vs-skill/database-janusgraph-vs-neo4j-vs-dgraph)
- [Top 10 Open Source Graph Databases 2025 (GeeksforGeeks)](https://www.geeksforgeeks.org/blogs/open-source-graph-databases/)
- [7 Best Open Source Graph Databases (PuppyGraph)](https://www.puppygraph.com/blog/open-source-graph-databases)
- [Apache AGE vs Other Graph Databases (DEV)](https://dev.to/mohanadtoaima/graph-database-comparison-apache-age-vs-other-graph-databases-2bmc)
- [Databases in 2025: A Year in Review (CMU)](https://www.cs.cmu.edu/~pavlo/blog/2026/01/2025-databases-retrospective.html)
