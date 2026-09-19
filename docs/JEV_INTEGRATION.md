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
| `JEV_ABSTENTION_ENABLED` | `true` | Calibrated abstention gate (needs `JEV_ENABLED`) |
| `JEV_ABSTENTION_THRESHOLD` | `0.5` | Abstain when P(answerable) < t or P(out_of_scope) ≥ t |

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

After retrieval and before generation, both paths run the abstention gate:

3. `resolve_answerability` asks Jev whether the retrieved candidates can
   answer the query (`answerable` + `out_of_scope` Nouls). When it abstains,
   generation is skipped and the response is `ABSTENTION_MESSAGE` with empty
   citations; non-streaming metadata gets `mode="abstention"`.

After generation, when citations exist, both paths run the guardrail:

4. `resolve_answer_verification` checks the answer against the retrieved
   context. If it is not grounded, the generated text is replaced by
   `build_retrieval_fallback_response(..., intro=GROUNDED_FALLBACK_INTRO)` — a
   deterministic, citation-backed venue list.
   - Non-streaming: replaced before returning; metadata gets
     `fallback_triggered=True`, `error_stage="verification"`,
     `error_code="ungrounded_answer"`.
   - Streaming: the frontend replaces streamed text with the `done` event's
     `content`, so the fallback is emitted in `done` with `"verified": false`.
     (The ungrounded text is briefly visible while it streams.)

Everything is behind `JEV_ENABLED` / `JEV_GUARDRAIL_ENABLED` /
`JEV_ABSTENTION_ENABLED`. When off, the key is missing, the call times out, or
the response is malformed, the code behaves exactly as before. New Prometheus
series: `jev_requests_total{decision,status}` and `jev_latency_seconds{decision}`
(`decision` is `query_analysis`, `answer_verification`, `answerability`, or
`eval_judge`).

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

### Abstention calibration

`scripts/run_eval.py --jev` uses the Jev abstention gate for the abstention
category instead of the raw `similarity < 0.3` cutoff. Measured on the
96-question benchmark (retrieval only, no generation):

| | Abstention pass | Over-abstention on legit queries |
|---|---|---|
| Baseline (`similarity < 0.3`) | 15/18 | ~0/78 |
| Jev gate | 15/18 | 1/78 (1.3%) |

Getting there took two wording iterations (documented here so the next person
doesn't repeat them):

- A strict "satisfy every requested attribute" `answerable` question caught
  all 18 but over-abstained on **83%** of legit queries (it conflates retrieval
  quality with scope). Rejected.
- Defining scope as "Manhattan nightlife" wrongly flagged restaurants, cafes,
  museums, and galleries as out of scope (**~19%** over-abstention). Fixed by
  enumerating the catalog: bars, clubs, lounges, restaurants, cafes, museums,
  art galleries.
- Adding an events/schedules clause to `out_of_scope` caused false positives on
  "live jazz performances in Manhattan". Moved that catch into the `answerable`
  question instead.

The 3 remaining misses (Q092 valet parking + waterfront views, Q095 dog menus,
Q096 private rooms for 20) are attribute-level requests. They are deliberately
**not** abstained: the venues may well satisfy them, the data just doesn't say
so, and the guardrail/prompt stop the model fabricating the attribute. Treating
them as abstention would require a separate, noisier signal.

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

1. **Rerank with Jev Score.** Score `(query, candidate)` relevance with
   calibrated probabilities, replacing the latency-blocked cross-encoder and
   enabling threshold-based filtering.
2. **Move the query analysis to the route layer.** Compute `QueryAnalysis`
   once in `app.py` and pass it through, then remove the remaining
   `extract_location_from_query` / regex category paths.
3. **Guardrail + abstention threshold tuning.** Calibrate
   `JEV_CONFIDENCE_THRESHOLD` / `JEV_ABSTENTION_THRESHOLD` against the
   benchmark's false-positive and false-negative rates once generation credits
   are restored.
4. **Run the full A/B.** With HF credits restored, run `--jev` vs. baseline
   over all 96 questions and record the deltas in
   `docs/EVALUATION_STRATEGY.md`.
