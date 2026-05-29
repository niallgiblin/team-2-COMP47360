"""Corpus manifest loading and SHA-256 checksum verification."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

_REQUIRED_MANIFEST_KEYS = frozenset({"corpus_version", "schema_version", "venues_csv", "document_model"})
_REQUIRED_VENUES_CSV_KEYS = frozenset({"path", "sha256", "row_count", "columns"})


def sha256_file(path: Path) -> str:
    """Compute lowercase hex SHA-256 digest of a file using 1 MiB chunks."""
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict:
    """Load and validate required keys in a corpus manifest JSON file."""
    with path.open(encoding="utf-8") as fh:
        manifest = json.load(fh)
    if not isinstance(manifest, dict):
        raise ValueError("manifest must be a JSON object")
    missing = _REQUIRED_MANIFEST_KEYS - set(manifest.keys())
    if missing:
        raise ValueError(f"manifest missing required keys: {sorted(missing)}")
    venues_csv = manifest.get("venues_csv")
    if not isinstance(venues_csv, dict):
        raise ValueError("manifest venues_csv must be an object")
    venues_missing = _REQUIRED_VENUES_CSV_KEYS - set(venues_csv.keys())
    if venues_missing:
        raise ValueError(f"manifest venues_csv missing required keys: {sorted(venues_missing)}")
    return manifest


def verify_manifest_checksum(manifest: dict, csv_path: Path) -> tuple[bool, list[str]]:
    """Compare manifest venues_csv.sha256 against the actual CSV digest."""
    venues_csv = manifest.get("venues_csv")
    if not isinstance(venues_csv, dict):
        return False, ["manifest venues_csv must be an object"]
    expected = venues_csv.get("sha256")
    if not expected:
        return False, ["manifest venues_csv.sha256 is required"]
    if not csv_path.is_file():
        return False, [f"venues CSV not found: {csv_path.name}"]
    actual = sha256_file(csv_path)
    if actual != expected:
        return False, ["Checksum mismatch: venues.csv"]
    return True, []


def build_manifest_from_csv(corpus_root: Path) -> dict:
    """Build a manifest dict from venues.csv under corpus_root (maintainer helper)."""
    csv_path = corpus_root / "venues.csv"
    if not csv_path.is_file():
        raise FileNotFoundError(f"venues.csv not found under {corpus_root.name}")

    import pandas as pd

    df = pd.read_csv(csv_path, nrows=0)
    columns = list(df.columns)
    return {
        "corpus_version": corpus_root.name,
        "schema_version": "1.0.0",
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "venues_csv": {
            "path": "venues.csv",
            "sha256": sha256_file(csv_path),
            "row_count": sum(1 for _ in csv_path.open(encoding="utf-8")) - 1,
            "columns": columns,
        },
        "document_model": {
            "format": "labeled_lines",
            "one_document_per_venue": True,
            "embed_fields": [
                "name", "description", "zone", "price", "loc_type", "tags", "summary", "Info",
            ],
            "metadata_fields": [
                "id", "lat", "long", "addr", "uri", "reviews", "num_reviews",
            ],
        },
        "field_mapping_ref": "SCHEMA.md",
        "spring_sync": {
            "target": "BackEnd/src/main/resources/data/locations.csv",
            "policy": "same_commit_manual_sync",
        },
    }
