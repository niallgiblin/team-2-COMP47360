"""Wave 0 tests for corpus manifest loading and checksum verification."""

import copy
from pathlib import Path

from venue_corpus.manifest import load_manifest, verify_manifest_checksum

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "corpus_v1"
MANIFEST_PATH = FIXTURE_DIR / "manifest.json"
CSV_PATH = FIXTURE_DIR / "venues.csv"


def test_manifest_required_fields():
    manifest = load_manifest(MANIFEST_PATH)
    assert manifest["corpus_version"] == "v1"
    assert manifest["schema_version"] == "1.0.0"
    assert "venues_csv" in manifest
    assert "document_model" in manifest
    assert manifest["venues_csv"]["row_count"] == 2


def test_manifest_checksum_matches_csv():
    manifest = load_manifest(MANIFEST_PATH)
    ok, errors = verify_manifest_checksum(manifest, CSV_PATH)
    assert ok is True
    assert errors == []


def test_manifest_checksum_rejects_mismatch():
    manifest = load_manifest(MANIFEST_PATH)
    corrupted = copy.deepcopy(manifest)
    corrupted["venues_csv"]["sha256"] = "0" * 64
    ok, errors = verify_manifest_checksum(corrupted, CSV_PATH)
    assert ok is False
    assert any("Checksum mismatch" in error for error in errors)
