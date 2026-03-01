# Graph Database Architecture: Deep Research Report

**Date:** 2026-02-05
**Purpose:** Comprehensive analysis of graph database architectures, performance characteristics, and what makes graph databases fast and scalable.

---

## Table of Contents

1. [Storage Engines](#1-storage-engines)
2. [In-Memory vs Disk-Based Approaches](#2-in-memory-vs-disk-based-approaches)
3. [Graph-Native vs Property Graph over Relational/KV](#3-graph-native-vs-property-graph-over-relationalkv)
4. [Distributed Graph Processing and Sharding](#4-distributed-graph-processing-and-sharding)
5. [Query Optimization Techniques](#5-query-optimization-techniques)
6. [Benchmark Comparisons](#6-benchmark-comparisons)
7. [Rust-Based Graph Databases](#7-rust-based-graph-databases)
8. [Embedding-Native Graph Databases](#8-embedding-native-graph-databases)
9. [Recent Academic Papers (2023-2025)](#9-recent-academic-papers-2023-2025)
10. [Architectural Patterns for Best Performance](#10-architectural-patterns-for-best-performance)
11. [What a New Entrant Needs](#11-what-a-new-entrant-needs)

---

## 1. Storage Engines

### Storage Engine Landscape by Database

| Database | Storage Engine | Type | Language | Key Design |
|----------|---------------|------|----------|------------|
| **Neo4j** | Custom (Block/Aligned format) | Native graph | Java | Fixed-size records, index-free adjacency |
| **TigerGraph** | Custom NPG (Native Parallel Graph) | Native graph | C++ | Co-located GSE+GPE, MPP design |
| **Memgraph** | Custom in-memory + optional RocksDB | In-memory native | C++ | Contiguous RAM structures, WAL for durability |
| **KuzuDB** | Custom columnar + CSR | Columnar native | C++ | Columnar Sparse Row adjacency, factorized processing |
| **NebulaGraph** | RocksDB (default) | LSM-tree KV overlay | C++ | Shared-nothing, Raft consensus, schema-aware KV |
| **Dgraph** | Badger (custom Go LSM) | LSM-tree KV overlay | Go | Posting lists over LSM, native GraphQL |
| **JanusGraph** | Pluggable (Cassandra/HBase/ScyllaDB) | External KV/columnar | Java | Graph serialized into key-column entries |
| **ArangoDB** | RocksDB (default) | LSM-tree KV overlay | C++ | Multi-model (document+graph+KV), bloom filters |
| **SurrealDB** | SurrealKV (custom Rust) | Custom KV | Rust | Append-only logs, SSTable-style, pluggable |
| **CozoDB** | Pluggable (RocksDB/SQLite/memory) | Datalog over KV | Rust | Datalog queries, RAII memory management |

### LSM Trees vs B-Trees vs Custom Graph Storage

**LSM Trees (RocksDB, Badger, LevelDB):**
- Excel at write throughput via sequential WAL and compaction
- Higher read amplification (multiple levels to check)
- Require bloom filters to optimize point lookups
- Used by: NebulaGraph, Dgraph, ArangoDB, JanusGraph (via Cassandra/HBase)
- Best for: Write-heavy, high-concurrency graph workloads

**B-Trees (LMDB, traditional RDBMS):**
- Lower read amplification, better for range scans
- Higher write amplification due to random I/O
- Predictable latency for point queries
- A data structure can optimize for at most two of: read, write, and space amplification

**Custom Graph-Native Storage:**
- Neo4j: Fixed-size record stores (9 bytes per node record), O(1) record location computation
- TigerGraph: Contiguous memory segments for adjacency, optimized for parallel neighbor access
- KuzuDB: Columnar storage with CSR (Compressed Sparse Row) adjacency indices
- Galaxybase: Log-Structured Adjacency List with Edge Page structure
- These achieve 5-10x faster multi-hop traversals than LSM-based property graphs at scale

### Key Academic Innovation: LSMGraph (SIGMOD 2025)

LSMGraph combines the write-friendly LSM-tree with read-friendly CSR format. It uses a multi-level CSR structure embedded within LSM-tree levels, with a MemGraph memory buffer and vertex-grained version control. It significantly outperforms state-of-the-art systems on both graph update and graph analytical workloads.

Source: https://arxiv.org/html/2411.06392v1

---

## 2. In-Memory vs Disk-Based Approaches

### In-Memory (Memgraph, KuzuDB in-memory mode)
- **Latency:** Sub-millisecond neighbor lookup
- **Throughput:** Memgraph claims up to 120x faster than Neo4j on certain queries
- **Write speed:** Memgraph shows 50x faster writes than Neo4j
- **Limitation:** Bounded by RAM size and cost
- **Durability:** WAL + snapshots for crash recovery

### Disk-Based (Neo4j, TigerGraph, NebulaGraph)
- **Scalability:** Handles hundreds of billions of edges
- **Predictable IO:** Cache misses and seek latencies are manageable
- **Neo4j Block format:** Co-locates node, relationship, and property data in on-disk blocks to reduce pointer chasing

### Hybrid Approaches
- **Memgraph larger-than-memory mode:** Buffers active graph in RAM, persists cold data
- **TigerGraph streaming ingestion:** Active portions in memory, background persistence
- **General guidance:** For OLTP, in-memory yields 2-5x lower latency. For OLAP, disk-based with massive parallelism scales better.

### Performance Numbers (Memgraph vs Neo4j)
- Expansion query: 1.09ms (Memgraph) vs 27.96ms (Neo4j) = 25x faster
- Mixed workload throughput: 132x that of Neo4j under concurrent read/write loads
- Memory consumption: Memgraph uses 1/4 the memory of Neo4j for equivalent workloads
- Isolation: Memgraph provides snapshot isolation vs Neo4j's read-committed

Source: https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison

---

## 3. Graph-Native vs Property Graph over Relational/KV

### Index-Free Adjacency (Neo4j's Core Principle)
- Each node directly references its adjacent neighbors via memory pointers
- Traversal complexity: O(1) per hop (pointer follow) vs O(log n) for index lookup
- Processing time proportional to data traversed, NOT total dataset size
- Node store: fixed 9-byte records enabling direct offset computation

### Native Graph Storage Advantages
- Storage layouts directly reflect nodes and edges (adjacency lists)
- Localized IO for traversals (data co-location)
- Constant-time neighbor hops
- LDBC benchmarks show native engines achieving 10-20x higher traversal throughput vs overlay approaches

### Overlay Property Graphs (JanusGraph, AGE over PostgreSQL)
- Require multi-table/column requests per traversal step
- Additional joins and network hops in distributed settings
- JanusGraph/Cassandra: 8 QPS at 1B nodes vs TigerGraph's 150 QPS (LDBC SN 2024)
- Trade-off: Leverage existing infrastructure (Cassandra, HBase) but sacrifice graph-specific performance

### Key Insight
Graph-native storage (co-located adjacency + properties) consistently outperforms KV/RDB overlays in traversal throughput and latency. The performance gap widens with graph size and traversal depth.

---

## 4. Distributed Graph Processing and Sharding

### Edge-Cut Partitioning (Vertex Partitioning)
- Assigns contiguous vertex sets to shards, cutting edges across partitions
- Minimizes number of cross-partition edges
- Used by: Neo4j Fabric, JanusGraph/Cassandra deployments
- Best for: Low-degree, structured graphs (mesh-like)
- Tools: Metis achieves optimal quality for static balanced graphs

### Vertex-Cut Partitioning (Edge Partitioning)
- Shards edges uniformly, replicating high-degree vertices across machines
- Balances load for scale-free (power-law) graphs
- Used by: Dgraph, TigerGraph (hash partition on vertex ID with replicated edges)
- Performance: 30% faster PageRank than edge-cut on power-law graphs
- Tools: HDRF provides superior performance for dynamic power-law networks

### CUTTANA: State-of-the-Art Graph Partitioning (2024)
- Streaming graph partitioner achieving superior quality vs existing solutions
- Improves runtime performance by up to 59% vs HDRF, Fennel, Ginger, HeiStream
- For graph database tasks: up to 23% higher query throughput without hurting tail latency
- Published at VLDB 2024

Source: https://arxiv.org/abs/2312.08356

### NebulaGraph Architecture
- Shared-nothing, storage-compute separated, Raft-consensus
- RocksDB local engine with sequential WAL writes
- Parallel Raft batches log entries and pipelines append/confirm/commit phases
- Achieves millions of edges per second write throughput in distributed mode

### TigerGraph Distributed Design
- Automatic graph data partitioning across cluster
- MPP execution: compute functions run in parallel on every vertex/edge
- MapReduce-based computing model with accumulator variables
- GSQL provides Turing-complete query language with ACCUM clause for parallel computation

---

## 5. Query Optimization Techniques

### Worst-Case Optimal Joins (WCOJ)
WCOJ algorithms are a class of join algorithms for cyclic queries over many-to-many relationships, evaluated column-at-a-time (multiway) instead of table-at-a-time (binary).

**Key implementations:**
- **Leapfrog Trie Join (LFTJ):** All relations scanned simultaneously, matching values across multiple indexes
- **KuzuDB:** Generates plans that seamlessly combine binary joins and WCOJ-style multiway intersections
- **The Ring (2024):** Single compact index supporting all wco join orders for triple-based graphs, replacing the need for 6 separate B-Tree indexes

**When WCOJ helps:**
- Queries with strong cyclic components involving many-to-many relationships
- For acyclic queries, traditional binary joins remain preferred
- LDBC BI: 2-3x execution speedups attributed to WCOJ integration

Source: https://blog.kuzudb.com/post/wcoj/

### Factorized Query Processing
- Compression technique for intermediate results in many-to-many joins
- Avoids redundancy in relational query answers
- Computed directly from input database in time proportional to input size
- KuzuDB: Factorized query processor achieves exponential reduction in intermediate result set size
- Academic results: 3x memory reduction and 2x speedup on Twitter subgraph extraction (VLDB 2023)

### Other Optimization Techniques
- **Neo4j Cypher 5.0:** Multi-hop join reordering, traversal reuse caching
- **TigerGraph GSQL:** Compile-time query plans with static code generation, inlined traversal hot paths
- **NebulaGraph:** Schema-aware filter pushdown into KV operations
- **Semi-join / bloom-filter approaches:** Eliminate tuples early in multi-hop traversals

---

## 6. Benchmark Comparisons

### LDBC Social Network Benchmark (2024)
| System | Scale | Throughput | Notes |
|--------|-------|------------|-------|
| TigerGraph v4.3 | 1B nodes, 5B edges | 150 QPS | Block-native format |
| JanusGraph/Cassandra | Same scale | 8 QPS | KV overlay penalty |
| Neo4j | SF-300+ | Completed 12/25 BI queries (5hr limit) | Timed out on complex BI |
| TigerGraph | SF-300+ | Completed all 25 BI queries | ~10x faster average across queries |

**Storage efficiency:** Neo4j storage ~4x larger than TigerGraph across all settings.

**Scalability:** Only TigerGraph scaled to 1TB in the LDBC study.

Source: https://info.tigergraph.com/ldbc-benchmark (Note: not officially audited by LDBC)

### Independent Benchmarks
| Comparison | Result | Source |
|------------|--------|--------|
| Memgraph vs Neo4j | Up to 120x faster, 1/4 memory | Memgraph benchmark |
| NebulaGraph vs Neo4j | NebulaGraph faster at large scale, Neo4j faster at small scale | NebulaGraph benchmark |
| Dgraph vs ArangoDB | Dgraph: 100M edges in 4min vs ArangoDB 7min (bulk load) | DB-Engines 2025 |
| TigerGraph vs Neo4j | 100x+ faster on certain BI queries | UC research / LDBC SNB |

### IEEE Study (2024): Scalability and Performance
Comparison of Neo4j, JanusGraph, Memgraph, NebulaGraph, and TigerGraph:
- Neo4j: Lowest average query execution time (24.30 min) on tested workloads
- NebulaGraph: Best distributed performance with lowest storage amplification ratio
- Memgraph: Superior real-time and write-heavy workloads

Source: https://ieeexplore.ieee.org/document/10391694/

### Graph500
- KuzuDB (in-memory colstore): #4 SUV ranking, 7.5M TEPS on 64-core machine
- Neo4j Fabric: 2.1M TEPS on comparable hardware

---

## 7. Rust-Based Graph Databases

### SurrealDB
- **Language:** Rust
- **Storage:** SurrealKV (custom, SSTable-backed with append-only logs)
- **Model:** Multi-model (document + graph + relational + time-series + vector)
- **Query:** SurrealQL (SQL-like)
- **Architecture:** Compute separated from storage, Raft-inspired protocol for sharding
- **Vector support:** Built-in vector indexes, ~50us nearest neighbor on 1M vectors
- **Status:** Production-ready (v2.0+), active development
- **GitHub:** https://github.com/surrealdb/surrealdb

### CozoDB
- **Language:** Rust
- **Storage:** Pluggable (RocksDB, SQLite, in-memory)
- **Model:** Relational-graph-vector with Datalog queries
- **Query:** Datalog (declarative, powerful for recursive graph queries)
- **Key feature:** RAII memory management, minimal memory footprint during queries
- **Self-description:** "The hippocampus for AI" (combining graphs + vectors)
- **Status:** Alpha/early production
- **GitHub:** https://github.com/cozodb/cozo

### Other Rust Graph Projects
- **Grasp:** In-memory graph engine in Rust (early stage)
- **Indradb:** Property graph database in Rust using pluggable backends
- **Various Rust crates:** petgraph (in-memory graph library), not a database but widely used

### Why Rust for Graph Databases
- **Zero-cost abstractions:** No GC pauses (critical for consistent query latency)
- **Memory safety without GC:** Prevents data races at compile time
- **Performance:** Matches or exceeds C++ on throughput benchmarks (~60K req/s vs Go's ~40K)
- **Cold start:** ~30ms (vs Go ~45ms, Java ~100ms)
- **RAII:** Deterministic resource cleanup, important for memory-mapped operations
- **Trade-off:** Slower development velocity, steeper learning curve, fewer database engineers available

---

## 8. Embedding-Native Graph Databases (Vectors + Graphs)

### TigerVector (TigerGraph v4.2, December 2024)
- MPP index framework interoperating with graph engine
- GSQL enhanced for vector type expressions
- Enables query compositions: vector search results combined with graph traversal blocks
- Hybrid top-k similarity + multi-hop filtering in single query

Source: https://arxiv.org/html/2501.11216v3

### Neo4j Native Vector Type
- First-class Vector type: drivers -> Bolt -> Cypher -> storage -> constraints
- Fixed-length, single-dtype numeric arrays
- Used for semantic search, GraphRAG patterns
- End-to-end support across the entire stack

Source: https://neo4j.com/blog/developer/introducing-neo4j-native-vector-data-type/

### SurrealDB Vector Indexes
- Co-located with document/graph records
- ~50us nearest neighbor lookup on 1M vectors
- Integrated into SurrealQL query language

### CozoDB
- Combines graph + vector in Datalog queries
- Positioned as "hippocampus for AI"
- Vector similarity as first-class Datalog relation

### GraphRAG Architecture Pattern
- Hybrid retrieval: embedding-based text retrieval + structured graph reasoning
- Knowledge graphs provide relational context that pure vector search misses
- Benchmarks show nearly 2x correct answers with GraphRAG vs traditional RAG
- HybridRAG (Memgraph): Combines vector-based and graph-based retrieval

---

## 9. Recent Academic Papers (2023-2025)

### Storage and Architecture
| Paper | Venue | Year | Key Contribution |
|-------|-------|------|------------------|
| LSMGraph: High-Performance Dynamic Graph Storage with Multi-Level CSR | SIGMOD | 2025 | Combines LSM write-friendliness with CSR read-friendliness |
| Galaxybase: Native Distributed Graph DB for HTAP | VLDB | 2024 | Log-Structured Adjacency List, offset-based retrieval, bidirectional HTAP transactions |
| GraphAr: Efficient Storage Scheme for Graph Data in Data Lakes | VLDB | 2025 | Addresses columnar format limitations for graph data |
| AeonG: Efficient Built-in Temporal Support in Graph Databases | VLDB | 2024 | Hybrid storage for temporal graph with current + historical storage |
| Columnar Storage and List-Based Processing for GDBMSs | VLDB | 2021 (cited heavily 2023-25) | Foundation for KuzuDB's columnar approach |

### Query Processing
| Paper | Venue | Year | Key Contribution |
|-------|-------|------|------------------|
| The Ring: WCO Joins in Graph DBs using Almost No Extra Space | ACM TODS | 2024 | Single compact index replaces 6 B-Tree indexes for triple graphs |
| WCO Similarity Joins on Graph Databases | SIGMOD | 2024 | Extends WCOJ to kNN similarity within graph queries |
| Graphflow: A Native WCO Graph DBMS | SIGMOD | 2024 | Trie-based data structure with LFTJ, 5x faster than Neo4j on LDBC |
| Factorized Representations for Deep Graph Traversals | VLDB | 2023 | 3x memory reduction, 2x speedup on subgraph extraction |
| Optimizing Queries with Many-to-Many Joins | ArXiv | 2024 | Combining binary and WCO joins for subgraph queries |

### Distributed and Partitioning
| Paper | Venue | Year | Key Contribution |
|-------|-------|------|------------------|
| CUTTANA: Scalable Graph Partitioning | VLDB | 2024 | Up to 59% faster runtime, 23% higher query throughput |
| DGraph-Fit: Scalable Partitioning for LSM-Backed Graph Stores | ICDE | 2025 | Optimizes vertex-cut for LSM systems, 25% PageRank improvement |

### Comparative Studies
| Paper | Venue | Year | Key Contribution |
|-------|-------|------|------------------|
| Scalability and Performance of Graph DB Systems | IEEE | 2024 | Neo4j, JanusGraph, Memgraph, NebulaGraph, TigerGraph comparison |
| Modern Techniques for Querying Graph-Structured Relations | FnT | 2024 | Comprehensive survey of query processing techniques |

---

## 10. Architectural Patterns for Best Performance

### Pattern 1: Graph-Native Columnar Storage with CSR
- KuzuDB approach: columnar data stores for nodes, CSR for edges
- Enables vectorized processing and cache-friendly access patterns
- Combined with WCOJ for cyclic queries
- Best for: Analytical workloads, pattern matching

### Pattern 2: In-Memory with WAL Persistence
- Memgraph approach: all data in RAM, WAL for durability
- Lowest possible latency for OLTP graph queries
- C++ implementation for zero GC overhead
- Best for: Real-time, streaming, low-latency requirements

### Pattern 3: Native MPP with Custom Storage
- TigerGraph approach: custom C++ engine with parallel processing baked in
- Co-located storage and compute engines
- MapReduce-style parallel vertex/edge computation
- Best for: Large-scale analytics, deep traversals, distributed workloads

### Pattern 4: LSM-Tree with Graph-Aware Layering
- NebulaGraph/Dgraph approach: RocksDB/Badger underneath, graph-aware layer on top
- Benefits from LSM write throughput
- Raft consensus for distributed consistency
- Best for: Write-heavy distributed workloads, eventual consistency acceptable

### Pattern 5: Hybrid LSM-CSR (Emerging)
- LSMGraph approach: embed CSR within LSM-tree levels
- Gets best of both worlds: LSM write speed + CSR read speed
- Vertex-grained version control for concurrent access
- Best for: Dynamic graphs with mixed read/write workloads

---

## 11. What a New Entrant Needs

### Must-Have Architectural Choices
1. **Language: Rust or C++** (no GC pauses, fine-grained memory control, zero-cost abstractions)
2. **Graph-native storage** (not a graph layer over generic KV store)
3. **Columnar + CSR adjacency** for cache-friendly traversals
4. **WCOJ query engine** for cyclic pattern matching (the new standard)
5. **Factorized query processing** to compress intermediate join results
6. **Native vector support** (embedding-native from day one, not bolted on)
7. **Hybrid storage** (in-memory hot path + disk-based cold storage)

### Should-Have
8. **Pluggable storage backends** (embedded SQLite/RocksDB for testing, custom engine for production)
9. **Compute-storage separation** for cloud-native deployment
10. **Streaming/incremental computation** for dynamic graphs
11. **Cypher/GQL compatibility** (ISO GQL standard adoption)
12. **HTAP support** (both OLTP and OLAP in one engine)

### Competitive Differentiators
13. **Graph + Vector + Full-text in one query language** (the convergence play)
14. **Embeddable mode** (SQLite for graphs, following KuzuDB/CozoDB trend)
15. **Adaptive query optimizer** that switches between binary joins and WCOJ based on query structure
16. **Smart partitioning** (auto-detect power-law vs structured and choose vertex-cut vs edge-cut)
17. **WASM/edge deployment** capability

### Performance Targets to Be Competitive
- Sub-millisecond single-hop traversal
- 100K+ QPS on LDBC Interactive workload (single node)
- Complete all 25 LDBC BI queries within reasonable time
- Bulk load: 100M edges in under 5 minutes
- Vector search: sub-100us on 1M vectors integrated with graph traversal

---

## Sources

### Official Documentation and Blogs
- Neo4j Architecture: https://neo4j.com/blog/cypher-and-gql/native-vs-non-native-graph-technology/
- Neo4j Internals: https://www.oreilly.com/library/view/neo4j-high-performance/9781783555154/ch06.html
- Neo4j Vector Type: https://neo4j.com/blog/developer/introducing-neo4j-native-vector-data-type/
- TigerGraph Architecture: https://www.tigergraph.com/tigergraph-db/
- TigerGraph Benchmarks: https://www.tigergraph.com/benchmark/
- Memgraph vs Neo4j: https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison
- NebulaGraph Storage: https://docs.nebula-graph.io/3.2.0/1.introduction/3.nebula-graph-architecture/4.storage-service/
- KuzuDB Docs: https://docs.kuzudb.com/
- KuzuDB WCOJ Blog: https://blog.kuzudb.com/post/wcoj/
- SurrealDB: https://github.com/surrealdb/surrealdb
- CozoDB: https://github.com/cozodb/cozo
- JanusGraph Partitioning: https://docs.janusgraph.org/advanced-topics/partitioning/

### Academic Papers
- TigerGraph MPP Paper: https://arxiv.org/abs/1901.08248
- KuzuDB CIDR Paper: https://www.cidrdb.org/cidr2023/papers/p48-jin.pdf
- LSMGraph (SIGMOD 2025): https://arxiv.org/abs/2411.06392
- Galaxybase (VLDB 2024): https://www.vldb.org/pvldb/vol17/p3893-tong.pdf
- CUTTANA Partitioning (VLDB 2024): https://arxiv.org/abs/2312.08356
- The Ring WCO Joins (ACM TODS 2024): https://dl.acm.org/doi/10.1145/3644824
- WCO Similarity Joins (SIGMOD 2024): https://dl.acm.org/doi/10.1145/3639294
- TigerVector: https://arxiv.org/html/2501.11216v3
- LDBC SNB Paper: https://arxiv.org/abs/1907.07405
- IEEE Graph DB Comparison: https://ieeexplore.ieee.org/document/10391694/
- MyRocks LSM Paper: https://www.vldb.org/pvldb/vol13/p3217-matsunobu.pdf
- B-Tree vs LSM Revisited: https://www.usenix.org/publications/loginonline/revisit-b-tree-vs-lsm-tree-upon-arrival-modern-storage-hardware-built
- GraphAr (VLDB 2025): https://dl.acm.org/doi/10.14778/3712221.3712223
- Building High-Performance Graph Storage: https://pacman.cs.tsinghua.edu.cn/~cwg/publication/10372995/10372995.pdf

### Benchmark and Comparison Resources
- LDBC Benchmark: https://info.tigergraph.com/ldbc-benchmark
- TigerGraph LDBC Brief: https://cdn2.hubspot.net/hubfs/4114546/LDBC_brief_benchmark.pdf
- NebulaGraph Performance Comparison: https://www.nebula-graph.io/posts/performance-comparison-neo4j-janusgraph-nebula-graph
- KuzuDB Benchmark Study: https://github.com/prrao87/kuzudb-study
- Memgraph White Paper: https://memgraph.com/white-paper/performance-benchmark-graph-databases

### Community and Analysis
- Embedded DB Analysis (KuzuDB): https://thedataquarry.com/blog/embedded-db-2/
- CozoDB on Lobsters: https://lobste.rs/s/gcepzn/cozo_new_graph_db_with_datalog_embedded
- Graph DBs in 2025 Guide: https://medium.com/@visrow/graph-databases-query-languages-in-2025-a-practical-guide-39cb7a767aed
- Dgraph Badger Choice: https://discuss.dgraph.io/t/why-we-choose-badger-over-rocksdb-in-dgraph-dgraph-blog/3928
- LSM vs B-Tree (TiKV): https://tikv.org/deep-dive/key-value-engine/b-tree-vs-lsm/
