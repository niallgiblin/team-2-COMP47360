#!/usr/bin/env python3
"""Embedding fine-tuning spike — contrastive learning on venue tag pairs.

Loads the local MPNet model, creates contrastive training pairs from venues
sharing tags, fine-tunes for 2-3 epochs using MultipleNegativesRankingLoss,
and evaluates recall@5 on a 20-question subset before and after fine-tuning.

This is a SPIKE — do NOT ship the fine-tuned model to production.  Produces
a before/after comparison to quantify potential gains.

Usage:
    python3 scripts/finetune_embeddings.py
    python3 scripts/finetune_embeddings.py --epochs 2 --limit-questions 20
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("finetune")


def _parse_args(argv=None):
    p = argparse.ArgumentParser(description="Spike: fine-tune embeddings on venue corpus")
    p.add_argument("--epochs", type=int, default=2, help="Training epochs (default: 2)")
    p.add_argument("--limit-questions", type=int, default=20, help="Eval question count (default: 20)")
    p.add_argument("--batch-size", type=int, default=16, help="Training batch size (default: 16)")
    p.add_argument("--warmup-steps", type=int, default=100, help="Warmup steps (default: 100)")
    p.add_argument("--output", default="models/sentence-transformers-ft", help="Output model dir")
    p.add_argument("--eval-only", action="store_true", help="Only evaluate, skip training")
    return p.parse_args(argv)


# ---------------------------------------------------------------------------
# Contrastive pair generation
# ---------------------------------------------------------------------------


def _create_contrastive_pairs(venues, min_shared_tags=2, max_pairs=5000):
    """Create (anchor, positive) pairs from venues sharing >= min_shared_tags.

    Each venue is paired with another venue that shares at least min_shared_tags
    tags.  This uses MultipleNegativesRankingLoss — the positive is the paired
    venue, and other venues in the batch serve as negatives.
    """
    # Index venues by tag
    tag_to_venues: dict[str, list[int]] = defaultdict(list)
    for i, v in enumerate(venues):
        tags = [t.strip().lower() for t in (v.get("tags") or "").split(",") if t.strip()]
        for t in tags:
            tag_to_venues[t].append(i)

    pairs: list[tuple[str, str]] = []
    seen_pair_keys: set[tuple[int, int]] = set()

    # For each venue, find another venue sharing at least min_shared_tags
    for i, v in enumerate(venues):
        v_tags = set(t.strip().lower() for t in (v.get("tags") or "").split(",") if t.strip())
        if len(v_tags) < min_shared_tags:
            continue

        candidates: set[int] = set()
        for t in v_tags:
            candidates.update(tag_to_venues.get(t, []))

        candidates.discard(i)  # Don't pair with self

        for j in candidates:
            if (i, j) in seen_pair_keys or (j, i) in seen_pair_keys:
                continue
            j_tags = set(t.strip().lower() for t in (venues[j].get("tags") or "").split(",") if t.strip())
            shared = len(v_tags & j_tags)
            if shared >= min_shared_tags:
                pairs.append((_venue_text(v), _venue_text(venues[j])))
                seen_pair_keys.add((i, j))
                if len(pairs) >= max_pairs:
                    return pairs

    return pairs


def _venue_text(venue: dict) -> str:
    """Build a compact document text for embedding."""
    from venue_corpus.document import compose_document_text
    return compose_document_text(venue)


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def _finetune(pairs, model_path, output_path, epochs, batch_size, warmup_steps):
    """Fine-tune MPNet on contrastive venue pairs."""
    from sentence_transformers import SentenceTransformer, InputExample, losses
    from torch.utils.data import DataLoader

    logger.info("Loading base model from %s", model_path)
    model = SentenceTransformer(model_path, device="cpu")

    train_examples = [
        InputExample(texts=[anchor, positive])
        for anchor, positive in pairs
    ]
    train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=batch_size)
    train_loss = losses.MultipleNegativesRankingLoss(model)

    logger.info(
        "Training: %d pairs, %d epochs, batch_size=%d, warmup=%d",
        len(pairs), epochs, batch_size, warmup_steps,
    )
    t0 = time.time()
    model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        epochs=epochs,
        warmup_steps=warmup_steps,
        show_progress_bar=True,
        output_path=output_path,
    )
    elapsed = time.time() - t0
    logger.info("Training complete in %.1fs (%.1f min)", elapsed, elapsed / 60)

    return model


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def _evaluate(model, benchmark_entries, limit):
    """Evaluate recall@5 on a subset of benchmark questions."""
    import numpy as np
    import pandas as pd

    if str(_PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(_PROJECT_ROOT))

    from config import DATA_PATH
    from search_service import SearchService, build_vector_index, _normalize_query_vector

    df = pd.read_csv(DATA_PATH)
    logger.info("Loaded %d venues", len(df))

    # Build embeddings with the (possibly fine-tuned) model
    texts = [_venue_text(df.iloc[i]) for i in range(len(df))]
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=True)

    # Build search service
    row_ids = np.arange(len(df), dtype="int64")
    vector_index = build_vector_index(embeddings, row_ids=row_ids)

    svc = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=vector_index,
        encoder=model,
    )

    questions = benchmark_entries[:limit]
    total_recall = 0.0
    n = 0

    for entry in questions:
        if entry["category"] == "abstention":
            continue
        query = entry["query"]
        expected = entry.get("expected_venue_ids", [])
        filters = entry.get("filters") or {}

        try:
            results = svc.search(
                query, limit=5,
                location_filter=filters.get("location"),
                price_range=filters.get("price_range"),
            )
        except Exception:
            results = []

        retrieved = [int(r["id"]) for r in results]
        if expected:
            hit = len(set(expected) & set(retrieved[:5])) / len(expected)
        else:
            hit = 1.0
        total_recall += hit
        n += 1

    avg_recall = total_recall / n if n else 0.0
    return avg_recall, n


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv=None):
    args = _parse_args(argv)

    # Load benchmark
    bench_path = _PROJECT_ROOT / "data" / "benchmark.jsonl"
    entries = []
    with open(bench_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            entries.append(json.loads(line))
    logger.info("Loaded %d benchmark entries", len(entries))

    # Load venues
    import csv
    venues = list(csv.DictReader(open(_PROJECT_ROOT / "corpus/v1/venues.csv")))
    logger.info("Loaded %d venues", len(venues))

    model_path = str(_PROJECT_ROOT / "models/sentence-transformers")

    # Evaluate BEFORE fine-tuning
    logger.info("=== BEFORE fine-tuning ===")
    from sentence_transformers import SentenceTransformer
    base_model = SentenceTransformer(model_path, device="cpu")
    before_recall, n_eval = _evaluate(base_model, entries, args.limit_questions)
    logger.info("Before recall@5: %.4f (%d questions)", before_recall, n_eval)

    if args.eval_only:
        print(f"\nBefore recall@5: {before_recall:.4f}")
        return

    # Create contrastive pairs
    logger.info("Creating contrastive pairs...")
    pairs = _create_contrastive_pairs(venues)
    logger.info("Created %d training pairs", len(pairs))

    if len(pairs) < 10:
        logger.error("Too few pairs (%d) — cannot train", len(pairs))
        sys.exit(1)

    # Fine-tune
    ft_model = _finetune(
        pairs, model_path, args.output,
        args.epochs, args.batch_size, args.warmup_steps,
    )

    # Evaluate AFTER fine-tuning
    logger.info("=== AFTER fine-tuning ===")
    after_recall, n_eval = _evaluate(ft_model, entries, args.limit_questions)
    logger.info("After recall@5: %.4f (%d questions)", after_recall, n_eval)

    delta = after_recall - before_recall
    print(f"\n{'='*60}")
    print(f"FINE-TUNING SPIKE RESULTS")
    print(f"{'='*60}")
    print(f"Training pairs: {len(pairs)}")
    print(f"Epochs: {args.epochs}")
    print(f"Eval questions: {n_eval}")
    print(f"Before recall@5: {before_recall:.4f}")
    print(f"After recall@5:  {after_recall:.4f}")
    print(f"Delta:           {delta:+.4f}")
    print(f"Model saved to:  {args.output}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
