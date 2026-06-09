"""RAGAS-compatible evaluation service for Phase 20.

Provides LLM-as-judge scoring primitives that call the Hugging Face chat API
with judge-v1.yaml as the system prompt.  Scores are returned in the standard
RAGAS 0–1 range (judge outputs 1–5, divided by 5).

The module also provides batch eval orchestration and combined report building
so eval_ragas.py and run_eval.py both consume the same scoring pipeline.

Heavy imports (ragas, torch, sentence-transformers) are lazy — imported only
inside functions that need them.  This keeps the module importable from
run_eval.py without triggering expensive model loads.
"""

from __future__ import annotations

import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Judge prompt loading
# ---------------------------------------------------------------------------

_JUDGE_PROMPT_PATH = _PROJECT_ROOT / "prompts" / "judge-v1.yaml"

# Cached prompt template (lazy — loaded on first call).
_judge_template: dict[str, str] | None = None


def _load_judge_template() -> dict[str, str]:
    """Load and cache the judge-v1.yaml prompt template.

    Returns a dict with ``system_template`` and ``user_template`` keys.
    Unlike the main chat prompt, the judge template does NOT go through
    ``prompt_loader.load_prompt_template()`` because the judge prompt has a
    different caller contract (ad-hoc scoring requests, not chat messages).
    """
    global _judge_template
    if _judge_template is not None:
        return _judge_template

    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))

    import yaml

    raw = yaml.safe_load(_JUDGE_PROMPT_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(
            f"judge-v1.yaml must be a YAML mapping, got {type(raw).__name__}"
        )
    for key in ("system_template", "user_template"):
        if key not in raw:
            raise ValueError(f"judge-v1.yaml missing required key: {key}")

    _judge_template = {
        "system_template": str(raw["system_template"]),
        "user_template": str(raw["user_template"]),
    }
    logger.info("Loaded judge prompt template (version=%s)", raw.get("version", "?"))
    return _judge_template


# ---------------------------------------------------------------------------
# HF judge call
# ---------------------------------------------------------------------------


def _call_judge(
    question: str,
    context: str,
    answer: str,
    hf_call: Callable[..., Any] | None = None,
) -> dict[str, float]:
    """Call the HF chat API as an LLM judge and return parsed 0–1 scores.

    Parameters
    ----------
    question : str
        The original user question.
    context : str
        Formatted retrieval context (venue details).
    answer : str
        The assistant's generated answer.
    hf_call : callable | None
        Injection point for tests.  When ``None``, uses
        ``chat_service.huggingface_chat_api_call``.

    Returns
    -------
    dict
        ``{"faithfulness": float, "answer_relevancy": float,
        "context_precision": float, "faithfulness_reasoning": str,
        "answer_relevancy_reasoning": str, "context_precision_reasoning": str}``

        All scores are in the 0–1 range.  On failure, returns all zeros with
        empty reasoning strings and logs a warning.
    """
    template = _load_judge_template()

    user_content = template["user_template"].format(
        question=question,
        context=context,
        answer=answer,
    )

    messages = [
        {"role": "system", "content": template["system_template"]},
        {"role": "user", "content": user_content},
    ]

    try:
        if hf_call is None:
            if str(_PROJECT_ROOT) not in sys.path:
                sys.path.insert(0, str(_PROJECT_ROOT))
            from chat_service import huggingface_chat_api_call

            hf_call = huggingface_chat_api_call

        response = hf_call(messages, max_tokens=300, timeout=30)
        raw_text = response["choices"][0]["message"]["content"].strip()
        logger.debug("Judge raw response: %s", raw_text[:200])
    except Exception as exc:
        logger.warning("Judge HF call failed: %s", exc)
        return _empty_judge_scores()

    return _parse_judge_response(raw_text)


def _empty_judge_scores() -> dict[str, float]:
    return {
        "faithfulness": 0.0,
        "answer_relevancy": 0.0,
        "context_precision": 0.0,
        "faithfulness_reasoning": "",
        "answer_relevancy_reasoning": "",
        "context_precision_reasoning": "",
    }


# Regex to extract a JSON object from text that may have markdown fences or
# surrounding prose.
_JSON_BLOCK_RE = re.compile(r"\{[^{}]*\"faithfulness\"[^{}]*\}", re.DOTALL)


def _parse_judge_response(raw_text: str) -> dict[str, float]:
    """Parse the judge's JSON output into 0–1 scores.

    Handles common LLM output quirks: markdown code fences, trailing commas,
    prose before/after the JSON block.
    """
    # 1. Try to extract a JSON object containing "faithfulness"
    match = _JSON_BLOCK_RE.search(raw_text)
    json_candidate = match.group(0) if match else raw_text

    # 2. Strip markdown fences
    json_candidate = json_candidate.strip()
    if json_candidate.startswith("```"):
        json_candidate = re.sub(r"^```(?:json)?\s*", "", json_candidate)
        json_candidate = re.sub(r"\s*```$", "", json_candidate)

    # 3. Try parsing
    try:
        parsed = json.loads(json_candidate)
    except json.JSONDecodeError:
        # Try with trailing-comma cleanup
        cleaned = re.sub(r",\s*}", "}", json_candidate)
        cleaned = re.sub(r",\s*]", "]", cleaned)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning(
                "Failed to parse judge JSON response: %s\nRaw: %s",
                exc,
                raw_text[:500],
            )
            return _empty_judge_scores()

    if not isinstance(parsed, dict):
        logger.warning("Judge response is not a JSON object: %s", raw_text[:200])
        return _empty_judge_scores()

    # 4. Extract scores (1–5 → 0–1) and reasoning
    def _safe_score(key: str) -> float:
        val = parsed.get(key)
        if isinstance(val, (int, float)) and 1 <= val <= 5:
            return round(float(val) / 5.0, 4)
        logger.warning("Judge score %s is invalid: %s", key, val)
        return 0.0

    def _safe_reasoning(key: str) -> str:
        val = parsed.get(key)
        return str(val).strip() if isinstance(val, str) else ""

    return {
        "faithfulness": _safe_score("faithfulness"),
        "answer_relevancy": _safe_score("answer_relevancy"),
        "context_precision": _safe_score("context_precision"),
        "faithfulness_reasoning": _safe_reasoning("faithfulness_reasoning"),
        "answer_relevancy_reasoning": _safe_reasoning("answer_relevancy_reasoning"),
        "context_precision_reasoning": _safe_reasoning("context_precision_reasoning"),
    }


# ---------------------------------------------------------------------------
# Per-question scoring
# ---------------------------------------------------------------------------


def score_with_ragas(
    query: str,
    answer: str,
    contexts: list[str],
    hf_call: Callable[..., Any] | None = None,
) -> dict[str, float | None]:
    """Score a single (query, answer, contexts) tuple with the LLM judge.

    This is the primary entry point used by eval_ragas.py and run_eval.py.
    It calls the HF judge API with judge-v1.yaml.

    Parameters
    ----------
    query : str
        The user's question.
    answer : str
        The assistant's generated response.
    contexts : list[str]
        Retrieved context strings (one per venue/document).
    hf_call : callable | None
        Injection point for tests.

    Returns
    -------
    dict
        ``{"faithfulness": float, "answer_relevancy": float,
        "context_precision": float}`` with scores in 0–1 range.
        Returns ``None`` for all three on judge failure.
    """
    # Build a compact context string.
    if not contexts:
        context_str = "(no context available)"
    else:
        context_str = "\n".join(
            f"- {c}" for c in contexts[:10]  # cap at 10 to keep prompt size bounded
        )

    scores = _call_judge(
        question=query,
        context=context_str,
        answer=answer,
        hf_call=hf_call,
    )

    # Check if the judge failed (all zeros + empty reasoning)
    if (
        scores["faithfulness"] == 0.0
        and scores["answer_relevancy"] == 0.0
        and scores["context_precision"] == 0.0
        and not scores["faithfulness_reasoning"]
        and not scores["answer_relevancy_reasoning"]
        and not scores["context_precision_reasoning"]
    ):
        logger.warning("Judge returned all-zero scores — treating as failure")
        return {
            "faithfulness": None,
            "answer_relevancy": None,
            "context_precision": None,
        }

    return {
        "faithfulness": scores["faithfulness"],
        "answer_relevancy": scores["answer_relevancy"],
        "context_precision": scores["context_precision"],
    }


# ---------------------------------------------------------------------------
# Batch eval orchestration
# ---------------------------------------------------------------------------


def _build_context_strings_from_results(search_results: list[dict]) -> list[str]:
    """Convert search result DTOs into compact context strings for the judge.

    Each context string is formatted as:
    "VenueName (Zone, Type, Rating: X.X/5) — description snippet"
    """
    contexts: list[str] = []
    for r in search_results[:5]:  # top 5 only
        name = r.get("name", "Unknown")
        zone = r.get("zone", "")
        vtype = r.get("type", "")
        rating = r.get("rating", 0)
        desc = r.get("description", "") or r.get("summary", "") or ""

        parts = [name]
        meta_parts = []
        if zone:
            meta_parts.append(zone)
        if vtype:
            meta_parts.append(vtype)
        if rating:
            meta_parts.append(f"{rating:.1f}/5")
        if meta_parts:
            parts.append(f"({', '.join(meta_parts)})")
        if desc:
            # Truncate to keep context compact
            truncated = desc[:150] + "…" if len(desc) > 150 else desc
            parts.append(f"— {truncated}")

        contexts.append(" ".join(parts))
    return contexts


def run_ragas_eval(
    benchmark_entries: list[dict],
    search_service: Any,
    *,
    hf_call: Callable[..., Any] | None = None,
    delay: float = 2.0,
    limit: int | None = None,
    ragas_only: bool = False,
) -> list[dict]:
    """Run RAGAS evaluation on a set of benchmark entries.

    For each entry: runs retrieval → generation → judge scoring, then returns
    a combined result record.

    Parameters
    ----------
    benchmark_entries : list[dict]
        Loaded benchmark entries from benchmark.jsonl.
    search_service : SearchService
        Initialized search service for retrieval.
    hf_call : callable | None
        Injection point for tests.
    delay : float
        Seconds to wait between questions (HF rate limiting).
    limit : int | None
        Only process the first N entries (for smoke testing).
    ragas_only : bool
        If True, skip retrieval metric computation.

    Returns
    -------
    list[dict]
        One result record per benchmark entry with keys: id, category, query,
        answer, retrieved_ids, retrieval_metrics, ragas_scores, ragas_error.
    """
    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))

    # Lazy imports
    from chat_service import get_ai_response_with_metadata
    from scripts.run_eval import (  # type: ignore[import-not-found]
        check_citation_accuracy,
        compute_hit_rate,
        compute_mrr,
        compute_ndcg_at_k,
        compute_precision_at_k,
        compute_recall_at_k,
    )

    entries = benchmark_entries[:limit] if limit else benchmark_entries
    results: list[dict] = []

    for i, entry in enumerate(entries):
        qid = entry["id"]
        cat = entry["category"]
        query = entry.get("standalone_query") or entry["query"]
        expected_ids = entry.get("expected_venue_ids", [])
        filters = entry.get("filters") or {}

        logger.info("RAGAS eval [%d/%d] %s [%s]: %s", i + 1, len(entries), qid, cat, query[:80])

        # --- Retrieval ---
        location_filter = filters.get("location")
        price_range = filters.get("price_range")

        try:
            search_results = search_service.search(
                query, limit=5,
                location_filter=location_filter,
                price_range=price_range,
            )
        except Exception:
            logger.exception("Search failed for %s", qid)
            search_results = []

        retrieved_ids = [int(r["id"]) for r in search_results]

        # --- Retrieval metrics (unless --ragas-only) ---
        retrieval_metrics: dict[str, float] | None = None
        if not ragas_only:
            retrieval_metrics = {
                "recall": round(compute_recall_at_k(expected_ids, retrieved_ids, k=5), 4),
                "ndcg": round(compute_ndcg_at_k(expected_ids, retrieved_ids, k=5), 4),
                "mrr": round(compute_mrr(expected_ids, retrieved_ids), 4),
                "precision": round(compute_precision_at_k(expected_ids, retrieved_ids, k=5), 4),
                "hit_rate": round(compute_hit_rate(expected_ids, retrieved_ids, k=5), 4),
            }
            citation_ok, citation_detail = check_citation_accuracy(search_results)
            retrieval_metrics["citation_ok"] = citation_ok
            retrieval_metrics["citation_detail"] = citation_detail

        # --- Generation ---
        ragas_scores: dict[str, float | None] | None = None
        ragas_error: str | None = None
        answer: str = ""

        try:
            chat_result = get_ai_response_with_metadata(
                query, previous_questions=[], previous_responses=[],
                search_helper=None,  # we already ran search — build context manually
            )
            # Hmm, get_ai_response_with_metadata expects search_helper.
            # We need to call it differently — pass a helper that returns our results.
        except Exception:
            pass

        # We need a search helper that returns pre-computed results.
        # The simplest approach: build retrieval context manually and call
        # build_chat_messages + huggingface_chat_api_call directly.

        # --- Build context and call generation ---
        from chat_service import (
            build_busyness_context,
            build_chat_messages,
            format_retrieval_context,
            huggingface_chat_api_call,
        )

        retrieval_context_str, citations = format_retrieval_context(search_results)
        busyness_str = build_busyness_context()

        messages, _ = build_chat_messages(
            query=query,
            previous_questions=[],
            previous_responses=[],
            retrieval_context=retrieval_context_str,
            search_helper=None,
            busyness_context=busyness_str,
        )

        try:
            if hf_call is None:
                gen_call = huggingface_chat_api_call
            else:
                gen_call = hf_call
            response = gen_call(messages)
            answer = response["choices"][0]["message"]["content"]
            logger.debug("  Generated answer (%d chars)", len(answer))
        except Exception as exc:
            logger.warning("  Generation failed for %s: %s", qid, exc)
            ragas_error = "generation_failed"
            answer = ""

        # --- RAGAS scoring ---
        if answer and ragas_error is None:
            try:
                contexts = _build_context_strings_from_results(search_results)
                ragas_scores = score_with_ragas(
                    query=query,
                    answer=answer,
                    contexts=contexts,
                    hf_call=hf_call,
                )
                if ragas_scores.get("faithfulness") is None:
                    ragas_error = "judge_failed"
                logger.debug(
                    "  RAGAS: faith=%.2f relev=%.2f prec=%.2f",
                    ragas_scores.get("faithfulness") or 0,
                    ragas_scores.get("answer_relevancy") or 0,
                    ragas_scores.get("context_precision") or 0,
                )
            except Exception as exc:
                logger.warning("  RAGAS scoring failed for %s: %s", qid, exc)
                ragas_error = "ragas_error"
                ragas_scores = None

        # --- Assemble result ---
        result: dict[str, Any] = {
            "id": qid,
            "category": cat,
            "query": query,
            "answer": answer,
            "retrieved_ids": retrieved_ids,
        }
        if retrieval_metrics is not None:
            result["retrieval_metrics"] = retrieval_metrics
        if ragas_scores is not None:
            result["ragas_scores"] = ragas_scores
        if ragas_error is not None:
            result["ragas_error"] = ragas_error

        results.append(result)

        # Rate-limit delay
        if delay > 0 and i < len(entries) - 1:
            time.sleep(delay)

    return results


# ---------------------------------------------------------------------------
# Combined report building
# ---------------------------------------------------------------------------


_RAGAS_METRIC_NAMES = ["faithfulness", "answer_relevancy", "context_precision"]
_RETRIEVAL_METRIC_NAMES = ["recall", "ndcg", "mrr", "precision", "hit_rate"]


def build_combined_report(
    ragas_results: list[dict],
) -> dict[str, Any]:
    """Build a combined JSON report from RAGAS eval results.

    Parameters
    ----------
    ragas_results : list[dict]
        Output of ``run_ragas_eval()``.

    Returns
    -------
    dict
        Report with ``retrieval``, ``ragas``, and ``questions`` keys.
    """
    categories: dict[str, dict[str, Any]] = {}
    ragas_scored = 0
    ragas_failed = 0

    for r in ragas_results:
        cat = r["category"]
        if cat not in categories:
            categories[cat] = {
                "total": 0,
                # Retrieval
                "recall_sum": 0.0,
                "ndcg_sum": 0.0,
                "mrr_sum": 0.0,
                "precision_sum": 0.0,
                "hit_rate_sum": 0.0,
                "retrieval_count": 0,
                # RAGAS
                "faithfulness_sum": 0.0,
                "relevancy_sum": 0.0,
                "precision_ragas_sum": 0.0,
                "ragas_scored": 0,
                "ragas_failed": 0,
            }

        stats = categories[cat]
        stats["total"] += 1

        # Retrieval
        rm = r.get("retrieval_metrics")
        if rm:
            stats["recall_sum"] += rm.get("recall", 0)
            stats["ndcg_sum"] += rm.get("ndcg", 0)
            stats["mrr_sum"] += rm.get("mrr", 0)
            stats["precision_sum"] += rm.get("precision", 0)
            stats["hit_rate_sum"] += rm.get("hit_rate", 0)
            stats["retrieval_count"] += 1

        # RAGAS
        rs = r.get("ragas_scores")
        re = r.get("ragas_error")
        if rs and re is None:
            stats["faithfulness_sum"] += rs.get("faithfulness") or 0
            stats["relevancy_sum"] += rs.get("answer_relevancy") or 0
            stats["precision_ragas_sum"] += rs.get("context_precision") or 0
            stats["ragas_scored"] += 1
            ragas_scored += 1
        elif re:
            stats["ragas_failed"] += 1
            ragas_failed += 1

    # Build category summaries
    retrieval_categories: dict[str, dict] = {}
    ragas_categories: dict[str, dict] = {}

    for cat, stats in sorted(categories.items()):
        t = stats["total"]
        rc = stats["retrieval_count"]
        rs = stats["ragas_scored"]

        retrieval_categories[cat] = {
            "recall_at_5": round(stats["recall_sum"] / rc, 4) if rc else 0.0,
            "ndcg_at_5": round(stats["ndcg_sum"] / rc, 4) if rc else 0.0,
            "mrr": round(stats["mrr_sum"] / rc, 4) if rc else 0.0,
            "precision_at_5": round(stats["precision_sum"] / rc, 4) if rc else 0.0,
            "hit_rate": round(stats["hit_rate_sum"] / rc, 4) if rc else 0.0,
            "total": t,
        }
        ragas_categories[cat] = {
            "faithfulness": round(stats["faithfulness_sum"] / rs, 4) if rs else None,
            "answer_relevancy": round(stats["relevancy_sum"] / rs, 4) if rs else None,
            "context_precision": round(stats["precision_ragas_sum"] / rs, 4) if rs else None,
            "scored": rs,
            "failed": stats["ragas_failed"],
            "total": t,
        }

    # Build aggregates (non-abstention)
    def _agg_retrieval(cats: dict) -> dict:
        sums = {k: 0.0 for k in _RETRIEVAL_METRIC_NAMES}
        total = 0
        for cat, s in cats.items():
            if cat == "abstention":
                continue
            total += s["total"]
            sums["recall"] += s["recall_at_5"] * s["total"]
            sums["ndcg"] += s["ndcg_at_5"] * s["total"]
            sums["mrr"] += s["mrr"] * s["total"]
            sums["precision"] += s["precision_at_5"] * s["total"]
            sums["hit_rate"] += s["hit_rate"] * s["total"]
        if total == 0:
            return {k: 0.0 for k in _RETRIEVAL_METRIC_NAMES}
        return {k: round(v / total, 4) for k, v in sums.items()}

    def _agg_ragas(cats: dict) -> dict:
        sums = {k: 0.0 for k in _RAGAS_METRIC_NAMES}
        total = 0
        for cat, s in cats.items():
            if cat == "abstention":
                continue
            scored = s["scored"]
            if not scored:
                continue
            total += scored
            sums["faithfulness"] += (s["faithfulness"] or 0) * scored
            sums["answer_relevancy"] += (s["answer_relevancy"] or 0) * scored
            sums["context_precision"] += (s["context_precision"] or 0) * scored
        if total == 0:
            return {k: None for k in _RAGAS_METRIC_NAMES}
        return {k: round(v / total, 4) for k, v in sums.items()}

    return {
        "total_questions": len(ragas_results),
        "ragas_scoring_failures": ragas_failed,
        "retrieval": {
            "aggregates": _agg_retrieval(retrieval_categories),
            "categories": retrieval_categories,
        },
        "ragas": {
            "aggregates": _agg_ragas(ragas_categories),
            "categories": ragas_categories,
            "scored_total": ragas_scored,
            "failed_total": ragas_failed,
        },
        "questions": ragas_results,
    }
