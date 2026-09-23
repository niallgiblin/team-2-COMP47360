"""Hugging Face chat integration and prompt/context assembly."""

import json
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
    JEV_ABSTENTION_ENABLED,
    JEV_ENABLED,
    JEV_GUARDRAIL_ENABLED,
    JEV_QUERY_ANALYSIS_ENABLED,
)
from dto import create_citation_dto
from prompt_loader import PromptLoadError, load_prompt_template
from search_service import location_filter_group_terms

logger = logging.getLogger(__name__)

# Sentinel distinguishing "caller did not supply a QueryAnalysis" (compute it
# here, for backward compatibility) from "caller supplied None" (Jev returned
# no signal — do not recompute). The route layer passes the value explicitly.
_QUERY_ANALYSIS_UNSET = object()

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


def _expand_zone_filter(zone_name):
    """Expand a zone name to include sub-zones via the location filter groups.

    Returns a set containing the original zone name plus all sub-zones
    from the filter groups dictionary.  Unknown zones return a set containing
    only the original name.

    Examples
    --------
    >>> sorted(_expand_zone_filter("upper east side"))
    ['carnegie hill', 'lenox hill', 'upper east side', 'yorkville']
    >>> _expand_zone_filter("nonexistent_zone")
    {'nonexistent_zone'}
    """
    if not zone_name or not str(zone_name).strip():
        return set()
    normalized = str(zone_name).strip().lower()
    return {normalized} | location_filter_group_terms(normalized)


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

# Lead-in for the deterministic fallback used when the guardrail rejects an
# ungrounded generated answer (distinct from the model-unavailable wording).
GROUNDED_FALLBACK_INTRO = (
    "I found a few options, but I couldn't verify every detail in my first "
    "answer, so here are the confirmed venues from our database:"
)

# Appended when the guardrail flags unverified details but the answer is kept
# (the softer tier — replacing the whole answer costs answer relevancy).
UNVERIFIED_CAVEAT = (
    "_Heads up: I couldn't verify every detail against our venue data — "
    "double-check anything important before you go._"
)

# Response when the calibrated-abstention gate decides retrieval cannot answer
# the request. Citations are intentionally empty so the UI shows no cards.
ABSTENTION_MESSAGE = (
    "I couldn't find a good match for that in Manhattan. "
    "Try a different neighborhood, vibe, or type of venue."
)

# Scoped refusals for the pre-retrieval scope gate. Kept short and on-brand so
# an out-of-catalog or abusive message never reaches retrieval/generation.
OUT_OF_SCOPE_MESSAGE = (
    "I can only help with Manhattan nightlife — bars, clubs, lounges, "
    "restaurants, cafes, museums, and galleries. Try a neighborhood, vibe, "
    "or type of venue."
)
HARMFUL_SCOPE_MESSAGE = (
    "I can't help with that. I can help you find Manhattan venues instead."
)
# In-catalog venue but a detail the catalog does not store (hours, capacity,
# phone, dress code, cover charge, social following, schedules). The user asked
# the right kind of question; we just do not have the datum.
UNKNOWN_ATTRIBUTE_MESSAGE = (
    "I don't have that detail about that venue. I can help with what the "
    "catalog covers — venue type, price, vibe, neighborhood, and current "
    "busyness. Want a recommendation instead?"
)

# ---------------------------------------------------------------------------
# General / non-venue chat detection (prevents random venue results for meta
# questions like "how do you work?" or "what can you do?")
# ---------------------------------------------------------------------------

import re

_GENERAL_CHAT_PATTERNS = [
    # Greetings / small talk
    r"^(hi|hey|hello|yo|sup|howdy|good (morning|afternoon|evening))\b",
    r"^how are you[?!]*$",
    r"^what'?s up[?!]*$",
    # Meta / self-referential
    r"how (do|does) (you|this|the (chatbot|bot|ai|assistant)) work",
    r"what (can|do) you do",
    r"what are you",
    r"who are you",
    r"who made you",
    r"what (is )?your (name|purpose|function)",
    r"tell me about yourself",
    r"are you (an? )?ai",
    r"are you (a |an )?(chatbot|bot|llm|language model)",
    r"what model",
    r"what data (do you|are you)",
    r"how (were|are) you (trained|built|made)",
    r"what (is )?(urban gala|this app|this website)",
    r"help me (understand|use|navigate) (the |this )(app|chat|chatbot)",
    # Capability questions (non-venue)
    r"what (features|functionality) (do you|does this) (have|offer)",
    r"what (can|should) I (ask|type|say)",
    r"how (do|can) I (use|interact with|start)",
    r"(give me )?(a |some )?(tips|advice|suggestions) (on |for |about )?(using |how to use )",
    # Thank you / closing
    r"^(thanks?|thank you|thx|ty|ok|okay|bye|goodbye|see ya|later)[!\s]*$",
    r"^(cool|nice|great|awesome|perfect|got it|understood)[!\s]*$",
]

_GENERAL_CHAT_RE = [re.compile(p, re.IGNORECASE) for p in _GENERAL_CHAT_PATTERNS]

# Queries that are explicitly requesting venue/service recommendations and
# should ALWAYS trigger retrieval (overrides general-chat detection).
_VENUE_INTENT_PATTERNS = [
    r"\b(bar|bars|club|clubs|lounge|pub|restaurant|venue|place|spot|nightlife|cafe|diner|rooftop|speakeasy|jazz|wine|cocktail|dance|dancing|drink|food|eat|dinner|lunch|brunch|date|party|hangout|night)\b",
    r"\b(recommend|suggest|find|search|looking for|show me|give me|tell me about|what'?s (good|hot|trending|popular|nearby|open)|where|any (good|nice|cool|fun))\b",
]

_VENUE_INTENT_RE = [re.compile(p, re.IGNORECASE) for p in _VENUE_INTENT_PATTERNS]


def is_general_chat_query(query):
    """Detect whether a user query is a general/meta question that should not
    trigger venue retrieval.

    Returns True when the query looks like small talk, a meta question about
    the bot/app itself, or a capability question — not a venue recommendation
    request.  Returns False when venue intent keywords are detected AND no
    high-confidence general-chat pattern matched.

    The general-chat check runs first so that unambiguous meta queries like
    "tell me about yourself" are not accidentally classified as venue intent
    due to the substring "tell me about".

    Examples
    --------
    >>> is_general_chat_query("how do you work?")
    True
    >>> is_general_chat_query("find me a jazz bar in Midtown")
    False
    >>> is_general_chat_query("hello")
    True
    >>> is_general_chat_query("tell me about yourself")
    True
    """
    if not query or not str(query).strip():
        return False

    text = str(query).strip()

    # 1. Check high-confidence general-chat patterns first — these are
    #    unambiguous meta/small-talk queries, not venue requests.
    for pattern in _GENERAL_CHAT_RE:
        if pattern.search(text):
            return True

    # 2. If no general pattern matched, check for venue intent keywords.
    for pattern in _VENUE_INTENT_RE:
        if pattern.search(text):
            return False

    # 3. Default: no clear signal either way → not general chat.
    return False


def resolve_query_analysis(query, previous_questions=None):
    """Return a Jev ``QueryAnalysis`` for *query*, or ``None`` for regex fallback.

    Jev provides one typed, calibrated call that covers the general-chat gate
    and location extraction that regex currently approximates. This function
    never raises — any Jev failure degrades to the existing behaviour.
    """
    if not (JEV_ENABLED and JEV_QUERY_ANALYSIS_ENABLED):
        return None
    try:
        from jev_service import analyze_query

        return analyze_query(
            query,
            zones=_load_known_zones(),
            categories=list(_ACTIVITY_PATTERNS.keys()),
            previous_questions=previous_questions,
            enabled=True,
        )
    except Exception as exc:  # defensive: never break the chat path
        logger.debug("Jev query analysis unavailable: %s", exc)
        return None


def _is_general_chat(query, analysis=None):
    """Jev-first general-chat decision, falling back to the regex detector."""
    if analysis is not None:
        return analysis.is_general_chat
    return is_general_chat_query(query)


def _analysis_categories(analysis):
    """Category names from a Jev QueryAnalysis, or None for the regex map."""
    if analysis is None:
        return None
    return list(analysis.categories)


def compose_search_query(query, analysis):
    """Build a keyword-rich retrieval query from a Jev ``QueryAnalysis``.

    Replaces the HF ``rewrite_query`` call when Jev is enabled: the typed
    location, price tier, and categories are appended to the original query,
    then the static ``expand_query`` synonym map runs as usual.
    """
    if analysis is None:
        return query
    parts = [query]
    if analysis.location:
        parts.append(analysis.location)
    if analysis.price_tier:
        parts.append(analysis.price_tier)
    parts.extend(analysis.categories)
    return " ".join(part for part in parts if part)


def resolve_answer_verification(answer, retrieval_context, citations):
    """Check a generated answer for faithfulness via Jev.

    Returns an ``AnswerVerification`` when the guardrail runs, or ``None``
    when it is disabled, unavailable, or there is nothing to verify (no
    citations). Callers must treat ``None`` as "not verified", not "good".
    """
    if not JEV_ENABLED or not JEV_GUARDRAIL_ENABLED:
        return None
    if not answer or not citations:
        return None
    try:
        from jev_service import verify_answer

        venue_names = [c.get("name") for c in citations if c.get("name")]
        return verify_answer(
            answer,
            retrieval_context,
            venue_names=venue_names,
            enabled=True,
        )
    except Exception as exc:  # defensive: never break the chat path
        logger.debug("Jev answer verification unavailable: %s", exc)
        return None


_KNOWN_VENUE_NAMES = None


def _load_known_venue_names():
    """Load catalog venue names (lowercased) for the follow-up scope rule."""
    global _KNOWN_VENUE_NAMES
    if _KNOWN_VENUE_NAMES is not None:
        return _KNOWN_VENUE_NAMES
    try:
        import pandas as pd

        csv_path = os.getenv("DATA_PATH", DATA_PATH)
        df = pd.read_csv(csv_path, usecols=["name"])
        # Names shorter than 5 chars ("Oso", "NR") match too many ordinary
        # words; require something distinctive.
        _KNOWN_VENUE_NAMES = {
            str(n).strip().lower()
            for n in df["name"].dropna()
            if len(str(n).strip()) >= 5
        }
        logger.info("Loaded %d venue names for scope follow-up", len(_KNOWN_VENUE_NAMES))
    except Exception as exc:
        logger.warning("Cannot load venue names for scope follow-up: %s", exc)
        _KNOWN_VENUE_NAMES = set()
    return _KNOWN_VENUE_NAMES


def _query_mentions_known_venue(query):
    """True when *query* contains a catalog venue name."""
    text = str(query or "").lower()
    if not text:
        return False
    return any(name in text for name in _load_known_venue_names())


def resolve_scope_decision(query, previous_questions=None):
    """Classify *query* as in-scope / off-topic / unknown-attribute / harmful.

    Returns a ``ScopeDecision`` or ``None`` (gate disabled, unavailable, or
    failed). ``None`` means "do not block" — this cap fails open so a Jev
    outage never takes the chat down.

    Follow-up rule: a question about a *named catalog venue* is in-catalog
    even when the classifier lands on ``off_topic`` (it is asking for a detail
    we do not store, not asking about another topic), so it is upgraded to
    ``decline_unknown_attribute`` and gets the "I don't have that detail"
    response rather than the generic refusal.
    """
    try:
        from jev_service import classify_scope

        # ``enabled=None`` lets classify_scope honour JEV_ENABLED +
        # CHAT_SCOPE_GATE_ENABLED and fail open if Jev is down.
        decision = classify_scope(query, previous_questions=previous_questions)
        if decision is not None and decision.action == "decline_off_topic":
            try:
                if _query_mentions_known_venue(query):
                    from dataclasses import replace as _replace

                    decision = _replace(decision, action="decline_unknown_attribute")
                    logger.info(
                        "Scope follow-up: off_topic -> unknown_attribute "
                        "(known venue in query)"
                    )
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug("Scope follow-up rule failed: %s", exc)
        return decision
    except Exception as exc:  # defensive: never break the chat path
        logger.debug("Scope gate unavailable: %s", exc)
        return None


def scope_refusal_message(scope):
    """Return the refusal text for a declining ``ScopeDecision``."""
    if scope is not None:
        if scope.action == "decline_harmful":
            return HARMFUL_SCOPE_MESSAGE
        if scope.action == "decline_unknown_attribute":
            return UNKNOWN_ATTRIBUTE_MESSAGE
    return OUT_OF_SCOPE_MESSAGE


def resolve_answerability(query, citations):
    """Decide whether retrieved citations can answer *query* (calibrated).

    Returns an ``AnswerabilityAssessment``, or ``None`` when abstention gating
    is disabled, unavailable, or there is nothing to assess. Callers must
    treat ``None`` as "do not abstain".
    """
    if not JEV_ENABLED or not JEV_ABSTENTION_ENABLED:
        return None
    if not citations:
        return None
    try:
        from jev_service import assess_answerability

        return assess_answerability(query, citations, enabled=True)
    except Exception as exc:  # defensive: never break the chat path
        logger.debug("Jev answerability unavailable: %s", exc)
        return None


GENERAL_CHAT_SYSTEM_PROMPT = (
    "You are a helpful AI assistant for Urban Gala, a Manhattan nightlife app. "
    "You help users discover bars, clubs, lounges, and restaurants in Manhattan. "
    "Users can ask you to find venues by vibe, neighborhood, or activity, and you "
    "search our curated Manhattan venue database to recommend real places. "
    "Keep responses friendly and concise — 2-3 sentences. "
    "If the user asks how you work, explain that you use a hybrid search system "
    "(semantic embeddings + keyword matching) over a curated database of Manhattan "
    "nightlife venues, powered by a language model for natural conversation. "
    "If the user is just saying hello or making small talk, respond warmly."
)

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


_ZONE_NAMES: dict[str, str] | None = None


def _load_zone_names():
    """Load the LocationID → zone-name map (bundled from manhattanZones.geojson).

    The busyness model emits only numeric LocationIDs (e.g. ``237``), which are
    meaningless to the LLM. This map restores the neighbourhood names. The file
    is mounted at ``data/zone_names.json`` in the container.
    """
    global _ZONE_NAMES
    if _ZONE_NAMES is not None:
        return _ZONE_NAMES

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "zone_names.json")
    try:
        with open(path, encoding="utf-8") as fh:
            _ZONE_NAMES = {str(k): str(v) for k, v in json.load(fh).items()}
        logger.info("Loaded %d zone names from %s", len(_ZONE_NAMES), path)
    except Exception as exc:
        logger.warning("Could not load zone names from %s: %s", path, exc)
        _ZONE_NAMES = {}
    return _ZONE_NAMES


def fetch_busyness_report(lat=40.7580, lon=-73.9855):
    """Fetch the full busyness report (live predictions + hourly forecast).

    Returns the parsed response body (``predictions`` and ``forecast``) or
    ``None`` on failure. The read timeout must exceed the busyness service's
    cold-path latency (~6 s to run every DNN+LSTM), otherwise the first request
    after a cache expiry is discarded as a timeout.
    """
    try:
        url = f"{BUSYNESS_SERVICE_URL}/busyness"
        resp = requests.get(
            url,
            params={"lat": lat, "lon": lon},
            timeout=(3, BUSYNESS_FETCH_TIMEOUT_SECONDS),
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("success") and (body.get("predictions") or body.get("forecast")):
            return body
        logger.warning("Busyness service returned success=false or empty payload")
        return None
    except requests.exceptions.Timeout:
        logger.warning(
            "Busyness service request timed out after %ds",
            BUSYNESS_FETCH_TIMEOUT_SECONDS,
        )
        return None
    except requests.exceptions.ConnectionError:
        logger.warning("Busyness service unavailable at %s", BUSYNESS_SERVICE_URL)
        return None
    except Exception as exc:
        logger.warning("Failed to fetch busyness report: %s", exc)
        return None


def fetch_busyness_predictions(lat=40.7580, lon=-73.9855):
    """Fetch live busyness predictions keyed by zone ID, or ``None`` on failure."""
    report = fetch_busyness_report(lat, lon)
    return report.get("predictions") if report else None


def _forecast_by_zone(forecast):
    """Group the busyness service forecast into ``{zone_id: [(ts, value), ...]}``."""
    series: dict[str, list[tuple[str, float]]] = {}
    for entry in forecast or ():
        if not isinstance(entry, dict):
            continue
        raw_id = entry.get("LocationID")
        if raw_id is None:
            continue
        zone_id = str(raw_id).split()[0]
        points: list[tuple[str, float]] = []
        for point in entry.get("predictions") or ():
            if not isinstance(point, dict) or point.get("busyness") is None:
                continue
            try:
                points.append((str(point.get("timestamp", "")), float(point["busyness"])))
            except (TypeError, ValueError):
                continue
        if points:
            series[zone_id] = points
    return series


def format_busyness_context(predictions, forecast=None, zone_names=None, focus_zone_ids=None):
    """Format busyness predictions + forecast into text for the LLM prompt.

    Parameters
    ----------
    predictions : dict | None
        Live predictions (zone ID → normalized 0–1 score).
    forecast : list | None
        Raw forecast entries from the busyness service (per-zone hourly series).
    zone_names : dict | None
        LocationID → neighbourhood name. When omitted, zones are labelled
        ``Zone <id>`` (backward-compatible behaviour).
    focus_zone_ids : iterable | None
        Zone IDs for the requested neighbourhood, highlighted first and given a
        short hourly forecast.

    Returns
    -------
    str
        Formatted busyness context for the ``{busyness_context}`` placeholder.
    """
    if not predictions:
        return NO_BUSYNESS_MESSAGE

    names = zone_names or {}

    def label(zone_id):
        return names.get(str(zone_id)) or f"Zone {zone_id}"

    parts = [
        "Current Manhattan busyness levels (0.0=empty, 1.0=packed, source: ML forecast):"
    ]

    def line(indent, zone_id, score):
        return f"{indent}{label(zone_id)}: {float(score):.2f} ({_busyness_label(float(score))})"

    focus = {str(z) for z in (focus_zone_ids or ())}
    focus_present = [(z, s) for z, s in predictions.items() if str(z) in focus]
    if focus_present:
        parts.append("  Requested area:")
        for zone_id, score in sorted(focus_present, key=lambda kv: kv[1], reverse=True):
            parts.append(line("    ", zone_id, score))

    # Keep it compact: list all when small, else the top 5 busiest and bottom 3.
    sorted_zones = sorted(predictions.items(), key=lambda kv: kv[1], reverse=True)
    if len(sorted_zones) <= 10:
        for zone_id, score in sorted_zones:
            parts.append(line("  ", zone_id, score))
    else:
        parts.append("  Busiest zones:")
        for zone_id, score in sorted_zones[:5]:
            parts.append(line("    ", zone_id, score))
        parts.append("  Quietest zones:")
        for zone_id, score in sorted_zones[-3:]:
            parts.append(line("    ", zone_id, score))

    # Hourly forecast for the requested area (relative to that zone's own day).
    if focus_present and forecast:
        series = _forecast_by_zone(forecast)
        for zone_id, _score in sorted(focus_present, key=lambda kv: kv[1], reverse=True)[:2]:
            points = series.get(str(zone_id))
            if not points:
                continue
            values = [value for _ts, value in points]
            lo, hi = min(values), max(values)
            span = (hi - lo) or 1.0
            parts.append(
                f"  {label(zone_id)} next hours "
                "(relative to its own forecast, 0=quietest, 1=busiest):"
            )
            for ts, value in points[:6]:
                relative = (value - lo) / span
                hour = ts[11:16] if len(ts) >= 16 else ts
                parts.append(f"    {hour}: {relative:.2f} ({_busyness_label(relative)})")

    return "\n".join(parts)


def build_busyness_context(location_filter=None):
    """Fetch and format busyness context for RAG prompt injection.

    When *location_filter* names a neighbourhood, that zone is highlighted and
    its hourly forecast is included.
    """
    report = fetch_busyness_report()
    if not report:
        return NO_BUSYNESS_MESSAGE

    names = _load_zone_names()
    focus_zone_ids: set[str] = set()
    if location_filter and names:
        terms = location_filter_group_terms(location_filter)
        terms.add(str(location_filter).lower().strip())
        focus_zone_ids = {
            str(zone_id)
            for zone_id, name in names.items()
            if any(term in name.lower() for term in terms if term)
        }

    return format_busyness_context(
        report.get("predictions"),
        forecast=report.get("forecast"),
        zone_names=names,
        focus_zone_ids=focus_zone_ids,
    )


# ---------------------------------------------------------------------------
# Retrieval context
# ---------------------------------------------------------------------------


def _truncate(text, max_len=120):
    """Truncate text to *max_len* characters with ellipsis, breaking on a word
    boundary (last space) to avoid mid-word cuts."""
    if not text or len(text) <= max_len:
        return text
    truncated = text[: max_len - 1]
    last_space = truncated.rfind(" ")
    if last_space > 0:
        truncated = truncated[:last_space]
    return truncated + "…"


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

    # Expand location filter to include sub-zones (D-04).
    expanded_filter = None
    if location_filter:
        expanded_zones = _expand_zone_filter(location_filter)
        if len(expanded_zones) > 1:
            logger.debug(
                "Expanded zone filter %r -> %r", location_filter, expanded_zones,
            )
        expanded_filter = location_filter  # original name for display/fallback text

    try:
        raw = search_helper(query, limit=limit, location_filter=location_filter)
        if isinstance(raw, str):
            # Backward-compat: caller returned a pre-formatted string.
            return (raw, [])
        if not raw and location_filter:
            fallback_raw = search_helper(query, limit=limit, location_filter=None)
            if isinstance(fallback_raw, str):
                return (fallback_raw, [])
            if fallback_raw:
                context, citations = format_retrieval_context(fallback_raw)
                caveat = (
                    f"No exact venue matches were found in {location_filter}. "
                    "The venues below are relevant alternatives outside the requested area; "
                    "tell the user this clearly and recommend them only with that caveat.\n\n"
                )
                return (caveat + context, citations)
        return format_retrieval_context(raw)
    except Exception as exc:
        logger.error("Error building chat retrieval context: %s", exc)
        return (CHAT_SEARCH_ERROR_MESSAGE, [])


def _build_chat_history(previous_questions, previous_responses=None):
    """Format truncated chat history for the user-template ``{chat_history}``
    placeholder.  Returns an empty string when there are no previous questions.

    When *previous_responses* is provided, formats alternating Q&A pairs
    (zipped and truncated to the shorter list, keeping the last 3 turns).
    Falls back to question-only format when responses are absent or empty.
    """
    if not previous_questions:
        return ""
    lines = ["Previous conversation:"]

    if previous_responses:
        # Alternating Q&A pairs: zip to shorter list, keep last 3 turns
        pairs = list(zip(previous_questions, previous_responses))[-3:]
        for q, r in pairs:
            lines.append(f"- User: {q}")
            lines.append(f"- AI: {r}")
    else:
        for question in previous_questions[-3:]:
            lines.append(f"- User: {question}")

    return "\n".join(lines)


def build_chat_messages(
    query,
    previous_questions,
    previous_responses=None,
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
    previous_responses : list[str] | None
        Previous AI responses matching *previous_questions* 1:1.
        When provided, history is formatted as alternating Q&A pairs.
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
        # Highlight the requested neighbourhood when known. Keep the zero-arg
        # call when there is no filter so callers/tests can patch it.
        busyness_context = (
            build_busyness_context(location_filter=location_filter)
            if location_filter
            else build_busyness_context()
        )

    # ---- Load prompt template ------------------------------------------------
    if template is None:
        try:
            template = load_prompt_template()
        except PromptLoadError as exc:
            logger.error("Failed to load prompt template: %s", exc)
            # Fallback: bare-minimum system prompt so the endpoint still works.
            template = None

    # ---- Build history & user content ----------------------------------------
    chat_history = _build_chat_history(previous_questions, previous_responses)

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


def huggingface_chat_api_call(messages, model=None, requests_module=None, max_tokens=400, timeout=30, temperature=0.4):
    """Make a call to the Hugging Face chat completions API.

    Parameters
    ----------
    max_tokens : int
        Maximum tokens in the response (default 400).
    timeout : int
        Request timeout in seconds (default 30).
    temperature : float
        Sampling temperature (default 0.4). Set to 0 for deterministic
        evaluation runs.
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
        "temperature": temperature,
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
# SSE streaming support (Phase 22)
# ---------------------------------------------------------------------------

import json as _json


def _stream_hf_response(messages, model=None, requests_module=None, max_tokens=400, timeout=90):
    """Generator that yields content tokens from a streaming HF API call.

    Detects whether the API returns native SSE (text/event-stream) or a
    regular JSON response.  For non-streaming responses, simulates
    streaming by yielding word-by-word with a small delay.

    Yields
    ------
    str
        Content tokens as they arrive from the model.
    """
    token = os.environ.get("HF_TOKEN")
    if not token or token == "your-hugging-face-api-token":
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
        "stream": True,
    }

    logger.info("Making streaming request to Hugging Face API...")
    try:
        response = http.post(
            CHAT_API_URL, headers=headers, json=payload,
            timeout=timeout, stream=True,
        )
        response.raise_for_status()
    except http.exceptions.Timeout:
        logger.error("Streaming request to Hugging Face API timed out.")
        raise
    except http.exceptions.RequestException as exc:
        logger.error("Error in streaming HF API call: %s", exc)
        if getattr(exc, "response", None) is not None:
            logger.error(
                "Response status: %s, Body: %s",
                exc.response.status_code,
                exc.response.text[:500] if exc.response.text else "(empty)",
            )
        raise

    content_type = (response.headers.get("Content-Type") or "").lower()
    is_native_sse = "text/event-stream" in content_type

    if is_native_sse:
        logger.info("Native SSE streaming from HF API")
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            # Strip SSE prefix ("data: " or "data:")
            data_str = line
            if line.startswith("data: "):
                data_str = line[6:]
            elif line.startswith("data:"):
                data_str = line[5:]
            else:
                continue

            if data_str == "[DONE]":
                break

            try:
                chunk = _json.loads(data_str)
            except _json.JSONDecodeError:
                continue

            choices = chunk.get("choices", [])
            if not choices:
                continue

            delta = choices[0].get("delta", {})
            content = delta.get("content", "")
            if content:
                yield content

            finish_reason = choices[0].get("finish_reason")
            if finish_reason and finish_reason not in (None, "null", ""):
                break
    else:
        # Fallback: non-streaming response → simulate token-by-token
        logger.info("Non-streaming response; simulating token streaming")
        try:
            body = response.json()
            text = body["choices"][0]["message"]["content"]
        except Exception as exc:
            logger.error("Failed to parse non-streaming fallback response: %s", exc)
            raise

        import re as _re
        import time as _time

        # Split on whitespace boundaries, preserving whitespace.
        tokens = _re.split(r"(\s+)", text)
        for tok in tokens:
            if tok:
                yield tok
                _time.sleep(0.03)  # 30 ms between tokens simulates streaming feel


def stream_chat_response(
    query,
    previous_questions,
    previous_responses=None,
    search_helper=None,
    hf_call=None,
    busyness_context=None,
    location_filter=None,
    query_analysis=_QUERY_ANALYSIS_UNSET,
    obs_sink=None,
):
    """SSE generator that streams chat tokens and emits final citations.

    Follows the same retrieval → generation → post-processing pipeline as
    ``get_ai_response_with_metadata``, but yields SSE-formatted events so
    the frontend can render tokens incrementally.

    When *obs_sink* is provided, the final branch mode is recorded into it
    (``general_chat`` / ``out_of_scope`` / ``abstention``), plus a
    ``fallback`` flag. The route uses it to emit an accurate observability
    event after the stream completes.

    SSE event types
    ---------------
    ``token``
        Content chunk from the model.  ``data.content`` is the token text.
    ``done``
        Stream complete.  ``data.content`` is the full processed response
        (with citations, corrections, and category notices).
        ``data.citations`` is the citations array.
    ``error``
        An error occurred.  ``data.message`` describes the error.

    Parameters
    ----------
    Same as ``get_ai_response_with_metadata``.

    Yields
    ------
    str
        SSE-formatted lines (``data: {…}\n\n``).
    """
    import time as _time

    def _emit(event_type, data):
        """Format and yield a single SSE event."""
        payload = _json.dumps(data, ensure_ascii=False)
        return f"event: {event_type}\ndata: {payload}\n\n"

    # ---- Error helper ----------------------------------------------------
    def _emit_error(message):
        return _emit("error", {"message": message})

    try:
        # ---- Jev query understanding (optional) ---------------------------
        # One typed, calibrated call replaces the regex general-chat gate
        # and substring location extraction when enabled. Falls back to regex.
        analysis = (
            resolve_query_analysis(query, previous_questions)
            if query_analysis is _QUERY_ANALYSIS_UNSET
            else query_analysis
        )
        if analysis is not None and analysis.location and not location_filter:
            location_filter = analysis.location
            logger.info(
                "Jev location filter: %r (confidence=%.2f)",
                location_filter,
                analysis.location_confidence,
            )

        # ---- General chat: skip retrieval ---------------------------------
        if _is_general_chat(query, analysis):
            logger.info("General chat query detected — streaming: %r", query[:80])
            if obs_sink is not None:
                obs_sink["mode"] = "general_chat"
            chat_history = _build_chat_history(previous_questions, previous_responses)
            user_content = f"User question: {query}"
            if chat_history:
                user_content = f"{chat_history}\n\n{user_content}"

            messages = [
                {"role": "system", "content": GENERAL_CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ]

            full_text = ""
            hf = hf_call if hf_call else huggingface_chat_api_call
            # General chat doesn't use streaming API; use non-streaming
            # and token-split for consistency.
            try:
                response = hf(messages, max_tokens=200, timeout=15)
                full_text = response["choices"][0]["message"]["content"]

                import re as _re
                tokens = _re.split(r"(\s+)", full_text)
                for tok in tokens:
                    if tok:
                        yield _emit("token", {"content": tok})
            except Exception:
                yield _emit_error("I'm having trouble processing your request right now.")
                return

            yield _emit("done", {
                "content": full_text,
                "citations": [],
            })
            return

        # ---- Out-of-scope / abuse cap (optional) --------------------------
        # Runs before retrieval so off-catalog and abusive messages never reach
        # the retriever or generator. Fails open (None == do not block).
        scope = resolve_scope_decision(query, previous_questions)
        if scope is not None and scope.action != "allow":
            logger.info("Scope gate declined (%s): %r", scope.action, query[:80])
            if obs_sink is not None:
                obs_sink["mode"] = "out_of_scope"
                obs_sink["fallback"] = True
            yield _emit("done", {
                "content": scope_refusal_message(scope),
                "citations": [],
                "out_of_scope": True,
                "scope_action": scope.action,
            })
            return

        # ---- Venue query: retrieval + streaming generation -----------------
        retrieval_start = _time.perf_counter()

        # Reformulate for retrieval when history exists.
        search_query = reformulate_query(
            query, previous_questions, previous_responses, hf_call=hf_call,
        )
        if search_query != query:
            logger.info(
                "Query reformulated for retrieval: %d→%d chars",
                len(query), len(search_query),
            )

        # Build retrieval context.
        retrieval_context, citations = build_retrieval_context(
            search_query, search_helper=search_helper, location_filter=location_filter,
        )
        candidates = len(citations)
        retrieval_elapsed = _time.perf_counter() - retrieval_start
        logger.info(
            "Retrieval complete in %.0fms, %d candidates",
            retrieval_elapsed * 1000, candidates,
        )

        # ---- Calibrated abstention (optional) -----------------------------
        # Decide whether the retrieved candidates can actually answer the
        # query before spending a generation call on them.
        assessment = resolve_answerability(search_query, citations)
        if assessment is not None and assessment.should_abstain:
            logger.info("Jev abstention (streaming): %s", assessment.as_dict())
            if obs_sink is not None:
                obs_sink["mode"] = "abstention"
                obs_sink["candidates"] = len(citations)
            yield _emit("done", {
                "content": ABSTENTION_MESSAGE,
                "citations": [],
                "abstained": True,
            })
            return

        # Build chat messages with ORIGINAL query in user prompt.
        messages, _ = build_chat_messages(
            query=query,
            previous_questions=previous_questions,
            previous_responses=previous_responses,
            retrieval_context=retrieval_context,
            search_helper=None,
            busyness_context=busyness_context,
            location_filter=location_filter,
        )

        # Stream tokens from HF.
        full_text = ""
        gen_start = _time.perf_counter()
        try:
            for token in _stream_hf_response(messages, max_tokens=400, timeout=90):
                full_text += token
                yield _emit("token", {"content": token})
        except Exception as exc:
            generation_elapsed = _time.perf_counter() - gen_start
            logger.error("Streaming generation failed: %s", exc)
            if citations:
                # Citation-backed fallback.
                fallback_text = build_retrieval_fallback_response(
                    retrieval_context, citations,
                )
                fallback_text = append_location_corrections(
                    fallback_text, citations, location_filter,
                )
                fallback_text = prepend_missing_bowling_notice(
                    fallback_text, query, citations,
                    requested_categories=_analysis_categories(analysis),
                )
                yield _emit("done", {
                    "content": fallback_text,
                    "citations": citations,
                })
            else:
                yield _emit_error("I'm having trouble processing your request right now.")
            return

        generation_elapsed = _time.perf_counter() - gen_start
        logger.info(
            "Generation complete in %.0fms, %d chars",
            generation_elapsed * 1000, len(full_text),
        )

        # ---- Faithfulness guardrail (optional) --------------------------
        # The frontend replaces the streamed text with done.content, so a
        # replacement or caveat can be applied to the final content.
        verification = resolve_answer_verification(
            full_text, retrieval_context, citations,
        )
        guardrail_action = verification.action if verification is not None else None
        if guardrail_action == "replace":
            logger.warning(
                "Jev guardrail (replace): %s",
                verification.as_dict(),
            )
            if obs_sink is not None:
                obs_sink["fallback"] = True
            fallback_text = build_retrieval_fallback_response(
                retrieval_context, citations, intro=GROUNDED_FALLBACK_INTRO,
            )
            fallback_text = append_location_corrections(
                fallback_text, citations, location_filter,
            )
            fallback_text = prepend_missing_bowling_notice(
                fallback_text, query, citations,
                requested_categories=_analysis_categories(analysis),
            )
            yield _emit("done", {
                "content": fallback_text,
                "citations": citations,
                "verified": False,
                "guardrail_action": "replace",
            })
            return
        if guardrail_action == "caveat":
            logger.info("Jev guardrail (caveat): %s", verification.as_dict())

        # Post-processing: apply corrections, notices, and citations.
        processed = full_text
        if guardrail_action == "caveat":
            processed = f"{processed}\n\n{UNVERIFIED_CAVEAT}"
        processed = append_location_corrections(processed, citations, location_filter)
        processed = prepend_missing_bowling_notice(
            processed, query, citations,
            requested_categories=_analysis_categories(analysis),
        )
        processed = parse_inline_citations(processed, citations)

        yield _emit("done", {
            "content": processed,
            "citations": citations,
            "verified": None if verification is None else verification.grounded,
            "guardrail_action": guardrail_action,
        })

    except Exception as exc:
        logger.error("Error in stream_chat_response: %s", exc)
        yield _emit_error("An unexpected error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Inline citation parsing (S05)
# ---------------------------------------------------------------------------

_INLINE_CITATION_RE = __import__("re").compile(r"(?<=[a-zA-Z])[ \t]?\[([1-9]\d?)\](?=\s|[.,!?;:]|$)")


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


def _zone_matches_location_filter(zone, location_filter):
    """Return whether a venue zone satisfies a natural location filter."""
    if not location_filter:
        return True
    normalized_zone = str(zone or "").strip().lower()
    normalized_filter = str(location_filter or "").strip().lower()
    if not normalized_zone or not normalized_filter:
        return True
    return normalized_zone == normalized_filter or normalized_filter in normalized_zone


def append_location_corrections(response_text, citations, location_filter):
    """Append a correction when cited venue zones contradict the requested area."""
    if not response_text or not citations or not location_filter:
        return response_text

    cited_numbers = [
        int(number)
        for number in _INLINE_CITATION_RE.findall(response_text)
        if 1 <= int(number) <= len(citations)
    ]
    if not cited_numbers:
        return response_text

    corrections = []
    seen = set()
    for number in cited_numbers:
        if number in seen:
            continue
        seen.add(number)
        citation = citations[number - 1]
        zone = citation.get("zone")
        if _zone_matches_location_filter(zone, location_filter):
            continue
        name = citation.get("name") or f"venue [{number}]"
        corrections.append(
            f"{name} [{number}] is in {zone}, not {location_filter}."
        )

    if not corrections:
        return response_text

    prefix = "One location correction: " if len(corrections) == 1 else "Location corrections: "
    return f"{response_text}\n\n{prefix}{' '.join(corrections)}"


# ---------------------------------------------------------------------------
# Activity category detection — generalised from the original bowling-only
# implementation.  When the user asks for an activity that has no matching
# venue in the retrieval results, a notice is prepended so the user knows
# the category was not found rather than guessing the AI ignored it.
# ---------------------------------------------------------------------------

_ACTIVITY_PATTERNS: dict[str, re.Pattern] = {
    "bowling":     re.compile(r"\bbowling\b|\bbowl\b|\bbowling alley\b"),
    "comedy":      re.compile(r"\bcomedy\b|\bcomedian\b|\bstand[- ]?up\b|\bcomic\b"),
    "jazz":        re.compile(r"\bjazz\b"),
    "dance":       re.compile(r"\bdanc(e|ing)\b|\bdj\b"),
    "rooftop":     re.compile(r"\brooftop\b"),
    "wine":        re.compile(r"\bwine\b"),
    "cocktail":    re.compile(r"\bcocktail\b|\bmixology\b"),
    "speakeasy":   re.compile(r"\bspeakeasy\b|\bspeak[- ]?easy\b"),
    "brunch":      re.compile(r"\bbrunch\b"),
    "karoake":     re.compile(r"\bkaroake\b"),
    "live music":  re.compile(r"\blive music\b|\blive band\b|\bconcert\b"),
    "outdoor":     re.compile(r"\boutdoor\b|\bpatio\b|\bterrace\b"),
    "quiet":       re.compile(r"\bquiet\b|\bcozy\b|\bintimate\b"),
}


def _detect_requested_categories(query):
    """Return the set of activity category names whose patterns match *query*."""
    text = str(query or "").strip().lower()
    if not text:
        return set()
    matched = set()
    for category, pattern in _ACTIVITY_PATTERNS.items():
        if pattern.search(text):
            matched.add(category)
    return matched


def _citation_matches_category(citation, category):
    """Return whether a citation's name, type, description, or tags mention
    *category* (or common synonyms)."""
    searchable = " ".join(
        str(citation.get(field, "") or "")
        for field in ("name", "type", "snippet", "description", "tags")
    ).lower()
    cat_lower = category.lower()
    if cat_lower in searchable:
        return True
    # Known synonyms that imply the category.
    synonyms: dict[str, list[str]] = {
        "bowling": ["bowling alley", "bowl"],
        "comedy": ["comedian", "stand-up", "stand up", "comic", "comedy club"],
        "jazz": ["jazz club", "jazz bar"],
        "dance": ["dancing", "dj", "dance club"],
        "rooftop": ["rooftop bar"],
        "wine": ["wine bar"],
        "cocktail": ["mixology"],
        "speakeasy": ["speak easy"],
        "karoake": ["karoake bar"],
        "live music": ["live band", "concert"],
    }
    for synonym in synonyms.get(cat_lower, []):
        if synonym in searchable:
            return True
    return False


def prepend_missing_category_notice(response_text, query, citations, requested_categories=None):
    """Prepend a notice when activity categories were requested but none of
    the retrieved citations match them.

    When *requested_categories* is provided (the Jev ``QueryAnalysis``
    categories), it is used instead of the regex detector.
    """
    if not response_text or not citations:
        return response_text

    requested = (
        set(requested_categories)
        if requested_categories is not None
        else _detect_requested_categories(query)
    )
    if not requested:
        return response_text

    # Remove categories the user explicitly wants to skip.
    text = str(query or "").strip().lower()
    active_requested = set()
    for cat in requested:
        if re.search(rf"\b(forget|skip|ignore|drop|no|not)\b.{{0,30}}\b{re.escape(cat)}\b", text):
            continue
        active_requested.add(cat)

    if not active_requested:
        return response_text

    # Filter out categories already covered by a citation.
    lowered = response_text.lower()
    missing = []
    for cat in sorted(active_requested):
        # If the LLM already mentioned the category is missing, skip.
        if cat in lowered and (
            "don't have" in lowered
            or "do not have" in lowered
            or "couldn't find" in lowered
            or "could not find" in lowered
            or "no matching" in lowered
        ):
            continue
        if any(_citation_matches_category(citation, cat) for citation in citations):
            continue
        missing.append(cat)

    if not missing:
        return response_text

    notice = (
        "I don't have suggestions for "
        + ", ".join(missing)
        + ", but here are suggestions for the other things:"
    )
    return f"{notice}\n\n{response_text}"


# Backward-compatible aliases for existing callers.
def _query_requests_bowling(query):
    return "bowling" in _detect_requested_categories(query)


def _citation_is_bowling(citation):
    return _citation_matches_category(citation, "bowling")


def prepend_missing_bowling_notice(response_text, query, citations, requested_categories=None):
    return prepend_missing_category_notice(
        response_text, query, citations, requested_categories=requested_categories,
    )


def build_retrieval_fallback_response(retrieval_context, citations, intro=None):
    """Create a readable venue answer when the chat model is unavailable.

    Retrieval has already succeeded at this point, so returning the venue
    matches is more useful than hiding them behind a generic model error.

    *intro* overrides the lead-in sentence — used by the faithfulness
    guardrail, which has a different reason for falling back than a model
    failure.
    """
    if not citations:
        return CHAT_RESPONSE_ERROR_MESSAGE

    outside_requested_area = "outside the requested area" in (retrieval_context or "").lower()
    if intro is not None:
        lines = [intro]
    elif outside_requested_area:
        lines = [
            "I found a few nearby options, but they look a little outside the exact area you asked for:",
        ]
    else:
        lines = [
            "I found a few matching options, but the AI wording service is temporarily unavailable:",
        ]

    for idx, citation in enumerate(citations[:3], start=1):
        name = citation.get("name") or "This venue"
        venue_type = citation.get("type") or "Venue"
        zone = citation.get("zone") or ""
        rating = citation.get("rating")
        address = citation.get("address") or ""

        details = []
        if venue_type:
            details.append(venue_type)
        if zone:
            details.append(zone)
        if rating:
            details.append(f"{rating}/5")
        if address:
            details.append(address)

        suffix = f" — {', '.join(str(part) for part in details)}" if details else ""
        lines.append(f"{name} [{idx}]{suffix}.")

    lines.append("Tap a venue card to see it on the map.")
    return parse_inline_citations("\n\n".join(lines), citations)


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


def reformulate_query(current_query, previous_questions, previous_responses, hf_call=None):
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
    hf_call : callable | None
        Optional injection point for tests.  When ``None``, defaults to
        ``huggingface_chat_api_call``.

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
        call = hf_call or huggingface_chat_api_call
        response = call(
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
    previous_responses=None,
    search_helper=None,
    hf_call=None,
    busyness_context=None,
    location_filter=None,
    query_analysis=_QUERY_ANALYSIS_UNSET,
):
    """Get AI response (compatibility wrapper — returns tuple only)."""
    result = get_ai_response_with_metadata(
        query,
        previous_questions,
        previous_responses=previous_responses,
        search_helper=search_helper,
        hf_call=hf_call,
        busyness_context=busyness_context,
        location_filter=location_filter,
        query_analysis=query_analysis,
    )
    return result.text, result.citations


def get_ai_response_with_metadata(
    query,
    previous_questions,
    previous_responses=None,
    search_helper=None,
    hf_call=None,
    busyness_context=None,
    location_filter=None,
    query_analysis=_QUERY_ANALYSIS_UNSET,
):
    """Get AI response with execution metadata for observability.

    Returns ChatExecutionResult with text, citations, and ChatExecutionMetadata
    containing mode, retrieval/generation timings, candidates, fallback flags,
    and bounded error stage/code.
    """
    import time as _time
    from observability import ChatExecutionResult, ChatExecutionMetadata

    retrieval_elapsed = 0.0
    generation_elapsed = 0.0
    mode = "unknown"
    retrieval_started = False
    candidates = 0
    fallback_triggered = False
    error_stage = None
    error_code = None

    try:
        # ---- Jev query understanding (optional) -------------------------
        # The route layer normally computes this once and passes it down;
        # the sentinel keeps legacy/test callers working.
        analysis = (
            resolve_query_analysis(query, previous_questions)
            if query_analysis is _QUERY_ANALYSIS_UNSET
            else query_analysis
        )
        if analysis is not None and analysis.location and not location_filter:
            location_filter = analysis.location
            logger.info(
                "Jev location filter: %r (confidence=%.2f)",
                location_filter,
                analysis.location_confidence,
            )

        # ---- General chat: skip retrieval for non-venue queries ---------
        if _is_general_chat(query, analysis):
            logger.info(
                "General chat query detected — skipping retrieval: %r", query[:80]
            )
            mode = "general_chat"
            chat_history = _build_chat_history(previous_questions, previous_responses)
            user_content = GENERAL_CHAT_SYSTEM_PROMPT
            if chat_history:
                user_content = f"{chat_history}\n\nUser question: {query}"
            else:
                user_content = f"User question: {query}"

            messages = [
                {"role": "system", "content": GENERAL_CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ]
            call = hf_call or huggingface_chat_api_call
            gen_start = _time.perf_counter()
            try:
                response = call(messages, max_tokens=200, timeout=15)
            except Exception:
                generation_elapsed = _time.perf_counter() - gen_start
                error_stage = "generation"
                error_code = "hf_request_failed"
                logger.error("General chat HF call failed")
                return ChatExecutionResult(
                    CHAT_RESPONSE_ERROR_MESSAGE, [],
                    ChatExecutionMetadata(
                        mode=mode, retrieval_started=False, candidates=0,
                        fallback_triggered=False, retrieval_elapsed_s=0.0,
                        generation_elapsed_s=generation_elapsed,
                        error_stage=error_stage, error_code=error_code,
                    ),
                )
            generation_elapsed = _time.perf_counter() - gen_start
            response_text = response["choices"][0]["message"]["content"]
            return ChatExecutionResult(
                response_text, [],
                ChatExecutionMetadata(
                    mode=mode, retrieval_started=False, candidates=0,
                    fallback_triggered=False, retrieval_elapsed_s=0.0,
                    generation_elapsed_s=generation_elapsed,
                    error_stage=None, error_code=None,
                ),
            )

        # ---- Out-of-scope / abuse cap (optional) ------------------------
        scope = resolve_scope_decision(query, previous_questions)
        if scope is not None and scope.action != "allow":
            logger.info("Scope gate declined (%s): %r", scope.action, query[:80])
            return ChatExecutionResult(
                scope_refusal_message(scope), [],
                ChatExecutionMetadata(
                    mode="out_of_scope", retrieval_started=False, candidates=0,
                    fallback_triggered=False, retrieval_elapsed_s=0.0,
                    generation_elapsed_s=0.0,
                    error_stage=None, error_code=None,
                ),
            )

        # ---- Venue query: retrieval + generation ------------------------
        retrieval_start = _time.perf_counter()
        retrieval_started = True

        # Reformulate for retrieval when history exists
        reformulation_code = None
        search_query = reformulate_query(
            query, previous_questions, previous_responses, hf_call=hf_call,
        )
        if search_query != query:
            logger.info(
                "Query reformulated for retrieval: %d→%d chars",
                len(query), len(search_query),
            )

        # ---- Build retrieval context with reformulated query ------------
        retrieval_context, citations = build_retrieval_context(
            search_query, search_helper=search_helper, location_filter=location_filter,
        )

        # Determine mode and fallback from search result metadata.
        # The search_helper wraps the SearchService; we check degradation
        # from the search result if available, else from context signals.
        if search_helper is not None:
            # The helper returns list only; mode is inferred from context.
            # For now, default to dense; Plan 19-02 Task 2 will wire
            # search_with_metadata through the app helper.
            if location_filter:
                candidates = len(citations)  # rough proxy until app wiring
            else:
                candidates = len(citations)
        else:
            candidates = len(citations)

        # Heuristic mode detection (will be replaced by direct metadata
        # when app.py wires search_with_metadata in Task 2).
        # The actual effective mode is communicated through the app search
        # helper result; here we use a safe default.
        mode = "dense"  # default — overridden by app.py in Task 2

        retrieval_elapsed = _time.perf_counter() - retrieval_start

        # ---- Calibrated abstention (optional) -----------------------------
        assessment = resolve_answerability(search_query, citations)
        if assessment is not None and assessment.should_abstain:
            logger.info("Jev abstention: %s", assessment.as_dict())
            return ChatExecutionResult(
                ABSTENTION_MESSAGE, [],
                ChatExecutionMetadata(
                    mode="abstention", retrieval_started=True, candidates=candidates,
                    fallback_triggered=False, retrieval_elapsed_s=retrieval_elapsed,
                    generation_elapsed_s=0.0,
                    error_stage=None, error_code=None,
                ),
            )

        # ---- Build chat messages with ORIGINAL query in user prompt -----
        messages, _ = build_chat_messages(
            query=query,
            previous_questions=previous_questions,
            previous_responses=previous_responses,
            retrieval_context=retrieval_context,
            search_helper=None,
            busyness_context=busyness_context,
            location_filter=location_filter,
        )
        call = hf_call or huggingface_chat_api_call
        gen_start = _time.perf_counter()
        try:
            response = call(messages)
        except Exception as exc:
            generation_elapsed = _time.perf_counter() - gen_start
            logger.error("Error calling chat model after retrieval: %s", exc)
            if citations:
                # Citation-backed fallback
                fallback_triggered = True
                error_stage = "generation"
                error_code = "hf_request_failed"
                fallback_text = build_retrieval_fallback_response(retrieval_context, citations)
                fallback_text = append_location_corrections(fallback_text, citations, location_filter)
                fallback_text = prepend_missing_bowling_notice(fallback_text, query, citations)
                return ChatExecutionResult(
                    fallback_text, citations,
                    ChatExecutionMetadata(
                        mode=mode, retrieval_started=True, candidates=candidates,
                        fallback_triggered=True, retrieval_elapsed_s=retrieval_elapsed,
                        generation_elapsed_s=generation_elapsed,
                        error_stage=error_stage, error_code=error_code,
                    ),
                )
            else:
                # Generation failure without citations → error
                return ChatExecutionResult(
                    CHAT_RESPONSE_ERROR_MESSAGE, [],
                    ChatExecutionMetadata(
                        mode=mode, retrieval_started=True, candidates=candidates,
                        fallback_triggered=False, retrieval_elapsed_s=retrieval_elapsed,
                        generation_elapsed_s=generation_elapsed,
                        error_stage="generation", error_code="hf_request_failed",
                    ),
                )
        generation_elapsed = _time.perf_counter() - gen_start
        response_text = response["choices"][0]["message"]["content"]

        # ---- Faithfulness guardrail (optional) --------------------------
        verification = resolve_answer_verification(
            response_text, retrieval_context, citations,
        )
        guardrail_action = None
        if verification is not None and verification.action != "pass":
            guardrail_action = verification.action
            logger.warning(
                "Jev guardrail (%s): %s",
                verification.action,
                verification.as_dict(),
            )
            if verification.action == "replace":
                fallback_text = build_retrieval_fallback_response(
                    retrieval_context, citations, intro=GROUNDED_FALLBACK_INTRO,
                )
                fallback_text = append_location_corrections(
                    fallback_text, citations, location_filter,
                )
                fallback_text = prepend_missing_bowling_notice(
                    fallback_text, query, citations,
                    requested_categories=_analysis_categories(analysis),
                )
                return ChatExecutionResult(
                    fallback_text, citations,
                    ChatExecutionMetadata(
                        mode=mode, retrieval_started=True, candidates=candidates,
                        fallback_triggered=True, retrieval_elapsed_s=retrieval_elapsed,
                        generation_elapsed_s=generation_elapsed,
                        error_stage="verification", error_code="ungrounded_answer",
                        guardrail_action="replace",
                    ),
                )
            # Caveat tier: keep the answer, flag unverified details.
            response_text = f"{response_text}\n\n{UNVERIFIED_CAVEAT}"

        response_text = append_location_corrections(response_text, citations, location_filter)
        response_text = prepend_missing_bowling_notice(
            response_text, query, citations,
            requested_categories=_analysis_categories(analysis),
        )
        response_text = parse_inline_citations(response_text, citations)
        return ChatExecutionResult(
            response_text, citations,
            ChatExecutionMetadata(
                mode=mode, retrieval_started=True, candidates=candidates,
                fallback_triggered=False, retrieval_elapsed_s=retrieval_elapsed,
                generation_elapsed_s=generation_elapsed,
                error_stage=None, error_code=None,
                guardrail_action=guardrail_action,
            ),
        )
    except Exception as exc:
        logger.error("Error getting AI response: %s", exc)
        return ChatExecutionResult(
            CHAT_RESPONSE_ERROR_MESSAGE, [],
            ChatExecutionMetadata(
                mode=mode if mode != "unknown" else "unknown",
                retrieval_started=retrieval_started,
                candidates=candidates,
                fallback_triggered=False,
                retrieval_elapsed_s=retrieval_elapsed,
                generation_elapsed_s=generation_elapsed,
                error_stage=error_stage or "response",
                error_code=error_code or "internal_error",
            ),
        )
