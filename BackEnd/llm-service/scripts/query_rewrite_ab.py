#!/usr/bin/env python3
"""Query-resolution A/B — HF rewrite vs Jev composition.

Compares retrieval quality for the ways the chat path can build its search
query:

    raw            the benchmark query, unchanged
    expand         static expand_query() only
    hf_rewrite     expand_query(rewrite_query(query))   (previous default)
    jev_compose    expand_query(compose_search_query(query, analyze_query()))

Usage:
    export TYPESAFE_API_KEY=ts_... HF_TOKEN=hf_...
    JEV_ENABLED=true PYTHONPATH=. python3 scripts/query_rewrite_ab.py \
        --report reports/query-rewrite-ab.json
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
sys.path.insert(0, str(_PROJECT_ROOT / "scripts"))

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)

from run_eval import (  # noqa: E402
    _init_search_service,
    _load_benchmark,
    compute_hit_rate,
    compute_ndcg_at_k,
    compute_recall_at_k,
)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Query-resolution A/B")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--report", default=None)
    args = parser.parse_args(argv)

    from chat_service import (
        _ACTIVITY_PATTERNS,
        _load_known_zones,
        compose_search_query,
    )
    from jev_service import analyze_query
    from query_expander import expand_query
    from query_rewriter import rewrite_query

    entries = _load_benchmark(_PROJECT_ROOT / "data" / "benchmark.jsonl")
    if args.limit:
        entries = entries[: args.limit]
    service = _init_search_service()
    zones = _load_known_zones()
    categories = list(_ACTIVITY_PATTERNS.keys())

    modes = ("raw", "expand", "jev_full", "jev_fallback")
    metrics = {m: {"recall": [], "ndcg": [], "hit": [], "ms": []} for m in modes}

    for i, entry in enumerate(entries, 1):
        query = entry.get("standalone_query") or entry["query"]
        expected = entry.get("expected_venue_ids", [])
        grades = entry.get("relevance_grades")

        started = time.perf_counter()
        analysis = analyze_query(
            query, zones=zones, categories=categories, enabled=True,
        )
        analyses_ms = (time.perf_counter() - started) * 1000

        t0 = time.perf_counter()
        try:
            hf_query = rewrite_query(query) or query  # noqa: F841 (kept for legacy comparison)
        except Exception:
            hf_query = query
        hf_ms = (time.perf_counter() - t0) * 1000  # noqa: F841

        composed = compose_search_query(query, analysis) if analysis else query
        expanded_raw = expand_query(query) or query
        # Use Jev terms only when the static map found nothing to add.
        fallback = (
            expanded_raw if expanded_raw != (query or "")
            else (expand_query(composed) or composed)
        )

        resolved = {
            "raw": (query, 0.0),
            "expand": (expanded_raw, 0.0),
            "jev_full": (expand_query(composed) or composed, analyses_ms),
            "jev_fallback": (fallback, analyses_ms),
        }

        for mode in modes:
            search_query, resolution_ms = resolved[mode]
            t0 = time.perf_counter()
            try:
                results = service.search(search_query, limit=5)
            except Exception:
                results = []
            elapsed = (time.perf_counter() - t0) * 1000 + resolution_ms
            retrieved = [int(r["id"]) for r in results]
            metrics[mode]["recall"].append(compute_recall_at_k(expected, retrieved, k=5))
            metrics[mode]["ndcg"].append(compute_ndcg_at_k(expected, retrieved, k=5, relevance_grades=grades))
            metrics[mode]["hit"].append(compute_hit_rate(expected, retrieved, k=5))
            metrics[mode]["ms"].append(elapsed)

        if i % 10 == 0:
            logging.warning("  %d/%d", i, len(entries))

    report = {"n": len(entries), "modes": {}}
    for mode in modes:
        m = metrics[mode]
        report["modes"][mode] = {
            "recall_at_5": round(statistics.mean(m["recall"]), 4),
            "ndcg_at_5": round(statistics.mean(m["ndcg"]), 4),
            "hit_rate": round(statistics.mean(m["hit"]), 4),
            "mean_query_ms": round(statistics.mean(m["ms"]), 1),
        }

    header = f"{'mode':14} {'recall@5':>9} {'ndcg@5':>8} {'hit':>6} {'query ms':>9}"
    print(header)
    print("-" * len(header))
    for mode in modes:
        r = report["modes"][mode]
        print(f"{mode:14} {r['recall_at_5']:>9} {r['ndcg_at_5']:>8} {r['hit_rate']:>6} {r['mean_query_ms']:>9}")

    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(json.dumps(report, indent=2))
        print(f"Report written to {args.report}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
