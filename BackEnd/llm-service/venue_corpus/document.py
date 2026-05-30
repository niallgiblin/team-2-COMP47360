"""Per-venue document text composition for RAG embedding."""

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


EMBED_FIELDS: list[tuple[str, str]] = [
    ("name", "Name"),
    ("description", "Description"),
    ("zone", "Zone"),
    ("price", "Price"),
    ("loc_type", "Type"),
    ("tags", "Tags"),
    ("summary", "Summary"),
    ("Info", "Info"),
    ("reviews", "Reviews"),
]

# Max characters for review text in embed context to stay within model token limits
MAX_REVIEW_CHARS = 200


def _truncate_reviews(text: str, max_chars: int = MAX_REVIEW_CHARS) -> str:
    """Truncate review text to a safe length for the embedding model."""
    if not text or len(text) <= max_chars:
        return text
    # Try to break at a sentence boundary within the limit
    cut = text.rfind(". ", 0, max_chars)
    if cut == -1:
        cut = text.rfind(" | ", 0, max_chars)
    if cut == -1:
        cut = max_chars
    return text[:cut] + "…"


def compose_document_text(row) -> str:
    """Build labeled-line document text from a CSV venue row."""
    getter = row.get if hasattr(row, "get") else lambda key, default="": row[key] if key in row else default
    lines: list[str] = []
    for column, label in EMBED_FIELDS:
        raw = getter(column, "")
        if _is_na(raw):
            continue
        text = str(raw).strip()
        if not text:
            continue
        # Truncate reviews to stay within model max_position_embeddings
        if column == "reviews":
            text = _truncate_reviews(text)
        lines.append(f"{label}: {text}")
    return "\n".join(lines)
