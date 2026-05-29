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
    ("zone", "Zone"),
    ("loc_type", "Type"),
    ("price", "Price"),
    ("description", "Description"),
    ("tags", "Tags"),
    ("summary", "Summary"),
    ("Info", "Info"),
]


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
        lines.append(f"{label}: {text}")
    return "\n".join(lines)
