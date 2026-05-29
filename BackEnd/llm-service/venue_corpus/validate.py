"""Corpus directory layout and venue CSV schema validation."""

from pathlib import Path

try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None  # type: ignore[assignment]

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
    """Check required corpus artifacts exist under corpus_root."""
    errors: list[str] = []
    for name in ("venues.csv", "manifest.json", "SCHEMA.md"):
        if not (corpus_root / name).is_file():
            errors.append(f"missing required file: {name}")
    return errors
