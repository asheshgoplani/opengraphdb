"""Shared helpers for the Tier-1 Neo4j-vs-OpenGraphDB harness.

Workload spec (per documentation/.planning/neo4j-comparison/PLAN.md §3.1.1):
- 10 k nodes + 9 999 edges, single-tx ingest, deterministic seed.
- Point-read: 1 000 random node ids.
- 2-hop: 1 000 random seed ids; cap 100 results per seed.

The two engines do not share an `id(n)` semantics that returns the same
integer space, so both drivers key on a `Bench` label + property `id`
(integer, 0..n_nodes). This is the apples-to-apples shape: same Cypher
syntax, same predicate, same property cost on both engines. The chained
`(n:Bench)-[:LINK]->(x)-[:LINK]->(m)` form is used for 2-hop because
OpenGraphDB's variable-length `[*2]` matcher does not yet expand to two
edges in 0.5.1; chaining is identical in result-shape.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

# Match the shape of throughput::ingest_bulk in crates/ogdb-eval: a path graph
# 0 -> 1 -> 2 -> ... -> n-1 (so n nodes, n-1 edges). The 2-hop seed pool
# excludes the last two ids so every seed has a real 2-hop neighbour.
SEED = 0x0123456789ABCDEF
N_NODES_DEFAULT = 10_000
N_QUERIES_DEFAULT = 1_000
TWO_HOP_LIMIT = 100
EDGE_TYPE = "LINK"
NODE_LABEL = "Bench"


@dataclass(frozen=True)
class Workload:
    n_nodes: int
    n_queries: int
    seed: int

    def edges(self) -> Iterable[tuple[int, int]]:
        for i in range(self.n_nodes - 1):
            yield (i, i + 1)

    def random_ids(self, count: int) -> list[int]:
        rng = random.Random(self.seed ^ count ^ self.n_nodes)
        return [rng.randrange(self.n_nodes) for _ in range(count)]

    def two_hop_seed_ids(self, count: int) -> list[int]:
        # Need at least 2 forward edges from the seed; on a path graph that
        # means seed id <= n_nodes - 3.
        rng = random.Random(self.seed ^ 0xABCD ^ count ^ self.n_nodes)
        upper = max(1, self.n_nodes - 2)
        return [rng.randrange(upper) for _ in range(count)]


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--iter", type=int, required=True, help="iter index (0 = warmup, >=1 measured)")
    parser.add_argument("--n-nodes", type=int, default=N_NODES_DEFAULT)
    parser.add_argument("--n-queries", type=int, default=N_QUERIES_DEFAULT)
    parser.add_argument("--out", type=str, required=True, help="path to write JSON result")
    parser.add_argument("--engine-version", type=str, default="", help="engine version label (free-form)")


def write_result(
    out_path: str,
    *,
    engine: str,
    engine_version: str,
    iter_idx: int,
    workload: Workload,
    ingest_seconds: float,
    point_read_us: list[float],
    two_hop_us: list[float],
    extra: dict[str, object] | None = None,
) -> None:
    payload = {
        "engine": engine,
        "engine_version": engine_version,
        "iter": iter_idx,
        "workload": {
            "n_nodes": workload.n_nodes,
            "n_queries": workload.n_queries,
            "two_hop_limit": TWO_HOP_LIMIT,
            "seed": workload.seed,
            "shape": "path-graph(n_nodes-1 edges); MATCH (n:Bench {id:$id}); MATCH (n:Bench)-[:LINK]->(x)-[:LINK]->(m) WHERE n.id=$id LIMIT 100",
        },
        "ingest_seconds": ingest_seconds,
        "ingest_nodes_per_sec": (workload.n_nodes / ingest_seconds) if ingest_seconds > 0 else 0.0,
        "point_read_us": point_read_us,
        "two_hop_us": two_hop_us,
    }
    if extra:
        payload["extra"] = extra
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(payload, f)


def percentile(samples: list[float], q: float) -> float:
    """Nearest-rank percentile with a 1-based ceiling, matching
    crates/ogdb-eval/src/drivers/common.rs::percentiles_extended."""
    if not samples:
        return 0.0
    sorted_samples = sorted(samples)
    n = len(sorted_samples)
    idx = max(0, min(n - 1, int(-(-q * n // 1)) - 1))  # ceil(q*n) - 1
    return sorted_samples[idx]
