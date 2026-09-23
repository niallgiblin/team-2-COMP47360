#!/usr/bin/env python3
"""Controlled pipeline A/B — jev vs option-1, generation held fixed.

For each benchmark question this generates the RAG answer ONCE (temperature 0)
against a fixed retrieval context, then replays that same raw answer through
both pipelines' decision layers:

  * jev     : Jev query analysis (categories), calibrated abstention, guardrail
  * opt1    : regex categories, no abstention, guardrail

Because no answer is regenerated between arms, judged differences come from the
*decisions* (abstain / replace / caveat / category notice), not HF sampling.
Retrieval is held to the benchmark filter, which is the canonical macro-zone
that both pipelines resolve to (live jev/opt1 retrieval was verified identical).

Usage:
    export TYPESAFE_API_KEY=ts_...
    export HF_TOKEN=hf_...
    PYTHONPATH=. python3 scripts/pipeline_ab.py --limit 48 --report reports/pipeline-ab.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
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

# Offline harness: force the cross-encoder onto CPU. The MPS backend has
# segfaulted on this model during batch scoring; CPU is slower but stable and
# matches the container (Linux/CPU). Set PIPELINE_AB_CPU=0 to opt out.
if os.getenv("PIPELINE_AB_CPU", "1").lower() not in {"0", "false", "no"}:
    try:
        import sentence_transformers as _st

        _orig_ce = _st.CrossEncoder
        _st.CrossEncoder = lambda *a, **k: _orig_ce(*a, device="cpu", **k)
    except Exception:  # pragma: no cover - best effort
        pass

from run_eval import _init_search_service, _load_benchmark  # noqa: E402

_METRICS = ("faithfulness", "answer_relevancy", "context_precision")


def _tiered(raw, verification, context, citations):
    """Current guardrail policy, shared by both arms."""
    from chat_service import (
        GROUNDED_FALLBACK_INTRO,
        UNVERIFIED_CAVEAT,
        build_retrieval_fallback_response,
    )

    if verification is None:
        return raw, "unverified"
    if verification.action == "replace":
        return build_retrieval_fallback_response(
            context, citations, intro=GROUNDED_FALLBACK_INTRO,
        ), "replace"
    if verification.action == "caveat":
        return f"{raw}\n\n{UNVERIFIED_CAVEAT}", "caveat"
    return raw, "pass"


def _judge(query, answer, contexts, cache):
    from eval_service import score_with_ragas

    if not answer:
        return None
    if answer in cache:
        return cache[answer]
    scores = score_with_ragas(query, answer, contexts, judge="jev")
    cache[answer] = scores
    return scores


def _aggregate(rows):
    out = {}
    for arm in ("jev", "opt1"):
        vals = {m: [] for m in _METRICS}
        actions = Counter()
        for r in rows:
            entry = r["arms"][arm]
            actions[entry["action"]] += 1
            for m in _METRICS:
                v = (entry["scores"] or {}).get(m)
                if v is not None:
                    vals[m].append(v)
        out[arm] = {
            "n": len(rows),
            "actions": dict(actions),
            **{m: (round(statistics.mean(vals[m]), 4) if vals[m] else None) for m in _METRICS},
        }
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Controlled jev-vs-opt1 pipeline A/B")
    parser.add_argument("--benchmark", default="data/benchmark.jsonl")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.0)
    parser.add_argument("--report", default=None)
    args = parser.parse_args(argv)

    from chat_service import (
        ABSTENTION_MESSAGE,
        _ACTIVITY_PATTERNS,
        _load_known_zones,
        build_busyness_context,
        build_chat_messages,
        format_retrieval_context,
        huggingface_chat_api_call,
        prepend_missing_bowling_notice,
    )
    from eval_service import _build_context_strings_from_results
    from jev_service import analyze_query, assess_answerability, verify_answer

    entries = _load_benchmark(_PROJECT_ROOT / args.benchmark)
    if args.limit:
        entries = entries[: args.limit]
    service = _init_search_service()
    busyness = build_busyness_context()
    zones = _load_known_zones()
    categories = list(_ACTIVITY_PATTERNS.keys())

    rows = []
    judge_cache: dict[str, dict | None] = {}
    for i, entry in enumerate(entries, 1):
        query = entry.get("standalone_query") or entry["query"]
        filters = entry.get("filters") or {}
        location = filters.get("location")

        try:
            results = service.search(
                query, limit=5,
                location_filter=location, price_range=filters.get("price_range"),
            )
        except Exception:
            results = []
        context, citations = format_retrieval_context(results)
        contexts = _build_context_strings_from_results(results)

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
        analysis = analyze_query(query, zones=zones, categories=categories, enabled=True)

        arms = {}

        # --- option-1: regex categories, no abstention ---------------------
        opt1_answer, opt1_action = _tiered(raw, verification, context, citations)
        opt1_answer = prepend_missing_bowling_notice(
            opt1_answer, query, citations, requested_categories=None,
        )
        arms["opt1"] = {
            "action": opt1_action,
            "scores": _judge(query, opt1_answer, contexts, judge_cache),
        }

        # --- jev: Jev categories + calibrated abstention -------------------
        abstained = False
        if analysis is not None and citations:
            assessment = assess_answerability(query, citations, enabled=True)
            if assessment is not None and assessment.should_abstain:
                abstained = True
        if abstained:
            arms["jev"] = {
                "action": "abstain",
                "scores": _judge(query, ABSTENTION_MESSAGE, contexts, judge_cache),
            }
        else:
            jev_answer, jev_action = _tiered(raw, verification, context, citations)
            jev_answer = prepend_missing_bowling_notice(
                jev_answer, query, citations,
                requested_categories=(analysis.categories if analysis is not None else None),
            )
            arms["jev"] = {
                "action": jev_action,
                "scores": _judge(query, jev_answer, contexts, judge_cache),
            }

        rows.append({
            "id": entry["id"],
            "category": entry["category"],
            "actions": {a: arms[a]["action"] for a in arms},
            "arms": arms,
        })
        logging.getLogger("pipeline_ab").warning(
            "[%d/%d] %s opt1=%s jev=%s",
            i, len(entries), entry["id"], arms["opt1"]["action"], arms["jev"]["action"],
        )
        if args.delay:
            time.sleep(args.delay)

    report = {"n": len(rows), "arms": _aggregate(rows), "questions": rows}
    print(json.dumps(report["arms"], indent=2))
    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(json.dumps(report, indent=2))
        print(f"Report written to {args.report}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
