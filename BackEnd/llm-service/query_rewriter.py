"""LLM-based query rewriting for conversational venue search.

Replaces the static query_expander.py keyword map with a lightweight HF API
call that can handle paraphrases, synonyms, zone aliases, and underspecified
queries.

Enabled only in the chat path (not /search or /similar).  Falls back to the
static expansion map on any failure.  Controlled by QUERY_REWRITE_ENABLED env
var (default: True).

Observability:
  - Counter: query_rewrite_total{status=success|fallback|timeout}
  - Histogram: query_rewrite_duration_seconds
"""

from __future__ import annotations

import logging
import os
import time
from typing import Callable

logger = logging.getLogger(__name__)

QUERY_REWRITE_ENABLED = os.getenv("QUERY_REWRITE_ENABLED", "true").lower() in {
    "1", "true", "yes",
}

_REWRITE_SYSTEM_PROMPT = (
    "You are a query rewriter for a Manhattan venue search engine. "
    "Your job is to rewrite a user's natural-language query into a keyword-rich "
    "search query that will find relevant bars, restaurants, clubs, and venues. "
    "Add synonyms, normalize neighborhood names, and clarify intent. "
    "Keep the rewritten query under 15 words. "
    "Output ONLY the rewritten query, nothing else."
)

_REWRITE_TIMEOUT_S = 5.0
_REWRITE_MAX_TOKENS = 50

# Lazy-imported metrics
_rewrite_counter = None
_rewrite_histogram = None


def _init_metrics():
    """Lazy-initialise Prometheus metrics for query rewriting."""
    global _rewrite_counter, _rewrite_histogram
    if _rewrite_counter is not None:
        return
    try:
        # Import may fail if observability module is not loaded
        from observability import (
            REWRITE_COUNTER,
            REWRITE_HISTOGRAM,
        )
        _rewrite_counter = REWRITE_COUNTER
        _rewrite_histogram = REWRITE_HISTOGRAM
    except ImportError:
        # Observability not initialised — no metrics (non-fatal)
        pass


def rewrite_query(
    query: str,
    hf_call: Callable[..., dict] | None = None,
) -> str:
    """Rewrite a user query for better retrieval.

    Parameters
    ----------
    query : str
        The original user query.
    hf_call : callable | None
        Injection point for tests.  When None, uses
        ``chat_service.huggingface_chat_api_call``.

    Returns
    -------
    str
        Rewritten query, or the original query on any failure.
    """
    if not QUERY_REWRITE_ENABLED:
        return query

    if not query or not query.strip():
        return query

    _init_metrics()

    messages = [
        {"role": "system", "content": _REWRITE_SYSTEM_PROMPT},
        {"role": "user", "content": f"Query: {query}"},
    ]

    try:
        if hf_call is None:
            import sys
            from pathlib import Path
            _PROJECT_ROOT = Path(__file__).resolve().parent
            if str(_PROJECT_ROOT) not in sys.path:
                sys.path.insert(0, str(_PROJECT_ROOT))
            from chat_service import huggingface_chat_api_call
            hf_call = huggingface_chat_api_call

        t0 = time.perf_counter()
        response = hf_call(
            messages,
            max_tokens=_REWRITE_MAX_TOKENS,
            timeout=_REWRITE_TIMEOUT_S,
        )
        elapsed = time.perf_counter() - t0

        rewritten = response["choices"][0]["message"]["content"].strip()

        # Sanity check: if the rewrite is empty or wildly different length,
        # fall back to original.
        if not rewritten:
            logger.debug("query_rewriter: empty rewrite — using original")
            _record_metric("fallback", elapsed)
            return query
        if len(rewritten) > len(query) * 5:
            logger.debug(
                "query_rewriter: rewrite too long (%d chars vs %d) — using original",
                len(rewritten), len(query),
            )
            _record_metric("fallback", elapsed)
            return query

        logger.debug(
            "query_rewriter: original=%r → rewritten=%r (%.2fs)",
            query, rewritten, elapsed,
        )
        _record_metric("success", elapsed)
        return rewritten

    except Exception as exc:
        logger.debug("query_rewriter: HF call failed — using original: %s", exc)
        _record_metric("timeout" if "timeout" in str(exc).lower() else "fallback", 0)
        return query


def _record_metric(status: str, duration_s: float):
    """Record Prometheus metrics if available."""
    if _rewrite_counter is not None:
        try:
            _rewrite_counter.labels(status=status).inc()
        except Exception:
            pass
    if _rewrite_histogram is not None and duration_s > 0:
        try:
            _rewrite_histogram.observe(duration_s)
        except Exception:
            pass
