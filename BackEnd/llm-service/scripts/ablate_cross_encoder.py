#!/usr/bin/env python3
"""Cross-encoder ablation — quality vs. latency trade-off measurement.

Runs every benchmark question through the retrieval pipeline twice:
  1. With cross-encoder re-ranking enabled
  2. With cross-encoder disabled (dense + BM25 + RRF only)

For each mode, measures per-query retrieval latency and computes:
  - Quality: Recall@5, NDCG@5, MRR, Precision@5, Hit Rate
  - Latency: P50, P95, P99, mean (milliseconds)

Produces a comparison table and optional JSON report.  Exits 0 regardless
of results — this is an analysis tool, not a quality gate.

Usage:
    python3 scripts/ablate_cross_encoder.py
    python3 scripts/ablate_cross_encoder.py --limit 10
    python3 scripts/ablate_cross_encoder.py --report reports/ablation.json
    python3 scripts/ablate_cross_encoder.py --metrics-only
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import statistics
import sys
import time
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("ablate_ce")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Cross-encoder ablation — quality vs. latency")
    p.add_argument(
        "--benchmark", default="data/benchmark.jsonl",
        help="Path to benchmark JSONL (default: data/benchmark.jsonl)",
    )
    p.add_argument("--report", default=None, help="Optional JSON report output path")
    p.add_argument(
        "--limit", type=int, default=None,
        help="Only process first N questions (for smoke testing)",
    )
    p.add_argument(
        "--metrics-only", action="store_true",
        help="Always exit 0 (skip threshold enforcement)",
    )
    return p.parse_args(argv)


# ---------------------------------------------------------------------------
# Benchmark loader
# ---------------------------------------------------------------------------


def _load_benchmark(path: Path) -> list[dict]:
    entries: list[dict] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            entries.append(json.loads(stripped))
    return entries


# ---------------------------------------------------------------------------
# Metric helpers
# ---------------------------------------------------------------------------


def recall_at_k(expected: list[int], retrieved: list[int], k: int = 5) -> float:
    if not expected:
        return 1.0
    return len(set(expected) & set(retrieved[:k])) / len(expected)


def ndcg_at_k(expected: list[int], retrieved: list[int], k: int = 5) -> float:
    if not expected:
        return 1.0
    eset = set(expected)
    dcg = sum(1.0 / math.log2(i + 2) for i, rid in enumerate(retrieved[:k]) if rid in eset)
    ideal = sum(1.0 / math.log2(i + 2) for i in range(min(len(eset), k)))
    return dcg / ideal if ideal > 0 else 1.0


def mrr(expected: list[int], retrieved: list[int]) -> float:
    if not expected:
        return 1.0
    eset = set(expected)
    for i, rid in enumerate(retrieved):
        if rid in eset:
            return 1.0 / (i + 1)
    return 0.0


def precision_at_k(expected: list[int], retrieved: list[int], k: int = 5) -> float:
    if not expected:
        return 1.0
    return len(set(expected) & set(retrieved[:k])) / k


def hit_rate(expected: list[int], retrieved: list[int], k: int = 5) -> float:
    if not expected:
        return 1.0
    return 1.0 if set(expected) & set(retrieved[:k]) else 0.0


# ---------------------------------------------------------------------------
# Search service init
# ---------------------------------------------------------------------------


def _init_search_service():
    import numpy as np
    import pandas as pd
    from sentence_transformers import SentenceTransformer

    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))

    from config import DATA_PATH, EMBEDDINGS_PATH, MODEL_PATH
    from search_service import SearchService

    logger.info("Loading model from %s", MODEL_PATH)
    model = SentenceTransformer(MODEL_PATH, device="cpu")

    logger.info("Loading data from %s", DATA_PATH)
    df = pd.read_csv(DATA_PATH)

    logger.info("Loading embeddings from %s", EMBEDDINGS_PATH)
    embeddings = np.load(EMBEDDINGS_PATH)

    logger.info("Building SearchService")
    svc = SearchService.from_startup(df=df, embeddings=embeddings, encoder=model)
    logger.info("Ready — index_source=%s", svc._index_source)
    return svc


# ---------------------------------------------------------------------------
# Run ablation
# ---------------------------------------------------------------------------


_METRIC_FNS = [
    ("Recall@5", recall_at_k),
    ("NDCG@5", ndcg_at_k),
    ("MRR", mrr),
    ("Precision@5", precision_at_k),
    ("Hit Rate", hit_rate),
]


def _run_pass(
    entries: list[dict],
    svc,
    label: str,
    cross_encoder_enabled: bool,
) -> dict:
    """Run one ablation pass and return aggregated results."""
    saved_ce = getattr(svc, "_cross_encoder", None)
    if cross_encoder_enabled:
        if saved_ce is None:
            logger.warning(
                "%s: cross-encoder is None — this pass will be identical to disabled",
                label,
            )
    else:
        svc._cross_encoder = None

    try:
        per_query: list[dict] = []
        latencies: list[float] = []
        cat_stats: dict[str, dict] = {}

        for entry in entries:
            qid = entry["id"]
            cat = entry["category"]
            query = entry["query"]
            expected = entry.get("expected_venue_ids", [])
            filters = entry.get("filters") or {}
            loc_filter = filters.get("location")
            price_filter = filters.get("price_range")

            t0 = time.perf_counter()
            try:
                results = svc.search(
                    query, limit=5,
                    location_filter=loc_filter,
                    price_range=price_filter,
                )
            except Exception:
                logger.exception("Search failed for %s", qid)
                results = []
            elapsed_ms = (time.perf_counter() - t0) * 1000
            latencies.append(elapsed_ms)

            retrieved = [int(r["id"]) for r in results]

            qr = {
                "id": qid,
                "category": cat,
                "query": query,
                "expected_ids": expected,
                "retrieved_ids": retrieved,
                "latency_ms": round(elapsed_ms, 3),
            }
            for mname, mfn in _METRIC_FNS:
                qr[mname.lower().replace("@", "_at_").replace(" ", "_")] = round(
                    mfn(expected, retrieved), 4
                )
            per_query.append(qr)

            if cat not in cat_stats:
                cat_stats[cat] = {
                    "total": 0,
                    **{mname.lower().replace("@", "_at_").replace(" ", "_") + "_sum": 0.0
                       for mname, _ in _METRIC_FNS},
                }
            cat_stats[cat]["total"] += 1
            for mname, mfn in _METRIC_FNS:
                ikey = mname.lower().replace("@", "_at_").replace(" ", "_")
                sum_key = ikey + "_sum"
                cat_stats[cat][sum_key] += qr[ikey]

        # Compute percentiles
        sorted_lat = sorted(latencies)
        n = len(sorted_lat)

        def _pct(p: float) -> float:
            idx = int(math.ceil(p / 100.0 * n)) - 1
            return round(sorted_lat[max(0, min(idx, n - 1))], 2)

        # Per-category aggregates
        cat_aggs = {}
        for cat, stats in cat_stats.items():
            t = stats["total"]
            cat_aggs[cat] = {"total": t}
            for mname, _ in _METRIC_FNS:
                skey = mname.lower().replace("@", "_at_").replace(" ", "_") + "_sum"
                cat_aggs[cat][skey.replace("_sum", "")] = round(stats[skey] / t, 4) if t else 0.0

        # Aggregate (non-abstention)
        non_abst = [s for c, s in cat_stats.items() if c != "abstention"]
        agg_total = sum(s["total"] for s in non_abst)
        aggregates = {}
        for mname, _ in _METRIC_FNS:
            skey = mname.lower().replace("@", "_at_").replace(" ", "_") + "_sum"
            agg_sum = sum(s[skey] for s in non_abst)
            aggregates[skey.replace("_sum", "")] = round(agg_sum / agg_total, 4) if agg_total else 0.0

        return {
            "label": label,
            "cross_encoder_enabled": cross_encoder_enabled,
            "num_queries": len(entries),
            "latency": {
                "p50_ms": _pct(50),
                "p95_ms": _pct(95),
                "p99_ms": _pct(99),
                "mean_ms": round(statistics.mean(latencies), 2) if latencies else 0.0,
                "min_ms": round(min(latencies), 2) if latencies else 0.0,
                "max_ms": round(max(latencies), 2) if latencies else 0.0,
            },
            "quality_aggregates": aggregates,
            "quality_by_category": cat_aggs,
            "per_query": per_query,
        }
    finally:
        svc._cross_encoder = saved_ce


# ---------------------------------------------------------------------------
# Report printing
# ---------------------------------------------------------------------------


def _print_report(with_ce: dict, without_ce: dict):
    """Print a formatted comparison table."""
    wq = with_ce["quality_aggregates"]
    woq = without_ce["quality_aggregates"]
    wl = with_ce["latency"]
    wol = without_ce["latency"]

    print("\n" + "=" * 80)
    print("CROSS-ENCODER ABLATION REPORT")
    print("=" * 80)

    # Quality comparison
    print(f"\n--- Retrieval Quality ({with_ce['num_queries']} questions) ---")
    print(f"  {'Metric':<14} {'Without CE':>12} {'With CE':>12} {'Delta':>12}")
    print(f"  {'─' * 14} {'─' * 12} {'─' * 12} {'─' * 12}")
    for mname, _ in _METRIC_FNS:
        key = mname.lower().replace("@", "_at_").replace(" ", "_")
        w = wq.get(key, 0)
        wo = woq.get(key, 0)
        delta = w - wo
        sign = "+" if delta > 0 else ""
        print(f"  {mname:<14} {wo:>12.4f} {w:>12.4f} {sign}{delta:>11.4f}")

    # Latency comparison
    print(f"\n--- Latency (ms) ---")
    print(f"  {'Percentile':<14} {'Without CE':>12} {'With CE':>12} {'Delta':>12}")
    print(f"  {'─' * 14} {'─' * 12} {'─' * 12} {'─' * 12}")
    for pct in ["p50_ms", "p95_ms", "p99_ms", "mean_ms"]:
        label = pct.replace("_ms", "").upper()
        w = wl[pct]
        wo = wol[pct]
        delta = w - wo
        sign = "+" if delta > 0 else ""
        print(f"  {label:<14} {wo:>11.2f}ms {w:>11.2f}ms {sign}{delta:>10.2f}ms")

    # Summary verdict
    w_ce_note = ""
    if with_ce["cross_encoder_enabled"] and getattr(
        with_ce, "_ce_was_none", False
    ):
        w_ce_note = " (cross-encoder was None — passes are identical)"

    print(f"\n--- Summary ---")
    print(f"  With CE pass:    cross_encoder_enabled={with_ce['cross_encoder_enabled']}{w_ce_note}")
    print(f"  Without CE pass: cross_encoder_enabled={without_ce['cross_encoder_enabled']}")
    print(f"  Total queries:   {with_ce['num_queries']}")

    # Per-category breakdown
    print(f"\n--- Per-Category Quality ---")
    all_cats = sorted(
        set(with_ce["quality_by_category"]) | set(without_ce["quality_by_category"])
    )
    for cat in all_cats:
        wc = with_ce["quality_by_category"].get(cat, {})
        woc = without_ce["quality_by_category"].get(cat, {})
        print(f"\n  {cat} ({wc.get('total', woc.get('total', 0))} questions):")
        print(f"    {'Metric':<14} {'Without CE':>10} {'With CE':>10} {'Delta':>10}")
        print(f"    {'─' * 14} {'─' * 10} {'─' * 10} {'─' * 10}")
        for mname, _ in _METRIC_FNS:
            key = mname.lower().replace("@", "_at_").replace(" ", "_")
            w = wc.get(key, 0) or 0
            wo = woc.get(key, 0) or 0
            delta = w - wo
            sign = "+" if delta > 0 else ""
            print(f"    {mname:<14} {wo:>10.4f} {w:>10.4f} {sign}{delta:>9.4f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    bpath = _PROJECT_ROOT / args.benchmark
    if not bpath.is_file():
        print(f"ERROR: benchmark not found: {bpath}", file=sys.stderr)
        sys.exit(2)

    entries = _load_benchmark(bpath)
    if args.limit:
        entries = entries[:args.limit]
    logger.info("Loaded %d benchmark questions", len(entries))

    svc = _init_search_service()

    # Report CE status
    ce_available = getattr(svc, "_cross_encoder", None) is not None
    logger.info("Cross-encoder available: %s", ce_available)
    print(f"Cross-encoder available: {ce_available}")

    # ---- With CE ----
    logger.info("Running WITH cross-encoder pass...")
    t0 = time.time()
    with_ce = _run_pass(entries, svc, "with_ce", cross_encoder_enabled=True)
    logger.info(
        "With CE pass done in %.1fs — P50=%.1fms P95=%.1fms P99=%.1fms",
        time.time() - t0,
        with_ce["latency"]["p50_ms"],
        with_ce["latency"]["p95_ms"],
        with_ce["latency"]["p99_ms"],
    )

    # ---- Without CE ----
    logger.info("Running WITHOUT cross-encoder pass...")
    t0 = time.time()
    without_ce = _run_pass(entries, svc, "without_ce", cross_encoder_enabled=False)
    logger.info(
        "Without CE pass done in %.1fs — P50=%.1fms P95=%.1fms P99=%.1fms",
        time.time() - t0,
        without_ce["latency"]["p50_ms"],
        without_ce["latency"]["p95_ms"],
        without_ce["latency"]["p99_ms"],
    )

    # ---- Print ----
    _print_report(with_ce, without_ce)

    # ---- JSON report ----
    if args.report:
        rpath = (_PROJECT_ROOT / args.report).resolve()
        rpath.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "benchmark_path": str(bpath),
            "cross_encoder_available": ce_available,
            "num_queries": len(entries),
            "with_ce": {
                k: v for k, v in with_ce.items() if k != "per_query"
            },
            "without_ce": {
                k: v for k, v in without_ce.items() if k != "per_query"
            },
            "deltas": {
                "quality": {
                    key: round(
                        with_ce["quality_aggregates"].get(key, 0)
                        - without_ce["quality_aggregates"].get(key, 0),
                        4,
                    )
                    for key in with_ce["quality_aggregates"]
                },
                "latency": {
                    key: round(
                        with_ce["latency"][key] - without_ce["latency"][key], 2
                    )
                    for key in with_ce["latency"]
                },
            },
        }
        with open(rpath, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        print(f"\nReport written to {rpath}")

    if args.metrics_only:
        sys.exit(0)
    sys.exit(0)


if __name__ == "__main__":
    main()
