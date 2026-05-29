"""
Google Places API client for enriching venue context with real reviews.

Used by the chat service to inject real Google review snippets into the LLM
prompt, enabling the AI chatbot to make better, more personalised venue
recommendations grounded in authentic guest feedback.

Rate limiting: results are cached with a TTL to stay within Google's usage quotas.
"""

import logging
import os
import time
from threading import Lock
from typing import Optional
from urllib.parse import urlencode

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

GOOGLE_PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
REQUEST_TIMEOUT = 8  # seconds

# In-memory TTL cache for place details (place_id → enriched data).
# Google Places data doesn't change rapidly; 1-hour TTL keeps quota low.
DETAILS_CACHE_TTL_SECONDS = int(os.getenv("GOOGLE_PLACES_CACHE_TTL_SECONDS", "3600"))
MAX_CACHE_ENTRIES = int(os.getenv("GOOGLE_PLACES_CACHE_MAX_ENTRIES", "2000"))

_details_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = Lock()


def _api_key() -> Optional[str]:
    key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not key:
        logger.warning("GOOGLE_API_KEY is not set — Google Places enrichment disabled")
        return None
    return key


def _cached_get(url: str, cache_key: str) -> Optional[dict]:
    """Fetch a URL with caching and basic retry logic."""
    now = time.time()

    with _cache_lock:
        if cache_key in _details_cache:
            ts, data = _details_cache[cache_key]
            if now - ts < DETAILS_CACHE_TTL_SECONDS:
                logger.debug("Cache hit for %s", cache_key[:60])
                return data
            del _details_cache[cache_key]

    session = requests.Session()
    retry = Retry(total=2, backoff_factor=0.5, status_forcelist=[429, 500, 502, 503])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)

    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        # Prune oldest entries if at capacity
        with _cache_lock:
            if len(_details_cache) >= MAX_CACHE_ENTRIES:
                oldest = min(_details_cache.keys(), key=lambda k: _details_cache[k][0])
                del _details_cache[oldest]
            _details_cache[cache_key] = (now, data)

        return data
    except Exception as exc:
        logger.warning("Google Places API request failed: %s", exc)
        return None


def find_place_id(name: str, address: str = "") -> Optional[str]:
    """Resolve a venue name + address to a Google Place ID.

    Uses Google's Find Place From Text endpoint.  Results are cached
    inside the caller's preferred caching layer.
    """
    key = _api_key()
    if not key:
        return None

    query = f"{name} {address}".strip()
    params = {
        "input": query,
        "inputtype": "textquery",
        "fields": "place_id",
        "key": key,
    }
    url = f"{GOOGLE_PLACES_BASE}/findplacefromtext/json?{urlencode(params)}"

    data = _cached_get(url, f"findplace:{query.lower()}")
    if not data:
        return None

    status = data.get("status", "")
    if status != "OK":
        logger.debug("findplacefromtext status=%s for '%s'", status, query[:80])
        return None

    candidates = data.get("candidates", [])
    if candidates:
        return candidates[0].get("place_id")
    return None


def get_place_details(place_id: str) -> Optional[dict]:
    """Fetch Place Details including rating, review count, and top reviews.

    Returns a dict with keys:
        name, rating, user_ratings_total, reviews (list), place_id
    or None on failure.
    """
    key = _api_key()
    if not key:
        return None

    params = {
        "place_id": place_id,
        "fields": "name,rating,user_ratings_total,reviews",
        "language": "en",
        "key": key,
    }
    url = f"{GOOGLE_PLACES_BASE}/details/json?{urlencode(params)}"

    data = _cached_get(url, f"details:{place_id}")
    if not data:
        return None

    status = data.get("status", "")
    if status != "OK":
        logger.debug("place details status=%s for %s", status, place_id)
        return None

    result = data.get("result", {})
    return {
        "name": result.get("name", ""),
        "rating": result.get("rating"),
        "user_ratings_total": result.get("user_ratings_total", 0),
        "reviews": result.get("reviews", []),
        "place_id": place_id,
    }


def fetch_reviews_for_venue(name: str, address: str = "") -> Optional[dict]:
    """Convenience: find place ID then fetch details for a venue.

    Returns the place details dict or None.
    """
    place_id = find_place_id(name, address)
    if not place_id:
        return None
    return get_place_details(place_id)


def format_reviews_for_context(place_details: Optional[dict], max_reviews: int = 3) -> str:
    """Format Google Place reviews into a compact string for LLM context.

    Parameters
    ----------
    place_details : dict | None
        Output of ``get_place_details`` / ``fetch_reviews_for_venue``.
    max_reviews : int
        Maximum number of individual review texts to include.

    Returns
    -------
    str
        A compact string like:
        "Google rating: 4.5/5 (230 reviews). Top reviews: [\"Great spot...\", ...]"
        or an empty string when no data is available.
    """
    if not place_details:
        return ""

    parts = []
    rating = place_details.get("rating")
    total = place_details.get("user_ratings_total", 0)

    if rating is not None:
        parts.append(f"Google rating: {rating:.1f}/5")
    if total:
        parts.append(f"({total} reviews)")

    header = " ".join(parts) if parts else ""

    reviews = place_details.get("reviews", [])
    if reviews:
        snippets = []
        for rev in reviews[:max_reviews]:
            text = (rev.get("text", "") or "").strip()
            if text:
                rating_str = f"[{rev.get('rating', '?')}/5]"
                snippets.append(f"{rating_str} {text}")
        if snippets:
            header += " | What people say: " + " | ".join(snippets)

    return header


def enrich_venue_with_google_reviews(venue_dto: dict) -> str:
    """Fetch Google reviews for a single venue DTO and return a context string.

    Designed to be called per-venue when building chat retrieval context.
    Returns an empty string when enrichment is unavailable.
    """
    name = venue_dto.get("name", "")
    address = venue_dto.get("address", "")
    if not name:
        return ""

    details = fetch_reviews_for_venue(name, address)
    return format_reviews_for_context(details, max_reviews=2)
