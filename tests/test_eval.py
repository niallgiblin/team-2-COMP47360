"""Tests for the RAG evaluation harness — benchmark validation and recall computation.

This test file validates benchmark.jsonl from the repo root. The primary test
lives in BackEnd/llm-service/tests/test_eval.py; this file ensures the
verification command works from the project root as well.
"""

import csv
import json
from pathlib import Path


BENCHMARK_PATH = Path(__file__).resolve().parent.parent / "BackEnd" / "llm-service" / "data" / "benchmark.jsonl"
CORPUS_CSV_PATH = Path(__file__).resolve().parent.parent / "BackEnd" / "llm-service" / "corpus" / "v1" / "venues.csv"

VALID_CATEGORIES = {"retrieval", "filtered", "conversational", "adversarial", "abstention"}
MIN_QUESTIONS_TOTAL = 35
MAX_QUESTIONS_TOTAL = 45
MIN_PER_CATEGORY = 5


def _load_venue_ids():
    """Load set of valid venue IDs from the corpus CSV."""
    if not CORPUS_CSV_PATH.exists():
        raise FileNotFoundError(f"Corpus CSV not found: {CORPUS_CSV_PATH}")
    ids = set()
    with open(CORPUS_CSV_PATH, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ids.add(int(row["id"]))
    return ids


def test_benchmark_valid():
    """Validate the benchmark.jsonl file — schema, IDs, categories, and counts."""
    # 1. File must exist
    assert BENCHMARK_PATH.exists(), f"benchmark.jsonl not found at {BENCHMARK_PATH}"

    venue_ids = _load_venue_ids()
    entries = []

    with open(BENCHMARK_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue  # skip comments and blank lines
            entries.append(json.loads(line))

    # 2. Total count within range
    n = len(entries)
    assert MIN_QUESTIONS_TOTAL <= n <= MAX_QUESTIONS_TOTAL, (
        f"Expected {MIN_QUESTIONS_TOTAL}-{MAX_QUESTIONS_TOTAL} entries, got {n}"
    )

    categories_seen = set()
    category_counts = {}
    ids_seen = set()

    for entry in entries:
        eid = entry["id"]
        # 3. id must be unique and string
        assert isinstance(eid, str), f"Entry {eid}: id must be a string"
        assert eid not in ids_seen, f"Duplicate entry id: {eid}"
        ids_seen.add(eid)

        # 4. Required fields present
        for field in ("id", "category", "query", "expected_venue_ids", "filters", "description"):
            assert field in entry, f"{eid}: missing required field '{field}'"

        # 5. Category must be valid
        cat = entry["category"]
        assert cat in VALID_CATEGORIES, f"{eid}: invalid category '{cat}'"
        categories_seen.add(cat)
        category_counts[cat] = category_counts.get(cat, 0) + 1

        # 6. query must be non-empty string
        query = entry["query"]
        assert isinstance(query, str) and query.strip(), f"{eid}: query must be non-empty string"

        # 7. description must be non-empty string
        desc = entry["description"]
        assert isinstance(desc, str) and desc.strip(), f"{eid}: description must be non-empty string"

        # 8. expected_venue_ids must be a list
        expected = entry["expected_venue_ids"]
        assert isinstance(expected, list), f"{eid}: expected_venue_ids must be a list"

        # 9. All expected venue IDs must exist in corpus
        for vid in expected:
            assert vid in venue_ids, f"{eid}: expected_venue_id {vid} not found in corpus"

        # 10. If abstention, expected_venue_ids must be empty
        if cat == "abstention":
            assert len(expected) == 0, (
                f"{eid}: abstention entries must have empty expected_venue_ids"
            )

        # 11. filters must be null or a dict with optional location/price_range only
        filters = entry["filters"]
        if filters is not None:
            assert isinstance(filters, dict), f"{eid}: filters must be null or dict"
            for k in filters:
                assert k in ("location", "price_range"), (
                    f"{eid}: unexpected filter key '{k}'"
                )

    # 12. All five categories must be present
    for cat in VALID_CATEGORIES:
        assert cat in categories_seen, f"Missing category: {cat}"

    # 13. At least MIN_PER_CATEGORY per category
    for cat in VALID_CATEGORIES:
        count = category_counts.get(cat, 0)
        assert count >= MIN_PER_CATEGORY, (
            f"Category '{cat}' has {count} questions, need at least {MIN_PER_CATEGORY}"
        )

    # 14. Check for sequential ordering of IDs (Q001, Q002, ...)
    for i, entry in enumerate(entries):
        expected_id = f"Q{i + 1:03d}"
        assert entry["id"] == expected_id, (
            f"Expected id '{expected_id}' at position {i}, got '{entry['id']}'"
        )
