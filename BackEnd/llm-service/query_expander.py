"""Heuristic query-expansion module for the LLM Flask service.

Expands ambiguous/subjective queries by appending related keywords drawn
from a curated expansion map.  No external dependencies — pure Python stdlib.
"""

import logging
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Expansion map: lowercase key-phrase → space-separated expansion keywords.
# Keyed by the benchmark vocabulary domains:
#   date / romantic / wine
#   dancing / electronic
#   cheap / affordable / budget
#   upscale / luxury / fancy
#   live music / band
#   rooftop / view
#   speakeasy / hidden
#   comedy / funny
#   late / open late
#
# Keys are sorted longest-first so that "open late" is matched before "late".
# ---------------------------------------------------------------------------
_EXPANSION_MAP: dict[str, str] = {
    # --- live-music / band (longer compound keys first) ---
    "live music": "live music band concert performance",
    "open late": "open late late night after-hours",
    # --- date / romantic / wine ---
    "romantic": "romantic date night intimate dinner wine",
    "date": "date romantic restaurant intimate dinner",
    "wine": "wine bar romantic upscale intimate",
    # --- dancing / electronic ---
    "electronic": "electronic music dance club dj nightlife",
    "dancing": "dancing dance club nightlife electronic music dj",
    # --- cheap / affordable / budget ---
    "affordable": "affordable budget cheap inexpensive",
    "cheaper": "cheap affordable budget inexpensive",
    "cheap": "cheap affordable budget inexpensive",
    "budget": "budget cheap affordable inexpensive",
    # --- upscale / luxury / fancy ---
    "upscale": "upscale luxury fancy premium high-end fine dining",
    "luxury": "luxury upscale fancy premium high-end fine dining",
    "fancy": "fancy upscale luxury premium elegant",
    # --- rooftop / view ---
    "rooftop": "rooftop view skyline outdoor terrace",
    "view": "view rooftop skyline scenic panorama",
    # --- speakeasy / hidden ---
    "speakeasy": "speakeasy hidden secret craft cocktails intimate",
    "hidden": "hidden speakeasy secret underground intimate",
    # --- comedy / funny ---
    "comedy": "comedy funny humor stand-up laugh",
    "funny": "funny comedy humor laugh stand-up",
    # --- late ---
    "late": "late night open late after-hours",
}

# Keys sorted longest-first so compound phrases ("open late") match before
# single-word substrings ("late").
_SORTED_KEYS = sorted(_EXPANSION_MAP.keys(), key=len, reverse=True)


def expand_query(query: str) -> str:
    """Expand *query* by appending keywords from the expansion map.

    Matching is **case-insensitive substring** against the map keys.
    When multiple patterns match, keywords are deduplicated.  The
    original query text is never replaced — expansions are appended.

    Parameters
    ----------
    query : str or None
        Raw user query string.

    Returns
    -------
    str
        Expanded query string, or ``""`` when *query* is ``None`` or empty.
    """
    if not query:
        return ""

    lower = query.lower()
    matched_keywords: list[str] = []

    for key in _SORTED_KEYS:
        if key in lower:
            matched_keywords.append(_EXPANSION_MAP[key])

    if not matched_keywords:
        logger.debug("expand_query: no expansion match — pass-through (query=%r)", query)
        return query

    # Deduplicate individual keywords while preserving discovery order
    seen: set[str] = set()
    deduped: list[str] = []
    for kw in " ".join(matched_keywords).split():
        if kw not in seen:
            seen.add(kw)
            deduped.append(kw)

    expansion_text = " ".join(deduped)
    expanded = f"{query} {expansion_text}"

    logger.info(
        "expand_query: original=%r expanded=%r expansion_keywords=%r",
        query,
        expanded,
        expansion_text,
    )
    return expanded
