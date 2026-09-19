"""TypeSafe System One / Jev integration for the LLM service.

Jev turns unstructured state into *typed, calibrated decisions* (Choice,
Score, Noul). This module is the single boundary between the concierge and
the TypeSafe API; everything above it consumes plain dataclasses so the rest
of the pipeline stays testable without network access.

Design rules (mirrors the existing ``hf_call`` injection pattern):

* **Never raise into the chat path.** Every entry point returns ``None`` on
  any failure so callers fall back to the existing regex/LLM behaviour.
* **Disabled by default.** Guarded by ``JEV_ENABLED`` plus a configured
  ``TYPESAFE_API_KEY``. ``QUERY_REWRITE_ENABLED`` is the closest precedent.
* **Confidence-gated.** A typed answer below ``JEV_CONFIDENCE_THRESHOLD`` is
  reported but not acted on. See https://docs.typesafe.ai/confidence.

API reference: https://docs.typesafe.ai/api
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping, Sequence

import requests

logger = logging.getLogger(__name__)

DEFAULT_API_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"

# TypeSafe returns these retryable status codes; back off per the docs.
_RETRYABLE_STATUS = {429, 529}


class JevError(Exception):
    """Raised internally when a Jev call cannot be completed."""


# ---------------------------------------------------------------------------
# Question builders (the three System One primitives)
# ---------------------------------------------------------------------------


def noul(instructions: str, criteria: Mapping[str, str] | None = None) -> dict:
    """A yes/no question. Answer is a probability in [0, 1]."""
    question: dict[str, Any] = {"type": "noul", "instructions": instructions}
    if criteria:
        question["criteria"] = dict(criteria)
    return question


def choice(instructions: str, criteria: Mapping[str, str | None]) -> dict:
    """A single-choice question over a caller-defined option set."""
    return {"type": "choice", "instructions": instructions, "criteria": dict(criteria)}


def score(instructions: str, criteria: Sequence[str]) -> dict:
    """An ordered-rubric question returning a probability-weighted level."""
    return {"type": "score", "instructions": instructions, "criteria": list(criteria)}


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class JevClient:
    """Thin HTTP client for ``POST /v1/systemone`` with retry/backoff.

    Parameters
    ----------
    api_key : str | None
        TypeSafe API key. Falls back to ``TYPESAFE_API_KEY``.
    api_url : str | None
        Override the endpoint (tests, self-hosted proxies).
    model : str | None
        Model alias, e.g. ``jev-latest``.
    timeout : int | None
        Per-request timeout in seconds.
    max_retries : int | None
        Number of retries for 429/529 and transient network errors.
    transport : callable | None
        Injection point mirroring ``hf_call``: ``(url, headers, json, timeout)
        -> response-like``. When ``None``, ``requests.post`` is used.
    """

    def __init__(
        self,
        api_key: str | None = None,
        api_url: str | None = None,
        model: str | None = None,
        timeout: int | None = None,
        max_retries: int | None = None,
        transport: Callable[..., Any] | None = None,
    ):
        self.api_key = api_key if api_key is not None else os.getenv("TYPESAFE_API_KEY", "")
        self.api_url = (api_url or os.getenv("TYPESAFE_API_URL") or DEFAULT_API_URL).rstrip("/")
        self.model = model or os.getenv("JEV_MODEL") or DEFAULT_MODEL
        self.timeout = int(timeout if timeout is not None else os.getenv("JEV_TIMEOUT_SECONDS", 8))
        self.max_retries = int(
            max_retries if max_retries is not None else os.getenv("JEV_MAX_RETRIES", 2)
        )
        self._transport = transport or requests.post

    @property
    def available(self) -> bool:
        """True when a key is configured and the client can be used."""
        return bool(self.api_key) and not self.api_key.startswith("your-")

    def system_one(
        self,
        state: Any,
        questions: Mapping[str, dict],
        *,
        model: str | None = None,
    ) -> dict:
        """Evaluate *state* against *questions* and return the ``answers`` map.

        Raises
        ------
        JevError
            On missing key, exhausted retries, or a malformed response.
        """
        if not self.available:
            raise JevError("TYPESAFE_API_KEY is not configured")

        if not questions:
            raise JevError("at least one question is required")

        payload = {
            "state": state,
            "model": model or self.model,
            "questions": dict(questions),
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self._transport(
                    self.api_url, headers=headers, json=payload, timeout=self.timeout
                )
            except Exception as exc:  # network/timeout — retry
                last_error = exc
            else:
                status = getattr(response, "status_code", None)
                if status in _RETRYABLE_STATUS:
                    last_error = JevError(f"TypeSafe returned retryable status {status}")
                elif status is not None and status >= 400:
                    body = getattr(response, "text", "")
                    raise JevError(f"TypeSafe error {status}: {body[:200]}")
                else:
                    data = response.json()
                    answers = data.get("answers")
                    if not isinstance(answers, dict):
                        raise JevError("TypeSafe response missing 'answers' map")
                    return answers

            if attempt < self.max_retries:
                backoff = 0.25 * (2 ** attempt)
                logger.debug(
                    "jev_service: retry %d/%d in %.2fs (%s)",
                    attempt + 1,
                    self.max_retries,
                    backoff,
                    last_error,
                )
                time.sleep(backoff)

        raise JevError(f"TypeSafe call failed after {self.max_retries + 1} attempts: {last_error}")


# ---------------------------------------------------------------------------
# Query-understanding decision
# ---------------------------------------------------------------------------

# Categories are asked as one Noul per category so the model can express
# independent, parallel judgements. Keep this bounded to the activity
# vocabulary the corpus actually tags.
_DEFAULT_CATEGORIES: tuple[str, ...] = (
    "bowling",
    "comedy",
    "jazz",
    "dance",
    "rooftop",
    "wine",
    "cocktail",
    "speakeasy",
    "karaoke",
    "live music",
    "outdoor",
    "quiet",
)

_PRICE_TIERS: Mapping[str, str | None] = {
    "unspecified": "No price preference stated",
    "budget": "Cheap, affordable, or budget-friendly",
    "moderate": "Mid-range, reasonable prices",
    "upscale": "Upscale, luxury, or expensive",
}


@dataclass(frozen=True)
class QueryAnalysis:
    """Typed, calibrated reading of a user query.

    All fields are safe defaults when the corresponding question was not
    asked or its confidence fell below threshold.
    """

    is_general_chat: bool = False
    general_chat_probability: float = 0.0
    location: str | None = None
    location_confidence: float = 0.0
    location_probabilities: Mapping[str, float] = field(default_factory=dict)
    price_tier: str | None = None
    price_tier_confidence: float = 0.0
    categories: tuple[str, ...] = ()
    category_probabilities: Mapping[str, float] = field(default_factory=dict)
    confidences: Mapping[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict:
        """JSON-serialisable view for structured logs / observability."""
        return {
            "is_general_chat": self.is_general_chat,
            "general_chat_probability": round(self.general_chat_probability, 4),
            "location": self.location,
            "location_confidence": round(self.location_confidence, 4),
            "price_tier": self.price_tier,
            "price_tier_confidence": round(self.price_tier_confidence, 4),
            "categories": list(self.categories),
            "confidences": {k: round(v, 4) for k, v in self.confidences.items()},
        }


def build_query_questions(
    zones: Iterable[str] | None = None,
    categories: Iterable[str] | None = None,
) -> dict[str, dict]:
    """Build the System One question map for the query-understanding decision.

    Kept public so it can be shared with the Playground/eval harness.
    """
    questions: dict[str, dict] = {
        "is_general_chat": noul(
            "Is this message a greeting, small talk, or a meta question about "
            "the assistant or app itself (for example 'how do you work?', "
            "'what can you do?'), rather than a request to find venues?",
            criteria={
                "true": "Greeting, small talk, or meta/capability question",
                "false": "A request to find, compare, or ask about venues",
            },
        ),
        "price_tier": choice(
            "What price preference, if any, does the user express?",
            _PRICE_TIERS,
        ),
    }

    if zones:
        # 'none' is the explicit no-signal option; concrete zones carry no
        # extra rubric text (criteria values may be null).
        zone_criteria: dict[str, str | None] = {
            "none": "No Manhattan neighborhood is named or clearly implied",
        }
        for zone in sorted({str(z).strip().lower() for z in zones if str(z).strip()}):
            zone_criteria[zone] = None
        questions["location"] = choice(
            "Which Manhattan neighborhood does the user name or clearly imply? "
            "Answer 'none' if no neighborhood is specified.",
            zone_criteria,
        )

    for category in categories or ():
        questions[f"category:{category}"] = noul(
            f"Does the user ask for or clearly imply '{category}' as a venue "
            "activity or category?"
        )

    return questions


def _probabilities_for(answer: Mapping[str, Any]) -> Mapping[str, float]:
    raw = answer.get("probabilities")
    if not isinstance(raw, Mapping):
        return {}
    probs: dict[str, float] = {}
    for key, value in raw.items():
        try:
            probs[str(key)] = float(value)
        except (TypeError, ValueError):
            continue
    return probs


def _answer_confidence(answer: Mapping[str, Any]) -> float:
    try:
        return float(answer.get("confidence", 0.0) or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _parse_analysis(
    answers: Mapping[str, Any],
    confidence_threshold: float,
) -> QueryAnalysis:
    """Fold a raw ``answers`` map into a :class:`QueryAnalysis`."""
    confidences: dict[str, float] = {}

    # --- is_general_chat (Noul) ---
    general_prob = 0.0
    general_answer = answers.get("is_general_chat")
    if isinstance(general_answer, Mapping):
        try:
            general_prob = float(general_answer.get("noul", 0.0) or 0.0)
        except (TypeError, ValueError):
            general_prob = 0.0
    is_general_chat = general_prob >= confidence_threshold

    # --- location (Choice) ---
    location: str | None = None
    location_confidence = 0.0
    location_probabilities: Mapping[str, float] = {}
    location_answer = answers.get("location")
    if isinstance(location_answer, Mapping):
        location_confidence = _answer_confidence(location_answer)
        location_probabilities = _probabilities_for(location_answer)
        chosen = location_answer.get("choice")
        if (
            chosen
            and str(chosen) != "none"
            and location_confidence >= confidence_threshold
        ):
            location = str(chosen)
        confidences["location"] = location_confidence

    # --- price_tier (Choice) ---
    price_tier: str | None = None
    price_confidence = 0.0
    price_answer = answers.get("price_tier")
    if isinstance(price_answer, Mapping):
        price_confidence = _answer_confidence(price_answer)
        chosen = price_answer.get("choice")
        if (
            chosen
            and str(chosen) != "unspecified"
            and price_confidence >= confidence_threshold
        ):
            price_tier = str(chosen)
        confidences["price_tier"] = price_confidence

    # --- categories (one Noul each) ---
    category_probabilities: dict[str, float] = {}
    for key, value in answers.items():
        if not key.startswith("category:") or not isinstance(value, Mapping):
            continue
        name = key.split(":", 1)[1]
        try:
            prob = float(value.get("noul", 0.0) or 0.0)
        except (TypeError, ValueError):
            continue
        category_probabilities[name] = prob
    categories = tuple(
        name
        for name, prob in sorted(
            category_probabilities.items(), key=lambda item: item[1], reverse=True
        )
        if prob >= confidence_threshold
    )
    confidences["categories"] = (
        max(category_probabilities.values()) if category_probabilities else 0.0
    )

    return QueryAnalysis(
        is_general_chat=is_general_chat,
        general_chat_probability=general_prob,
        location=location,
        location_confidence=location_confidence,
        location_probabilities=location_probabilities,
        price_tier=price_tier,
        price_tier_confidence=price_confidence,
        categories=categories,
        category_probabilities=category_probabilities,
        confidences=confidences,
    )


# ---------------------------------------------------------------------------
# Metrics (lazy; never fatal)
# ---------------------------------------------------------------------------


def _record_metric(status: str, duration_s: float, decision: str = "query_analysis") -> None:
    try:
        from observability import JEV_LATENCY_SECONDS, JEV_REQUESTS_TOTAL
    except Exception:
        return
    try:
        JEV_REQUESTS_TOTAL.labels(decision=decision, status=status).inc()
        JEV_LATENCY_SECONDS.labels(decision=decision).observe(max(duration_s, 0.0))
    except Exception:
        pass


@dataclass(frozen=True)
class AnswerVerification:
    """Typed, calibrated judgement of whether an answer is grounded."""

    grounded: bool = True
    faithful_probability: float = 1.0
    fabricated_venue_probability: float = 0.0
    unsupported_detail_probability: float = 0.0
    confidences: Mapping[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "grounded": self.grounded,
            "faithful_probability": round(self.faithful_probability, 4),
            "fabricated_venue_probability": round(self.fabricated_venue_probability, 4),
            "unsupported_detail_probability": round(
                self.unsupported_detail_probability, 4
            ),
        }


def build_verification_questions() -> dict[str, dict]:
    """System One questions for the runtime faithfulness guardrail."""
    return {
        "faithful": noul(
            "Is every factual claim in `answer` supported by `context`? "
            "Treat the `[N]` citation markers and any crowd/busyness "
            "statements as non-factual. Answer true only if no venue name, "
            "zone, type, price, rating, or feature is asserted without "
            "support in `context`.",
            criteria={
                "true": "Every factual claim is supported by the context",
                "false": "At least one factual claim is unsupported or invented",
            },
        ),
        "fabricated_venue": noul(
            "Does `answer` name any specific venue that does NOT appear in "
            "`context`?",
            criteria={
                "true": "The answer mentions a venue absent from the context",
                "false": "Every venue named is present in the context",
            },
        ),
        "unsupported_detail": noul(
            "Does `answer` state a rating, price, address, or distinguishing "
            "feature for a venue that is NOT present in `context`?",
            criteria={
                "true": "The answer asserts a detail the context does not contain",
                "false": "All stated venue details appear in the context",
            },
        ),
    }


def _noul_probability(answer: Mapping[str, Any]) -> float:
    try:
        return float(answer.get("noul", 0.0) or 0.0)
    except (TypeError, ValueError):
        return 0.0


def verify_answer(
    answer: str,
    context: str,
    *,
    venue_names: Iterable[str] | None = None,
    client: JevClient | None = None,
    confidence_threshold: float | None = None,
    enabled: bool | None = None,
) -> AnswerVerification | None:
    """Check whether *answer* is grounded in *context*.

    Returns ``None`` whenever the guardrail is disabled or Jev cannot be
    reached, so callers keep the generated answer. Callers must treat
    ``None`` as "not verified" rather than "verified good".
    """
    from config import (
        JEV_CONFIDENCE_THRESHOLD,
        JEV_ENABLED,
        JEV_GUARDRAIL_ENABLED,
        JEV_TIMEOUT_SECONDS,
    )

    is_enabled = JEV_ENABLED if enabled is None else enabled
    if not (is_enabled and JEV_GUARDRAIL_ENABLED):
        _record_metric("disabled", 0.0, decision="answer_verification")
        return None

    if not answer or not answer.strip() or not context:
        return None

    active_client = client or JevClient(timeout=JEV_TIMEOUT_SECONDS)
    if not active_client.available:
        _record_metric("disabled", 0.0, decision="answer_verification")
        return None

    threshold = (
        JEV_CONFIDENCE_THRESHOLD if confidence_threshold is None else confidence_threshold
    )

    state: dict[str, Any] = {"answer": answer, "context": context}
    if venue_names:
        state["known_venue_names"] = [str(name) for name in venue_names]

    t0 = time.perf_counter()
    try:
        answers = active_client.system_one(state, build_verification_questions())
    except JevError as exc:
        elapsed = time.perf_counter() - t0
        status = "timeout" if "timeout" in str(exc).lower() else "error"
        logger.warning("jev_service: answer verification unavailable (%s): %s", status, exc)
        _record_metric(status, elapsed, decision="answer_verification")
        return None
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        logger.warning("jev_service: unexpected verification failure: %s", exc)
        _record_metric("error", elapsed, decision="answer_verification")
        return None

    elapsed = time.perf_counter() - t0

    faithful = _noul_probability(answers.get("faithful", {}) or {})
    fabricated = _noul_probability(answers.get("fabricated_venue", {}) or {})
    unsupported = _noul_probability(answers.get("unsupported_detail", {}) or {})

    # Grounded requires a confident positive on `faithful` and confident
    # negatives on both failure-detection questions.
    negative_threshold = max(0.5, threshold)
    grounded = (
        faithful >= threshold
        and fabricated < negative_threshold
        and unsupported < negative_threshold
    )

    verification = AnswerVerification(
        grounded=grounded,
        faithful_probability=faithful,
        fabricated_venue_probability=fabricated,
        unsupported_detail_probability=unsupported,
        confidences={
            "faithful": faithful,
            "fabricated_venue": fabricated,
            "unsupported_detail": unsupported,
        },
    )
    logger.info(
        "jev_service: answer verification in %.0fms %s",
        elapsed * 1000,
        verification.as_dict(),
    )
    _record_metric("success", elapsed, decision="answer_verification")
    return verification


# ---------------------------------------------------------------------------
# Jev-backed evaluation judge (drop-in for eval_service's HF judge)
# ---------------------------------------------------------------------------

# Five ordered levels per dimension, ascending quality, matching the semantics
# of prompts/judge-v1.yaml so the Jev judge is comparable to the HF judge.
JUDGE_LEVELS: dict[str, list[str]] = {
    "faithfulness": [
        "Mostly fabricated: claims contradict the context or invent venues",
        "Several unsupported or contradicted claims",
        "About half the claims are supported; some unsupported details",
        "Nearly all claims supported; at most one minor unsupported detail",
        "Every factual claim is grounded in the context",
    ],
    "answer_relevancy": [
        "Completely irrelevant to the question",
        "Tangentially related but mostly off-topic",
        "Partially answers the question but misses key aspects",
        "Mostly on-topic; misses at most one minor aspect",
        "Fully and directly answers every aspect of the question",
    ],
    "context_precision": [
        "None of the retrieved context is relevant to the question",
        "Only one or two context items are relevant; most are noise",
        "About half the retrieved context is relevant",
        "Most context is relevant; one item is marginally related",
        "Every retrieved context item is highly relevant",
    ],
}

_JUDGE_DIMENSIONS = ("faithfulness", "answer_relevancy", "context_precision")


def build_judge_questions() -> dict[str, dict]:
    """System One Score questions mirroring prompts/judge-v1.yaml."""
    return {
        "faithfulness": score(
            "Score how well every factual claim in `answer` is supported by "
            "`context`. Treat `[N]` citation markers and crowd/busyness "
            "statements as non-factual.",
            JUDGE_LEVELS["faithfulness"],
        ),
        "answer_relevancy": score(
            "Score how directly and completely `answer` addresses `question`.",
            JUDGE_LEVELS["answer_relevancy"],
        ),
        "context_precision": score(
            "Score how relevant the retrieved `context` is to `question`.",
            JUDGE_LEVELS["context_precision"],
        ),
    }


def _score_to_unit(answer: Mapping[str, Any]) -> float:
    """Map a Score answer to 0–1 using the level count from its legend."""
    try:
        raw = float(answer.get("score", 0.0) or 0.0)
    except (TypeError, ValueError):
        return 0.0
    legend = answer.get("legend")
    levels = len(legend) if isinstance(legend, Mapping) and len(legend) >= 2 else 5
    unit = raw / (levels - 1)
    return round(max(0.0, min(1.0, unit)), 4)


def _score_reasoning(answer: Mapping[str, Any]) -> str:
    """Build a short reasoning string from the dominant level + confidence."""
    legend = answer.get("legend") if isinstance(answer.get("legend"), Mapping) else {}
    probabilities = _probabilities_for(answer)
    if probabilities:
        level = max(probabilities, key=lambda key: probabilities[key])
    else:
        try:
            level = str(round(float(answer.get("score", 0.0) or 0.0)))
        except (TypeError, ValueError):
            level = ""
    description = legend.get(level) or legend.get(str(level)) or "n/a"
    confidence = _answer_confidence(answer)
    return f"Jev level '{description}' (confidence={confidence:.2f})"


def judge_answer(
    question: str,
    answer: str,
    context: str,
    *,
    client: JevClient | None = None,
    enabled: bool | None = None,
) -> dict[str, Any] | None:
    """Score a RAG answer with Jev, mirroring ``eval_service._call_judge``.

    Returns a dict with ``faithfulness``, ``answer_relevancy``,
    ``context_precision`` (all 0–1) and matching ``*_reasoning`` strings, or
    ``None`` when Jev is unavailable — callers treat ``None`` as "judge
    failed", exactly like the HF judge's all-zero sentinel.
    """
    from config import JEV_ENABLED, JEV_TIMEOUT_SECONDS

    is_enabled = JEV_ENABLED if enabled is None else enabled
    if not is_enabled:
        _record_metric("disabled", 0.0, decision="eval_judge")
        return None
    if not answer or not answer.strip():
        return None

    active_client = client or JevClient(timeout=JEV_TIMEOUT_SECONDS)
    if not active_client.available:
        _record_metric("disabled", 0.0, decision="eval_judge")
        return None

    state = {"question": question, "answer": answer, "context": context}

    t0 = time.perf_counter()
    try:
        answers = active_client.system_one(state, build_judge_questions())
    except JevError as exc:
        elapsed = time.perf_counter() - t0
        status = "timeout" if "timeout" in str(exc).lower() else "error"
        logger.warning("jev_service: judge unavailable (%s): %s", status, exc)
        _record_metric(status, elapsed, decision="eval_judge")
        return None
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        logger.warning("jev_service: unexpected judge failure: %s", exc)
        _record_metric("error", elapsed, decision="eval_judge")
        return None

    elapsed = time.perf_counter() - t0

    result: dict[str, Any] = {}
    for dimension in _JUDGE_DIMENSIONS:
        raw_answer = answers.get(dimension)
        if not isinstance(raw_answer, Mapping):
            logger.warning("jev_service: judge missing dimension %r", dimension)
            _record_metric("error", elapsed, decision="eval_judge")
            return None
        result[dimension] = _score_to_unit(raw_answer)
        result[f"{dimension}_reasoning"] = _score_reasoning(raw_answer)

    logger.debug(
        "jev_service: judge in %.0fms faith=%.2f relev=%.2f prec=%.2f",
        elapsed * 1000,
        result["faithfulness"],
        result["answer_relevancy"],
        result["context_precision"],
    )
    _record_metric("success", elapsed, decision="eval_judge")
    return result


# ---------------------------------------------------------------------------
# Calibrated abstention (answerability)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AnswerabilityAssessment:
    """Typed, calibrated decision on whether retrieval can answer the query."""

    answerable: bool = True
    answerable_probability: float = 1.0
    out_of_scope_probability: float = 0.0
    should_abstain: bool = False

    def as_dict(self) -> dict:
        return {
            "answerable": self.answerable,
            "answerable_probability": round(self.answerable_probability, 4),
            "out_of_scope_probability": round(self.out_of_scope_probability, 4),
            "should_abstain": self.should_abstain,
        }


def build_answerability_questions() -> dict[str, dict]:
    """System One questions for the calibrated-abstention decision."""
    return {
        "answerable": noul(
            "Can the candidate venues in `candidates` plausibly satisfy "
            "`query` in terms of venue type, vibe, and location? Answer "
            "false when the request targets a different city or borough, a "
            "non-venue service this app does not cover, or event listings "
            "rather than a specific venue.",
            criteria={
                "true": "A candidate plausibly fits the request",
                "false": "No candidate fits or the request is out of scope",
            },
        ),
        "out_of_scope": noul(
            "Is `query` outside this app's catalog of Manhattan venues? The "
            "catalog covers bars, clubs, lounges, restaurants, cafes, "
            "museums, and art galleries in Manhattan. Answer true only for a "
            "different city or borough, or a non-venue service the catalog "
            "does not cover (plumbers, dentists, gyms, hotels, schools, "
            "coworking, salons, pharmacies, car repair).",
            criteria={
                "true": "Outside the Manhattan venue catalog",
                "false": "Within the Manhattan venue catalog",
            },
        ),
    }


def assess_answerability(
    query: str,
    candidates: Iterable[Mapping[str, Any]] | None,
    *,
    client: JevClient | None = None,
    threshold: float | None = None,
    enabled: bool | None = None,
) -> AnswerabilityAssessment | None:
    """Decide whether retrieved *candidates* can answer *query*.

    Returns ``None`` when abstention gating is disabled or Jev is unavailable,
    so callers keep their existing behaviour. ``should_abstain`` is true when
    the request is out of scope or answerability is below *threshold* — a
    calibrated decision, not a raw similarity cutoff.
    """
    from config import (
        JEV_ABSTENTION_ENABLED,
        JEV_ABSTENTION_THRESHOLD,
        JEV_ENABLED,
        JEV_TIMEOUT_SECONDS,
    )

    is_enabled = JEV_ENABLED if enabled is None else enabled
    if not (is_enabled and JEV_ABSTENTION_ENABLED):
        _record_metric("disabled", 0.0, decision="answerability")
        return None

    if not query or not query.strip():
        return None

    active_client = client or JevClient(timeout=JEV_TIMEOUT_SECONDS)
    if not active_client.available:
        _record_metric("disabled", 0.0, decision="answerability")
        return None

    gate = JEV_ABSTENTION_THRESHOLD if threshold is None else threshold

    # Compact candidate list keeps the state small and the decision focused.
    compact: list[dict[str, Any]] = []
    for candidate in candidates or ():
        if not isinstance(candidate, Mapping):
            continue
        compact.append({
            "name": candidate.get("name"),
            "type": candidate.get("type"),
            "zone": candidate.get("zone"),
        })
    if not compact:
        return None

    state = {"query": query, "candidates": compact}

    t0 = time.perf_counter()
    try:
        answers = active_client.system_one(state, build_answerability_questions())
    except JevError as exc:
        elapsed = time.perf_counter() - t0
        status = "timeout" if "timeout" in str(exc).lower() else "error"
        logger.warning("jev_service: answerability unavailable (%s): %s", status, exc)
        _record_metric(status, elapsed, decision="answerability")
        return None
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        logger.warning("jev_service: unexpected answerability failure: %s", exc)
        _record_metric("error", elapsed, decision="answerability")
        return None

    elapsed = time.perf_counter() - t0

    answerable_prob = _noul_probability(answers.get("answerable", {}) or {})
    out_of_scope_prob = _noul_probability(answers.get("out_of_scope", {}) or {})

    answerable = answerable_prob >= gate
    should_abstain = out_of_scope_prob >= gate or answerable_prob < gate

    assessment = AnswerabilityAssessment(
        answerable=answerable,
        answerable_probability=answerable_prob,
        out_of_scope_probability=out_of_scope_prob,
        should_abstain=should_abstain,
    )
    logger.info(
        "jev_service: answerability in %.0fms %s",
        elapsed * 1000,
        assessment.as_dict(),
    )
    _record_metric("success", elapsed, decision="answerability")
    return assessment


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def analyze_query(
    query: str,
    *,
    zones: Iterable[str] | None = None,
    categories: Iterable[str] | None = None,
    previous_questions: Sequence[str] | None = None,
    client: JevClient | None = None,
    confidence_threshold: float | None = None,
    enabled: bool | None = None,
) -> QueryAnalysis | None:
    """Read a user query into typed, calibrated signals via Jev.

    Returns ``None`` whenever Jev is disabled, misconfigured, times out, or
    returns a malformed response. Callers must treat ``None`` as "no Jev
    signal" and fall back to their existing behaviour.
    """
    from config import (
        JEV_CONFIDENCE_THRESHOLD,
        JEV_ENABLED,
        JEV_TIMEOUT_SECONDS,
    )

    is_enabled = JEV_ENABLED if enabled is None else enabled
    if not is_enabled:
        _record_metric("disabled", 0.0)
        return None

    if not query or not query.strip():
        return None

    active_client = client or JevClient(timeout=JEV_TIMEOUT_SECONDS)
    if not active_client.available:
        logger.debug("jev_service: no API key configured — skipping query analysis")
        _record_metric("disabled", 0.0)
        return None

    threshold = (
        JEV_CONFIDENCE_THRESHOLD if confidence_threshold is None else confidence_threshold
    )

    # Present conversation context as part of the state so follow-up
    # questions can be classified in context.
    state: Any = query
    if previous_questions:
        history = [str(q) for q in previous_questions if q][-3:]
        if history:
            state = {
                "current_message": query,
                "previous_questions": history,
            }

    questions = build_query_questions(
        zones=zones,
        categories=categories if categories is not None else _DEFAULT_CATEGORIES,
    )

    t0 = time.perf_counter()
    try:
        answers = active_client.system_one(state, questions)
    except JevError as exc:
        elapsed = time.perf_counter() - t0
        status = "timeout" if "timeout" in str(exc).lower() else "error"
        logger.warning("jev_service: query analysis unavailable (%s): %s", status, exc)
        _record_metric(status, elapsed)
        return None
    except Exception as exc:  # defensive: never leak into the chat path
        elapsed = time.perf_counter() - t0
        logger.warning("jev_service: unexpected query analysis failure: %s", exc)
        _record_metric("error", elapsed)
        return None

    elapsed = time.perf_counter() - t0
    try:
        analysis = _parse_analysis(answers, threshold)
    except Exception as exc:
        logger.warning("jev_service: could not parse answers: %s", exc)
        _record_metric("error", elapsed)
        return None

    logger.info(
        "jev_service: query analysis in %.0fms %s",
        elapsed * 1000,
        analysis.as_dict(),
    )
    _record_metric("success", elapsed)
    return analysis
