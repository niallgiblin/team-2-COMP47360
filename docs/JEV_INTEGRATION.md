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
| `JEV_GUARDRAIL_REPLACE_THRESHOLD` | `0.8` | Replace the answer at/above this unsupported-detail probability |
| `JEV_GUARDRAIL_CAVEAT_THRESHOLD` | `0.5` | Append a caveat at/above this unsupported/faithful probability |
| `JEV_ABSTENTION_ENABLED` | `true` | Calibrated abstention gate (needs `JEV_ENABLED`) |
| `JEV_ABSTENTION_THRESHOLD` | `0.5` | Abstain when P(answerable) < t or P(out_of_scope) ≥ t |
| `JEV_RERANK_ENABLED` | `false` | Use Jev to re-rank candidates (replaces the cross-encoder) |
| `JEV_RERANK_OVERFETCH_MULTIPLIER` | `5` | Candidate over-fetch when Jev re-ranks |
| `JEV_RERANK_MAX_CANDIDATES` | `50` | Max candidates scored in one Jev call |

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
- `jev_service.rerank()` — one `Score` question per candidate, evaluated in a
  single parallel call, returning calibrated 0–1 relevance aligned to the
  input. `search_service._re_rank` prefers it over the cross-encoder when
  `JEV_RERANK_ENABLED` is set; `_overfetch()` selects the candidate pool size
  for the active strategy.

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
   context and returns an action:
   - `replace` (fabricated venue or unsupported detail ≥ 0.8) → swap the
     answer for `build_retrieval_fallback_response(...)`. Non-streaming sets
     `fallback_triggered=True`, `error_stage="verification"`,
     `error_code="ungrounded_answer"`, `guardrail_action="replace"`.
   - `caveat` (low faithfulness or unsupported detail ≥ 0.5) → keep the
     answer and append `UNVERIFIED_CAVEAT`; `guardrail_action="caveat"`.
   - `pass` → no change.
   - Streaming applies the same to the `done` event's `content`, which the
     frontend swaps in. (Replaced text is briefly visible while streaming.)

Everything is behind `JEV_ENABLED` / `JEV_GUARDRAIL_ENABLED` /
`JEV_ABSTENTION_ENABLED`. When off, the key is missing, the call times out, or
the response is malformed, the code behaves exactly as before. New Prometheus
series: `jev_requests_total{decision,status}` and `jev_latency_seconds{decision}`
(`decision` is `query_analysis`, `answer_verification`, `answerability`,
`rerank`, or `eval_judge`).

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
# Full: Jev query analysis + guardrail + abstention
PYTHONPATH=. python3 scripts/eval_ragas.py --jev --report reports/jev-on.json
# Baseline (no Jev) for comparison
PYTHONPATH=. python3 scripts/eval_ragas.py --report reports/jev-off.json
# Isolate the pipeline: same Jev judge, baseline generation path
PYTHONPATH=. python3 scripts/eval_ragas.py --jev-judge --report reports/control.json
# Hermetic smoke (mock generation + mocked Jev judge, no API calls)
PYTHONPATH=. python3 scripts/eval_ragas.py --jev --mock-judge --limit 5
```

The clean A/B is `--jev-judge` (control) vs `--jev` (treatment): both score
with the Jev judge, so only the generation pipeline differs.

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

### A/B result (96 questions, same Jev judge all arms)

All arms scored with the Jev judge so only the pipeline varies. Generation used
the restored HF credits; 0 scoring failures.

| Arm | Faithfulness | Answer relevancy | Context precision | Guardrail |
|---|---|---|---|---|
| A baseline pipeline | 0.3566 | **0.7784** | 0.6773 | — |
| B guardrail v1 (replace-any) | **0.4282** | 0.6873 | **0.6992** | 32 replace |
| B2 guardrail tuned (tiered) | 0.3486 | 0.7590 | 0.6943 | 4 replace + 25 caveat |

Abstention fired on 16 questions in both B and B2 (unchanged).

The v1 guardrail logged each verdict; the signal distribution was the case for
tuning:

| Trigger reason (v1, n=31) | Count |
|---|---|
| `fabricated_venue ≥ 0.5` (invented venue) | **1** |
| `unsupported_detail ≥ 0.5` | 13 |
| only `faithful < 0.5` (no fabrication, low detail risk) | 17 |

So 30/31 wholesale replacements were not fabricated venues — the answer was
merely under-grounded. The tiered guardrail keeps those answers and appends a
caveat instead, replacing only on a fabricated venue or a severe
unsupported detail (`≥ JEV_GUARDRAIL_REPLACE_THRESHOLD`, default 0.8).

Reading:

- **Tuning recovers most of the relevancy** (−0.019 vs −0.091) while still
  hard-blocking fabricated venues (4 replacements). The caveat applies to
  soft cases (median `faithful` 0.42).
- The faithfulness advantage of v1 comes from replacing 32 answers with
grounded venue lists; with only 4 replacements that lift largely disappears.
- **Methodological caveat:** generation uses `temperature=0.4`, so each arm
  re-samples the answers and cross-arm differences include generation noise.
  The v1→B2 faithfulness drop (0.43→0.35) is larger than plausible noise, but
  a definitive number needs a fixed-generation (temperature 0) or multi-seed
  run. The relevancy/trigger-count differences are policy effects and are
  reliable.
- **Chosen default: the tuned (tiered) guardrail.** Its core job is to stop
  invented venues, which it does, without discarding a third of all answers.

### Re-ranking: cross-encoder vs Jev

`scripts/rerank_bench.py` over all 96 questions:

| Strategy | p50 | p95 | Recall@5 | NDCG@5 | Hit Rate |
|---|---|---|---|---|---|
| None | 22.5 ms | 25.1 ms | 0.4493 | 0.4357 | 0.5938 |
| Cross-encoder | 57.8 ms | 81.2 ms | 0.4899 | 0.4984 | 0.6771 |
| Jev | 887.7 ms | 1222.5 ms | 0.4889 | 0.4975 | 0.6562 |

**Jev re-ranking matches cross-encoder quality but is ~15× slower.** It does not
unblock the cross-encoder — the opposite: the local model is already the cheap
option. Consequently the cross-encoder was **re-enabled**
(`CROSS_ENCODER_ENABLED=true`) and Jev re-ranking stays behind
`JEV_RERANK_ENABLED=false`, useful only where no local model can run or for
offline batch re-ranking. See [CROSS_ENCODER_TRADEOFF.md](CROSS_ENCODER_TRADEOFF.md).

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

1. **Controlled guardrail evaluation.** Re-run the A/B at temperature 0 (or
   multi-seed) so the guardrail's effect is not confounded by generation
   sampling. The trigger-count and relevancy effects are already clear; the
   faithfulness delta needs a fixed-generation comparison.
2. **Move the query analysis to the route layer.** Compute `QueryAnalysis`
   once in `app.py` and pass it through, then remove the remaining
   `extract_location_from_query` / regex category paths.
3. **Jev re-ranking for serverless / batch.** Keep `JEV_RERANK_ENABLED=false`
   for interactive use (see the benchmark), but it is a viable option where no
   local cross-encoder can run, or for offline re-ranking of large candidate
   sets.
