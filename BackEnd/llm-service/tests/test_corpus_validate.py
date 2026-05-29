"""Wave 0 tests for corpus schema and directory validation."""

from pathlib import Path

import pandas as pd
import pytest

from venue_corpus.validate import (
    REQUIRED_VENUE_COLUMNS,
    resolve_corpus_root,
    validate_corpus_dir,
    validate_venue_schema,
)

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "corpus_v1"
SERVICE_DIR = Path(__file__).resolve().parent.parent


def test_required_columns():
    df = pd.read_csv(FIXTURE_DIR / "venues.csv")
    errors = validate_venue_schema(df)
    assert errors == []

    incomplete = df.drop(columns=["tags"])
    errors = validate_venue_schema(incomplete)
    assert any("missing columns" in error for error in errors)


def test_duplicate_id_rejected():
    df = pd.DataFrame([
        {"id": 1, **{col: "" for col in REQUIRED_VENUE_COLUMNS if col != "id"}},
        {"id": 1, **{col: "" for col in REQUIRED_VENUE_COLUMNS if col != "id"}},
    ])
    errors = validate_venue_schema(df)
    assert errors == ["duplicate id values in venues.csv"]


def test_corpus_v1_layout():
    errors = validate_corpus_dir(FIXTURE_DIR)
    assert errors == []


def test_schema_md_covers_field_mapping():
    schema_text = (FIXTURE_DIR / "SCHEMA.md").read_text(encoding="utf-8")
    assert "embed" in schema_text.lower()
    assert "metadata" in schema_text.lower()
    assert "loc_type" in schema_text


def test_resolve_corpus_root_rejects_traversal():
    with pytest.raises(ValueError, match="invalid corpus_version"):
        resolve_corpus_root(SERVICE_DIR, "../etc")


def test_row_count_matches_embeddings():
    npy_path = SERVICE_DIR / "data" / "location_embeddings.npy"
    if not npy_path.is_file():
        pytest.skip("location_embeddings.npy not present locally")
    import numpy as np

    df = pd.read_csv(FIXTURE_DIR / "venues.csv")
    embeddings = np.load(npy_path)
    assert len(df) <= embeddings.shape[0]


def test_production_manifest_matches():
    prod_root = SERVICE_DIR / "corpus" / "v1"
    if not (prod_root / "venues.csv").is_file():
        pytest.skip("production corpus/v1 not present")
    errors = validate_corpus_dir(prod_root)
    assert errors == []
