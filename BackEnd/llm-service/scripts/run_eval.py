#!/usr/bin/env python3
"""RAG evaluation runner — automated recall@5 and citation-accuracy measurement.

Loads a benchmark JSONL, executes every question through SearchService
against the live (or .npy-fallback) FAISS index, prints a structured report
to stdout, and exits 0 (all thresholds met) or 1 (any threshold breach).

Usage:
    python3 scripts/run_eval.py
    python3 scripts/run_eval.py --threshold-recall 0.50 --report reports/eval.json
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from pathlib import Path

# -- project root -------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Heavy imports are lazy — see _init_search_service().  This keeps the
# pure helpers importable from tests that don't have pandas / numpy /
# sentence-transformers available.
#   import numpy as np          — inside _init_search_service()
#   import pandas as pd         — inside _init_search_service()
#   from sentence_transformers import SentenceTransformer  — inside _init_search_service()
#   from config import ...      — inside _init_search_service()
#   from chat_service import ... — already used by check_citation_accuracy
#   from search_service import ... — inside _init_search_service()


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("run_eval")

# ---------------------------------------------------------------------------
# CLI helpers (zero external deps)
# ---------------------------------------------------------------------------


def _resolve_path(raw: str, fallback_root: Path) -> Path:
    p = Path(raw)
    if not p.is_absolute():
        p = fallback_root / p
    return p.resolve()


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="RAG eval runner — recall@5 + citation accuracy"
    )
    parser.add_argument(
        "--benchmark",
        default="data/benchmark.jsonl",
        help="Path to benchmark JSONL (default: data/benchmark.jsonl)",
    )
    parser.add_argument(
        "--threshold-recall",
        type=float,
        default=0.60,
        help="Recall@5 threshold for non-abstention categories (default: 0.60)",
    )
    parser.add_argument(
        "--threshold-abstention",
        type=float,
        default=0.70,
        help="Abstention pass-rate threshold (default: 0.70)",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Optional JSON report output path",
    )
    parser.add_argument(
        "--baseline",
        action="store_true",
        help="Run dense-only baseline pass and print comparison table",
    )
    parser.add_argument(
        "--metrics-only",
        action="store_true",
        help="Print metrics but always exit 0 (skip threshold enforcement)",
    )
    return parser.parse_args(argv)


# ---------------------------------------------------------------------------
# Pure helpers (zero external deps beyond stdlib + chat_service)
# ---------------------------------------------------------------------------


def compute_recall_at_k(expected_ids: list[int], retrieved_ids: list[int], k: int = 5) -> float:
    """Return recall@k = |expected_ids ∩ retrieved_ids[:k]| / |expected_ids|.

    When *expected_ids* is empty the function returns 1.0 (perfect recall by
    definition — there are no expectations to miss).
    """
    if not expected_ids:
        return 1.0
    top_k = set(retrieved_ids[:k])
    expected = set(expected_ids)
    return len(expected & top_k) / len(expected)


def compute_ndcg_at_k(expected_ids: list[int], retrieved_ids: list[int], k: int = 5) -> float:
    """Return NDCG@k with binary relevance (rel=1 if doc in expected, else 0).

    DCG  = Σᵢ relᵢ / log₂(i+2)  for i = 0 .. k-1.
    IDCG = ideal DCG (all relevant docs ranked first).

    When *expected_ids* is empty or IDCG = 0 the function returns 1.0.
    """
    if not expected_ids:
        return 1.0
    expected_set = set(expected_ids)
    top_k = retrieved_ids[:k]

    dcg = 0.0
    for i, doc_id in enumerate(top_k):
        if doc_id in expected_set:
            dcg += 1.0 / math.log2(i + 2)  # i+2 = position+1

    num_rel = min(len(expected_set), k)
    idcg = 0.0
    for i in range(num_rel):
        idcg += 1.0 / math.log2(i + 2)

    if idcg == 0.0:
        return 1.0
    return dcg / idcg


def compute_mrr(expected_ids: list[int], retrieved_ids: list[int]) -> float:
    """Return MRR = 1 / rank of the first relevant result.

    Returns 1.0 when *expected_ids* is empty (no expectations).
    Returns 0.0 when no relevant result is found in *retrieved_ids*.
    """
    if not expected_ids:
        return 1.0
    expected_set = set(expected_ids)
    for i, doc_id in enumerate(retrieved_ids):
        if doc_id in expected_set:
            return 1.0 / (i + 1)
    return 0.0


def compute_precision_at_k(expected_ids: list[int], retrieved_ids: list[int], k: int = 5) -> float:
    """Return precision@k = |expected_ids ∩ retrieved_ids[:k]| / k.

    When *expected_ids* is empty the function returns 1.0 (no expectations
    to miss).
    """
    if not expected_ids:
        return 1.0
    expected_set = set(expected_ids)
    top_k = set(retrieved_ids[:k])
    return len(expected_set & top_k) / k


def compute_hit_rate(expected_ids: list[int], retrieved_ids: list[int], k: int = 5) -> float:
    """Return 1.0 if any relevant doc appears in the top-k, else 0.0.

    When *expected_ids* is empty the function returns 1.0 (no expectations).
    """
    if not expected_ids:
        return 1.0
    expected_set = set(expected_ids)
    top_k = set(retrieved_ids[:k])
    return 1.0 if expected_set & top_k else 0.0


def check_citation_accuracy(results: list[dict]) -> tuple[bool, str]:
    """Verify that ``format_retrieval_context`` produces well-formed citations.

    Each citation must have a non-empty ``venue_id``, ``name``, and ``snippet``,
    and ``venue_id`` / ``name`` must be traceable back to the input results.

    Returns
    -------
    (pass: bool, detail: str)
    """
    # Empty results → empty citations is valid (short-circuit before heavy import).
    if not results:
        return (True, "no results, no citations")

    # Lazy import to keep this function importable without heavy deps.
    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))
    try:
        from chat_service import format_retrieval_context  # noqa: E402
    except ImportError as exc:
        return (False, f"chat_service unavailable: {exc}")

    _, citations = format_retrieval_context(results)

    if not citations:
        return (False, "citations absent for non-empty results")

    result_ids: set[int] = {int(r["id"]) for r in results}
    result_names: set[str] = {r["name"] for r in results}

    issues: list[str] = []
    for i, c in enumerate(citations):
        vid = c.get("venue_id")
        name = str(c.get("name", ""))
        snippet = str(c.get("snippet", ""))

        if vid is None or vid == 0:
            issues.append(f"citation {i}: missing/zero venue_id")
        elif int(vid) not in result_ids:
            issues.append(f"citation {i}: venue_id={vid} not in result IDs {sorted(result_ids)}")

        if not name:
            issues.append(f"citation {i}: empty name")
        elif name not in result_names:
            issues.append(f"citation {i}: name '{name}' not in result names")

        if not snippet:
            issues.append(f"citation {i}: empty snippet")

    if issues:
        return (False, "; ".join(issues))
    return (True, "all citations valid")


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
# Lazy initialisation (pandas, numpy, sentence-transformers, search_service)
# ---------------------------------------------------------------------------


def _init_search_service():
    """Create a SearchService the same way the Flask app does.

    All heavy imports are kept inside this function so the pure helpers
    above remain importable without pandas / numpy / torch / faiss.
    """
    import numpy as np  # noqa: E402
    import pandas as pd  # noqa: E402
    from sentence_transformers import SentenceTransformer  # noqa: E402

    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))

    from config import DATA_PATH, EMBEDDINGS_PATH, MODEL_PATH, INDEX_PATH  # noqa: E402
    from search_service import SearchService  # noqa: E402

    logger.info("Loading sentence-transformer model from %s", MODEL_PATH)
    model = SentenceTransformer(MODEL_PATH, device="cpu")

    logger.info("Loading venue data from %s", DATA_PATH)
    df = pd.read_csv(DATA_PATH)
    logger.info("  %d locations", len(df))

    logger.info("Loading pre-computed embeddings from %s", EMBEDDINGS_PATH)
    embeddings = np.load(EMBEDDINGS_PATH)
    logger.info("  shape %s", embeddings.shape)

    logger.info("Building SearchService (index_path=%s)", INDEX_PATH)
    service = SearchService.from_startup(
        df=df,
        embeddings=embeddings,
        encoder=model,
    )
    logger.info("SearchService ready — index_source=%s", service._index_source)
    return service


# ---------------------------------------------------------------------------
# Eval runner
# ---------------------------------------------------------------------------


def _run_question(
    entry: dict,
    search_service,
    threshold_recall: float,
    baseline_mode: bool = False,
) -> dict:
    """Execute one benchmark question and return a result record."""
    qid: str = entry["id"]
    cat: str = entry["category"]
    query: str = entry["query"]
    expected_ids: list[int] = entry.get("expected_venue_ids", [])
    filters: dict = entry.get("filters") or {}

    location_filter = filters.get("location")
    price_range = filters.get("price_range")

    try:
        if baseline_mode:
            results = search_service.search(
                query,
                limit=5,
                location_filter=location_filter,
                price_range=price_range,
                mode="dense",
            )
        else:
            results = search_service.search(
                query,
                limit=5,
                location_filter=location_filter,
                price_range=price_range,
            )
    except Exception:
        logger.exception("Search failed for %s", qid)
        results = []

    retrieved_ids = [int(r["id"]) for r in results]
    recall = compute_recall_at_k(expected_ids, retrieved_ids, k=5)
    ndcg = compute_ndcg_at_k(expected_ids, retrieved_ids, k=5)
    mrr = compute_mrr(expected_ids, retrieved_ids)
    precision = compute_precision_at_k(expected_ids, retrieved_ids, k=5)
    hit_rate = compute_hit_rate(expected_ids, retrieved_ids, k=5)

    citation_ok, citation_detail = check_citation_accuracy(results)

    # -- pass/fail logic ----------------------------------------------------
    if cat == "abstention":
        # Abstention passes when 0 results are returned OR all scores < 0.3.
        if len(results) == 0:
            passed = True
        else:
            passed = all(float(r.get("similarity", 0)) < 0.3 for r in results)
    elif cat == "adversarial":
        # Adversarial passes if citation accuracy holds (no fabricated attributes).
        passed = citation_ok
    else:
        # Retrieval, filtered, conversational → recall@5 threshold.
        passed = recall >= threshold_recall

    return {
        "id": qid,
        "category": cat,
        "query": query,
        "expected_ids": expected_ids,
        "retrieved_ids": retrieved_ids,
        "recall": round(recall, 4),
        "ndcg": round(ndcg, 4),
        "mrr": round(mrr, 4),
        "precision": round(precision, 4),
        "hit_rate": round(hit_rate, 4),
        "passed": passed,
        "citation_ok": citation_ok,
        "citation_detail": citation_detail,
        "num_results": len(results),
        "scores": [round(float(r.get("similarity", 0)), 4) for r in results],
    }


def _category_report(
    cat: str,
    stats: dict,
    threshold_recall: float,
    threshold_abstention: float,
) -> str:
    """Return a verdict string for a single category."""
    total = stats["total"]
    avg_recall = stats["recall_sum"] / total if total else 0.0
    avg_ndcg = stats["ndcg_sum"] / total if total else 0.0
    avg_mrr = stats["mrr_sum"] / total if total else 0.0
    avg_precision = stats["precision_sum"] / total if total else 0.0
    avg_hit_rate = stats["hit_rate_sum"] / total if total else 0.0
    pass_rate = stats["pass_count"] / total if total else 0.0

    if cat == "abstention":
        metric = pass_rate
        threshold = threshold_abstention
        prefix = f"  abstention pass rate: {pass_rate:.4f} (threshold: {threshold})"
    else:
        metric = avg_recall
        threshold = threshold_recall
        prefix = (
            f"  recall@5: {avg_recall:.4f} (threshold: {threshold})\n"
            f"  NDCG@5: {avg_ndcg:.4f}\n"
            f"  MRR: {avg_mrr:.4f}\n"
            f"  Precision@5: {avg_precision:.4f}\n"
            f"  Hit Rate: {avg_hit_rate:.4f}"
        )

    verdict = "PASS" if metric >= threshold else "FAIL"

    return (
        f"\n{cat}:\n"
        f"{prefix}\n"
        f"  pass rate: {pass_rate:.4f} ({stats['pass_count']}/{total} passed, "
        f"{stats['fail_count']} failed)\n"
        f"  verdict: {verdict}"
    )


def _run_all_questions(entries, search_service, args, baseline_mode=False):
    """Run all benchmark questions and return (results, categories).

    In baseline_mode, temporarily sets _cross_encoder = None to force
    dense-only retrieval without cross-encoder re-ranking.  The
    original cross-encoder is restored in a finally block.
    """
    saved_cross_encoder = None

    if baseline_mode:
        saved_cross_encoder = getattr(search_service, "_cross_encoder", None)
        search_service._cross_encoder = None

    try:
        categories: dict[str, dict] = {}
        question_results: list[dict] = []

        for entry in entries:
            qr = _run_question(entry, search_service, args.threshold_recall,
                               baseline_mode=baseline_mode)
            question_results.append(qr)

            cat = qr["category"]
            if cat not in categories:
                categories[cat] = {
                    "recall_sum": 0.0,
                    "ndcg_sum": 0.0,
                    "mrr_sum": 0.0,
                    "precision_sum": 0.0,
                    "hit_rate_sum": 0.0,
                    "pass_count": 0,
                    "fail_count": 0,
                    "total": 0,
                }
            categories[cat]["recall_sum"] += qr["recall"]
            categories[cat]["ndcg_sum"] += qr["ndcg"]
            categories[cat]["mrr_sum"] += qr["mrr"]
            categories[cat]["precision_sum"] += qr["precision"]
            categories[cat]["hit_rate_sum"] += qr["hit_rate"]
            categories[cat]["pass_count"] += int(qr["passed"])
            categories[cat]["fail_count"] += int(not qr["passed"])
            categories[cat]["total"] += 1

            if not qr["passed"]:
                print(
                    f"  FAIL {qr['id']} [{cat}]: recall={qr['recall']:.4f} "
                    f"expected={qr['expected_ids']} actual={qr['retrieved_ids']} "
                    f"scores={qr['scores']}"
                )

        return question_results, categories
    finally:
        if baseline_mode and saved_cross_encoder is not None:
            search_service._cross_encoder = saved_cross_encoder


_METRIC_DISPLAY = [
    ("Recall@5",      "recall_sum"),
    ("NDCG@5",        "ndcg_sum"),
    ("MRR",           "mrr_sum"),
    ("Precision@5",   "precision_sum"),
    ("Hit Rate",      "hit_rate_sum"),
]


def _print_comparison_table(full_categories, baseline_categories):
    """Print a formatted baseline vs. improved comparison table to stdout."""
    all_cats = sorted(set(full_categories) | set(baseline_categories))

    print("\n" + "=" * 60)
    print("BASELINE COMPARISON (Dense-only vs. Improved Pipeline)")
    print("=" * 60)

    for cat in all_cats:
        fc = full_categories.get(cat)
        bc = baseline_categories.get(cat)
        f_total = fc["total"] if fc else 0
        b_total = bc["total"] if bc else 0

        print(f"\nCategory: {cat}")
        print(f"  {'Metric':<14} {'Baseline':>10} {'Improved':>10} {'Delta':>10}")
        print(f"  {'─' * 14} {'─' * 10} {'─' * 10} {'─' * 10}")

        for name, key in _METRIC_DISPLAY:
            base_val = (bc[key] / b_total) if bc and b_total else 0.0
            impr_val = (fc[key] / f_total) if fc and f_total else 0.0
            delta = impr_val - base_val
            sign = "+" if delta >= 0 else ""
            print(f"  {name:<14} {base_val:>10.4f} {impr_val:>10.4f} {sign}{delta:>9.4f}")

    # ---- aggregate (non-abstention) ---------------------------------------
    _print_comparison_aggregate(full_categories, baseline_categories)


def _print_comparison_aggregate(full_categories, baseline_categories):
    """Print the aggregate (non-abstention) comparison rows."""

    def _agg(categories):
        sums = {key: 0.0 for _, key in _METRIC_DISPLAY}
        total = 0
        for cat, stats in categories.items():
            if cat == "abstention":
                continue
            total += stats["total"]
            for _, key in _METRIC_DISPLAY:
                sums[key] += stats[key]
        if total == 0:
            return {key: 0.0 for _, key in _METRIC_DISPLAY}
        return {key: sums[key] / total for _, key in _METRIC_DISPLAY}

    full_agg = _agg(full_categories)
    base_agg = _agg(baseline_categories)

    print(f"\nAggregate (non-abstention)")
    print(f"  {'Metric':<14} {'Baseline':>10} {'Improved':>10} {'Delta':>10}")
    print(f"  {'─' * 14} {'─' * 10} {'─' * 10} {'─' * 10}")

    for name, key in _METRIC_DISPLAY:
        base_val = base_agg[key]
        impr_val = full_agg[key]
        delta = impr_val - base_val
        sign = "+" if delta >= 0 else ""
        print(f"  {name:<14} {base_val:>10.4f} {impr_val:>10.4f} {sign}{delta:>9.4f}")


def _build_baseline_json(full_categories, baseline_categories):
    """Build the baseline_comparison node for the JSON report."""

    def _category_aggregates(categories):
        result = {}
        for cat, stats in categories.items():
            total = stats["total"]
            result[cat] = {
                "recall_at_5": round(stats["recall_sum"] / total, 4) if total else 0.0,
                "ndcg_at_5": round(stats["ndcg_sum"] / total, 4) if total else 0.0,
                "mrr": round(stats["mrr_sum"] / total, 4) if total else 0.0,
                "precision_at_5": round(stats["precision_sum"] / total, 4) if total else 0.0,
                "hit_rate": round(stats["hit_rate_sum"] / total, 4) if total else 0.0,
            }
        return result

    def _aggregate(categories):
        sums = {"recall": 0.0, "ndcg": 0.0, "mrr": 0.0,
                "precision": 0.0, "hit_rate": 0.0}
        total = 0
        for cat, stats in categories.items():
            if cat == "abstention":
                continue
            total += stats["total"]
            sums["recall"] += stats["recall_sum"]
            sums["ndcg"] += stats["ndcg_sum"]
            sums["mrr"] += stats["mrr_sum"]
            sums["precision"] += stats["precision_sum"]
            sums["hit_rate"] += stats["hit_rate_sum"]
        if total == 0:
            return {k: 0.0 for k in sums}
        return {k: round(v / total, 4) for k, v in sums.items()}

    baseline_agg = _aggregate(baseline_categories)
    improved_agg = _aggregate(full_categories)

    return {
        "baseline": {
            "aggregates": baseline_agg,
            "categories": _category_aggregates(baseline_categories),
        },
        "improved": {
            "aggregates": improved_agg,
            "categories": _category_aggregates(full_categories),
        },
        "deltas": {
            "aggregates": {
                k: round(improved_agg[k] - baseline_agg.get(k, 0.0), 4)
                for k in baseline_agg
            },
        },
    }


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    benchmark_path = _resolve_path(args.benchmark, _PROJECT_ROOT)
    if not benchmark_path.is_file():
        print(f"ERROR: benchmark file not found: {benchmark_path}", file=sys.stderr)
        sys.exit(2)

    entries = _load_benchmark(benchmark_path)
    logger.info("Loaded %d benchmark questions", len(entries))

    search_service = _init_search_service()

    # Report cross-encoder re-ranking status for before/after comparison
    re_rank_enabled = (
        getattr(search_service, "_cross_encoder", None) is not None
    )
    logger.info(
        "Re-rank status: re_rank_enabled=%s",
        re_rank_enabled,
    )
    print(f"Re-rank enabled: {re_rank_enabled}")

    # ---- full pass --------------------------------------------------------
    question_results, categories = _run_all_questions(entries, search_service, args)

    # ---- baseline pass (optional) -----------------------------------------
    baseline_results = None
    baseline_categories = None
    if args.baseline:
        print("\n" + "=" * 60)
        print("BASELINE PASS (dense-only, no cross-encoder)")
        print("=" * 60)
        baseline_results, baseline_categories = _run_all_questions(
            entries, search_service, args, baseline_mode=True,
        )

    # ---- report -----------------------------------------------------------
    print("\n" + "=" * 60)
    print("EVALUATION REPORT")
    print("=" * 60)

    any_breach = False
    for cat in sorted(categories):
        stats = categories[cat]
        report = _category_report(cat, stats, args.threshold_recall, args.threshold_abstention)
        print(report)
        if "verdict: FAIL" in report:
            any_breach = True

    # Aggregate recall (non-abstention only — abstention always contributes 1.0).
    non_abst = [qr for qr in question_results if qr["category"] != "abstention"]
    agg_recall = sum(qr["recall"] for qr in non_abst) / len(non_abst) if non_abst else 0.0

    agg_ndcg = sum(qr["ndcg"] for qr in non_abst) / len(non_abst) if non_abst else 0.0
    agg_mrr = sum(qr["mrr"] for qr in non_abst) / len(non_abst) if non_abst else 0.0
    agg_precision = sum(qr["precision"] for qr in non_abst) / len(non_abst) if non_abst else 0.0
    agg_hit_rate = sum(qr["hit_rate"] for qr in non_abst) / len(non_abst) if non_abst else 0.0

    print(f"\nAggregate recall@5 (non-abstention): {agg_recall:.4f}")
    print(f"Aggregate NDCG@5 (non-abstention): {agg_ndcg:.4f}")
    print(f"Aggregate MRR (non-abstention): {agg_mrr:.4f}")
    print(f"Aggregate Precision@5 (non-abstention): {agg_precision:.4f}")
    print(f"Aggregate Hit Rate (non-abstention): {agg_hit_rate:.4f}")
    print(f"Total questions evaluated: {len(entries)}")

    failures = [qr for qr in question_results if not qr["passed"]]
    if failures:
        print(f"\n--- Failure Detail ({len(failures)} failures) ---")
        for fq in failures:
            print(
                f"  {fq['id']} [{fq['category']}]: {fq['query']!r}  "
                f"recall={fq['recall']:.4f} expected={fq['expected_ids']} "
                f"actual={fq['retrieved_ids']}"
            )

    # ---- baseline comparison table ----------------------------------------
    if args.baseline and baseline_categories is not None:
        _print_comparison_table(categories, baseline_categories)

    overall_verdict = "FAIL" if any_breach else "PASS"
    print(f"\nOverall verdict: {overall_verdict}")

    # ---- JSON report (optional) -------------------------------------------
    if args.report:
        report_path = _resolve_path(args.report, _PROJECT_ROOT)
        report_path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "benchmark_path": str(benchmark_path),
            "total_questions": len(entries),
            "threshold_recall": args.threshold_recall,
            "threshold_abstention": args.threshold_abstention,
            "aggregate_recall": round(agg_recall, 4),
            "aggregate_ndcg": round(agg_ndcg, 4),
            "aggregate_mrr": round(agg_mrr, 4),
            "aggregate_precision": round(agg_precision, 4),
            "aggregate_hit_rate": round(agg_hit_rate, 4),
            "categories": {},
            "failures": failures,
            "verdict": overall_verdict,
        }
        for category_name in sorted(categories):
            stats = categories[category_name]
            total = stats["total"]
            payload["categories"][category_name] = {
                "recall_at_5": round(stats["recall_sum"] / total, 4) if total else 0.0,
                "ndcg_at_5": round(stats["ndcg_sum"] / total, 4) if total else 0.0,
                "mrr": round(stats["mrr_sum"] / total, 4) if total else 0.0,
                "precision_at_5": round(stats["precision_sum"] / total, 4) if total else 0.0,
                "hit_rate": round(stats["hit_rate_sum"] / total, 4) if total else 0.0,
                "pass_rate": round(stats["pass_count"] / total, 4) if total else 0.0,
                "pass_count": stats["pass_count"],
                "fail_count": stats["fail_count"],
                "total": total,
            }

        # ---- baseline comparison in JSON -----------------------------------
        if args.baseline and baseline_categories is not None:
            payload["baseline_comparison"] = _build_baseline_json(
                categories, baseline_categories,
            )

        with open(report_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        print(f"\nReport written to {report_path}")

    # Exit code: --metrics-only always exits 0
    if args.metrics_only:
        sys.exit(0)
    sys.exit(1 if any_breach else 0)


if __name__ == "__main__":
    main()
