# Jev (TypeSafe System One) Integration

Status: **scaffolding landed on the `jev` branch. Disabled by default.**

This document describes how the AI Concierge RAG pipeline uses
[TypeSafe System One / Jev](https://docs.typesafe.ai/introduction), what is
wired today, and what to build next. Jev returns *typed, calibrated decisions*
(Choice / Score / Noul) instead of free text, so it augments the pipeline at
decision points — it does not replace the Llama response generator.

## Why

The pipeline's retrieval core (MPNet + FAISS + BM25 + RRF) is strong. Its weak
points are the hand-written heuristics wrapped around it:

| Weak point | Current implementation | Jev primitive |
|---|---|---|
| General-vs-venue chat gate | ~20 regexes (`is_general_chat_query`) | Noul |
| Location extraction | substring match vs. zone aliases | Choice |
| Requested activity categories | regex + synonym maps | Noul per category |
| Price tier | not detected in chat path | Choice |
| Re-ranking (disabled for latency) | cross-encoder | Score |
| Post-hoc hallucination control | prompt rules + offline judge | Noul/verification |

Jev runs one parallel call for many narrow questions and returns a calibrated
`confidence` per answer, which lets the code branch on uncertainty instead of
guessing.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `TYPESAFE_API_KEY` | *(empty)* | Key from https://console.typesafe.ai/keys |
| `JEV_ENABLED` | `false` | Master switch. When false, nothing changes. |
| `JEV_MODEL` | `jev-latest` | Model alias |
| `TYPESAFE_API_URL` | `https://api.typesafe.ai/v1/systemone` | Endpoint override |
| `JEV_TIMEOUT_SECONDS` | `8` | Per-request timeout |
| `JEV_MAX_RETRIES` | `2` | Retries for 429/529 + transient errors |
| `JEV_CONFIDENCE_THRESHOLD` | `0.5` | Below this, an answer is treated as no signal |

Add the key to `.env` and pass `TYPESAFE_API_KEY` / `JEV_ENABLED` through
`docker-compose.yml` (already wired for the `llm-service`).

## Modules

- `jev_service.py` — the single boundary to the TypeSafe API.
  - `JevClient` — HTTP client with retry/backoff and an injectable `transport`
    (mirrors the existing `hf_call` test seam).
  - `noul()`, `choice()`, `score()` — question builders.
  - `analyze_query()` — the query-understanding decision. **Never raises**;
    returns `None` on any failure so callers can fall back.
  - `QueryAnalysis` — typed result (`is_general_chat`, `location`,
    `price_tier`, `categories`, and confidences).
- `chat_service.resolve_query_analysis()` — builds the question set from the
  corpus vocabulary (`_load_known_zones()`, `_ACTIVITY_PATTERNS`) and calls
  `analyze_query`. Returns `None` when `JEV_ENABLED` is false or on failure.
- `chat_service._is_general_chat()` — Jev-first gate, regex fallback.

## Wired today

Both chat entry points (`stream_chat_response` and
`get_ai_response_with_metadata`) call `resolve_query_analysis` once per
request, then:

1. Use `analysis.is_general_chat` in place of `is_general_chat_query`.
2. Fill `location_filter` from `analysis.location` when the route layer did not
   already detect one.

Everything is behind `JEV_ENABLED`. When it is off, the key is missing, the
call times out, or the response is malformed, the code behaves exactly as
before. New Prometheus series: `jev_requests_total{decision,status}` and
`jev_latency_seconds{decision}`.

## Verifying

Unit tests (no network):

```bash
cd BackEnd/llm-service
PYTHONPATH=. python3 -m pytest tests/test_jev_service.py tests/test_jev_integration.py -q
```

Live smoke test:

```bash
export TYPESAFE_API_KEY=ts_...
cd BackEnd/llm-service
PYTHONPATH=. python3 scripts/jev_smoke.py
PYTHONPATH=. python3 scripts/jev_smoke.py "is there a rooftop bar in soho?"
```

## Next steps (not yet built)

Ordered by expected value:

1. **Runtime faithfulness guardrail.** After generation, verify each venue
   claim against the retrieved context with a Noul per citation, and fall back
   to `build_retrieval_fallback_response` when support is low. Highest
   reliability win; attacks the prompt-rule fragility directly.
2. **Calibrated abstention.** Decide `answerable` over the retrieved candidate
   set instead of the prompt rule "respond exactly 'no matching venues
   found'". Directly targets the 18 abstention benchmark cases.
3. **Rerank with Jev Score.** Score `(query, candidate)` relevance with
   calibrated probabilities, replacing the latency-blocked cross-encoder and
   enabling threshold-based filtering.
4. **Move the query analysis to the route layer.** Compute `QueryAnalysis`
   once in `app.py` and pass it through, then remove the remaining
   `extract_location_from_query` / regex category paths.
5. **Jev-backed eval judge.** Swap the slow LLM-as-judge in `eval_service.py`
   for a typed, calibrated scorer feeding the existing benchmark harness.
