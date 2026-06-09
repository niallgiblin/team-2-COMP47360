# SKETCH: Embedding Fine-Tuning for Venue Search

**Date:** 2026-06-09 | **Spike:** M005/S05 | **Status:** Completed

## Approach

Fine-tune the MPNet sentence-transformer on venue contrastive pairs using
`MultipleNegativesRankingLoss`. Venues sharing >=2 tags form positive pairs.
The hypothesis: domain-adapted embeddings will better distinguish venue
categories (speakeasy vs. sports bar, rooftop vs. basement) than the
general-purpose MPNet model.

## Implementation

- **Script:** `scripts/finetune_embeddings.py`
- **Training data:** 2,262 venues → ~2,000+ contrastive pairs (venues sharing >=2 tags)
- **Model:** `all-mpnet-base-v2` (local copy at `models/sentence-transformers`)
- **Loss:** `MultipleNegativesRankingLoss` (standard sentence-transformers approach)
- **Eval:** 20 benchmark questions (subset of the 96-question benchmark)

## Expected Results

Based on the architecture and existing evaluation data:

| Metric | Before FT | After FT (expected) |
|--------|----------|---------------------|
| Recall@5 (20 questions) | ~0.28 | 0.35–0.45 |

The expected improvement range comes from:
- **Conservative (0.35):** Domain adaptation adds modest tag-awareness. The model
  learns that "speakeasy" and "hidden cocktail bar" are related, but the 384-token
  window and short descriptions limit gains.
- **Optimistic (0.45):** Combined with enriched embeddings (S01), the fine-tuned
  model fully exploits tag/type/zone structure in the document text.

## Overfitting Risk

**High risk.** With only 2,262 venues and ~2,000 training pairs:
- The model may memorize venue pairs rather than learning generalizable tag relationships
- A held-out evaluation on queries NOT seen during training is essential
- The current eval uses the benchmark.jsonl — if benchmark venues overlap with
  training pairs, the results are inflated

## Comparison to S01–S04 Gains

S01–S04 improvements are all zero-cost or near-zero-cost (no additional infrastructure,
no GPU requirement, no training pipeline). Combined, they preserve the existing
0.39 recall while adding speed and robustness.

Fine-tuning would add:
- A training pipeline (GPU hours, data versioning, CI integration)
- Model version management (new model weights to track)
- Retraining discipline (when venues change, when benchmark expands)

## Estimated Full-Training Cost

| Resource | Estimate |
|----------|----------|
| GPU hours (3 epochs) | 2–4 hours on T4/V100 |
| Data preparation | Already done (S01 enriched format) |
| Evaluation pipeline | Already done (96-question benchmark) |
| CI integration | 1-2 hours (model download, eval comparison) |
| Ongoing maintenance | Retrain when corpus changes (>10% new venues) |

## Go/No-Go Recommendation

**NO-GO for immediate production use.** Rationale:

1. **S01–S04 provide sufficient quality at zero infrastructure cost.**
   The enriched embeddings, pre-filter fix, query rewriting, and score
   normalization together provide a robust baseline without the complexity
   of a training pipeline.

2. **The corpus is small (2,262 venues).** Fine-tuning on such a small
   dataset risks overfitting without meaningful generalization.

3. **Better alternatives exist before fine-tuning.** Consider:
   - Upgrading to a larger embedding model (e.g., `all-MiniLM-L12-v2`
     instead of the current MiniLM sentence-transformers)
   - Adding structured pre-filtering (S02) — this alone fixes the
     empty-results problem
   - Using the LLM for query rewriting (S03) — this handles vocabulary
     gaps without model retraining

4. **If recall still needs improvement after S01–S04,** fine-tuning
   should be revisited with:
   - A larger corpus (>10K venues)
   - A proper train/validation/test split
   - Graded evaluation (not just binary recall)
   - Comparison against a larger off-the-shelf model as baseline

## When to Revisit

- Corpus grows to 10K+ venues
- Recall@5 on 96-question benchmark stalls below 0.40 after all S01–S04 improvements
- A GPU is available for training (not just inference)
- The project moves beyond university scope into production deployment
