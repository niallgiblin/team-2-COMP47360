#!/usr/bin/env python3
"""Live smoke test for the TypeSafe System One / Jev integration.

Exercises ``jev_service.analyze_query`` against the real API for a handful of
representative concierge queries and prints the typed, calibrated output. Use
it to sanity-check that the key works and that the decision quality is sane
before flipping ``JEV_ENABLED`` in an environment.

Usage:
    export TYPESAFE_API_KEY=ts_...
    PYTHONPATH=. python3 scripts/jev_smoke.py
    PYTHONPATH=. python3 scripts/jev_smoke.py "is there a rooftop bar in soho?"

Exits 0 if at least one call succeeded, 1 otherwise.
"""

from __future__ import annotations

import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from jev_service import JevClient, analyze_query, verify_answer  # noqa: E402

# A zone/category vocabulary mirroring the corpus wiring in chat_service.
_ZONES = [
    "midtown", "upper west side", "upper east side", "east village",
    "west village", "lower east side", "chelsea", "soho", "tribeca",
    "harlem", "financial district", "gramercy", "williamsburg", "kips bay",
]
_CATEGORIES = [
    "bowling", "comedy", "jazz", "dance", "rooftop", "wine", "cocktail",
    "speakeasy", "karaoke", "live music", "outdoor", "quiet",
]

_DEFAULT_QUERIES = [
    "hello, what can you do?",
    "find me a jazz bar in midtown",
    "somewhere fun tonight",
    "cheap eats in the east village",
    "what about a rooftop place?",
    "how do you work?",
]

# (label, context, answer, expected_grounded)
_GUARDRAIL_CASES = [
    (
        "grounded",
        "1. Tomi Jazz — Zone: Midtown, Type: Jazz Bar, Rating: 4.3/5.",
        "Tomi Jazz [1] is a jazz bar in Midtown rated 4.3/5.",
        True,
    ),
    (
        "fabricated venue",
        "1. Tomi Jazz — Zone: Midtown, Type: Jazz Bar, Rating: 4.3/5.",
        "Cafe Wha? [1] is a jazz bar in Midtown with a 4.9 rating and a rooftop.",
        False,
    ),
    (
        "unsupported detail",
        "1. Tomi Jazz — Zone: Midtown, Type: Jazz Bar, Rating: 4.3/5.",
        "Tomi Jazz [1] is a jazz bar in Midtown with a Michelin star.",
        False,
    ),
    (
        "wrong zone",
        "1. Tomi Jazz — Zone: Midtown, Type: Jazz Bar, Rating: 4.3/5.",
        "Tomi Jazz [1] is a jazz bar in the East Village rated 4.3/5.",
        False,
    ),
]


def _run_query_analysis(client: JevClient, queries: list[str]) -> int:
    ok = 0
    for query in queries:
        print(f"query: {query!r}")
        analysis = analyze_query(
            query,
            zones=_ZONES,
            categories=_CATEGORIES,
            client=client,
            enabled=True,
        )
        if analysis is None:
            print("  -> NO SIGNAL (would fall back to regex)\n")
            continue
        ok += 1
        payload = analysis.as_dict()
        print(f"  is_general_chat : {payload['is_general_chat']} "
              f"(p={payload['general_chat_probability']})")
        print(f"  location        : {payload['location']} "
              f"(confidence={payload['location_confidence']})")
        print(f"  price_tier      : {payload['price_tier']} "
              f"(confidence={payload['price_tier_confidence']})")
        print(f"  categories      : {', '.join(payload['categories']) or '(none)'}")
        print()
    return ok


def _run_guardrail(client: JevClient) -> int:
    ok = 0
    for label, context, answer, expected in _GUARDRAIL_CASES:
        verification = verify_answer(
            answer, context, client=client, enabled=True
        )
        if verification is None:
            print(f"{label:20} -> NO SIGNAL")
            continue
        mark = "OK" if verification.grounded == expected else "UNEXPECTED"
        if mark == "OK":
            ok += 1
        print(f"{label:20} grounded={verification.grounded!s:5} "
              f"expected={expected!s:5} [{mark}] {verification.as_dict()}")
    return ok


def main(argv: list[str]) -> int:
    queries = argv[1:] or _DEFAULT_QUERIES

    client = JevClient()
    if not client.available:
        print("ERROR: TYPESAFE_API_KEY is not set. Export it and retry.")
        return 1

    print(f"TypeSafe endpoint: {client.api_url}")
    print(f"Model:             {client.model}\n")

    print("=== Query understanding ===")
    analysed = _run_query_analysis(client, queries)
    print(f"{analysed}/{len(queries)} queries returned a usable analysis.\n")

    print("=== Faithfulness guardrail ===")
    guarded = _run_guardrail(client)
    print(f"{guarded}/{len(_GUARDRAIL_CASES)} guardrail cases matched expectation.\n")

    return 0 if analysed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
