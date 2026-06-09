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
    # Structured metadata first — short, high-signal, survives truncation
    ("name", "Name"),
    ("loc_type", "Type"),
    ("zone", "Zone"),
    ("price", "Price"),
    ("tags", "Tags"),
    # Longer text fields — may be partially truncated, metadata already captured above
    ("description", "Description"),
    ("summary", "Summary"),
    # Reviews and Info dropped: too long, dilutes signal in 384-token window
]

# Document format version — bumped when EMBED_FIELDS order or content changes.
# Recorded in index metadata so downstream consumers can detect format shifts.
DOCUMENT_FORMAT_VERSION = 2


def compose_document_text(row) -> str:
    """Build labeled-line document text from a CSV venue row.

    Structured metadata (name, type, zone, price, tags) comes first so the
    most discriminative signal survives the 384-token embedding window.
    Longer text fields (description, summary) follow and may be partially
    truncated by the model's tokenizer.
    """
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
