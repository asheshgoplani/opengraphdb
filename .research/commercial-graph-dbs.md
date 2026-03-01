# Commercial & Cloud-Managed Graph Databases: Research Report

**Date:** 2026-02-05
**Purpose:** Comprehensive evaluation for OpenGraphDB project reference

---

## 1. Amazon Neptune

### Overview
Fully managed graph database service on AWS supporting property graph (Gremlin, openCypher) and RDF (SPARQL) models.

### Pricing Model
- **On-demand instances:** Starting at $0.098/hr (db.t3.medium) up to ~$7.68/hr for large instances
- **Serverless:** Pay per NCU-second (Neptune Capacity Units), min 1.0 NCU, max 128 NCU. Can save up to 90% vs provisioned peak.
- **Storage:** $0.67/GB-month (Standard), $1.507/GB-month (I/O-Optimized)
- **I/O:** $1.33 per million requests (Standard), $0 (I/O-Optimized)
- **Neptune Analytics:** Per m-NCU-hour, paused graphs at 10% compute cost
- **Database Savings Plans:** 1-year commitment for discounted hourly rates
- **Typical monthly cost:** Small workload ~$200-400/mo, medium ~$1,000-3,000/mo, large ~$5,000-20,000+/mo

### Performance
- 100K+ queries/second on property graph
- Neptune Analytics: tens of billions of relationships analyzed in seconds
- Up to 15 read replicas with single-digit millisecond replica lag
- In-memory optimized architecture

### Scalability
- Auto-expanding storage up to 128 TiB
- Serverless scaling: 1.0 to 128 NCU in 0.5 NCU increments
- Global Database: primary + up to 5 secondary regions (16 read replicas each)
- Recovery from regional outage in < 1 minute

### Query Languages
- Apache TinkerPop Gremlin
- openCypher
- SPARQL 1.1
- Neptune Analytics: openCypher with graph algorithm library

### Vendor Lock-in Concerns
- **HIGH**: Deep AWS integration required (VPC, IAM, CloudWatch)
- No on-premises option
- Neptune-specific extensions and APIs
- Data export requires manual ETL
- Serverless mode never scales to zero (always some cost)

### Limitations
- Single writer instance (write throughput bottleneck)
- No native visualization tools
- No full-text search built-in
- Query language learning curve for SPARQL
- Cannot run outside AWS

### Sources
- https://aws.amazon.com/neptune/pricing/
- https://aws.amazon.com/neptune/features/
- https://docs.aws.amazon.com/neptune-analytics/latest/userguide/neptune-analytics-vs-neptune-database.html

---

## 2. Azure Cosmos DB (Gremlin API)

### Overview
Microsoft's globally distributed, multi-model database with Gremlin API for graph workloads. Not a native graph database; graph is one of several API surfaces.

### Pricing Model
- **Request Units (RU/s):** Fundamental billing unit combining compute, memory, and I/O
- **Provisioned throughput:** Standard or Autoscale
- **Serverless:** Pay per RU consumed
- **Free tier:** 1,000 RU/s + 25 GB storage free for lifetime of account
- **Reserved capacity:** 1-year or 3-year commitments for discounts (up to 65%)
- **Storage:** ~$0.25/GB-month
- **Typical monthly cost:** Small ~$50-200/mo (serverless), medium ~$500-2,000/mo, large ~$5,000-30,000+/mo
- **Multi-region writes multiply cost** by number of write regions

### Performance
- Single-digit millisecond reads and writes at 99th percentile
- Guaranteed <10ms read and <15ms write latency
- Auto-partitioning for throughput scaling
- Performance degrades on deep traversals (3+ hops)

### Scalability
- Virtually unlimited throughput and storage via partitioning
- Global distribution across 60+ Azure regions
- Multi-region writes with automatic conflict resolution
- Horizontal scaling through partition key design

### Query Languages
- Apache TinkerPop Gremlin (subset)
- Not all Gremlin steps supported (e.g., limited `mergeV`, `mergeE`)
- No SPARQL, no openCypher

### Vendor Lock-in Concerns
- **HIGH**: Deep Azure ecosystem integration
- RU pricing model is Azure-specific and hard to predict costs
- Gremlin API is a subset, not full TinkerPop compatibility
- Data model tied to Cosmos DB's document/partition architecture
- No on-premises equivalent (Azure Stack has limited support)

### Limitations
- **Not a native graph database:** Graph is layered on document store
- Incomplete Gremlin support: many traversal steps missing or limited
- `.range()` function walks all elements up to end index (expensive in RUs)
- Throttling at 429 when RU limit reached
- Deep traversals (4+ hops) are slow and expensive
- Partition-crossing queries have high latency
- Graph-specific features lag behind dedicated graph databases
- No graph algorithms library built-in

### Sources
- https://learn.microsoft.com/en-us/azure/cosmos-db/gremlin/limits
- https://learn.microsoft.com/en-us/azure/cosmos-db/how-pricing-works
- https://azure.microsoft.com/en-us/pricing/details/cosmos-db/autoscale-provisioned/

---

## 3. Google Cloud Spanner (Graph Features)

### Overview
Globally distributed, strongly consistent relational database with graph query capabilities added via Spanner Graph (Enterprise edition). Graph is an overlay on relational tables, not a native graph engine.

### Pricing Model
- **Editions:** Standard, Enterprise, Enterprise Plus
- **Compute:** Per processing unit (PU) or node. Starting at ~$65/month for smallest config
- **Nodes:** ~$0.90/node-hour (Enterprise), each node handles ~10 TB storage
- **Storage:** $0.30/GB-month
- **Network egress:** Standard GCP rates
- **Typical monthly cost:** Small ~$65-500/mo, medium ~$2,000-5,000/mo, large ~$10,000-50,000+/mo

### Performance
- 50% throughput increase announced in 2023
- 10 TB per node (up from 4 TB)
- Sub-10ms reads for simple queries
- Strong consistency with TrueTime (global clock)
- Graph query performance depends on underlying table joins

### Scalability
- Virtually unlimited horizontal scaling
- Multi-region, globally distributed with strong consistency
- Automatic sharding and rebalancing
- Linear scaling with added nodes

### Query Languages
- **Spanner Graph:** ISO GQL-compatible graph query interface
- SQL with graph extensions
- Interoperability between relational and graph models
- No Gremlin, no SPARQL, no openCypher

### Vendor Lock-in Concerns
- **VERY HIGH**: GCP-only, no equivalent elsewhere
- Proprietary extensions to SQL/GQL
- TrueTime dependency unique to Google infrastructure
- Most expensive option for pure graph workloads
- Graph features only in Enterprise edition

### Limitations
- **Not a native graph database:** Graph queries translate to relational operations
- Graph features are relatively new (2024-2025), still maturing
- GQL support is partial/evolving
- No native graph algorithms or analytics
- Overkill for pure graph workloads (designed for relational + graph hybrid)
- Enterprise edition required for graph features (higher cost tier)
- Limited graph-specific tooling and visualization

### Sources
- https://cloud.google.com/spanner/pricing
- https://docs.google.com/spanner/docs/graph/overview
- https://cloud.google.com/blog/products/databases/spanner-in-2025

---

## 4. TigerGraph

### Overview
High-performance native parallel graph database designed for deep link analytics and real-time graph queries at scale. Proprietary platform with cloud (Savanna) and self-managed options.

### Pricing Model
- **Savanna Free Trial:** $0/GB-month (limited: 32 vCPU, 256GB RAM, 1 R/W workspace)
- **Savanna:** $45/GB-month (24/7 service, US/Tier 1), up to 512 vCPU, 4TB RAM
- **Savanna Business Critical:** $126/GB-month, multi-zone HA, 99.95% uptime SLA
- **Storage:** $0.025/GB-month (elastic)
- **Self-managed Community:** Free (single server, up to 300GB graph+vector storage)
- **Self-managed Enterprise:** Contact sales
- **Typical monthly cost:** Small ~$200-500/mo (Savanna), medium ~$2,000-5,000/mo, large ~$10,000-50,000+/mo

### Performance
- Claims 100K+ deep link queries/second on single machine
- 50x-100x query performance vs competitors (vendor claim)
- Efficient data compression (graph footprint smaller than raw data)
- Native parallel graph engine
- Scales to 100+ TB

### Scalability
- Horizontal scaling with distributed architecture
- Elastic and independent scaling of storage and compute
- Multi-zone availability in Business Critical tier
- On-demand read replicas

### Query Languages
- **GSQL:** Proprietary SQL-like graph query language (primary)
- **openCypher:** Supported via GSQL wrapper (since v3.9.3)
- **GQL:** Announced support
- No SPARQL support

### Vendor Lock-in Concerns
- **VERY HIGH**: GSQL is proprietary with no equivalent elsewhere
- Not open-source (closed-source engine)
- Migrating GSQL queries to another platform requires complete rewrite
- openCypher support is via wrapper, not native
- Cloud-only or self-managed with license
- Limited ecosystem compared to Neo4j

### Limitations
- Proprietary GSQL creates steep lock-in
- Not open-source: cannot inspect internals or contribute
- Learning curve for GSQL
- Smaller community than Neo4j or open-source alternatives
- Enterprise pricing is opaque (contact sales)
- Limited third-party tooling and integrations
- Recent concerns about company stability (layoffs, pivots)

### Sources
- https://www.tigergraph.com/pricing/
- https://www.tigergraph.com/tigergraph-cloud-pricing/
- https://www.puppygraph.com/blog/tigergraph-alternatives

---

## 5. GraphDB (Ontotext) / QLever

### GraphDB (Ontotext)

#### Overview
Enterprise RDF/SPARQL graph database optimized for semantic reasoning and knowledge graphs. W3C standards compliant with strong inferencing capabilities.

#### Pricing Model
- **GraphDB Free:** Free (requires license key, single write thread, limited performance)
- **GraphDB Enterprise:** Contact sales for pricing (custom quotes)
- **Cloud deployment:** Available on AWS, Azure, GCP marketplaces
- **Estimated Enterprise pricing:** ~$10,000-50,000+/year based on deployment size
- **Typical monthly cost:** Free tier $0, Enterprise ~$1,000-5,000+/mo

#### Performance
- Handles large-scale RDF datasets with semantic inferencing
- Free edition limited to single write thread
- Enterprise scales with CPU cores
- Real-time inferencing at scale
- Competitive on SPARQL benchmarks

#### Scalability
- Cluster deployment in Enterprise edition
- Horizontal read scaling via replication
- Handles billions of triples
- Limited write scaling (master-slave architecture)

#### Query Languages
- **SPARQL 1.1** (full support)
- GraphQL (via plugin)
- No property graph query languages (no Gremlin, no openCypher)

#### Vendor Lock-in Concerns
- **LOW-MEDIUM**: W3C standards (RDF, SPARQL, OWL) ensure data portability
- Standard SPARQL queries work across any RDF store
- Enterprise features are proprietary
- RDF/SPARQL ecosystem is standards-based

#### Limitations
- RDF-only (no property graph model)
- Enterprise pricing not transparent
- Free edition has significant performance limitations
- Smaller community than Neo4j
- SPARQL has steeper learning curve than Cypher/Gremlin
- Limited graph analytics/algorithm library

### QLever

#### Overview
Open-source SPARQL engine from University of Freiburg, optimized for extremely fast query execution on large RDF datasets. Research-grade but production-capable.

#### Pricing Model
- **Completely free and open-source** (Apache 2.0 license)
- Self-hosted only
- No managed cloud offering
- Cost is infrastructure only

#### Performance
- **Fastest SPARQL engine** on most benchmarks
- Scales to 1+ trillion triples on a single commodity machine
- Outperforms Virtuoso, Blazegraph, GraphDB on standard benchmarks
- Trades memory for speed (can be memory-hungry)

#### Query Languages
- **SPARQL 1.1** (full support including federated queries, named graphs, updates)
- SPARQL+Text hybrid queries

#### Vendor Lock-in Concerns
- **VERY LOW**: Open-source, W3C standards

#### Limitations
- No managed cloud service
- Research-grade: smaller community, less enterprise support
- Memory-hungry (can OOM on complex queries)
- No built-in HA or clustering
- Limited enterprise features (no RBAC, no audit logs)
- Requires self-management

### Sources
- https://www.ontotext.com/products/graphdb/
- https://graphdb.ontotext.com/documentation/11.2/benchmark.html
- https://github.com/ad-freiburg/qlever
- https://github.com/ad-freiburg/qlever/wiki/QLever-performance-evaluation-and-comparison-to-other-SPARQL-engines

---

## 6. Stardog

### Overview
Enterprise knowledge graph platform combining RDF graph database, virtualization, inference engine, and NLP. Focused on data fabric and semantic AI use cases.

### Pricing Model
- **Stardog Free:** Renewable 1-year license, commercial use allowed, limited features
- **Stardog Enterprise:** Custom pricing (contact sales)
- **AWS Marketplace:** Usage-based pricing, 30-day free trial, 365-day contracts available
- **Estimated Enterprise pricing:** ~$20,000-100,000+/year based on scale
- **Typical monthly cost:** Free tier $0, Enterprise ~$2,000-10,000+/mo

### Performance
- Bulk load: 500,000 triples/second on modest server
- Thousands of queries/second per node
- Claims 57x better price/performance vs alternatives
- Scales to 1 trillion edges with sub-second query times
- Virtual graph queries federate data without materialization

### Scalability
- Cluster deployment for HA
- Read replicas for horizontal read scaling
- Virtual graphs enable querying external data sources at scale
- Trillion-edge scale demonstrated

### Query Languages
- **SPARQL 1.1** (full support with extensions)
- **GraphQL** (via Stardog's GraphQL interface)
- Path queries with Stardog extensions
- No Gremlin, no openCypher, no GQL

### Vendor Lock-in Concerns
- **MEDIUM**: SPARQL is standard, but Stardog extensions are proprietary
- Virtual graph and inference features are Stardog-specific
- Enterprise pricing is opaque
- Free tier lacks critical features (no HA, no LDAP, no backups)
- Data is portable via standard RDF formats

### Limitations
- Opaque enterprise pricing
- Free tier significantly limited
- SPARQL-only (no property graph support)
- Smaller ecosystem than Neo4j
- Heavy platform: more than just a database
- Inference and virtual graph features add complexity
- Limited graph analytics algorithms compared to TigerGraph/Neo4j

### Sources
- https://www.stardog.com/pricing/
- https://www.stardog.com/platform/features/high-performance-graph-database/
- https://www.stardog.com/blog/trillion-edge-knowledge-graph/
- https://aws.amazon.com/marketplace/pp/prodview-ulfm6fel7xgjq

---

## 7. Blazegraph

### Overview
Open-source, high-performance RDF/SPARQL graph database. Powers Wikidata Query Service. **ABANDONED since 2020:** no active development, maintenance, or security patches.

### Pricing Model
- **Completely free and open-source** (GPLv2)
- Self-hosted only
- No managed cloud offering
- No commercial support available

### Performance
- Supports up to 50 billion edges on single machine
- Reasonable SPARQL performance for its era
- Performance degrades at ~6 billion triples
- Slower than QLever and Virtuoso on modern benchmarks

### Scalability
- Scale-out mode available (but unmaintained)
- Exact range counts expensive in scale-out
- Concurrency issues with multi-threaded loads
- Limited horizontal scaling

### Query Languages
- **SPARQL 1.1**
- Blueprints API (TinkerPop 2.x, outdated)
- No modern Gremlin/openCypher support

### Vendor Lock-in Concerns
- **VERY LOW**: Open-source, W3C standards

### Limitations
- **ABANDONED:** No development since 2020, no security patches
- No commercial support
- Performance degradation at large scale
- Outdated TinkerPop 2.x support
- Concurrency and resource utilization issues
- Not recommended for new deployments
- Wikidata is actively evaluating replacements (QLever is a candidate)

### Sources
- https://github.com/blazegraph/database
- https://en.wikipedia.org/wiki/Blazegraph
- https://www.g2.com/products/blazegraph/reviews
- https://www.wikidata.org/wiki/Wikidata:Scaling_Wikidata/Benchmarking/Final_Report

---

## 8. Virtuoso (OpenLink)

### Overview
Multi-model database (relational + RDF) that functions as both an RDBMS and a triplestore. Powers DBpedia and many public SPARQL endpoints. Available in open-source and commercial editions.

### Pricing Model
- **Virtuoso Open Source Edition (VOS):** Free (GPLv2)
- **Virtuoso Commercial:** Starting at ~$499/year (single user)
  - ~$4,000/year for 10 users
  - ~$30,000/year for 100 users
  - ~$100,000-200,000/year for 1,000+ users
- Custom quotes for enterprise deployments
- **Typical monthly cost:** OSS $0, Commercial ~$40-8,000+/mo depending on scale

### Performance
- Handles 100 TB+ datasets on clusters
- Dual SQL + SPARQL on same data
- Competitive on TPC-H and SPARQL benchmarks
- Parallel processing and optimized query execution
- Fastest on some distinct-result SPARQL benchmarks

### Scalability
- Cluster deployment for horizontal scaling
- Replication for read scaling
- Tested at 100 TB+ scale
- Both SQL and SPARQL scale together

### Query Languages
- **SPARQL 1.1** (full support with extensions)
- **SQL** (full SQL:2003 support)
- SPARQL-to-SQL bridging (query RDF as SQL and vice versa)
- No Gremlin, no openCypher

### Vendor Lock-in Concerns
- **LOW**: Open-source edition available, W3C standards
- SQL + SPARQL are both standards-based
- Virtuoso-specific extensions in commercial edition
- RDF data fully portable

### Limitations
- Open-source edition lacks advanced features (HA, security, inference)
- Commercial pricing not always transparent
- Smaller community than other graph databases
- Documentation could be more comprehensive
- UI and tooling feel dated
- Not a native property graph database
- Limited modern graph analytics

### Sources
- https://virtuoso.openlinksw.com/
- https://virtuoso.openlinksw.com/pricing/
- https://community.openlinksw.com/t/virtuoso-benchmarks-report/6040
- https://github.com/openlink/virtuoso-opensource

---

## 9. NebulaGraph

### Overview
Open-source distributed native graph database designed for massive-scale graphs. Uses shared-nothing architecture with separate storage and compute layers. Backed by vesoft inc.

### Pricing Model
- **Open-source Community:** Free (Apache 2.0)
- **NebulaGraph Cloud (Standard):** Starting at $0.049/hr (2 vCPU, 4GB RAM) to $3.76/hr (8 vCPU, 64GB RAM)
- **NebulaGraph Cloud (Professional):** Storage nodes $0.79-3.17/hr, Query nodes $0.49-2.08/hr
- **Storage:** $0.0001-0.0002/GB/hour
- **Enterprise (on-premises):** Subscription or perpetual license (contact sales)
- **14-day free trial** available
- **Typical monthly cost:** Self-hosted $0, Cloud standard ~$35-2,700/mo, Cloud professional ~$500-5,000+/mo

### Performance
- Millisecond-level response times
- Lightning-fast QPS and TPS
- Enterprise V5.2 (Nov 2025): 100x faster path queries
- Native graph-vector-text hybrid retrieval
- Lightweight in-database compute engine

### Scalability
- Shared-nothing distributed architecture
- Linear scalability (add nodes without reconfiguration)
- Handles trillions of edges and hundreds of billions of vertices
- Separate scaling of storage and compute
- Only open-source graph DB claiming trillion-edge support

### Query Languages
- **nGQL:** NebulaGraph's native query language
- **openCypher** compatibility
- **ISO-GQL** (first cloud to support it, as of 2025)
- No SPARQL, no Gremlin

### Vendor Lock-in Concerns
- **LOW-MEDIUM**: Open-source core (Apache 2.0)
- nGQL is proprietary but openCypher/GQL provide standards-based alternatives
- Cloud service runs on AWS (single cloud provider currently)
- Enterprise features require commercial license
- Data can be exported via standard formats

### Limitations
- Smaller community than Neo4j
- nGQL has a learning curve (though openCypher helps)
- Cloud currently AWS-only
- Enterprise features (RBAC, backup, monitoring) require paid license
- Relatively young project compared to established alternatives
- Documentation quality varies
- Limited third-party ecosystem and tooling

### Sources
- https://www.nebula-graph.io/
- https://www.nebula-graph.io/docs/cloud/master/pricing/
- https://github.com/vesoft-inc/nebula
- https://www.g2.com/products/nebulagraph/reviews

---

## 10. HugeGraph (Apache Incubating)

### Overview
Apache incubating project: open-source graph database supporting 100+ billion data points with OLTP capabilities. Originally developed by Baidu. Java-based with pluggable storage backends.

### Pricing Model
- **Completely free and open-source** (Apache 2.0)
- Self-hosted only
- No managed cloud offering
- Cost is infrastructure only

### Performance
- High-speed import of billions of graph data
- Millisecond-level real-time queries
- Concurrent online queries for thousands of users
- Performance varies significantly by storage backend (RocksDB vs HBase vs MySQL)

### Scalability
- Horizontal scaling with distributed deployment
- Pluggable storage backends: RocksDB (single node), HBase (distributed), MySQL, Cassandra
- Can scale from standalone to PB-level clusters
- **Practical storage limit:** ~4 TB per instance recommended (as of Feb 2026 docs)

### Query Languages
- **Gremlin** (Apache TinkerPop compatible)
- **RESTful API** for CRUD operations
- No SPARQL, no openCypher, no GQL

### Vendor Lock-in Concerns
- **VERY LOW**: Apache-licensed open-source
- Gremlin is a standard graph query language
- Pluggable storage backends allow flexibility
- No commercial entity controlling the project

### Limitations
- Apache incubating status (not yet a top-level project)
- 4 TB practical storage limit per instance
- Documentation primarily in Chinese (English docs are improving)
- Small community outside of China
- Limited enterprise features
- No managed cloud offering
- Fewer graph algorithms than TigerGraph or Neo4j
- HBase backend adds operational complexity
- Limited visualization tools (HugeGraph-Studio is basic)

### Sources
- https://hugegraph.apache.org/
- https://github.com/apache/incubator-hugegraph
- https://hugegraph.apache.org/docs/introduction/readme/
- https://hugegraph.apache.org/docs/guides/architectural/

---

## Comparison Summary Table

| Database | Pricing Model | Est. Monthly Cost (Medium) | Performance Tier | Max Scale | Query Languages | Lock-in Risk | Best For |
|----------|--------------|---------------------------|-----------------|-----------|----------------|-------------|----------|
| **Amazon Neptune** | Pay-as-you-go / Serverless | $1,000-3,000 | High | 128 TiB, 15 replicas | Gremlin, openCypher, SPARQL | HIGH | AWS-native graph apps |
| **Azure Cosmos DB (Gremlin)** | RU-based provisioned/serverless | $500-2,000 | Medium | Unlimited (partitioned) | Gremlin (subset) | HIGH | Multi-model Azure apps |
| **Google Spanner (Graph)** | Node/PU-based | $2,000-5,000 | Medium-High | Unlimited (distributed) | GQL, SQL+Graph | VERY HIGH | Relational+graph hybrid |
| **TigerGraph** | Per-GB/month (Savanna) | $2,000-5,000 | Very High | 100+ TB | GSQL, openCypher, GQL | VERY HIGH | Deep link analytics |
| **GraphDB (Ontotext)** | Free / Enterprise license | $1,000-5,000 | Medium | Billions of triples | SPARQL | LOW-MEDIUM | Semantic/RDF knowledge graphs |
| **QLever** | Free (open-source) | Infra only | Very High | 1+ trillion triples | SPARQL | VERY LOW | Large-scale SPARQL |
| **Stardog** | Enterprise license | $2,000-10,000 | High | Trillion edges | SPARQL, GraphQL | MEDIUM | Enterprise knowledge fabric |
| **Blazegraph** | Free (open-source, abandoned) | Infra only | Low-Medium | 50B edges (theoretical) | SPARQL | VERY LOW | Legacy/Wikidata |
| **Virtuoso** | Free (OSS) / $499-200K/yr | $40-8,000 | High | 100+ TB | SPARQL, SQL | LOW | SQL+SPARQL hybrid |
| **NebulaGraph** | Free (OSS) / Cloud pay-as-you-go | $500-5,000 | Very High | Trillions of edges | nGQL, openCypher, GQL | LOW-MEDIUM | Massive-scale property graph |
| **HugeGraph** | Free (open-source) | Infra only | Medium | ~4 TB/instance | Gremlin | VERY LOW | Budget-friendly graph OLTP |

---

## Cost Analysis for Typical Workloads

### Small Workload (< 10M edges, 1-2 users, dev/test)
| Database | Est. Monthly Cost | Notes |
|----------|------------------|-------|
| Neptune Serverless | $100-400 | Minimum NCU cost applies |
| Cosmos DB Serverless | $50-200 | Free tier covers small usage |
| Spanner | $65-200 | Minimum PU cost |
| TigerGraph Free Trial | $0 | Limited to 300GB self-managed |
| GraphDB Free | $0 | Single write thread |
| QLever | $0 + infra | Self-managed only |
| Stardog Free | $0 + infra | Limited features |
| Blazegraph | $0 + infra | Abandoned, not recommended |
| Virtuoso OSS | $0 + infra | Self-managed |
| NebulaGraph OSS | $0 + infra | Self-managed |
| HugeGraph | $0 + infra | Self-managed |

### Medium Workload (100M-1B edges, 10-50 users, production)
| Database | Est. Monthly Cost | Notes |
|----------|------------------|-------|
| Neptune | $1,000-3,000 | r5.large + storage + I/O |
| Cosmos DB | $1,000-3,000 | 10K-50K RU/s provisioned |
| Spanner | $2,000-5,000 | 1-3 nodes Enterprise |
| TigerGraph Savanna | $2,000-5,000 | 50-100GB graph data |
| GraphDB Enterprise | $1,000-4,000 | Annual license amortized |
| Stardog Enterprise | $2,000-8,000 | Annual license amortized |
| Virtuoso Commercial | $500-2,500 | Annual license amortized |
| NebulaGraph Cloud | $500-2,700 | Standard plan |

### Large Workload (10B+ edges, 100+ users, mission-critical)
| Database | Est. Monthly Cost | Notes |
|----------|------------------|-------|
| Neptune | $10,000-30,000 | Multiple large instances + replicas |
| Cosmos DB | $10,000-50,000 | High RU/s, multi-region |
| Spanner | $15,000-50,000+ | Multiple nodes, multi-region |
| TigerGraph Business Critical | $10,000-50,000+ | Multi-zone HA |
| GraphDB Enterprise | $5,000-15,000+ | Cluster deployment |
| Stardog Enterprise | $8,000-25,000+ | Custom enterprise pricing |
| NebulaGraph Enterprise | $5,000-20,000+ | Distributed cluster |

---

## Strengths & Weaknesses Summary

### What They Do Well

- **Neptune:** Seamless AWS integration, multi-model (property graph + RDF), serverless scaling, managed operations
- **Cosmos DB:** Global distribution, multi-model flexibility, SLA-backed latency guarantees, Azure ecosystem
- **Spanner:** Strongest consistency guarantees (globally), relational+graph hybrid, unlimited scale
- **TigerGraph:** Fastest deep-link analytics, parallel graph processing, compression efficiency
- **GraphDB:** Best semantic reasoning/inference, W3C compliance, knowledge graph ontology support
- **QLever:** Fastest SPARQL engine, trillion-triple scale on commodity hardware, fully open-source
- **Stardog:** Virtual graph (no data copy), inference engine, enterprise knowledge fabric, data unification
- **Blazegraph:** (Historical) Wikidata-proven, open-source
- **Virtuoso:** SQL+SPARQL dual access, proven at scale (DBpedia), flexible open-source + commercial
- **NebulaGraph:** Best open-source distributed graph, trillion-edge scale, ISO-GQL first mover
- **HugeGraph:** Free, pluggable backends, Apache governance, good for moderate-scale OLTP

### Where They Fall Short

- **Neptune:** AWS lock-in, single writer bottleneck, no native viz, cannot scale to zero
- **Cosmos DB:** Not a native graph DB, incomplete Gremlin, expensive deep traversals, RU unpredictability
- **Spanner:** Extremely expensive for pure graph, immature graph features, GCP-only
- **TigerGraph:** GSQL lock-in, not open-source, opaque pricing, smaller ecosystem, company stability concerns
- **GraphDB:** RDF-only, opaque enterprise pricing, limited free tier, no property graph
- **QLever:** No managed service, no HA/clustering, memory-hungry, research-grade support
- **Stardog:** Opaque pricing, SPARQL-only, heavy platform, limited free tier
- **Blazegraph:** Abandoned since 2020, no security patches, performance issues at scale
- **Virtuoso:** Dated UI/tooling, documentation gaps, limited modern graph analytics
- **NebulaGraph:** Smaller community, AWS-only cloud, nGQL learning curve, young project
- **HugeGraph:** 4TB limit, Chinese-primary docs, small community outside China, basic tooling

---

## Key Recommendations

1. **For AWS-native workloads:** Amazon Neptune is the pragmatic choice despite lock-in
2. **For Azure-native workloads:** Cosmos DB works for shallow graph queries; consider Neptune on AWS for deep traversals
3. **For RDF/SPARQL workloads:** QLever (performance), GraphDB (reasoning), Virtuoso (SQL+SPARQL hybrid), or Stardog (enterprise knowledge fabric)
4. **For massive-scale property graph:** NebulaGraph (open-source) or TigerGraph (commercial, highest raw performance)
5. **For budget-conscious projects:** NebulaGraph OSS, Virtuoso OSS, or HugeGraph
6. **Avoid for new projects:** Blazegraph (abandoned)
7. **For hybrid relational+graph:** Google Spanner (if already on GCP) or Virtuoso

---

## Sources

### Amazon Neptune
- [Amazon Neptune Pricing](https://aws.amazon.com/neptune/pricing/)
- [Amazon Neptune Features](https://aws.amazon.com/neptune/features/)
- [Neptune Analytics vs Neptune Database](https://docs.aws.amazon.com/neptune-analytics/latest/userguide/neptune-analytics-vs-neptune-database.html)
- [Neptune Cost Optimization](https://aws.amazon.com/blogs/database/use-cases-and-best-practices-to-optimize-cost-and-performance-with-amazon-neptune-serverless/)

### Azure Cosmos DB
- [Cosmos DB Gremlin Limits](https://learn.microsoft.com/en-us/azure/cosmos-db/gremlin/limits)
- [Cosmos DB Pricing Model](https://learn.microsoft.com/en-us/azure/cosmos-db/how-pricing-works)
- [Cosmos DB Pricing Details](https://azure.microsoft.com/en-us/pricing/details/cosmos-db/autoscale-provisioned/)

### Google Cloud Spanner
- [Spanner Pricing](https://cloud.google.com/spanner/pricing)
- [Spanner Graph Overview](https://docs.google.com/spanner/docs/graph/overview)
- [Spanner in 2025](https://cloud.google.com/blog/products/databases/spanner-in-2025)
- [Spanner Graph Product Page](https://cloud.google.com/products/spanner/graph)

### TigerGraph
- [TigerGraph Pricing](https://www.tigergraph.com/pricing/)
- [TigerGraph Cloud Pricing](https://www.tigergraph.com/tigergraph-cloud-pricing/)
- [TigerGraph Savanna Pricing Docs](https://docs.tigergraph.com/savanna/main/overview/pricing)
- [TigerGraph Alternatives](https://www.puppygraph.com/blog/tigergraph-alternatives)

### GraphDB (Ontotext) / QLever
- [Ontotext GraphDB](https://www.ontotext.com/products/graphdb/)
- [GraphDB Benchmarks](https://graphdb.ontotext.com/documentation/11.2/benchmark.html)
- [QLever GitHub](https://github.com/ad-freiburg/qlever)
- [QLever Performance Evaluation](https://github.com/ad-freiburg/qlever/wiki/QLever-performance-evaluation-and-comparison-to-other-SPARQL-engines)
- [QLever Benchmarks](https://docs.qlever.dev/benchmarks/)

### Stardog
- [Stardog Pricing](https://www.stardog.com/pricing/)
- [Stardog Performance](https://www.stardog.com/platform/features/high-performance-graph-database/)
- [Stardog Trillion Edge Knowledge Graph](https://www.stardog.com/blog/trillion-edge-knowledge-graph/)
- [Stardog AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-ulfm6fel7xgjq)

### Blazegraph
- [Blazegraph GitHub](https://github.com/blazegraph/database)
- [Blazegraph Wikipedia](https://en.wikipedia.org/wiki/Blazegraph)
- [Wikidata Benchmarking Report](https://www.wikidata.org/wiki/Wikidata:Scaling_Wikidata/Benchmarking/Final_Report)

### Virtuoso
- [Virtuoso Universal Server](https://virtuoso.openlinksw.com/)
- [Virtuoso Pricing](https://virtuoso.openlinksw.com/pricing/)
- [Virtuoso Benchmarks](https://community.openlinksw.com/t/virtuoso-benchmarks-report/6040)
- [Virtuoso Open Source](https://github.com/openlink/virtuoso-opensource)

### NebulaGraph
- [NebulaGraph](https://www.nebula-graph.io/)
- [NebulaGraph Cloud Pricing](https://www.nebula-graph.io/docs/cloud/master/pricing/)
- [NebulaGraph GitHub](https://github.com/vesoft-inc/nebula)
- [NebulaGraph Cloud 2025](https://www.nebula-graph.io/cloud-2025)

### HugeGraph
- [Apache HugeGraph](https://hugegraph.apache.org/)
- [HugeGraph GitHub](https://github.com/apache/incubator-hugegraph)
- [HugeGraph Architecture](https://hugegraph.apache.org/docs/guides/architectural/)

### General Comparisons
- [Graph Databases & Query Languages in 2025](https://medium.com/@visrow/graph-databases-query-languages-in-2025-a-practical-guide-39cb7a767aed)
- [Top 10 Graph Database Platforms](https://www.cotocus.com/blog/top-10-graph-database-platforms-features-pros-cons-comparison/)
- [TigerGraph vs Neptune](https://www.puppygraph.com/blog/tigergraph-vs-neptune)
