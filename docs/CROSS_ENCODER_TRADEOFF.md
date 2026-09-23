# Cross-Encoder Trade-off Analysis

**Date:** 2026-06-09 | **Branch:** urban-gala-v2 | **Milestone:** M004

## Summary

The RAG retrieval pipeline includes an optional cross-encoder re-ranking step
(MiniLM, `cross-encoder/ms-marco-MiniLM-L6-v2`). This document quantifies the
quality vs. latency trade-off to inform the decision to disable it by default
in the standard Docker Compose deploy.

> **Update 2026-09-19 — re-enabled.** A fresh 96-question measurement (below)
> shows the cross-encoder adds only **~35 ms** at p50 and *improves* quality
> (+0.041 Recall@5, +0.063 NDCG@5, +0.083 Hit Rate). The earlier 10-question
> sample overstated both the latency and the downside. `CROSS_ENCODER_ENABLED`
> now defaults to `true` in `docker-compose.yml`. See
> [Re-measurement (96 questions)](#re-measurement-96-questions).
>
> **Update 2026-09-23 — hybrid + reranker fix.** With hybrid retrieval and the
> micro-zone reranker fix, the cross-encoder costs **+63 ms p50** for
> **+0.056 Recall@5 / +0.050 NDCG@5 / +7.3 pp hit rate**. See
> [Hybrid re-measurement](#hybrid-re-measurement-2026-09-23).

## Re-measurement (96 questions)

Measured 2026-09-19 on an Apple Silicon Mac (CPU), 96 benchmark questions, via
`scripts/rerank_bench.py`. Includes Jev re-ranking as a third arm.

| Strategy | p50 | p95 | Mean | Recall@5 | NDCG@5 | Hit Rate |
|---|---|---|---|---|---|---|
| None | 22.5 ms | 25.1 ms | 22.7 ms | 0.4493 | 0.4357 | 0.5938 |
| **Cross-encoder** | **57.8 ms** | **81.2 ms** | **62.6 ms** | **0.4899** | **0.4984** | **0.6771** |
| Jev re-rank | 887.7 ms | 1222.5 ms | 933.9 ms | 0.4889 | 0.4975 | 0.6562 |

Interpretation:

- The cross-encoder costs **+35 ms at p50** over no re-ranking — negligible
  next to the multi-second generation call that follows retrieval.
- It improves every quality metric on the full benchmark, including Recall@5
  (the earlier 10-question sample showed recall *decreasing*, which the larger
  sample does not reproduce).
- **Jev re-ranking matches the cross-encoder's quality but is ~15× slower**
  (~0.9 s of network latency for up to 50 candidates). It does *not* unblock
  the cross-encoder; the local model is already the cheaper option at this
  corpus and candidate scale. Jev re-ranking remains available behind
  `JEV_RERANK_ENABLED` for deployments without a local model or for offline
  batch re-ranking.

The older 10-question ablation is retained below for provenance.

## Hybrid re-measurement (2026-09-23)

Measured on the same 96-question benchmark with hybrid retrieval (BM25 + FAISS
+ SW-RRF) and the fixes from the `jev` branch: filter-before-rerank, normalized
fusion on every pass, and canonical `Area:` labels in the reranker text.

| Strategy | p50 | p95 | Recall@5 | NDCG@5 | Hit Rate |
|---|---|---|---|---|---|
| none | 25.7 ms | 31.9 ms | 0.4988 | 0.5077 | 0.7292 |
| **cross-encoder** | **89.1 ms** | **106.6 ms** | **0.5545** | **0.5576** | **0.8021** |

- Hybrid raises the no-rerank baseline from 0.4493 to 0.4988 Recall@5, so the
  cross-encoder is now the smaller of the two retrieval wins — but still clearly
  positive, and cheap relative to generation.
- The reranker zone-text fix is what makes the cross-encoder consistent with
  RRF for sub-zones (Maya/Tacombi for an Upper East Side Mexican query). Without
  it the cross-encoder actively down-ranked venues whose corpus zone is
  `Lenox Hill West` rather than `Upper East Side`.
- Jev re-ranking remains non-competitive (~754 ms p50 on the same setup).

## Architecture

```
Without cross-encoder:
  BM25 → FAISS(MPNet) → SW-RRF(k=60) → filter → top-K results

With cross-encoder (default in the jev Compose):
  BM25 → FAISS(MPNet) → SW-RRF(k=60) → filter → cross-encoder re-rank → top-K results
```

The cross-encoder scores every candidate document against the query jointly
(not via separate embeddings), which can improve ranking precision but requires
a transformer forward pass for each query-document pair.

## Ablation Results

Measured on macOS (MPS backend) with 10 benchmark questions. Run via:

```bash
python3 scripts/ablate_cross_encoder.py --limit 10 --metrics-only
```

### Latency

| Percentile | Without CE | With CE | Delta |
|-----------|-----------|---------|-------|
| P50 | 130 ms | 227 ms | **+97 ms** |
| P95 | 145 ms | 372 ms | **+227 ms** |
| P99 | 145 ms | 372 ms | **+227 ms** |
| Mean | 132 ms | 265 ms | **+133 ms** |

### Retrieval Quality

| Metric | Without CE | With CE | Delta |
|--------|-----------|---------|-------|
| Recall@5 | 0.213 | 0.188 | -0.025 |
| NDCG@5 | 0.185 | 0.207 | +0.021 |
| MRR | 0.262 | 0.400 | **+0.138** |
| Precision@5 | 0.180 | 0.160 | -0.020 |
| Hit Rate | 0.600 | 0.600 | 0.000 |

### Interpretation

- **MRR improves most (+0.138):** The cross-encoder pushes the first relevant
  result higher in the ranking. This is the metric it's designed to improve.
- **Recall and Precision slightly decrease:** Re-ranking can deprioritize
  some relevant documents in favor of others. This is expected with a small
  sample.
- **Latency doubles at P50 and nearly triples at P95/P99:** On CPU/MPS, each
  re-rank pass adds significant time. In Docker with CPU-only inference,
  the overhead is even larger.

## Production Decision

**`CROSS_ENCODER_ENABLED=true`** in `docker-compose.yml` (changed 2026-09-19).

Rationale (from the 96-question re-measurement):
1. The cross-encoder adds only ~35 ms at p50 on CPU — not the 2–3× latency the
   original 10-question sample suggested, which was measured against a much
   slower baseline (130 ms) on a different setup.
2. It improves Recall@5, NDCG@5, and Hit Rate on the full benchmark.
3. The rank-order gain is the metric it is designed for, and it also gives the
   downstream abstention/guardrail stages a better candidate set.

The previous decision (2026-06-09) was to keep it disabled. That was based on a
10-question sample and interactive impressions; the full-benchmark evidence has
since overturned it.

## When to Re-enable

- **GPU deployment:** If the LLM service runs on GPU hardware, cross-encoder
  latency drops significantly. Flip `CROSS_ENCODER_ENABLED=true`.
- **Larger corpus:** If venues grow to 10K+, the extra ranking precision may
  become more important.
- **Higher-quality embedding model:** If the base embeddings improve, the
  cross-encoder's marginal benefit shrinks further.

## Reproducing

```bash
# Quick smoke test (10 questions, ~20s)
cd BackEnd/llm-service
python3 scripts/ablate_cross_encoder.py --limit 10 --metrics-only

# Full ablation (96 questions, ~3 min)
python3 scripts/ablate_cross_encoder.py --metrics-only --report reports/ablation.json
```

Results are deterministic for the same model weights and benchmark. CI runs
the ablation on every PR to `urban-gala-v2` as an informational job.

## Related

- [EVALUATION_STRATEGY.md](EVALUATION_STRATEGY.md) — full evaluation design
- `scripts/ablate_cross_encoder.py` — ablation tool
- `docker-compose.yml` — `CROSS_ENCODER_ENABLED` env var
- `.github/workflows/ci.yml` — `ablation` job
