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
    pass_rate = stats["pass_count"] / total if total else 0.0

    if cat == "abstention":
        metric = pass_rate
        threshold = threshold_abstention
        prefix = f"  abstention pass rate: {pass_rate:.4f} (threshold: {threshold})"
    else:
        metric = avg_recall
        threshold = threshold_recall
        prefix = f"  recall@5: {avg_recall:.4f} (threshold: {threshold})"

    verdict = "PASS" if metric >= threshold else "FAIL"

    return (
        f"\n{cat}:\n"
        f"{prefix}\n"
        f"  pass rate: {pass_rate:.4f} ({stats['pass_count']}/{total} passed, "
        f"{stats['fail_count']} failed)\n"
        f"  verdict: {verdict}"
    )


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

    # ---- per-category accumulators ----------------------------------------
    categories: dict[str, dict] = {}
    question_results: list[dict] = []

    for entry in entries:
        qid = entry["id"]
        cat = entry["category"]

        qr = _run_question(entry, search_service, args.threshold_recall)
        question_results.append(qr)

        if cat not in categories:
            categories[cat] = {
                "recall_sum": 0.0,
                "pass_count": 0,
                "fail_count": 0,
                "total": 0,
            }
        categories[cat]["recall_sum"] += qr["recall"]
        categories[cat]["pass_count"] += int(qr["passed"])
        categories[cat]["fail_count"] += int(not qr["passed"])
        categories[cat]["total"] += 1

        if not qr["passed"]:
            print(
                f"  FAIL {qid} [{cat}]: recall={qr['recall']:.4f} "
                f"expected={qr['expected_ids']} actual={qr['retrieved_ids']} "
                f"scores={qr['scores']}"
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

    print(f"\nAggregate recall@5 (non-abstention): {agg_recall:.4f}")
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
            "categories": {},
            "failures": failures,
            "verdict": overall_verdict,
        }
        for category_name in sorted(categories):
            stats = categories[category_name]
            total = stats["total"]
            payload["categories"][category_name] = {
                "recall_at_5": round(stats["recall_sum"] / total, 4) if total else 0.0,
                "pass_rate": round(stats["pass_count"] / total, 4) if total else 0.0,
                "pass_count": stats["pass_count"],
                "fail_count": stats["fail_count"],
                "total": total,
            }
        with open(report_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        print(f"\nReport written to {report_path}")

    sys.exit(1 if any_breach else 0)


if __name__ == "__main__":
    main()
