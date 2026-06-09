#!/usr/bin/env python3
"""RAGAS evaluation CLI — generation-quality scoring for the RAG pipeline.

Runs every benchmark question through the full RAG pipeline (retrieval →
generation → LLM-as-judge scoring) and produces a combined retrieval + RAGAS
metrics report.

Usage:
    python3 scripts/eval_ragas.py
    python3 scripts/eval_ragas.py --limit 5
    python3 scripts/eval_ragas.py --ragas-only --report reports/ragas.json
    python3 scripts/eval_ragas.py --baseline --report reports/comparison.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

# -- project root -------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("eval_ragas")


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------


def _resolve_path(raw: str, fallback_root: Path) -> Path:
    p = Path(raw)
    if not p.is_absolute():
        p = fallback_root / p
    return p.resolve()


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="RAGAS eval runner — generation-quality scoring"
    )
    parser.add_argument(
        "--benchmark",
        default="data/benchmark.jsonl",
        help="Path to benchmark JSONL (default: data/benchmark.jsonl)",
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
        "--ragas-only",
        action="store_true",
        help="Skip retrieval metrics; only compute RAGAS scores",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Seconds between questions to avoid HF rate limits (default: 2.0)",
    )
    parser.add_argument(
        "--no-delay",
        action="store_true",
        help="Skip delay between questions (use with caution — may hit rate limits)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process first N questions (for smoke testing)",
    )
    parser.add_argument(
        "--metrics-only",
        action="store_true",
        help="Print metrics but always exit 0 (skip threshold enforcement)",
    )
    parser.add_argument(
        "--mock-judge",
        action="store_true",
        help="Use synthetic judge scores instead of calling HF API (for smoke testing)",
    )
    return parser.parse_args(argv)


# ---------------------------------------------------------------------------
# Benchmark loader (mirrors run_eval.py)
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
# Search service initialisation (mirrors run_eval.py)
# ---------------------------------------------------------------------------


def _init_search_service():
    """Create a SearchService the same way the Flask app does."""
    import numpy as np
    import pandas as pd
    from sentence_transformers import SentenceTransformer

    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))

    from config import DATA_PATH, EMBEDDINGS_PATH, MODEL_PATH
    from search_service import SearchService

    logger.info("Loading sentence-transformer model from %s", MODEL_PATH)
    model = SentenceTransformer(MODEL_PATH, device="cpu")

    logger.info("Loading venue data from %s", DATA_PATH)
    df = pd.read_csv(DATA_PATH)
    logger.info("  %d locations", len(df))

    logger.info("Loading pre-computed embeddings from %s", EMBEDDINGS_PATH)
    embeddings = np.load(EMBEDDINGS_PATH)
    logger.info("  shape %s", embeddings.shape)

    logger.info("Building SearchService")
    service = SearchService.from_startup(
        df=df, embeddings=embeddings, encoder=model,
    )
    logger.info("SearchService ready — index_source=%s", service._index_source)
    return service


# ---------------------------------------------------------------------------
# Mock judge for smoke testing
# ---------------------------------------------------------------------------


_MOCK_COUNTER = 0


def _mock_judge_call(messages, **kwargs):
    """Return synthetic judge scores with deliberate variance."""
    global _MOCK_COUNTER
    _MOCK_COUNTER += 1

    # Cycle through scores to show variance (2-5 range)
    scores = [
        (5, 5, 4),  # perfect
        (4, 4, 5),  # very good
        (3, 5, 3),  # mixed
        (5, 3, 2),  # relevant but noisy context
        (2, 4, 4),  # partially grounded
        (4, 2, 3),  # off-topic-ish
        (3, 3, 3),  # middle
        (5, 4, 2),  # good answer, bad context
    ]
    f, r, c = scores[_MOCK_COUNTER % len(scores)]

    return {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "faithfulness": f,
                    "faithfulness_reasoning": "Mock judge score.",
                    "answer_relevancy": r,
                    "answer_relevancy_reasoning": "Mock judge score.",
                    "context_precision": c,
                    "context_precision_reasoning": "Mock judge score.",
                })
            }
        }]
    }


# ---------------------------------------------------------------------------
# Report printing
# ---------------------------------------------------------------------------


def _print_ragas_report(full_results: list[dict], baseline_results: list[dict] | None = None):
    """Print a formatted RAGAS evaluation report to stdout."""
    from eval_service import build_combined_report

    report = build_combined_report(full_results)

    print("\n" + "=" * 70)
    print("RAGAS EVALUATION REPORT")
    print("=" * 70)

    retrieval = report.get("retrieval", {})
    ragas = report.get("ragas", {})

    # Per-category breakdown
    for cat in sorted(retrieval.get("categories", {})):
        rcat = retrieval["categories"][cat]
        gcat = ragas.get("categories", {}).get(cat, {})

        print(f"\nCategory: {cat}")
        if rcat:
            print(
                f"  Retrieval: recall@5={rcat.get('recall_at_5', 0):.4f}  "
                f"NDCG@5={rcat.get('ndcg_at_5', 0):.4f}  "
                f"MRR={rcat.get('mrr', 0):.4f}  "
                f"Precision@5={rcat.get('precision_at_5', 0):.4f}  "
                f"Hit Rate={rcat.get('hit_rate', 0):.4f}"
            )
        if gcat:
            faith = gcat.get("faithfulness")
            relev = gcat.get("answer_relevancy")
            prec = gcat.get("context_precision")
            faith_str = f"{faith:.4f}" if faith is not None else "N/A"
            relev_str = f"{relev:.4f}" if relev is not None else "N/A"
            prec_str = f"{prec:.4f}" if prec is not None else "N/A"
            print(
                f"  RAGAS: faithfulness={faith_str}  "
                f"answer_relevancy={relev_str}  "
                f"context_precision={prec_str}"
            )
            print(f"  RAGAS scored: {gcat.get('scored', 0)}/{gcat.get('total', 0)} "
                  f"(failed: {gcat.get('failed', 0)})")

    # Aggregates
    ra = retrieval.get("aggregates", {})
    ga = ragas.get("aggregates", {})

    print(f"\nAggregate (non-abstention):")
    if ra:
        print(
            f"  Retrieval: recall@5={ra.get('recall', 0):.4f}  "
            f"NDCG@5={ra.get('ndcg', 0):.4f}  "
            f"MRR={ra.get('mrr', 0):.4f}  "
            f"Precision@5={ra.get('precision', 0):.4f}  "
            f"Hit Rate={ra.get('hit_rate', 0):.4f}"
        )
    if ga:
        faith = ga.get("faithfulness")
        relev = ga.get("answer_relevancy")
        prec = ga.get("context_precision")
        faith_str = f"{faith:.4f}" if faith is not None else "N/A"
        relev_str = f"{relev:.4f}" if relev is not None else "N/A"
        prec_str = f"{prec:.4f}" if prec is not None else "N/A"
        print(
            f"  RAGAS: faithfulness={faith_str}  "
            f"answer_relevancy={relev_str}  "
            f"context_precision={prec_str}"
        )

    print(f"\nTotal questions: {report['total_questions']}")
    print(f"RAGAS scoring failures: {report.get('ragas_scoring_failures', 0)}")

    # Baseline comparison
    if baseline_results is not None:
        _print_baseline_comparison(full_results, baseline_results)


def _print_baseline_comparison(full_results: list[dict], baseline_results: list[dict]):
    """Print baseline vs improved comparison for both metric families."""
    from eval_service import build_combined_report

    full_report = build_combined_report(full_results)
    base_report = build_combined_report(baseline_results)

    print("\n" + "=" * 70)
    print("BASELINE COMPARISON (Dense-only vs. Improved Pipeline)")
    print("=" * 70)

    full_cats = full_report.get("retrieval", {}).get("categories", {})
    base_cats = base_report.get("retrieval", {}).get("categories", {})
    full_ragas = full_report.get("ragas", {}).get("categories", {})
    base_ragas = base_report.get("ragas", {}).get("categories", {})

    all_cats = sorted(set(full_cats) | set(base_cats))

    # Retrieval metrics
    retrieval_metrics_display = [
        ("Recall@5", "recall_at_5"),
        ("NDCG@5", "ndcg_at_5"),
        ("MRR", "mrr"),
        ("Precision@5", "precision_at_5"),
        ("Hit Rate", "hit_rate"),
    ]

    ragas_metrics_display = [
        ("Faithfulness", "faithfulness"),
        ("Answer Relevancy", "answer_relevancy"),
        ("Context Precision", "context_precision"),
    ]

    for cat in all_cats:
        fc = full_cats.get(cat, {})
        bc = base_cats.get(cat, {})
        fr = full_ragas.get(cat, {})
        br = base_ragas.get(cat, {})

        print(f"\nCategory: {cat}")

        # Retrieval table
        print(f"  {'Retrieval Metric':<18} {'Baseline':>10} {'Improved':>10} {'Delta':>10}")
        print(f"  {'─' * 18} {'─' * 10} {'─' * 10} {'─' * 10}")
        for name, key in retrieval_metrics_display:
            base_val = bc.get(key, 0) or 0
            impr_val = fc.get(key, 0) or 0
            delta = impr_val - base_val
            sign = "+" if delta >= 0 else ""
            print(f"  {name:<18} {base_val:>10.4f} {impr_val:>10.4f} {sign}{delta:>9.4f}")

        # RAGAS table
        if fr or br:
            print(f"\n  {'RAGAS Metric':<18} {'Baseline':>10} {'Improved':>10} {'Delta':>10}")
            print(f"  {'─' * 18} {'─' * 10} {'─' * 10} {'─' * 10}")
            for name, key in ragas_metrics_display:
                base_val = br.get(key) or 0
                impr_val = fr.get(key) or 0
                delta = impr_val - base_val
                sign = "+" if delta >= 0 else ""
                bs = f"{base_val:.4f}" if base_val is not None else "N/A"
                im = f"{impr_val:.4f}" if impr_val is not None else "N/A"
                print(f"  {name:<18} {bs:>10} {im:>10} {sign}{delta:>9.4f}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    benchmark_path = _resolve_path(args.benchmark, _PROJECT_ROOT)
    if not benchmark_path.is_file():
        print(f"ERROR: benchmark file not found: {benchmark_path}", file=sys.stderr)
        sys.exit(2)

    entries = _load_benchmark(benchmark_path)
    logger.info("Loaded %d benchmark questions", len(entries))

    search_service = _init_search_service()

    # Re-rank status for baseline comparison
    re_rank_enabled = getattr(search_service, "_cross_encoder", None) is not None
    logger.info("Re-rank status: re_rank_enabled=%s", re_rank_enabled)
    print(f"Re-rank enabled: {re_rank_enabled}")

    delay = 0.0 if args.no_delay else args.delay

    # Resolve HF call (mock or real)
    if args.mock_judge:
        logger.info("Using MOCK mode — synthetic judge AND generation (no HF API calls)")

        # Monkey-patch _call_judge in eval_service
        import eval_service as es
        original_call_judge = es._call_judge

        def _mock_call_judge(question, context, answer, hf_call=None):
            global _MOCK_COUNTER
            _MOCK_COUNTER += 1
            scores_cycle = [
                (5, 5, 4), (4, 4, 5), (3, 5, 3), (5, 3, 2),
                (2, 4, 4), (4, 2, 3), (3, 3, 3), (5, 4, 2),
            ]
            f, r, c = scores_cycle[_MOCK_COUNTER % len(scores_cycle)]
            return {
                "faithfulness": f / 5.0,
                "answer_relevancy": r / 5.0,
                "context_precision": c / 5.0,
                "faithfulness_reasoning": "Mock judge score.",
                "answer_relevancy_reasoning": "Mock judge score.",
                "context_precision_reasoning": "Mock judge score.",
            }

        es._call_judge = _mock_call_judge

        # Also mock the HF chat generation API to avoid HF_TOKEN requirement
        import chat_service as cs
        original_hf_call = cs.huggingface_chat_api_call

        _MOCK_ANSWER_IDX = 0
        _MOCK_ANSWERS = [
            "Based on the available venues, I recommend checking out {name}. It has great reviews and matches your criteria well.",
            "Here are some options: {name} is a popular choice in that area with the atmosphere you're looking for.",
            "I found {name} which fits your requirements. It's known for excellent service and ambiance.",
            "For your query, {name} stands out as a top recommendation with its unique character and strong reviews.",
            "Let me suggest {name} — it's well-regarded and aligns with what you're searching for.",
        ]

        def _mock_chat_call(messages, max_tokens=512, timeout=30):
            nonlocal _MOCK_ANSWER_IDX
            _MOCK_ANSWER_IDX += 1
            answer = _MOCK_ANSWERS[_MOCK_ANSWER_IDX % len(_MOCK_ANSWERS)]
            # Try to use a real venue name from context for realism
            try:
                user_content = messages[-1]["content"] if messages else ""
            except (IndexError, KeyError):
                user_content = ""
            answer = answer.replace("{name}", "the recommended venue")
            return {
                "choices": [{
                    "message": {"content": answer}
                }]
            }

        cs.huggingface_chat_api_call = _mock_chat_call

    # ---- Full RAGAS pass --------------------------------------------------
    from eval_service import run_ragas_eval

    logger.info("Starting RAGAS evaluation pass...")
    start_time = time.time()

    full_results = run_ragas_eval(
        benchmark_entries=entries,
        search_service=search_service,
        delay=delay,
        limit=args.limit,
        ragas_only=args.ragas_only,
    )

    elapsed = time.time() - start_time
    logger.info("RAGAS eval completed in %.1fs (%d questions)", elapsed, len(full_results))

    # Restore original judge AND chat if mocked
    if args.mock_judge:
        import eval_service as es
        import chat_service as cs
        es._call_judge = original_call_judge
        cs.huggingface_chat_api_call = original_hf_call

    # ---- Baseline pass (optional) -----------------------------------------
    baseline_results = None
    if args.baseline:
        logger.info("Starting BASELINE pass (dense-only, no cross-encoder)...")
        saved_ce = getattr(search_service, "_cross_encoder", None)
        search_service._cross_encoder = None

        try:
            baseline_results = run_ragas_eval(
                benchmark_entries=entries,
                search_service=search_service,
                delay=delay,
                limit=args.limit,
                ragas_only=args.ragas_only,
            )
        finally:
            if saved_ce is not None:
                search_service._cross_encoder = saved_ce
        logger.info("Baseline pass completed (%d questions)", len(baseline_results))

    # ---- Print report -----------------------------------------------------
    _print_ragas_report(full_results, baseline_results)

    # ---- JSON report (optional) -------------------------------------------
    if args.report:
        from eval_service import build_combined_report

        report_path = _resolve_path(args.report, _PROJECT_ROOT)
        report_path.parent.mkdir(parents=True, exist_ok=True)

        payload = build_combined_report(full_results)
        payload["benchmark_path"] = str(benchmark_path)

        if baseline_results is not None:
            base_payload = build_combined_report(baseline_results)
            # Build deltas
            def _compute_deltas(full_agg, base_agg):
                if not full_agg or not base_agg:
                    return {}
                return {
                    k: round((full_agg.get(k) or 0) - (base_agg.get(k) or 0), 4)
                    for k in full_agg
                }

            retrieval_deltas = _compute_deltas(
                payload.get("retrieval", {}).get("aggregates", {}),
                base_payload.get("retrieval", {}).get("aggregates", {}),
            )
            ragas_deltas = _compute_deltas(
                payload.get("ragas", {}).get("aggregates", {}),
                base_payload.get("ragas", {}).get("aggregates", {}),
            )

            payload["baseline_comparison"] = {
                "baseline_retrieval": base_payload.get("retrieval", {}).get("aggregates", {}),
                "baseline_ragas": base_payload.get("ragas", {}).get("aggregates", {}),
                "retrieval_deltas": retrieval_deltas,
                "ragas_deltas": ragas_deltas,
            }

        with open(report_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        print(f"\nReport written to {report_path}")

    # Exit code
    if args.metrics_only:
        sys.exit(0)
    sys.exit(0)


if __name__ == "__main__":
    main()
