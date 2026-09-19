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
| `JEV_GUARDRAIL_ENABLED` | `true` | Runtime faithfulness guardrail (needs `JEV_ENABLED`) |

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
- `chat_service.resolve_answer_verification()` — runs `verify_answer` over a
  generated answer plus its citations.
- `jev_service.verify_answer()` — the faithfulness guardrail: three Noul
  questions (`faithful`, `fabricated_venue`, `unsupported_detail`) returning
  an `AnswerVerification`. Grounded requires a confident positive on `faithful`
  and confident negatives on both failure detectors.

## Wired today

Both chat entry points (`stream_chat_response` and
`get_ai_response_with_metadata`) call `resolve_query_analysis` once per
request, then:

1. Use `analysis.is_general_chat` in place of `is_general_chat_query`.
2. Fill `location_filter` from `analysis.location` when the route layer did not
   already detect one.

After generation, when citations exist, both paths run the guardrail:

3. `resolve_answer_verification` checks the answer against the retrieved
   context. If it is not grounded, the generated text is replaced by
   `build_retrieval_fallback_response(..., intro=GROUNDED_FALLBACK_INTRO)` — a
   deterministic, citation-backed venue list.
   - Non-streaming: replaced before returning; metadata gets
     `fallback_triggered=True`, `error_stage="verification"`,
     `error_code="ungrounded_answer"`.
   - Streaming: the frontend replaces streamed text with the `done` event's
     `content`, so the fallback is emitted in `done` with `"verified": false`.
     (The ungrounded text is briefly visible while it streams.)

Everything is behind `JEV_ENABLED` / `JEV_GUARDRAIL_ENABLED`. When off, the
key is missing, the call times out, or the response is malformed, the code
behaves exactly as before. New Prometheus series:
`jev_requests_total{decision,status}` and `jev_latency_seconds{decision}`
(`decision` is `query_analysis`, `answer_verification`, or `eval_judge`).

## Evaluation harness

The benchmark harness can use Jev in two places, enabled by `--jev`:

1. **Judge.** `jev_service.judge_answer()` scores `(question, answer, context)`
   with three System One `Score` questions (`faithfulness`,
   `answer_relevancy`, `context_precision`), mirroring `prompts/judge-v1.yaml`.
   Five levels map linearly to 0–1, so it is a drop-in for
   `eval_service._call_judge`. Selected via `score_with_ragas(judge="jev")`
   and `run_ragas_eval(judge="jev")`.
2. **Generation path.** `run_ragas_eval(use_jev=True)` routes generation through
   `get_ai_response_with_metadata` (with a pre-computed search helper) so the
   Jev query analysis and faithfulness guardrail actually run. Result records
   gain `guardrail_triggered` and `mode`, aggregated under `guardrail` in the
   report.

```bash
cd BackEnd/llm-service
export TYPESAFE_API_KEY=ts_...
# Full: Jev query analysis + guardrail + Jev judge
PYTHONPATH=. python3 scripts/eval_ragas.py --jev --report reports/jev-on.json
# Baseline (no Jev) for comparison
PYTHONPATH=. python3 scripts/eval_ragas.py --report reports/jev-off.json
# Hermetic smoke (mock generation + mocked Jev judge, no API calls)
PYTHONPATH=. python3 scripts/eval_ragas.py --jev --mock-judge --limit 5
```

`scripts/run_eval.py` accepts `--jev` too, applying it to the `--ragas` pass.
It also carries a fix for graded NDCG: `relevance_grades` keys arrive as
strings from JSON but were looked up with int ids, which collapsed graded
NDCG to 0. `compute_ndcg_at_k` now normalises keys (aggregate NDCG
0.051 → 0.406 on the 96-question benchmark).

> Note: the HF generation path and the HF judge both require Hugging Face
> inference credits. When those run out (`402 Payment Required`), only a
> working generator plus the Jev judge remains viable — another reason to run
> `--jev`.

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

1. **Calibrated abstention.** Decide `answerable` over the retrieved candidate
   set instead of the prompt rule "respond exactly 'no matching venues
   found'". Directly targets the 18 abstention benchmark cases.
2. **Rerank with Jev Score.** Score `(query, candidate)` relevance with
   calibrated probabilities, replacing the latency-blocked cross-encoder and
   enabling threshold-based filtering.
3. **Move the query analysis to the route layer.** Compute `QueryAnalysis`
   once in `app.py` and pass it through, then remove the remaining
   `extract_location_from_query` / regex category paths.
4. **Guardrail threshold tuning.** The grounded decision currently uses
   `JEV_CONFIDENCE_THRESHOLD` plus a fixed 0.5 floor on the failure detectors.
   Calibrate against the benchmark's false-positive / false-negative rates.
5. **Run the A/B.** With HF credits restored, run `--jev` vs. baseline over
   all 96 questions and record the deltas in `docs/EVALUATION_STRATEGY.md`.
