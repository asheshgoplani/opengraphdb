#!/usr/bin/env python3
"""Reducer for the Tier-1 Neo4j-vs-OpenGraphDB harness.

Reads `<engine>-iter<N>.json` files from --results-dir, drops the first
--warmup-iters per engine, computes per-iter percentiles (p50/p95/p99,
nearest-rank), then aggregates across iters with **lower-median** (matches
crates/ogdb-eval/src/drivers/multi_iter.rs::median_aggregate). Bulk-ingest
nodes/sec is also lower-median across iters.

Emits two outputs:
  1. <results-dir>/summary.json — full numeric breakdown for both engines.
  2. <results-dir>/summary.md   — markdown table for BENCHMARKS.md §2.2.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "drivers"))
from common import percentile  # noqa: E402


def lower_median(values: list[float]) -> float:
    """statistics.median_low — picks the lower of the two centre values
    when len is even, never reports a value that didn't actually occur."""
    if not values:
        return 0.0
    return statistics.median_low(values)


def load_iters(results_dir: Path, engine: str) -> list[dict]:
    out: list[dict] = []
    for path in sorted(results_dir.glob(f"{engine}-iter*.json")):
        with open(path) as f:
            out.append(json.load(f))
    return out


def reduce_engine(iters: list[dict]) -> dict:
    """Compute per-iter percentiles, then lower-median across iters."""
    if not iters:
        return {}

    ingest_seconds = [r["ingest_seconds"] for r in iters]
    ingest_rate = [r["ingest_nodes_per_sec"] for r in iters]

    pr_p50 = [percentile(r["point_read_us"], 0.50) for r in iters]
    pr_p95 = [percentile(r["point_read_us"], 0.95) for r in iters]
    pr_p99 = [percentile(r["point_read_us"], 0.99) for r in iters]

    th_p50 = [percentile(r["two_hop_us"], 0.50) for r in iters]
    th_p95 = [percentile(r["two_hop_us"], 0.95) for r in iters]
    th_p99 = [percentile(r["two_hop_us"], 0.99) for r in iters]

    return {
        "iter_count": len(iters),
        "engine": iters[0]["engine"],
        "engine_version": iters[0]["engine_version"],
        "ingest_seconds_med": lower_median(ingest_seconds),
        "ingest_nodes_per_sec_med": lower_median(ingest_rate),
        "point_read_us": {
            "p50": lower_median(pr_p50),
            "p95": lower_median(pr_p95),
            "p99": lower_median(pr_p99),
            "per_iter_p50": pr_p50,
            "per_iter_p95": pr_p95,
            "per_iter_p99": pr_p99,
        },
        "two_hop_us": {
            "p50": lower_median(th_p50),
            "p95": lower_median(th_p95),
            "p99": lower_median(th_p99),
            "per_iter_p50": th_p50,
            "per_iter_p95": th_p95,
            "per_iter_p99": th_p99,
        },
    }


def verdict(ogdb: float, neo4j: float, *, lower_is_better: bool, eq_band: float = 0.10) -> str:
    """Within ±eq_band ratio = 🤝 TIE; otherwise ✅ WIN / ❌ LOSS for OpenGraphDB."""
    if neo4j <= 0 or ogdb <= 0:
        return "?"
    if lower_is_better:
        ratio = neo4j / ogdb  # >1 means ogdb is faster
    else:
        ratio = ogdb / neo4j  # >1 means ogdb is higher
    if ratio < 1.0 / (1.0 + eq_band):
        return "❌ LOSS"
    if ratio > 1.0 + eq_band:
        return "✅ WIN"
    return "🤝 TIE"


def fmt_us(v: float) -> str:
    if v >= 1000:
        return f"{v / 1000:.2f} ms"
    if v >= 100:
        return f"{v:.0f} μs"
    if v >= 10:
        return f"{v:.1f} μs"
    return f"{v:.2f} μs"


def fmt_rate(v: float) -> str:
    return f"{v:,.0f}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", required=True)
    parser.add_argument("--warmup-iters", type=int, default=1)
    args = parser.parse_args()

    results_dir = Path(args.results_dir)

    raw = {}
    summaries: dict[str, dict] = {}
    for engine in ("opengraphdb", "neo4j"):
        all_iters = load_iters(results_dir, engine)
        measured = all_iters[args.warmup_iters :]
        raw[engine] = {"all": all_iters, "measured": measured}
        summaries[engine] = reduce_engine(measured)

    summary_path = results_dir / "summary.json"
    with open(summary_path, "w") as f:
        json.dump(
            {
                "warmup_iters": args.warmup_iters,
                "summaries": summaries,
                "iter_counts": {k: len(v["all"]) for k, v in raw.items()},
            },
            f,
            indent=2,
        )
    print(f"wrote {summary_path}")

    o = summaries.get("opengraphdb", {})
    n = summaries.get("neo4j", {})
    if not o or not n:
        print("[warn] one or both engines have no measured iters; markdown table not emitted", file=sys.stderr)
        return 0

    md_lines = [
        f"| Metric | OpenGraphDB {o['engine_version']} | Neo4j {n['engine_version']} | Verdict |",
        "|---|---|---|---|",
        f"| Bulk ingest 10k+10k (nodes/s) | **{fmt_rate(o['ingest_nodes_per_sec_med'])}** | {fmt_rate(n['ingest_nodes_per_sec_med'])} | {verdict(o['ingest_nodes_per_sec_med'], n['ingest_nodes_per_sec_med'], lower_is_better=False)} |",
        f"| Point-read p50 | **{fmt_us(o['point_read_us']['p50'])}** | {fmt_us(n['point_read_us']['p50'])} | {verdict(o['point_read_us']['p50'], n['point_read_us']['p50'], lower_is_better=True)} |",
        f"| Point-read p95 | **{fmt_us(o['point_read_us']['p95'])}** | {fmt_us(n['point_read_us']['p95'])} | {verdict(o['point_read_us']['p95'], n['point_read_us']['p95'], lower_is_better=True)} |",
        f"| Point-read p99 | **{fmt_us(o['point_read_us']['p99'])}** | {fmt_us(n['point_read_us']['p99'])} | {verdict(o['point_read_us']['p99'], n['point_read_us']['p99'], lower_is_better=True)} |",
        f"| 2-hop p50      | **{fmt_us(o['two_hop_us']['p50'])}** | {fmt_us(n['two_hop_us']['p50'])} | {verdict(o['two_hop_us']['p50'], n['two_hop_us']['p50'], lower_is_better=True)} |",
        f"| 2-hop p95      | **{fmt_us(o['two_hop_us']['p95'])}** | {fmt_us(n['two_hop_us']['p95'])} | {verdict(o['two_hop_us']['p95'], n['two_hop_us']['p95'], lower_is_better=True)} |",
        f"| 2-hop p99      | **{fmt_us(o['two_hop_us']['p99'])}** | {fmt_us(n['two_hop_us']['p99'])} | {verdict(o['two_hop_us']['p99'], n['two_hop_us']['p99'], lower_is_better=True)} |",
    ]
    md_path = results_dir / "summary.md"
    with open(md_path, "w") as f:
        f.write("\n".join(md_lines) + "\n")
    print(f"wrote {md_path}")
    print()
    print("\n".join(md_lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
