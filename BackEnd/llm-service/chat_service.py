"""Hugging Face chat integration and prompt/context assembly."""

import logging
import os

import requests

from config import CHAT_API_URL, DEFAULT_HF_CHAT_MODEL, HF_CHAT_MODEL
from dto import create_citation_dto
from prompt_loader import PromptLoadError, load_prompt_template

logger = logging.getLogger(__name__)

CHAT_UNAVAILABLE_MESSAGE = "Location search is not available at the moment."
CHAT_SEARCH_ERROR_MESSAGE = "I'm having trouble finding similar locations right now."
CHAT_RESPONSE_ERROR_MESSAGE = (
    "I'm having trouble processing your request right now. Please try again later."
)
NO_VENUES_MESSAGE = "no matching venues found"


def format_retrieval_context(results):
    """Format search-result DTOs into a retrieval-context string AND a citations list.

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

    loc_info_parts = []
    citations = []
    for loc in results:
        loc_type = loc.get("type", "")
        loc_info_parts.append(f"- {loc['name']} ({loc['zone']}): {loc_type}")
        citations.append(create_citation_dto(loc))

    context = "Here are some similar locations:\n" + "\n".join(loc_info_parts)
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
            retrieval_context=retrieval_context
        )
    else:
        system_content = (
            "You are a helpful AI assistant for a Manhattan nightlife app. "
            "You have access to information about venues in Manhattan. "
            f"Here's what you know about similar locations:\n{retrieval_context}\n\n"
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
        )
        call = hf_call or huggingface_chat_api_call
        response = call(messages)
        return response["choices"][0]["message"]["content"], citations
    except Exception as exc:
        logger.error("Error getting AI response: %s", exc)
        return CHAT_RESPONSE_ERROR_MESSAGE, []
