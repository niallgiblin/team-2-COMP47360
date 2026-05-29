"""Corpus directory layout and venue CSV schema validation."""

from pathlib import Path

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None  # type: ignore[assignment]

from venue_corpus.manifest import load_manifest, verify_manifest_checksum

REQUIRED_VENUE_COLUMNS = frozenset({
    "id", "lat", "long", "name", "addr", "uri", "reviews", "num_reviews",
    "loc_type", "description", "price", "zone", "Info", "summary", "tags",
})


def resolve_corpus_root(service_dir: Path, corpus_version: str) -> Path:
    """Resolve corpus root under service_dir/corpus, rejecting path traversal."""
    if ".." in Path(corpus_version).parts or Path(corpus_version).is_absolute():
        raise ValueError(f"invalid corpus_version: {corpus_version!r}")
    corpus_base = (service_dir / "corpus").resolve()
    resolved = (corpus_base / corpus_version).resolve()
    try:
        resolved.relative_to(corpus_base)
    except ValueError as exc:
        raise ValueError(f"corpus_version escapes corpus root: {corpus_version!r}") from exc
    return resolved


def validate_venue_schema(df) -> list[str]:
    """Return errors for missing columns or duplicate venue ids."""
    missing = REQUIRED_VENUE_COLUMNS - set(df.columns)
    if missing:
        return [f"missing columns: {sorted(missing)}"]
    if df["id"].duplicated().any():
        return ["duplicate id values in venues.csv"]
    return []


def validate_corpus_dir(corpus_root: Path) -> list[str]:
    """Validate corpus layout, schema, and manifest checksum."""
    errors: list[str] = []
    for name in ("venues.csv", "manifest.json", "SCHEMA.md"):
        if not (corpus_root / name).is_file():
            errors.append(f"missing required file: {name}")
    if errors:
        return errors

    manifest_path = corpus_root / "manifest.json"
    csv_path = corpus_root / "venues.csv"

    try:
        manifest = load_manifest(manifest_path)
    except (OSError, ValueError) as exc:
        return [f"manifest load failed: {exc}"]

    ok, checksum_errors = verify_manifest_checksum(manifest, csv_path)
    if not ok:
        errors.extend(checksum_errors)

    if pd is None:
        errors.append("pandas required for schema validation")
        return errors

    try:
        df = pd.read_csv(csv_path)
    except OSError as exc:
        return errors + [f"venues.csv read failed: {exc}"]

    errors.extend(validate_venue_schema(df))

    expected_rows = manifest.get("venues_csv", {}).get("row_count")
    if isinstance(expected_rows, int) and len(df) != expected_rows:
        errors.append(
            f"row_count mismatch: manifest {expected_rows}, csv {len(df)}"
        )

    return errors
