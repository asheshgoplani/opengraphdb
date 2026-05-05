#!/usr/bin/env python3
"""OpenGraphDB driver for the Tier-1 Neo4j-comparison harness.

For one iteration:
  1. Wipe the bench DB sidecar files at --db-path.
  2. `ogdb init` a fresh database.
  3. Spawn `ogdb serve --http` against it.
  4. Bulk-load workload via POST /import (single transaction).
  5. Run N point-read Cypher queries; record per-query latency.
  6. Run N 2-hop Cypher queries; record per-query latency.
  7. Stop the server, dump JSON.

Cypher shape (apples-to-apples):
  point-read  -> MATCH (n:Bench {id:<id>}) RETURN n.id
  2-hop       -> MATCH (n:Bench)-[:LINK]->(x)-[:LINK]->(m) WHERE n.id=<id> RETURN m.id LIMIT 100

Variable-length [*2] is not used because OpenGraphDB 0.5.1 expands it to a
single edge; chaining produces the spec's intended 2-hop result shape.
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import json as _json
from pathlib import Path

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


def wipe_db(db_path: str) -> None:
    p = Path(db_path)
    parent = p.parent
    stem = p.name
    for f in parent.glob(f"{stem}*"):
        try:
            if f.is_dir():
                shutil.rmtree(f)
            else:
                f.unlink()
        except FileNotFoundError:
            pass


def wait_for_health(url: str, timeout_s: float = 20.0) -> None:
    deadline = time.monotonic() + timeout_s
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url + "/health", timeout=1.0) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, ConnectionResetError, socket.timeout) as e:
            last_err = e
            time.sleep(0.05)
    raise RuntimeError(f"ogdb server did not become healthy at {url}: {last_err}")


def http_post(url: str, body: dict) -> dict:
    payload = _json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120.0) as resp:
        return _json.loads(resp.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    add_common_args(parser)
    parser.add_argument("--binary", required=True, help="path to ogdb release binary")
    parser.add_argument("--port", type=int, default=18099)
    parser.add_argument("--db-path", required=True, help="path to bench database file")
    args = parser.parse_args()

    workload = Workload(n_nodes=args.n_nodes, n_queries=args.n_queries, seed=SEED)
    base_url = f"http://127.0.0.1:{args.port}"

    wipe_db(args.db_path)
    subprocess.run([args.binary, "init", args.db_path], check=True, stdout=subprocess.DEVNULL)

    server = subprocess.Popen(
        [args.binary, "serve", "--http", "--port", str(args.port), args.db_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    try:
        try:
            wait_for_health(base_url)
        except Exception:
            err = server.stderr.read().decode("utf-8", errors="replace") if server.stderr else ""
            raise RuntimeError(f"ogdb server failed to start: {err}")

        # ------- Ingest (single tx via POST /import) -------
        nodes = [
            {"id": i, "labels": [NODE_LABEL], "properties": {"id": i}}
            for i in range(workload.n_nodes)
        ]
        edges = [
            {"src": s, "dst": d, "type": EDGE_TYPE} for (s, d) in workload.edges()
        ]
        ingest_body = {"nodes": nodes, "edges": edges}
        t0 = time.perf_counter()
        result = http_post(base_url + "/import", ingest_body)
        ingest_seconds = time.perf_counter() - t0
        if result.get("status") != "ok":
            raise RuntimeError(f"ingest failed: {result}")

        # ------- Point read -------
        ids_pr = workload.random_ids(workload.n_queries)
        point_read_us: list[float] = []
        for nid in ids_pr:
            q = f"MATCH (n:{NODE_LABEL} {{id:{nid}}}) RETURN n.id"
            t0 = time.perf_counter()
            http_post(base_url + "/query", {"query": q})
            point_read_us.append((time.perf_counter() - t0) * 1e6)

        # ------- 2-hop -------
        ids_th = workload.two_hop_seed_ids(workload.n_queries)
        two_hop_us: list[float] = []
        for nid in ids_th:
            q = (
                f"MATCH (n:{NODE_LABEL})-[:{EDGE_TYPE}]->(x)-[:{EDGE_TYPE}]->(m) "
                f"WHERE n.id = {nid} RETURN m.id LIMIT {TWO_HOP_LIMIT}"
            )
            t0 = time.perf_counter()
            http_post(base_url + "/query", {"query": q})
            two_hop_us.append((time.perf_counter() - t0) * 1e6)

    finally:
        server.terminate()
        try:
            server.wait(timeout=5.0)
        except subprocess.TimeoutExpired:
            server.kill()

    write_result(
        args.out,
        engine="opengraphdb",
        engine_version=args.engine_version or "0.5.1",
        iter_idx=args.iter,
        workload=workload,
        ingest_seconds=ingest_seconds,
        point_read_us=point_read_us,
        two_hop_us=two_hop_us,
        extra={"port": args.port, "transport": "http+json"},
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
