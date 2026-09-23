#!/usr/bin/env python3
"""Controlled guardrail A/B — isolate the guardrail from generation noise.

Generates each benchmark answer ONCE (temperature 0), captures the raw answer
and its Jev verification, then applies each guardrail policy to the *same*
answers and re-judges. Because no answer is regenerated between policies, the
faithfulness/relevancy differences are attributable to the guardrail alone,
not to sampling.

Usage:
    export TYPESAFE_API_KEY=ts_...
    export HF_TOKEN=hf_...
    JEV_ENABLED=true PYTHONPATH=. python3 scripts/guardrail_ab.py \
        --report reports/guardrail-ab.json

    # fast smoke
    PYTHONPATH=. python3 scripts/guardrail_ab.py --limit 5
"""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import sys
import time
from collections import Counter
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

from run_eval import _init_search_service, _load_benchmark  # noqa: E402

_METRICS = ("faithfulness", "answer_relevancy", "context_precision")


def _apply_v1(raw, verification, context, citations, **kw):
    """Original guardrail: any ungrounded verdict replaces the answer."""
    grounded = (
        verification.faithful_probability >= 0.5
        and verification.fabricated_venue_probability < 0.5
        and verification.unsupported_detail_probability < 0.5
    )
    if grounded:
        return raw, "pass"
    fallback = _fallback(context, citations)
    return fallback, "replace"


def _apply_tiered(raw, verification, context, citations, **kw):
    """Current guardrail: hard replace only on fabrication/severe detail."""
    if verification.action == "replace":
        return _fallback(context, citations), "replace"
    if verification.action == "caveat":
        return f"{raw}\n\n{kw['caveat']}", "caveat"
    return raw, "pass"


def _fallback(context, citations):
    from chat_service import GROUNDED_FALLBACK_INTRO, build_retrieval_fallback_response

    return build_retrieval_fallback_response(
        context, citations, intro=GROUNDED_FALLBACK_INTRO,
    )


POLICIES = {
    "none": lambda raw, v, context, citations, **kw: (raw, "pass"),
    "v1_replace_any": _apply_v1,
    "tiered": _apply_tiered,
}


def _aggregate(rows):
    out = {}
    for policy in POLICIES:
        vals = {m: [] for m in _METRICS}
        actions = Counter()
        for r in rows:
            entry = r["policies"][policy]
            actions[entry["action"]] += 1
            for m in _METRICS:
                v = (entry["scores"] or {}).get(m)
                if v is not None:
                    vals[m].append(v)
        out[policy] = {
            "n": len(rows),
            "actions": dict(actions),
            **{m: (round(statistics.mean(vals[m]), 4) if vals[m] else None) for m in _METRICS},
        }
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Controlled guardrail policy A/B")
    parser.add_argument("--benchmark", default="data/benchmark.jsonl")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.0)
    parser.add_argument("--report", default=None)
    args = parser.parse_args(argv)

    from chat_service import (
        UNVERIFIED_CAVEAT,
        build_busyness_context,
        build_chat_messages,
        format_retrieval_context,
        huggingface_chat_api_call,
    )
    from eval_service import _build_context_strings_from_results, score_with_ragas
    from jev_service import verify_answer

    entries = _load_benchmark(_PROJECT_ROOT / args.benchmark)
    if args.limit:
        entries = entries[: args.limit]
    service = _init_search_service()
    busyness = build_busyness_context()

    rows = []
    for i, entry in enumerate(entries, 1):
        query = entry.get("standalone_query") or entry["query"]
        filters = entry.get("filters") or {}
        t0 = time.perf_counter()
        try:
            results = service.search(
                query, limit=5,
                location_filter=filters.get("location"),
                price_range=filters.get("price_range"),
            )
        except Exception:
            results = []

        context, citations = format_retrieval_context(results)
        messages, _ = build_chat_messages(
            query=query, previous_questions=[], previous_responses=[],
            retrieval_context=context, search_helper=None, busyness_context=busyness,
        )
        try:
            response = huggingface_chat_api_call(messages, temperature=0.0)
            raw = response["choices"][0]["message"]["content"]
        except Exception as exc:
            logging.warning("generation failed for %s: %s", entry["id"], exc)
            raw = ""

        verification = verify_answer(
            raw, context,
            venue_names=[c.get("name") for c in citations if c.get("name")],
            enabled=True,
        )
        if verification is None:
            logging.warning("verification unavailable for %s — skipping", entry["id"])
            continue

        contexts = _build_context_strings_from_results(results)
        judge_cache: dict[str, dict | None] = {}
        policies = {}
        for policy, fn in POLICIES.items():
            answer, action = fn(raw, verification, context, citations, caveat=UNVERIFIED_CAVEAT)
            if not answer:
                scores = None
            elif answer in judge_cache:
                scores = judge_cache[answer]
            else:
                scores = score_with_ragas(query, answer, contexts, judge="jev")
                judge_cache[answer] = scores
            policies[policy] = {"action": action, "scores": scores}

        rows.append({
            "id": entry["id"],
            "category": entry["category"],
            "verification": verification.as_dict(),
            "policies": policies,
        })
        logger = logging.getLogger("guardrail_ab")
        logger.warning("[%d/%d] %s %s", i, len(entries), entry["id"],
                       {p: policies[p]["action"] for p in POLICIES})
        if args.delay:
            time.sleep(args.delay)

    report = {"n": len(rows), "policies": _aggregate(rows), "questions": rows}
    print(json.dumps(report["policies"], indent=2))
    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(json.dumps(report, indent=2))
        print(f"Report written to {args.report}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
