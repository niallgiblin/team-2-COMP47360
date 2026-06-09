# Evaluation Strategy

Current evaluation design for committed `urban-gala-v2`, verified 2026-06-09.

## Retrieval benchmark

`BackEnd/llm-service/data/benchmark.jsonl` contains 41 curated questions across
five categories. Each case records expected venue identifiers and any relevant
filter or conversational context.

`scripts/run_eval.py` can:

- Run the configured retrieval pipeline.
- Compare dense-only retrieval with the improved configuration.
- Report per-question, per-category, and aggregate metrics.
- Emit JSON reports.
- Run metrics-only mode without threshold enforcement.

## Metrics

| Metric | Meaning |
|--------|---------|
| Recall@5 | Fraction of expected relevant venues found in the first five results |
| Precision@5 | Fraction of the first five results that are expected relevant venues |
| MRR | Reciprocal rank of the first relevant result |
| NDCG@5 | Rank-sensitive gain for relevant results in the first five |
| Hit Rate | Fraction of queries with at least one relevant result |

The harness also tests citation parsing, abstention-related behavior, filters,
query expansion, multi-turn context, BM25, RRF, cross-encoder fallback, and
index integrity through pytest.

## Recorded comparison

| Metric | Dense baseline | Improved configuration | Delta |
|--------|---------------:|-----------------------:|------:|
| Recall@5 | 0.2495 | 0.2874 | +0.0379 |
| NDCG@5 | 0.2492 | 0.2899 | +0.0407 |
| MRR | 0.3182 | 0.3747 | +0.0566 |
| Precision@5 | 0.2121 | 0.2242 | +0.0121 |
| Hit Rate | 0.4545 | 0.4848 | +0.0303 |

The strongest relative result is improved ranking, especially MRR. Hybrid
retrieval also helps exact-name and rare-term queries that dense retrieval can
miss.

## Interpretation limits

- Forty-one questions are enough for regression development, not for a strong
  statistical claim about all users.
- The cases are internally curated rather than independently labeled.
- Expected IDs can reward a narrow set of acceptable answers even when other
  venues are reasonable.
- The aggregate Recall@5 of 0.2874 is still low in absolute terms.
- The improved configuration can include optional cross-encoder behavior, but
  checked-in Compose sets `CROSS_ENCODER_ENABLED=false`.
- Retrieval metrics do not measure the factuality, usefulness, style, latency,
  or cost of the final generated answer.
- The Hugging Face model is external and may change behavior independently of
  repository code unless its exact model/version is controlled.

Use the results as evidence that v2 introduced a reproducible measurement loop
and improved this benchmark. Do not present them as proof of production-grade
RAG quality.

## Busyness evaluation

The busyness service test suite verifies:

- Model artifact integrity and loading behavior.
- Prediction normalization and response shape.
- Twelve-hour forecast generation.
- Weather fallback.
- CORS and route behavior.
- Bounded caching.

The repository does not publish a current holdout-set accuracy table for the
served Keras models. Historical model explanations and research are not a
substitute for a reproducible training/evaluation report.

For interviews, state that v2 hardened serving reliability and artifact
reproducibility; do not invent model accuracy, calibration, or live-ground-
truth results.

## System quality gates

Evaluation extends beyond model metrics:

- Spring/Flask contract fixtures verify payload compatibility.
- Artifact checksums protect model/corpus reproducibility.
- Frontend tests cover AI, route, forecast, auth, plan, and cache behavior.
- Compose smoke exercises production-style service startup and proxying.
- Structured events and Prometheus metrics support future latency, failure,
  and quality monitoring.

The current v2 commit is not fully green. See [TESTING.md](TESTING.md) for
dated executable results.

## Next evaluation work

1. Fix all current LLM and Spring test failures.
2. Expand the retrieval set and have labels reviewed independently.
3. Add graded relevance rather than only expected-ID membership.
4. Measure confidence intervals and per-segment regressions.
5. Benchmark quality, p50/p95 latency, memory, and cost with the cross-encoder
   enabled and disabled.
6. Add answer-level groundedness and faithfulness evaluation without allowing
   an evaluator model to become the sole source of truth.
7. Publish busyness holdout metrics, temporal splits, calibration, and drift
   monitoring tied to the exact shipped artifacts.
8. Gate releases in CI with versioned reports rather than hand-maintained test
   counts.

