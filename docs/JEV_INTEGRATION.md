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
| `JEV_SEARCH_COMPOSE_ENABLED` | `false` | Append Jev location/price/category terms to the search query |

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

The **route layer** (`app.py`) computes `resolve_query_analysis` once per
request and passes the resulting `QueryAnalysis` down. `chat_service` accepts
it via a `query_analysis` argument (a sentinel means "not supplied — compute
here" so legacy/test callers still work). The route uses it to:

1. Route on `analysis.is_general_chat` (in place of `is_general_chat_query`).
2. Set `location_filter`: explicit request field → `analysis.location` →
   regex `extract_location_from_query` as a last resort.

`chat_service` then uses the passed analysis for the general-chat gate, the
location filter, and Jev-derived activity categories (falling back to the
regex map when the analysis is absent).

The route's search helper (`app._resolve_search_query`) also uses the analysis
to decide **not** to call the HF `rewrite_query`: when the route supplies an
analysis, the helper skips the rewrite and applies only the static
`expand_query` map. The analysis still drives the location filter and category
handling. Without an analysis (Jev disabled) the HF rewrite runs as before.
See "Query resolution" below for why the analysis is not appended as text.

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

### Guardrail A/B — controlled (96 questions, fixed generation)

`scripts/guardrail_ab.py` generates each answer **once** at temperature 0,
then applies every policy to the *same* answers. Judge scores are cached per
answer, so identical answers get identical scores — the guardrail effect is
fully isolated from generation and judge sampling.

| Policy | Faithfulness | Answer relevancy | Context precision | Actions |
|---|---|---|---|---|
| none | 0.3729 | **0.7180** | 0.6079 | 96 pass |
| v1 replace-any | **0.4513** | 0.6440 | **0.6185** | 36 replace |
| **tiered (chosen)** | 0.3924 | 0.7105 | 0.6109 | 5 replace + 31 caveat |

Δ vs no guardrail:

- v1: faithfulness **+0.078**, relevancy **−0.074**
- tiered: faithfulness **+0.020**, relevancy **−0.008**

The tiered guardrail is a favourable trade (~2.6:1): it keeps a quarter of
v1's faithfulness gain at a tenth of its relevancy cost, and still
hard-replaces every fabricated venue.

Why it works — the v1 trigger distribution (same run):

| Trigger reason | Count |
|---|---|
| `fabricated_venue ≥ 0.5` (invented venue) | **5** |
| `unsupported_detail ≥ 0.5` | 12 |
| only `faithful < 0.5` (no fabrication, low detail risk) | 19 |

Most v1 replacements were not fabricated venues — the answer was merely
under-grounded. The tiered guardrail keeps those and appends a caveat,
reserving replacement for a fabricated venue or a severe unsupported detail
(`≥ JEV_GUARDRAIL_REPLACE_THRESHOLD`, default 0.8).

> The earlier temperature-0.4 arms (A/B/B2, in `reports/ab-*.json`) are
> retained for provenance, but their cross-arm faithfulness deltas were
dominated by generation sampling and are superseded by the controlled run.

### Query resolution: HF rewrite vs Jev

`scripts/query_rewrite_ab.py` over all 96 questions (cross-encoder enabled):

| Resolution | Recall@5 | NDCG@5 | Hit Rate | Query ms |
|---|---|---|---|---|
| raw query | 0.4899 | 0.4984 | 0.6771 | 97 |
| static `expand` | **0.4950** | 0.4966 | 0.6667 | 57 |
| HF `rewrite_query` + expand | 0.4137 | 0.4091 | 0.5521 | **1027** |
| Jev compose + expand | 0.4774 | 0.4871 | 0.6562 | 820 |
| Jev compose (fallback only) | 0.4793 | 0.4848 | 0.6562 | 813 |

The HF rewrite **hurts** retrieval (−0.076 Recall@5 vs expand) and costs ~1 s
per query. Jev composition beats the HF rewrite but still underperforms plain
static expansion, so it is **not** used by default.

Decision: with a Jev analysis the HF rewrite is **removed**; the query is
`expand_query(query)` and the analysis is used only for the location filter and
category handling. Jev text composition is available behind
`JEV_SEARCH_COMPOSE_ENABLED=true` for deployments that want it.

> Caveat: the benchmark queries are already keyword-rich, which flatters the
> no-rewrite options. Conversational queries could differ; re-measure on real
> traffic before relying on this.

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

1. **Controlled guardrail evaluation.** Done — see the A/B section
   (`scripts/guardrail_ab.py`).
2. **Jev re-ranking for serverless / batch.** Keep `JEV_RERANK_ENABLED=false`
   for interactive use (see the benchmark), but it is a viable option where no
   local cross-encoder can run, or for offline re-ranking of large candidate
   sets.
3. **Conversational reformulation.** `reformulate_query` still makes an HF call
   per multi-turn follow-up; the same `QueryAnalysis` could absorb it.
