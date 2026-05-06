#!/usr/bin/env python3
"""Neo4j driver for the Tier-1 OpenGraphDB-comparison harness.

Talks to a running Neo4j 5.x Community container over Bolt v5
(`neo4j://127.0.0.1:7687`). The harness is responsible for the container
lifecycle (start, drop_caches, stop) — this driver assumes the bolt port is
ready and the database is empty.

Per-iter steps:
  1. MATCH (n) DETACH DELETE n  (in case the previous iter left state).
  2. CREATE INDEX FOR (n:Bench) ON (n.id) IF NOT EXISTS — fair predicate-side
     index, since OpenGraphDB treats the {id:_} property-pattern as an indexed
     lookup via its label catalog.
  3. UNWIND $rows AS row CREATE (n:Bench {id: row.id})  (batched, one tx).
  4. UNWIND $rows AS row MATCH (a:Bench {id: row.src}), (b:Bench {id: row.dst})
        CREATE (a)-[:LINK]->(b)  (batched, one tx).
  5. Point reads: MATCH (n:Bench {id: $id}) RETURN n.id  (one Cypher per id).
  6. 2-hop: MATCH (n:Bench)-[:LINK]->(x)-[:LINK]->(m) WHERE n.id=$id RETURN m.id LIMIT 100.

The CREATE-edge step is split out from CREATE-node because Neo4j's
batched-CREATE shape with both labels and edges in one statement is finicky;
two passes is a fair, common-sense apples-to-apples encoding of "single-tx
ingest" (both passes run as one explicit transaction).
"""

from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    EDGE_TYPE,
    NODE_LABEL,
    SEED,
    TWO_HOP_LIMIT,
    Workload,
    add_common_args,
    write_result,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    add_common_args(parser)
    parser.add_argument("--bolt-uri", default="neo4j://127.0.0.1:7687")
    parser.add_argument("--user", default="neo4j")
    parser.add_argument("--password", default=None, help="None disables auth (NEO4J_AUTH=none)")
    parser.add_argument("--batch-size", type=int, default=1000)
    args = parser.parse_args()

    # Avoid module-name collision: this file is `neo4j.py`, but the installed
    # PyPI package is also `neo4j`. Strip our own directory from sys.path
    # before importing the third-party driver.
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path[:] = [p for p in sys.path if os.path.abspath(p) != here]
    sys.modules.pop("neo4j", None)
    try:
        from neo4j import GraphDatabase
    except ImportError as e:
        print(f"neo4j-driver not installed: {e}", file=sys.stderr)
        return 2

    workload = Workload(n_nodes=args.n_nodes, n_queries=args.n_queries, seed=SEED)
    auth = None if args.password is None else (args.user, args.password)

    driver = GraphDatabase.driver(args.bolt_uri, auth=auth)
    try:
        with driver.session(database="neo4j") as sess:
            # Reset
            sess.run("MATCH (n) DETACH DELETE n").consume()
            try:
                sess.run("DROP INDEX bench_id IF EXISTS").consume()
            except Exception:
                pass
            sess.run("CREATE INDEX bench_id IF NOT EXISTS FOR (n:Bench) ON (n.id)").consume()
            sess.run("CALL db.awaitIndexes(60)").consume()

            # ---- Ingest (single explicit transaction) ----
            ingest_t0 = time.perf_counter()
            with sess.begin_transaction() as tx:
                # Nodes
                node_rows = [{"id": i} for i in range(workload.n_nodes)]
                for start in range(0, len(node_rows), args.batch_size):
                    chunk = node_rows[start : start + args.batch_size]
                    tx.run(
                        f"UNWIND $rows AS row CREATE (n:{NODE_LABEL} {{id: row.id}})",
                        rows=chunk,
                    )
                # Edges (path graph 0 -> 1 -> ... -> n-1)
                edge_rows = [{"s": s, "d": d} for (s, d) in workload.edges()]
                for start in range(0, len(edge_rows), args.batch_size):
                    chunk = edge_rows[start : start + args.batch_size]
                    tx.run(
                        f"UNWIND $rows AS row "
                        f"MATCH (a:{NODE_LABEL} {{id: row.s}}), (b:{NODE_LABEL} {{id: row.d}}) "
                        f"CREATE (a)-[:{EDGE_TYPE}]->(b)",
                        rows=chunk,
                    )
                tx.commit()
            ingest_seconds = time.perf_counter() - ingest_t0

            # ---- Point reads ----
            ids_pr = workload.random_ids(workload.n_queries)
            point_read_us: list[float] = []
            for nid in ids_pr:
                t0 = time.perf_counter()
                sess.run(
                    f"MATCH (n:{NODE_LABEL} {{id: $id}}) RETURN n.id", id=nid
                ).consume()
                point_read_us.append((time.perf_counter() - t0) * 1e6)

            # ---- 2-hop ----
            ids_th = workload.two_hop_seed_ids(workload.n_queries)
            two_hop_us: list[float] = []
            for nid in ids_th:
                t0 = time.perf_counter()
                sess.run(
                    f"MATCH (n:{NODE_LABEL})-[:{EDGE_TYPE}]->(x)-[:{EDGE_TYPE}]->(m) "
                    f"WHERE n.id = $id RETURN m.id LIMIT $lim",
                    id=nid,
                    lim=TWO_HOP_LIMIT,
                ).consume()
                two_hop_us.append((time.perf_counter() - t0) * 1e6)
    finally:
        driver.close()

    write_result(
        args.out,
        engine="neo4j",
        engine_version=args.engine_version or "5-community",
        iter_idx=args.iter,
        workload=workload,
        ingest_seconds=ingest_seconds,
        point_read_us=point_read_us,
        two_hop_us=two_hop_us,
        extra={"bolt_uri": args.bolt_uri, "transport": "bolt-v5"},
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
