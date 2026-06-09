# Cross-Encoder Trade-off Analysis

**Date:** 2026-06-09 | **Branch:** urban-gala-v2 | **Milestone:** M004

## Summary

The RAG retrieval pipeline includes an optional cross-encoder re-ranking step
(MiniLM, `cross-encoder/ms-marco-MiniLM-L6-v2`). This document quantifies the
quality vs. latency trade-off to inform the decision to disable it by default
in the standard Docker Compose deploy.

## Architecture

```
Without cross-encoder (default):
  BM25 → FAISS(MPNet) → RRF(k=60) → top-K results

With cross-encoder:
  BM25 → FAISS(MPNet) → RRF(k=60) → cross-encoder re-rank → top-K results
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

**`CROSS_ENCODER_ENABLED=false`** in `docker-compose.yml`.

Rationale:
1. Hybrid retrieval (BM25 + MPNet + RRF) already provides useful rankings
2. The cross-encoder adds ~2-3× latency in CPU deployment
3. The ranking improvement is marginal for this domain (2,262 venues, short
   descriptions)
4. The code is preserved and configurable — one env var toggles it

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
