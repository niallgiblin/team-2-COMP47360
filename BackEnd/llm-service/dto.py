"""Stable location result DTO serialization for search responses."""

import math

try:
    import pandas as pd

    def _is_na(value):
        return pd.isna(value)
except ImportError:  # pragma: no cover - tests may stub pandas
    def _is_na(value):
        return value is None or (
            isinstance(value, float) and math.isnan(value)
        )


REQUIRED_DTO_FIELDS = frozenset(
    {
        "id",
        "name",
        "address",
        "latitude",
        "longitude",
        "type",
        "price",
        "rating",
        "zone",
        "zoneId",
        "similarity",
    }
)


def _safe_to_int(value, default=0):
    """Safely convert a value to an integer, handling pandas/numpy NaN."""
    if _is_na(value):
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def _safe_to_float(value, default=0.0):
    """Safely convert a value to a float, handling NaN-like inputs."""
    if _is_na(value):
        return default
    try:
        parsed = float(value)
    except (ValueError, TypeError):
        return default
    if math.isnan(parsed):
        return default
    return parsed


def create_location_dto(row, similarity_score=None):
    """Create a location DTO dict preserving the current /search contract."""
    getter = row.get if hasattr(row, "get") else lambda key, default="": row[key] if key in row else default

    return {
        "id": _safe_to_int(getter("id", 0)),
        "name": str(getter("name", "")),
        "address": str(getter("address", "")),
        "latitude": _safe_to_float(getter("latitude", 0)),
        "longitude": _safe_to_float(getter("longitude", 0)),
        "type": str(getter("type", "")),
        "price": str(getter("price", "")),
        "rating": _safe_to_float(getter("rating", 0)),
        "zone": str(getter("zone", "")),
        "zoneId": _safe_to_int(getter("zoneId", 0)),
        "similarity": (
            _safe_to_float(similarity_score)
            if similarity_score is not None
            else None
        ),
    }


def create_citation_dto(result):
    """Map a search-result DTO to a structured citation with venue ID,
    display name, descriptive snippet, and similarity score.

    Parameters
    ----------
    result : dict
        A location DTO produced by ``create_location_dto`` (or equivalent).

    Returns
    -------
    dict
        ``{"venue_id": int, "name": str, "snippet": str, "score": float | None}``
    """
    snippet_parts = [str(result.get("type", "")).strip()]
    zone = str(result.get("zone", "")).strip()
    if zone:
        snippet_parts.append(f"in {zone}")
    address = str(result.get("address", "")).strip()
    if address:
        snippet_parts.append(f"— {address}")

    return {
        "venue_id": result.get("id"),
        "name": str(result.get("name", "")),
        "snippet": " ".join(snippet_parts) if snippet_parts[0] else "",
        "score": result.get("similarity"),
    }
