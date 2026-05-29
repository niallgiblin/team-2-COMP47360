"""Hugging Face chat integration and prompt/context assembly."""

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from config import (
    BUSYNESS_FETCH_TIMEOUT_SECONDS,
    BUSYNESS_SERVICE_URL,
    CHAT_API_URL,
    DEFAULT_HF_CHAT_MODEL,
    HF_CHAT_MODEL,
)
from dto import create_citation_dto
from prompt_loader import PromptLoadError, load_prompt_template

logger = logging.getLogger(__name__)

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


def build_retrieval_context(query, limit=5, search_helper=None):
    """Resolve top-k venue DTOs for chat context.

    Returns
    -------
    tuple[str, list[dict]]
        ``(context_string, citations)`` — citations is empty when retrieval
        is unavailable or produces an error.
    """
    if search_helper is None:
        return (CHAT_UNAVAILABLE_MESSAGE, [])

    try:
        raw = search_helper(query, limit=limit)
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
        ``(query, limit) -> list[dict]`` producing location DTOs.
    template : PromptTemplate | None
        Pre-loaded prompt template.  When ``None`` the function loads the
        default template via ``prompt_loader``.
    busyness_context : str | None
        Pre-built busyness context string.  When ``None`` the function
        fetches and formats busyness data via ``build_busyness_context``.

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
            query, search_helper=search_helper
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


def huggingface_chat_api_call(messages, model=None, requests_module=None):
    """Make a call to the Hugging Face chat completions API."""
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
        "max_tokens": 400,
        "temperature": 0.4,
        "top_p": 0.9,
    }

    logger.info("Making request to Hugging Face API...")
    try:
        response = http.post(CHAT_API_URL, headers=headers, json=payload, timeout=30)
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


def get_ai_response(
    query,
    previous_questions,
    search_helper=None,
    hf_call=None,
    busyness_context=None,
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
        )
        call = hf_call or huggingface_chat_api_call
        response = call(messages)
        return response["choices"][0]["message"]["content"], citations
    except Exception as exc:
        logger.error("Error getting AI response: %s", exc)
        return CHAT_RESPONSE_ERROR_MESSAGE, []
