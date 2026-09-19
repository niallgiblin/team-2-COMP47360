#!/usr/bin/env python3
"""Re-ranking benchmark — quality and latency for each re-ranking strategy.

Runs the benchmark queries through SearchService under whatever strategy the
environment selects, then reports retrieval quality and per-query latency:

    CROSS_ENCODER_ENABLED / JEV_RERANK_ENABLED / JEV_ENABLED

Usage:
    # no re-ranking
    CROSS_ENCODER_ENABLED=false JEV_RERANK_ENABLED=false \
        python3 scripts/rerank_bench.py --label none
    # cross-encoder
    CROSS_ENCODER_ENABLED=true JEV_RERANK_ENABLED=false \
        python3 scripts/rerank_bench.py --label cross-encoder
    # Jev
    JEV_ENABLED=true CROSS_ENCODER_ENABLED=false JEV_RERANK_ENABLED=true \
        python3 scripts/rerank_bench.py --label jev

    python3 scripts/rerank_bench.py --compare reports/rerank-none.json \
        reports/rerank-cross-encoder.json reports/rerank-jev.json
"""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
import time
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)

# Reuse the harness loaders/metrics.
sys.path.insert(0, str(_PROJECT_ROOT / "scripts"))
from run_eval import (  # noqa: E402
    _init_search_service,
    _load_benchmark,
    compute_hit_rate,
    compute_ndcg_at_k,
    compute_recall_at_k,
)


def _strategy(service) -> str:
    if getattr(service, "_jev_rerank", False):
        return "jev"
    if getattr(service, "_cross_encoder", None) is not None:
        return "cross-encoder"
    return "none"


def _benchmark(label: str, warmup: int, limit: int | None) -> dict:
    entries = _load_benchmark(_PROJECT_ROOT / "data" / "benchmark.jsonl")
    if limit:
        entries = entries[:limit]
    service = _init_search_service()

    # Warm-up (model/index/encoder caches).
    for entry in entries[:warmup]:
        query = entry.get("standalone_query") or entry["query"]
        try:
            service.search(query, limit=5)
        except Exception:
            pass

    latencies: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []
    hits: list[float] = []

    for entry in entries:
        query = entry.get("standalone_query") or entry["query"]
        expected = entry.get("expected_venue_ids", [])
        grades = entry.get("relevance_grades")
        t0 = time.perf_counter()
        try:
            results = service.search(query, limit=5)
        except Exception:
            results = []
        latencies.append((time.perf_counter() - t0) * 1000)
        retrieved = [int(r["id"]) for r in results]
        recalls.append(compute_recall_at_k(expected, retrieved, k=5))
        ndcgs.append(compute_ndcg_at_k(expected, retrieved, k=5, relevance_grades=grades))
        hits.append(compute_hit_rate(expected, retrieved, k=5))

    latencies.sort()

    def _pct(p):
        idx = min(len(latencies) - 1, int(round(p / 100 * (len(latencies) - 1))))
        return round(latencies[idx], 1)

    report = {
        "label": label,
        "strategy": _strategy(service),
        "queries": len(entries),
        "latency_ms": {
            "mean": round(statistics.mean(latencies), 1),
            "p50": _pct(50),
            "p95": _pct(95),
            "p99": _pct(99),
            "max": round(max(latencies), 1),
        },
        "quality": {
            "recall_at_5": round(statistics.mean(recalls), 4),
            "ndcg_at_5": round(statistics.mean(ndcgs), 4),
            "hit_rate": round(statistics.mean(hits), 4),
        },
    }
    return report


def _compare(paths: list[str]) -> None:
    reports = [json.loads(Path(p).read_text()) for p in paths]
    header = f"{'strategy':16} {'p50 ms':>8} {'p95 ms':>8} {'mean ms':>8} {'recall@5':>9} {'ndcg@5':>8} {'hit':>6}"
    print(header)
    print("-" * len(header))
    for r in reports:
        lat = r["latency_ms"]
        q = r["quality"]
        print(
            f"{r['label']:16} {lat['p50']:>8} {lat['p95']:>8} {lat['mean']:>8} "
            f"{q['recall_at_5']:>9} {q['ndcg_at_5']:>8} {q['hit_rate']:>6}"
        )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Re-ranking quality + latency benchmark")
    parser.add_argument("--label", default="run", help="Label for this configuration")
    parser.add_argument("--benchmark", default=None, help="(unused; uses data/benchmark.jsonl)")
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--report", default=None, help="Write JSON report here")
    parser.add_argument("--compare", nargs="+", default=None, help="Compare report JSONs")
    args = parser.parse_args(argv)

    if args.compare:
        _compare(args.compare)
        return 0

    report = _benchmark(args.label, args.warmup, args.limit)
    print(json.dumps(report, indent=2))
    if args.report:
        path = Path(args.report)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2))
        print(f"Report written to {path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
