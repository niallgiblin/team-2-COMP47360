"""Hugging Face chat integration and prompt/context assembly."""

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from config import (
    BUSYNESS_FETCH_TIMEOUT_SECONDS,
    BUSYNESS_SERVICE_URL,
    CHAT_API_URL,
    DATA_PATH,
    DEFAULT_HF_CHAT_MODEL,
    HF_CHAT_MODEL,
)
from dto import create_citation_dto
from prompt_loader import PromptLoadError, load_prompt_template

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Zone extraction for location-aware chat
# ---------------------------------------------------------------------------

_KNOWN_ZONES: set[str] | None = None
_ZONE_ALIASES: dict[str, str] = {
    "midtown": "midtown",
    "upper west side": "upper west side",
    "upper east side": "upper east side",
    "east village": "east village",
    "west village": "west village",
    "greenwich village": "greenwich village",
    "lower east side": "lower east side",
    "chelsea": "chelsea",
    "soho": "soho",
    "tribeca": "tribeca",
    "chinatown": "chinatown",
    "harlem": "harlem",
    "financial district": "financial district",
    "gramercy": "gramercy",
    "hell's kitchen": "clinton",
    "hells kitchen": "clinton",
    "kips bay": "kips bay",
    "murray hill": "murray hill",
    "flatiron": "flatiron",
    "union square": "union sq",
    "times square": "times sq",
    "battery park": "battery park",
    "washingon heights": "washington heights",
    "washington heights": "washington heights",
    "morningside heights": "morningside heights",
    "hamilton heights": "hamilton heights",
    "yorkville": "yorkville",
    "lenox hill": "lenox hill",
    "lincoln square": "lincoln square",
    "stuy town": "stuy town",
    "stuyvesant town": "stuy town",
    "alphabet city": "alphabet city",
    "two bridges": "two bridges",
    "seaport": "seaport",
    "roosevelt island": "roosevelt island",
    "williamsburg": "williamsburg",
    "long island city": "long island city",
    "hunters point": "hunters point",
    "meatpacking": "meatpacking",
    "hudson yards": "hudson yards",
    "hudson sq": "hudson sq",
    "garment district": "garment district",
    "penn station": "penn station",
}


def _load_known_zones():
    """Load unique zone names from the venues CSV into a cached module-level set."""
    global _KNOWN_ZONES
    if _KNOWN_ZONES is not None:
        return _KNOWN_ZONES

    try:
        import pandas as pd

        csv_path = os.getenv("DATA_PATH", DATA_PATH)
        if not os.path.isfile(csv_path):
            logger.warning("Cannot load zones: venues CSV not found at %s", csv_path)
            _KNOWN_ZONES = set()
            return _KNOWN_ZONES

        df = pd.read_csv(csv_path)
        zones = {str(z).strip().lower() for z in df["zone"].dropna().unique() if str(z).strip()}
        _KNOWN_ZONES = zones
        logger.info("Loaded %d unique zones for location extraction", len(zones))
        return _KNOWN_ZONES
    except Exception as exc:
        logger.warning("Failed to load zones from CSV: %s", exc)
        _KNOWN_ZONES = set()
        return _KNOWN_ZONES


def extract_location_from_query(query):
    """Scan a natural-language query for Manhattan zone names or common aliases.

    Returns a location filter string suitable for ``SearchService.search()``,
    or ``None`` when no location is detected.

    Examples
    --------
    >>> extract_location_from_query("find me a jazz bar in Midtown")
    'midtown'
    >>> extract_location_from_query("what's good in the Upper West Side tonight?")
    'upper west side'
    >>> extract_location_from_query("any quiet cafes?")
    None
    """
    if not query or not str(query).strip():
        return None

    text = str(query).lower().strip()

    # 1. Check aliases first (common names that map to zone substrings).
    for alias, filter_term in _ZONE_ALIASES.items():
        if alias in text:
            logger.debug("Location extracted via alias %r -> %r", alias, filter_term)
            return filter_term

    # 2. Check against known zone names from the corpus (substring match
    #    on the query side — if the query contains a zone name substring,
    #    it passes as a filter to _matches_location_filter).
    known = _load_known_zones()
    for zone in sorted(known, key=len, reverse=True):
        if zone in text:
            logger.debug("Location extracted via zone name %r", zone)
            return zone

    return None

CHAT_UNAVAILABLE_MESSAGE = "Location search is not available at the moment."
CHAT_SEARCH_ERROR_MESSAGE = "I'm having trouble finding similar locations right now."
CHAT_RESPONSE_ERROR_MESSAGE = (
    "I'm having trouble processing your request right now. Please try again later."
)
NO_VENUES_MESSAGE = "no matching venues found"
NO_BUSYNESS_MESSAGE = "Live busyness data is not available at the moment."

# ---------------------------------------------------------------------------
# Busyness context
# ---------------------------------------------------------------------------


def _busyness_label(score):
    """Map a normalized 0–1 busyness score to a human-readable label."""
    if score is None:
        return "unknown"
    if score >= 0.8:
        return "packed"
    if score >= 0.6:
        return "busy"
    if score >= 0.4:
        return "moderate"
    if score >= 0.2:
        return "quiet"
    return "very quiet"


def fetch_busyness_predictions(lat=40.7580, lon=-73.9855):
    """Fetch live busyness predictions from the busyness service.

    Parameters
    ----------
    lat : float
        Latitude for the busyness query (default: Times Square).
    lon : float
        Longitude for the busyness query (default: Times Square).

    Returns
    -------
    dict | None
        Predictions dict keyed by zone ID, or ``None`` on failure.
    """
    try:
        url = f"{BUSYNESS_SERVICE_URL}/busyness"
        resp = requests.get(
            url,
            params={"lat": lat, "lon": lon},
            timeout=BUSYNESS_FETCH_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("success") and body.get("predictions"):
            return body["predictions"]
        logger.warning("Busyness service returned success=false or empty predictions")
        return None
    except requests.exceptions.Timeout:
        logger.warning("Busyness service request timed out after %ds", BUSYNESS_FETCH_TIMEOUT_SECONDS)
        return None
    except requests.exceptions.ConnectionError:
        logger.warning("Busyness service unavailable at %s", BUSYNESS_SERVICE_URL)
        return None
    except Exception as exc:
        logger.warning("Failed to fetch busyness predictions: %s", exc)
        return None


def format_busyness_context(predictions):
    """Format raw busyness predictions into a concise text context for the LLM.

    Parameters
    ----------
    predictions : dict | None
        Raw predictions dict (zone_id → score), or ``None``.

    Returns
    -------
    str
        Formatted busyness context string suitable for the prompt template
        ``{busyness_context}`` placeholder.
    """
    if not predictions:
        return NO_BUSYNESS_MESSAGE

    parts = [
        "Current Manhattan busyness levels (0.0=empty, 1.0=packed, source: ML forecast):"
    ]
    # Show all zones sorted by busyness (busiest first) for a quick overview.
    sorted_zones = sorted(predictions.items(), key=lambda kv: kv[1], reverse=True)

    # Keep it compact: list the top 5 busiest and bottom 3 quietest.
    if len(sorted_zones) <= 10:
        for zone_id, score in sorted_zones:
            parts.append(f"  Zone {zone_id}: {score:.2f} ({_busyness_label(score)})")
    else:
        parts.append("  Busiest zones:")
        for zone_id, score in sorted_zones[:5]:
            parts.append(f"    Zone {zone_id}: {score:.2f} ({_busyness_label(score)})")
        parts.append("  Quietest zones:")
        for zone_id, score in sorted_zones[-3:]:
            parts.append(f"    Zone {zone_id}: {score:.2f} ({_busyness_label(score)})")

    return "\n".join(parts)


def build_busyness_context():
    """Fetch and format busyness context for RAG prompt injection.

    Returns
    -------
    str
        Formatted busyness context or the no-data fallback message.
    """
    predictions = fetch_busyness_predictions()
    return format_busyness_context(predictions)


# ---------------------------------------------------------------------------
# Retrieval context
# ---------------------------------------------------------------------------


def _truncate(text, max_len=120):
    """Truncate text to *max_len* characters with ellipsis."""
    if not text or len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def format_retrieval_context(results):
    """Format search-result DTOs into a rich retrieval-context string AND a citations list.

    Now includes price, rating, description, summary, tags, review count,
    **and live Google Places reviews** — giving the LLM much richer grounding
    than name/zone/type alone.

    Google enrichment runs concurrently with a short timeout per venue so
    chat latency stays low even when the Places API is slow.

    Parameters
    ----------
    results : list[dict]
        Location DTOs from the search service (empty list when no results).

    Returns
    -------
    tuple[str, list[dict]]
        ``(context_string, citations)`` where each citation has
        ``venue_id``, ``name``, ``snippet``, and ``score``.
    """
    if not results:
        return (NO_VENUES_MESSAGE, [])

    # Fetch Google Places reviews concurrently for all result venues.
    google_contexts: dict[int, str] = {}
    try:
        from google_places import enrich_venue_with_google_reviews

        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {
                pool.submit(enrich_venue_with_google_reviews, loc): idx
                for idx, loc in enumerate(results)
            }
            for future in as_completed(futures, timeout=4.0):
                idx = futures[future]
                try:
                    ctx = future.result()
                    if ctx:
                        google_contexts[idx] = ctx
                except Exception:
                    pass
    except Exception as exc:
        logger.debug("Google Places enrichment skipped: %s", exc)

    loc_info_parts = []
    citations = []

    for idx, loc in enumerate(results, start=1):
        name = loc.get("name", "Unknown")
        zone = loc.get("zone", "")
        loc_type = loc.get("type", "")
        price = loc.get("price", "")
        rating = loc.get("rating", 0)
        description = loc.get("description", "")
        summary = loc.get("summary", "")
        tags = loc.get("tags", "")
        num_reviews = loc.get("num_reviews", 0)
        reviews = loc.get("reviews", "")

        # Build a compact but rich venue summary for the LLM.
        detail_parts = [f"**{idx}. {name}**"]
        detail_parts.append(f"  Zone: {zone}")
        detail_parts.append(f"  Type: {loc_type}")
        if price:
            detail_parts.append(f"  Price: {price}")
        if rating:
            detail_parts.append(f"  Rating: {rating:.1f}/5")
        if num_reviews:
            detail_parts.append(f"  Reviews: {num_reviews}")
        if description:
            detail_parts.append(f"  Description: {_truncate(description)}")
        if summary:
            detail_parts.append(f"  Vibe: {_truncate(summary)}")
        if tags:
            detail_parts.append(f"  Tags: {tags}")

        # Prefer live Google reviews over static CSV reviews.
        google_ctx = google_contexts.get(idx - 1, "")
        if google_ctx:
            detail_parts.append(f"  {google_ctx}")
        elif reviews:
            detail_parts.append(f"  What people say: {_truncate(reviews, 250)}")

        loc_info_parts.append("\n".join(detail_parts))
        citations.append(create_citation_dto(loc))

    header = (
        "Here are the top matching venues in Manhattan. Use details below "
        "to ground your recommendations:\n\n"
    )
    context = header + "\n\n".join(loc_info_parts)
    return (context, citations)


def build_retrieval_context(query, limit=5, search_helper=None, location_filter=None):
    """Resolve top-k venue DTOs for chat context, optionally scoped to a location zone.

    Returns
    -------
    tuple[str, list[dict]]
        ``(context_string, citations)`` — citations is empty when retrieval
        is unavailable or produces an error.
    """
    if search_helper is None:
        return (CHAT_UNAVAILABLE_MESSAGE, [])

    try:
        raw = search_helper(query, limit=limit, location_filter=location_filter)
        if isinstance(raw, str):
            # Backward-compat: caller returned a pre-formatted string.
            return (raw, [])
        return format_retrieval_context(raw)
    except Exception as exc:
        logger.error("Error building chat retrieval context: %s", exc)
        return (CHAT_SEARCH_ERROR_MESSAGE, [])


def _build_chat_history(previous_questions):
    """Format truncated chat history for the user-template ``{chat_history}``
    placeholder.  Returns an empty string when there are no previous questions.
    """
    if not previous_questions:
        return ""
    lines = ["Previous conversation:"]
    for question in previous_questions[-3:]:
        lines.append(f"- User: {question}")
    return "\n".join(lines)


def build_chat_messages(
    query,
    previous_questions,
    retrieval_context=None,
    search_helper=None,
    template=None,
    busyness_context=None,
    location_filter=None,
):
    """Build Hugging Face chat messages using the versioned prompt template.

    Parameters
    ----------
    query : str
        The user's natural-language question.
    previous_questions : list[str]
        Truncated conversation history (last 3).
    retrieval_context : str | None
        Pre-built retrieval context string.  When ``None`` the function
        calls ``build_retrieval_context`` via *search_helper*.
    search_helper : callable | None
        ``(query, limit, location_filter=None) -> list[dict]`` producing location DTOs.
    template : PromptTemplate | None
        Pre-loaded prompt template.  When ``None`` the function loads the
        default template via ``prompt_loader``.
    busyness_context : str | None
        Pre-built busyness context string.  When ``None`` the function
        fetches and formats busyness data via ``build_busyness_context``.
    location_filter : str | None
        Optional zone substring filter (e.g. 'midtown', 'upper west side').
        When provided and *retrieval_context* is ``None``, it is forwarded
        to the search helper to scope retrieval to a geographic area.

    Returns
    -------
    tuple[list[dict], list[dict]]
        ``(messages, citations)`` — *citations* is populated when retrieval
        context is built from DTOs (structured citations).  When
        *retrieval_context* is passed directly as a string, citations is
        empty.
    """
    citations = []

    if retrieval_context is None:
        retrieval_context, citations = build_retrieval_context(
            query, search_helper=search_helper, location_filter=location_filter,
        )

    # ---- Resolve busyness context ------------------------------------------
    if busyness_context is None:
        busyness_context = build_busyness_context()

    # ---- Load prompt template ------------------------------------------------
    if template is None:
        try:
            template = load_prompt_template()
        except PromptLoadError as exc:
            logger.error("Failed to load prompt template: %s", exc)
            # Fallback: bare-minimum system prompt so the endpoint still works.
            template = None

    # ---- Build history & user content ----------------------------------------
    chat_history = _build_chat_history(previous_questions)

    if template and template.get("system_template"):
        system_content = template["system_template"].format(
            retrieval_context=retrieval_context,
            busyness_context=busyness_context,
        )
    else:
        system_content = (
            "You are a helpful AI assistant for a Manhattan nightlife app. "
            "You have access to information about venues in Manhattan. "
            f"Here's what you know about similar locations:\n{retrieval_context}\n\n"
            f"Current busyness levels:\n{busyness_context}\n\n"
            "Provide helpful, concise responses about Manhattan nightlife and venues."
        )

    if template and template.get("user_template"):
        user_content = template["user_template"].format(
            chat_history=chat_history,
            user_query=query,
        )
    else:
        context_parts = []
        if previous_questions:
            context_parts.append("Previous conversation:")
            for question in previous_questions[-3:]:
                context_parts.append(f"- User: {question}")
        context_parts.append(f"Current query: {query}")
        user_content = "\n".join(context_parts)

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]

    return messages, citations


def huggingface_chat_api_call(messages, model=None, requests_module=None, max_tokens=400, timeout=30):
    """Make a call to the Hugging Face chat completions API.

    Parameters
    ----------
    max_tokens : int
        Maximum tokens in the response (default 400).
    timeout : int
        Request timeout in seconds (default 30).
    """
    token = os.environ.get("HF_TOKEN")
    if not token or token == "your-hugging-face-api-token":
        logger.error(
            "CRITICAL: HF_TOKEN environment variable is not set or is using a placeholder value."
        )
        raise ValueError("Hugging Face API token is missing or invalid.")

    if model is None:
        model = os.environ.get("HF_CHAT_MODEL", DEFAULT_HF_CHAT_MODEL)

    http = requests_module or requests
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "messages": messages,
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "top_p": 0.9,
    }

    logger.info("Making request to Hugging Face API...")
    try:
        response = http.post(CHAT_API_URL, headers=headers, json=payload, timeout=timeout)
        response.raise_for_status()
        logger.info("Successfully received response from Hugging Face API.")
        return response.json()
    except http.exceptions.Timeout:
        logger.error("Request to Hugging Face API timed out.")
        raise
    except http.exceptions.RequestException as exc:
        logger.error("Error calling Hugging Face API: %s", exc)
        if getattr(exc, "response", None) is not None:
            logger.error(
                "Response status: %s, Body: %s",
                exc.response.status_code,
                exc.response.text,
            )
        raise


# ---------------------------------------------------------------------------
# Inline citation parsing (S05)
# ---------------------------------------------------------------------------

_INLINE_CITATION_RE = __import__("re").compile(r"\[(\d+)\]")


def parse_inline_citations(response_text, citations):
    """Extract [N] markers from LLM response text and append a footnote block.

    Parameters
    ----------
    response_text : str
        The raw text returned by the LLM.
    citations : list[dict]
        Citations list produced by ``format_retrieval_context``.  Each
        dict has ``name`` and ``snippet`` keys (and optionally
        ``venue_id`` / ``score``).

    Returns
    -------
    str
        *response_text* unchanged when *citations* is empty or contains no
        valid markers.  Otherwise *response_text* with a trailing footnote
        block appended::

            ---
            **Sources:**
            [1] Name — snippet
            [2] Name — snippet
    """
    # Fast path: empty citations or empty text → passthrough
    if not citations or not response_text:
        return response_text

    cite_count = len(citations)

    # Find all [N] markers and deduplicate.
    raw_matches = [int(n) for n in _INLINE_CITATION_RE.findall(response_text)]
    valid_indices = sorted(set(n for n in raw_matches if 1 <= n <= cite_count))

    if not valid_indices:
        # No valid markers → pass through (out-of-range markers survive
        # in the text — they are just not turned into footnotes).
        return response_text

    # Build the footnote block.
    lines = ["\n---\n**Sources:**"]
    for n in valid_indices:
        cit = citations[n - 1]
        name = cit.get("name", "Unknown")
        snippet = cit.get("snippet", "")
        lines.append(f"[{n}] {name} — {snippet}")

    return response_text + "\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# Query reformulation for multi-turn conversational retrieval (S06)
# ---------------------------------------------------------------------------

REFORMULATION_SYSTEM_PROMPT = (
    "You are a query reformulator for a Manhattan nightlife venue search system. "
    "Your task is to rewrite the user's follow-up question into a self-contained "
    "retrieval query using the previous conversation context.\n\n"
    "Rules:\n"
    "- NEVER invent venue names, zones, or attributes that were not mentioned "
    "by the user or in previous responses.\n"
    "- Preserve any location/zone context from previous turns. "
    "For example, if the user previously asked about Midtown, keep 'Midtown' "
    "in the reformulated query even if the follow-up doesn't re-state it.\n"
    "- If no conversation history is provided, return the query unchanged.\n"
    "- Output ONLY the reformulated query text — no prefixes, no explanations, "
    "no commentary, no quotation marks.\n"
    "- Make the reformulated query specific enough to be used directly in a "
    "venue search without additional context."
)


def reformulate_query(current_query, previous_questions, previous_responses):
    """Rewrite a context-dependent follow-up into a self-contained retrieval query.

    Uses conversation history (alternating Q&A pairs) so that follow-ups like
    "what about cheaper options?" inherit venue/zone context from earlier turns
    without the user re-stating it.

    Parameters
    ----------
    current_query : str
        The user's latest question (may be context-dependent).
    previous_questions : list[str]
        Previous user questions in chronological order.
    previous_responses : list[str]
        Previous AI responses in chronological order (1:1 with previous_questions).

    Returns
    -------
    str
        Self-contained retrieval query, or *current_query* unchanged when
        history is empty or reformulation fails.
    """
    # Fallback (a): empty history → return as-is, no API call
    if not previous_questions:
        logger.debug("No conversation history; returning query unchanged")
        return current_query

    # Build messages: system prompt + alternating Q&A pairs + instruction
    messages = [{"role": "system", "content": REFORMULATION_SYSTEM_PROMPT}]

    for q, r in zip(previous_questions, previous_responses):
        messages.append({"role": "user", "content": q})
        messages.append({"role": "assistant", "content": r})

    messages.append({
        "role": "user",
        "content": (
            f"Rewrite this follow-up question into a self-contained retrieval query: "
            f"{current_query}"
        ),
    })

    try:
        response = huggingface_chat_api_call(
            messages, max_tokens=100, timeout=10,
        )
        reformulated = response["choices"][0]["message"]["content"].strip()

        # Fallback (c): empty/whitespace-only output
        if not reformulated:
            logger.warning(
                "Reformulation returned empty output for query=%r; "
                "using original query",
                current_query,
            )
            return current_query

        logger.debug(
            "Reformulated query from %d-char original to %d-char reformulated: %r",
            len(current_query), len(reformulated), reformulated,
        )
        return reformulated

    except requests.exceptions.Timeout:
        # Fallback (b): timeout
        logger.warning(
            "Reformulation timed out for query=%r; using original query",
            current_query,
        )
        return current_query

    except Exception as exc:
        # Fallback (b): any other API error
        logger.warning(
            "Reformulation failed for query=%r: %s; using original query",
            current_query,
            exc,
        )
        return current_query


def get_ai_response(
    query,
    previous_questions,
    search_helper=None,
    hf_call=None,
    busyness_context=None,
    location_filter=None,
):
    """Get AI response using Hugging Face API and optional retrieval context.

    Returns
    -------
    tuple[str, list[dict]]
        ``(response_text, citations)`` — *citations* contains structured
        venue citations (empty when retrieval is unavailable or produces no
        results).
    """
    try:
        messages, citations = build_chat_messages(
            query=query,
            previous_questions=previous_questions,
            search_helper=search_helper,
            busyness_context=busyness_context,
            location_filter=location_filter,
        )
        call = hf_call or huggingface_chat_api_call
        response = call(messages)
        response_text = response["choices"][0]["message"]["content"]
        response_text = parse_inline_citations(response_text, citations)
        return response_text, citations
    except Exception as exc:
        logger.error("Error getting AI response: %s", exc)
        return CHAT_RESPONSE_ERROR_MESSAGE, []
