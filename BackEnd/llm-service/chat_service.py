"""Hugging Face chat integration and prompt/context assembly."""

import logging
import os

import requests

from config import CHAT_API_URL, DEFAULT_HF_CHAT_MODEL, HF_CHAT_MODEL

logger = logging.getLogger(__name__)

CHAT_UNAVAILABLE_MESSAGE = "Location search is not available at the moment."
CHAT_SEARCH_ERROR_MESSAGE = "I'm having trouble finding similar locations right now."
CHAT_RESPONSE_ERROR_MESSAGE = (
    "I'm having trouble processing your request right now. Please try again later."
)


def format_retrieval_context(results):
    """Format search results into chat retrieval context."""
    if not results:
        return "No similar locations found."

    loc_info_parts = []
    for loc in results:
        loc_type = loc.get("type", "")
        loc_info_parts.append(f"- {loc['name']} ({loc['zone']}): {loc_type}")

    return "Here are some similar locations:\n" + "\n".join(loc_info_parts)


def build_retrieval_context(query, limit=5, search_helper=None):
    """Resolve top-k venue snippets for chat context."""
    if search_helper is None:
        return CHAT_UNAVAILABLE_MESSAGE

    try:
        raw = search_helper(query, limit=limit)
        if isinstance(raw, str):
            return raw
        return format_retrieval_context(raw)
    except Exception as exc:
        logger.error("Error building chat retrieval context: %s", exc)
        return CHAT_SEARCH_ERROR_MESSAGE


def build_chat_messages(
    query,
    previous_questions,
    retrieval_context=None,
    search_helper=None,
):
    """Build Hugging Face chat messages with truncated history and retrieval context."""
    if retrieval_context is None:
        retrieval_context = build_retrieval_context(query, search_helper=search_helper)

    context_parts = []
    if previous_questions:
        context_parts.append("Previous conversation:")
        for question in previous_questions[-3:]:
            context_parts.append(f"- User: {question}")

    context_parts.append(f"Current query: {query}")

    return [
        {
            "role": "system",
            "content": (
                "You are a helpful AI assistant for a Manhattan nightlife app. "
                "You have access to information about venues in Manhattan. "
                f"Here's what you know about similar locations:\n{retrieval_context}\n\n"
                "Provide helpful, concise responses about Manhattan nightlife and venues."
            ),
        },
        {"role": "user", "content": "\n".join(context_parts)},
    ]


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
    """Get AI response using Hugging Face API and optional retrieval context."""
    try:
        messages = build_chat_messages(
            query=query,
            previous_questions=previous_questions,
            search_helper=search_helper,
        )
        call = hf_call or huggingface_chat_api_call
        response = call(messages)
        return response["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.error("Error getting AI response: %s", exc)
        return CHAT_RESPONSE_ERROR_MESSAGE
