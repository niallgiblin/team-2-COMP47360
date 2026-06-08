"""Structured observability primitives for Phase 19.

Provides strict canonical events, bounded Prometheus metrics, safe query
hashing, exactly-once request finalization, and single-writer JSONL rotation
for the Gunicorn preloaded two-worker process model.

Do NOT import this module until PROMETHEUS_MULTIPROC_DIR is set in the
environment.  The module-level metrics are created at import time.
"""

from __future__ import annotations

import hashlib
import json
import logging
import multiprocessing
import os
import sys
import time
import unicodedata
import uuid as _uuid
from logging.handlers import RotatingFileHandler
from typing import Callable, Literal, Optional

import pydantic
import structlog

# ── Prometheus (after env is confirmed) ─────────────────────────

_PROM_DIR = os.getenv("PROMETHEUS_MULTIPROC_DIR", "")
if _PROM_DIR:
    # The entrypoint clears this directory before gunicorn imports the app,
    # so stale files from prior runs cannot survive.
    pass

from prometheus_client import Counter, Histogram  # noqa: E402

# ── Logging ──────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

# Dedicated stdout handler for canonical chat_request events.
# Structlog renders these; existing root logger handles diagnostics.
_canonical_logger = structlog.get_logger("chat_request_event")


# ── Finite taxonomies ───────────────────────────────────────────

MODE_VALUES: tuple[str, ...] = ("unknown", "general_chat", "dense", "hybrid")
STATUS_VALUES: tuple[str, ...] = ("success", "fallback", "error")

ERROR_STAGE_VALUES: tuple[str, ...] = (
    "auth",
    "validation",
    "reformulation",
    "retrieval",
    "generation",
    "postprocessing",
    "response",
)

ERROR_TYPE_VALUES: tuple[str, ...] = (
    "auth_error",
    "validation_error",
    "reformulation_error",
    "retrieval_error",
    "generation_error",
    "postprocessing_error",
    "response_error",
)

# Finite stage → code policy table.  Error codes not listed here are rejected.
_STAGE_CODE_TABLE: dict[str, tuple[str, ...]] = {
    "auth": ("auth_required",),
    "validation": ("invalid_payload", "message_required"),
    "reformulation": ("query_reformulation_failed",),
    "retrieval": (
        "dense_only_fallback",
        "location_filter_relaxed",
        "retrieval_unavailable",
    ),
    "generation": (
        "hf_timeout",
        "hf_request_failed",
        "prompt_template_fallback",
        "busyness_unavailable",
    ),
    "postprocessing": ("postprocessing_failed",),
    "response": ("internal_error",),
}

ALL_VALID_CODES: frozenset[str] = frozenset(
    code for codes in _STAGE_CODE_TABLE.values() for code in codes
)


def _is_valid_code(stage: Optional[str], code: Optional[str]) -> bool:
    """Check that *code* is valid for *stage*, or both are None."""
    if stage is None and code is None:
        return True
    if stage is None or code is None:
        return False
    return code in _STAGE_CODE_TABLE.get(stage, ())


# ── Prometheus metrics (module scope) ───────────────────────────

# Pre-initialize all label combinations so Phase 21 dashboards never
# encounter missing-series panels before first traffic.

_MODE_LABELS = {mode: mode for mode in MODE_VALUES}
_STATUS_LABELS = {status: status for status in STATUS_VALUES}

CHAT_REQUESTS_TOTAL = Counter(
    "chat_requests_total",
    "Total chat requests",
    labelnames=["mode", "status"],
)

CHAT_LATENCY_SECONDS = Histogram(
    "chat_latency_seconds",
    "Chat endpoint total latency",
    labelnames=["mode"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 30, 60, 90, 120),
)

RETRIEVAL_LATENCY_SECONDS = Histogram(
    "retrieval_latency_seconds",
    "Retrieval pipeline latency",
    labelnames=["mode"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

CITATIONS_PER_RESPONSE = Histogram(
    "citations_per_response",
    "Citations returned per retrieval response",
    buckets=(0, 1, 2, 3, 5, 8, 10),
)

# Pre-initialize all 12 label combinations
for _mode in MODE_VALUES:
    CHAT_LATENCY_SECONDS.labels(mode=_mode)
    RETRIEVAL_LATENCY_SECONDS.labels(mode=_mode)
    for _status in STATUS_VALUES:
        CHAT_REQUESTS_TOTAL.labels(mode=_mode, status=_status)


# ── Hashing ──────────────────────────────────────────────────────


def hash_query(query: Optional[str]) -> Optional[str]:
    """Return lowercase 64-hex SHA-256 hash of NFKC-normalized query.

    Returns None for absent, empty, or whitespace-only input.
    The hash is pseudonymous/linkable, not anonymous.
    """
    if query is None:
        return None
    normalized = unicodedata.normalize("NFKC", query).strip()
    # Collapse internal whitespace
    normalized = " ".join(normalized.split())
    if not normalized:
        return None
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


# ── UUID helpers ─────────────────────────────────────────────────


def uuid4() -> str:
    """Return a new UUID4 as a string."""
    return str(_uuid.uuid4())


# ── Type carriers ────────────────────────────────────────────────


class SearchExecutionResult:
    """Immutable search execution result with metadata."""

    __slots__ = ("results", "effective_mode", "degradation")

    def __init__(
        self,
        results: list[dict],
        effective_mode: Literal["dense", "hybrid"],
        degradation: Optional[str] = None,
    ):
        self.results = list(results)
        self.effective_mode = effective_mode
        self.degradation = degradation


class ChatExecutionResult:
    """Immutable chat execution result with metadata."""

    __slots__ = ("text", "citations", "metadata")

    def __init__(
        self,
        text: str,
        citations: list[dict],
        metadata: ChatExecutionMetadata,
    ):
        self.text = text
        self.citations = list(citations)
        self.metadata = metadata


class ChatExecutionMetadata:
    """Bounded execution metadata from chat_service."""

    __slots__ = (
        "mode",
        "retrieval_started",
        "candidates",
        "fallback_triggered",
        "retrieval_elapsed_s",
        "generation_elapsed_s",
        "error_stage",
        "error_code",
    )

    def __init__(
        self,
        *,
        mode: str,
        retrieval_started: bool = False,
        candidates: int = 0,
        fallback_triggered: bool = False,
        retrieval_elapsed_s: float = 0.0,
        generation_elapsed_s: float = 0.0,
        error_stage: Optional[str] = None,
        error_code: Optional[str] = None,
    ):
        self.mode = mode
        self.retrieval_started = retrieval_started
        self.candidates = candidates
        self.fallback_triggered = fallback_triggered
        self.retrieval_elapsed_s = retrieval_elapsed_s
        self.generation_elapsed_s = generation_elapsed_s
        self.error_stage = error_stage
        self.error_code = error_code


# ── Request state ────────────────────────────────────────────────


class ChatRequestState:
    """Mutable request-local accumulator for one /api/chat attempt."""

    __slots__ = (
        "request_id",
        "started_at",
        "mode",
        "status",
        "query_hash",
        "candidates",
        "citations_count",
        "fallback_triggered",
        "retrieval_started",
        "retrieval_elapsed_s",
        "generation_elapsed_s",
        "total_elapsed_s",
        "error_type",
        "error_stage",
        "error_code",
        "_emitted",
    )

    def __init__(self, request_id: str):
        self.request_id = request_id
        self.started_at = time.perf_counter()
        self.mode: str = "unknown"
        self.status: str = "success"
        self.query_hash: Optional[str] = None
        self.candidates: int = 0
        self.citations_count: int = 0
        self.fallback_triggered: bool = False
        self.retrieval_started: bool = False
        self.retrieval_elapsed_s: float = 0.0
        self.generation_elapsed_s: float = 0.0
        self.total_elapsed_s: float = 0.0
        self.error_type: Optional[str] = None
        self.error_stage: Optional[str] = None
        self.error_code: Optional[str] = None
        self._emitted: bool = False

    def finish_after_response_construction(self) -> None:
        """Stop total-latency clock after response/header construction."""
        self.total_elapsed_s = time.perf_counter() - self.started_at

    @property
    def emitted(self) -> bool:
        return self._emitted

    def mark_emitted(self) -> None:
        if self._emitted:
            raise RuntimeError("duplicate finalizer call for request_id=%s" % self.request_id)
        self._emitted = True


# ── Frozen event model ───────────────────────────────────────────


class ChatRequestEvent(pydantic.BaseModel):
    """Immutable canonical event validated once before emission."""

    model_config = pydantic.ConfigDict(extra="forbid", frozen=True)

    event: Literal["chat_request"] = "chat_request"
    request_id: str
    query_hash: Optional[str] = pydantic.Field(default=None, pattern=r"^$|^[0-9a-f]{64}$")
    mode: Literal["unknown", "general_chat", "dense", "hybrid"]
    status: Literal["success", "fallback", "error"]
    candidates: int = pydantic.Field(ge=0)
    latency_retrieval_ms: float = pydantic.Field(ge=0)
    latency_generation_ms: float = pydantic.Field(ge=0)
    latency_total_ms: float = pydantic.Field(ge=0)
    citations_count: int = pydantic.Field(ge=0)
    fallback_triggered: bool
    error_type: Optional[str] = None
    error_stage: Optional[str] = None
    error_code: Optional[str] = pydantic.Field(default=None, pattern=r"^$|^[a-z0-9_]+$")

    @pydantic.field_validator("error_stage", mode="before")
    @classmethod
    def _validate_error_stage(cls, v):
        if v is not None and v not in ERROR_STAGE_VALUES:
            raise ValueError(f"invalid error_stage: {v!r}")
        return v

    @pydantic.field_validator("error_type", mode="before")
    @classmethod
    def _validate_error_type(cls, v):
        if v is not None and v not in ERROR_TYPE_VALUES:
            raise ValueError(f"invalid error_type: {v!r}")
        return v

    @pydantic.field_validator("error_code", mode="before")
    @classmethod
    def _validate_error_code(cls, v):
        if v is not None and v not in ALL_VALID_CODES:
            raise ValueError(f"invalid error_code: {v!r}")
        return v

    def model_dump_json(self, **kwargs) -> str:
        """Render to JSON, sorting keys for deterministic output."""
        kwargs.setdefault("indent", None)
        kwargs.setdefault("exclude_none", True)
        return super().model_dump_json(**kwargs)


# ── Event construction ──────────────────────────────────────────


def _build_event(state: ChatRequestState) -> ChatRequestEvent:
    """Construct a frozen event from mutable state, applying timing rules.

    Raises ValueError if state fields violate the contract.
    """
    if state.mode not in MODE_VALUES:
        raise ValueError(f"invalid mode: {state.mode!r}")
    if state.status not in STATUS_VALUES:
        raise ValueError(f"invalid status: {state.status!r}")

    # Derive error_type from error_stage when present but error_type is missing
    error_type = state.error_type
    if error_type is None and state.error_stage is not None:
        error_type = f"{state.error_stage}_error"
        if error_type not in ERROR_TYPE_VALUES:
            error_type = "response_error"

    if error_type is not None and error_type not in ERROR_TYPE_VALUES:
        raise ValueError(f"invalid error_type: {error_type!r}")

    # Validate stage/code compatibility
    if not _is_valid_code(state.error_stage, state.error_code):
        raise ValueError(
            "incompatible error_stage/error_code: %s/%s" % (state.error_stage, state.error_code)
        )

    # Apply timing rules: D-07 (non-retrieval = 0 retrieval latency)
    retrieval_ms = state.retrieval_elapsed_s * 1000.0 if state.retrieval_started else 0.0
    generation_ms = state.generation_elapsed_s * 1000.0
    total_ms = state.total_elapsed_s * 1000.0

    # Non-retrieval modes should have candidates=0
    if not state.retrieval_started:
        candidates = 0
    else:
        candidates = state.candidates

    return ChatRequestEvent(
        event="chat_request",
        request_id=state.request_id,
        query_hash=state.query_hash or None,
        mode=state.mode,
        status=state.status,
        candidates=candidates,
        latency_retrieval_ms=round(retrieval_ms, 3),
        latency_generation_ms=round(generation_ms, 3),
        latency_total_ms=round(total_ms, 3),
        citations_count=state.citations_count,
        fallback_triggered=state.fallback_triggered,
        error_type=error_type or None,
        error_stage=state.error_stage or None,
        error_code=state.error_code or None,
    )


# ── Finalization ────────────────────────────────────────────────


def finalize_chat_request(
    state: ChatRequestState,
    *,
    stdout_sink: Optional[Callable[[str], None]] = None,
    queue_sink: Optional[Callable[[str], None]] = None,
) -> None:
    """Finalize one chat attempt: validate, render, fan-out, metric bump.

    Idempotent: second call is a no-op (state._emitted guard).

    Sink failures are caught and logged to stderr; they never propagate
    to the caller.  The response has already been determined before this
    call, per D-03 and T-19-04.
    """
    if state.emitted:
        return

    # Build and validate the immutable event
    try:
        event = _build_event(state)
    except Exception:
        logger.exception("observability: failed to build event for request_id=%s", state.request_id)
        state.mark_emitted()
        return

    # Render once
    try:
        payload = event.model_dump_json()
    except Exception:
        logger.exception("observability: failed to serialize event for request_id=%s", state.request_id)
        state.mark_emitted()
        return

    # Mark emitted BEFORE sinks so duplicate suppression works even if sinks
    # crash after partial delivery.
    state.mark_emitted()

    # Fan-out: stdout
    try:
        if stdout_sink is not None:
            stdout_sink(payload)
        else:
            _canonical_logger.info(
                "chat_request",
                _event_json=payload,
                request_id=state.request_id,
            )
    except Exception:
        logger.warning(
            "observability: stdout sink failed (request_id=%s)", state.request_id, exc_info=True
        )

    # Fan-out: file queue (non-blocking)
    if queue_sink is not None:
        try:
            queue_sink(payload)
        except Exception:
            logger.warning(
                "observability: queue sink failed (request_id=%s)", state.request_id, exc_info=True
            )

    # Update metrics (never fails — exceptions are caught)
    _update_metrics(state, event.mode)


def _update_metrics(state: ChatRequestState, mode: str) -> None:
    """Update Prometheus metrics for the completed request."""
    try:
        CHAT_REQUESTS_TOTAL.labels(mode=mode, status=state.status).inc()
        CHAT_LATENCY_SECONDS.labels(mode=mode).observe(state.total_elapsed_s)

        if state.retrieval_started:
            RETRIEVAL_LATENCY_SECONDS.labels(mode=mode).observe(state.retrieval_elapsed_s)

        if mode in ("dense", "hybrid") and state.retrieval_started:
            CITATIONS_PER_RESPONSE.observe(state.citations_count)
    except Exception:
        logger.warning(
            "observability: metric update failed (request_id=%s)", state.request_id, exc_info=True
        )


# ── Single-writer JSONL rotation ─────────────────────────────────

# Shared across preloaded workers.  Created at import; writer process
# started by Gunicorn on_starting or Flask dev startup.
_event_queue: multiprocessing.Queue = multiprocessing.Queue()
_writer_process: Optional[multiprocessing.Process] = None
_writer_stop_sentinel = "##STOP##"


def _writer_loop(
    log_path: str,
    max_bytes: int,
    backup_count: int,
) -> None:
    """Run in dedicated writer process: drain queue → RotatingFileHandler."""
    handler: Optional[RotatingFileHandler] = None
    try:
        # Create parent directory if needed
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        handler = RotatingFileHandler(
            log_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
        )
        # Write only the rendered JSON line (no formatting)
        handler.setFormatter(logging.Formatter("%(message)s"))

        while True:
            item = _event_queue.get()
            if item == _writer_stop_sentinel:
                break
            try:
                record = logging.LogRecord(
                    "chat_request_writer", logging.INFO, "", 0, item, (), None
                )
                handler.emit(record)
            except Exception:
                # Swallow per-record errors; don't crash the writer
                sys.stderr.write(
                    "observability writer: failed to write record\n"
                )
    except Exception:
        sys.stderr.write("observability writer: fatal error\n")
    finally:
        if handler is not None:
            try:
                handler.close()
            except Exception:
                pass
        # Drain any remaining items after stop sentinel
        while True:
            try:
                item = _event_queue.get_nowait()
                if item == _writer_stop_sentinel:
                    continue
                # Try to write remaining items
                if handler is not None:
                    try:
                        record = logging.LogRecord(
                            "chat_request_writer", logging.INFO, "", 0, item, (), None
                        )
                        handler.emit(record)
                    except Exception:
                        pass
            except Exception:
                break


def _start_writer(
    log_path: Optional[str] = None,
    max_bytes: int = 10 * 1024 * 1024,
    backup_count: int = 3,
) -> None:
    """Start the dedicated writer process (called from Gunicorn on_starting)."""
    global _writer_process
    path = log_path or os.getenv("CHAT_LOG_PATH", "/app/logs/chat-requests.jsonl")
    _writer_process = multiprocessing.Process(
        target=_writer_loop,
        args=(path, max_bytes, backup_count),
        name="observability-writer",
        daemon=True,
    )
    _writer_process.start()
    logger.info("observability writer started: path=%s max_bytes=%d backup_count=%d",
                path, max_bytes, backup_count)


def _stop_writer(timeout: float = 5.0) -> None:
    """Stop the writer process gracefully (called from Gunicorn on_exit)."""
    global _writer_process
    if _writer_process is None or not _writer_process.is_alive():
        return
    try:
        _event_queue.put(_writer_stop_sentinel)
        _writer_process.join(timeout=timeout)
    except Exception:
        logger.warning("observability writer shutdown error", exc_info=True)
    finally:
        if _writer_process.is_alive():
            logger.warning("observability writer did not stop; terminating")
            _writer_process.terminate()
            _writer_process.join(timeout=2.0)
        _writer_process = None


def _queue_event(payload: str) -> None:
    """Non-blocking enqueue for worker-side emission.

    If the queue is full or broken, logs a warning and returns.
    Never blocks the worker request thread.
    """
    try:
        _event_queue.put_nowait(payload)
    except Exception:
        logger.warning("observability: failed to enqueue event (queue full or broken)")
