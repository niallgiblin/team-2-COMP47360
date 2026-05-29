"""Corpus manifest loading and SHA-256 checksum verification."""

import hashlib
import json
from pathlib import Path

_REQUIRED_MANIFEST_KEYS = frozenset({"corpus_version", "schema_version", "venues_csv", "document_model"})


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
    return manifest


def verify_manifest_checksum(manifest: dict, csv_path: Path) -> tuple[bool, list[str]]:
    """Compare manifest venues_csv.sha256 against the actual CSV digest."""
    errors: list[str] = []
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
        errors.append(
            f"Checksum mismatch for {csv_path.name}: expected {expected}, actual {actual}"
        )
        return False, errors
    return True, []
