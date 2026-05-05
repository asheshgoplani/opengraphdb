| Metric | OpenGraphDB 0.5.1 | Neo4j neo4j:5-community | Verdict |
|---|---|---|---|
| Bulk ingest 10k+10k (nodes/s) | **263** | 6,102 | ❌ LOSS |
| Point-read p50 | **714 μs** | 2.54 ms | ✅ WIN |
| Point-read p95 | **20.53 ms** | 5.71 ms | ❌ LOSS |
| Point-read p99 | **31.21 ms** | 7.65 ms | ❌ LOSS |
| 2-hop p50      | **15.74 ms** | 3.83 ms | ❌ LOSS |
| 2-hop p95      | **25.34 ms** | 6.75 ms | ❌ LOSS |
| 2-hop p99      | **28.21 ms** | 8.77 ms | ❌ LOSS |
