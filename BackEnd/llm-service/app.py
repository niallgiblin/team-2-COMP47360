import logging
import base64
import os
import sys
import threading
from typing import Optional

import jwt
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from jwt import InvalidTokenError
from sentence_transformers import SentenceTransformer

from cache_policy import BoundedTTLCache, generate_cache_key
from chat_service import get_ai_response as _chat_get_ai_response
from config import (
    BM25_INDEX_PATH,
    CROSS_ENCODER_ENABLED,
    CROSS_ENCODER_MODEL_NAME,
    DATA_PATH,
    EMBEDDINGS_PATH,
    HYBRID_SEARCH_ENABLED,
    MODEL_PATH,
    QUERY_EXPANSION_ENABLED,
    RRF_K,
    SEARCH_CACHE_MAX_ENTRIES,
    SEARCH_CACHE_TTL_SECONDS,
    SEARCH_OVERFETCH_MULTIPLIER,
    parse_allowed_origins,
)
from loader import validate_corpus_at_startup, verify_file_paths
from query_expander import expand_query
from search_service import VALID_PRICE_RANGES, SearchService, SearchStartupError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=parse_allowed_origins(), supports_credentials=False)

model: Optional[SentenceTransformer] = None
search_service: Optional[SearchService] = None
initialized = False
initialization_error = None
initialization_lock = threading.Lock()
search_cache = BoundedTTLCache(SEARCH_CACHE_MAX_ENTRIES, SEARCH_CACHE_TTL_SECONDS)


def cleanup_cache():
    """Compatibility hook; BoundedTTLCache evicts on get/set."""
    return None


def load_model():
    """Load the sentence transformer model."""
    global model
    try:
        logger.info("Loading model from configured MODEL_PATH")
        config_path = os.path.join(MODEL_PATH, "config.json")
        if not os.path.exists(config_path):
            logger.error("Model config.json not found for MODEL_PATH")
            return False

        model = SentenceTransformer(MODEL_PATH, device="cpu")
        logger.info("Model loaded successfully")
        return True
    except Exception as exc:
        logger.error("Model loading failed: %s", exc, exc_info=True)
        return False


def load_data():
    """Load location data and pre-computed embeddings."""
    try:
        logger.info("Loading data from configured DATA_PATH and EMBEDDINGS_PATH")
        df = pd.read_csv(DATA_PATH)
        logger.info("Loaded %s locations", len(df))

        embeddings = np.load(EMBEDDINGS_PATH)
        logger.info("Loaded embeddings with shape %s", embeddings.shape)
        return df, embeddings
    except Exception as exc:
        logger.error("Data loading failed: %s", exc, exc_info=True)
        return None, None


def initialize_service():
    """Initialize the ML service with model, data, and FAISS search."""
    global initialized, initialization_error, search_service

    with initialization_lock:
        if initialized:
            return True

        logger.info("Starting service initialization...")

        files_ok, missing_files, index_warnings = verify_file_paths()
        if not files_ok:
            initialization_error = f"Missing files: {missing_files}"
            return False
        for warning in index_warnings:
            logger.warning("Path validation warning: %s", warning)

        corpus_ok, corpus_messages = validate_corpus_at_startup()
        if not corpus_ok:
            initialization_error = f"Corpus validation failed: {', '.join(corpus_messages)}"
            return False
        for warning in corpus_messages:
            logger.warning("Corpus validation warning: %s", warning)

        model_ok = load_model()
        df, embeddings = load_data()
        if not model_ok or df is None or embeddings is None:
            initialization_error = "Failed to load model or data"
            return False

        try:
            search_service = SearchService.from_startup(
                df=df,
                embeddings=embeddings,
                encoder=model,
                over_fetch_multiplier=SEARCH_OVERFETCH_MULTIPLIER,
                bm25_index_path=BM25_INDEX_PATH,
                hybrid_search_enabled=HYBRID_SEARCH_ENABLED,
                rrf_k=RRF_K,
                cross_encoder_enabled=CROSS_ENCODER_ENABLED,
            )
        except SearchStartupError as exc:
            initialization_error = str(exc)
            logger.error("Search service startup failed: %s", exc)
            return False

        initialized = True
        logger.info("Service initialization completed successfully")
        return True


@app.route("/health")
def health():
    """Health check endpoint."""
    if not initialized or search_service is None:
        return jsonify(
            {
                "status": "unhealthy",
                "initialized": False,
                "error": initialization_error,
            }
        ), 503

    total_locations = len(search_service._df)
    re_rank_enabled = getattr(search_service, "_cross_encoder", None) is not None
    return jsonify(
        {
            "status": "healthy",
            "initialized": True,
            "model_loaded": model is not None,
            "data_loaded": search_service is not None,
            "embeddings_loaded": search_service is not None,
            "total_locations": total_locations,
            "index_source": getattr(search_service, "_index_source", "unknown"),
            "hybrid_search_enabled": getattr(search_service, "_bm25_index", None) is not None,
            "re_rank_enabled": re_rank_enabled,
            "re_rank_model": CROSS_ENCODER_MODEL_NAME if re_rank_enabled else None,
            "query_expansion_enabled": QUERY_EXPANSION_ENABLED,
        }
    )


def _service_unavailable_response():
    return jsonify(
        {
            "success": False,
            "error": "Service not initialized",
            "details": initialization_error,
        }
    ), 503


def _service_components_unavailable_response():
    return jsonify(
        {
            "success": False,
            "error": "Service components not properly loaded",
        }
    ), 503


def _chat_search_helper(query, limit=5, location_filter=None):
    """Return top similar locations as raw location DTOs (list of dicts).

    The caller (chat_service) is responsible for formatting and citation
    construction.  Returns an empty list when the service is unavailable
    or when no results are found.
    """
    if not initialized or search_service is None:
        return []

    try:
        search_query = query
        if QUERY_EXPANSION_ENABLED:
            try:
                search_query = expand_query(query) or query
            except Exception as exc:
                logger.warning("Query expansion failed; falling back to original: %s", exc)
                search_query = query

        results = search_service.search(search_query, limit=limit, location_filter=location_filter)
        return results  # list of location DTOs or empty list
    except Exception as exc:
        logger.error("Error in chat search helper: %s", exc)
        return []


def get_ai_response(query, previous_questions, previous_responses=None, location_filter=None):
    """Route-owned wrapper returning ChatExecutionResult.

    Tests may monkeypatch this with a simple tuple-returning lambda for
    backward compatibility — chat_endpoint detects tuple returns and wraps
    them into a minimal ChatExecutionResult.
    """
    return _get_ai_response_with_metadata(
        query,
        previous_questions,
        previous_responses=previous_responses,
        location_filter=location_filter,
    )


def _get_ai_response_with_metadata(query, previous_questions, previous_responses=None, location_filter=None):
    """Route-owned wrapper returning ChatExecutionResult with metadata."""
    from chat_service import get_ai_response_with_metadata as _svc_get_with_meta
    return _svc_get_with_meta(
        query,
        previous_questions,
        previous_responses=previous_responses,
        search_helper=_chat_search_helper_with_metadata,
        location_filter=location_filter,
    )


def _chat_search_helper_with_metadata(query, limit=5, location_filter=None):
    """Search helper returning list of location dicts.

    Wraps search_with_metadata() but unwraps the SearchExecutionResult
    to return a plain list — build_retrieval_context() expects iterable results.
    """
    if not initialized or search_service is None:
        return []

    try:
        search_query = query
        if QUERY_EXPANSION_ENABLED:
            try:
                search_query = expand_query(query) or query
            except Exception as exc:
                logger.warning("Query expansion failed; falling back to original: %s", exc)
                search_query = query

        result = search_service.search_with_metadata(
            search_query, limit=limit, location_filter=location_filter
        )
        return result.results
    except Exception as exc:
        logger.error("Error in chat search helper: %s", exc)
        return []


if os.environ.get("FLASK_ENV") == "development":

    @app.route("/locations/all", methods=["GET"])
    def get_all_locations():
        """Get all locations (for debugging; development only)."""
        if not initialized or search_service is None:
            return jsonify({"error": "Service not initialized"}), 503

        locations = [search_service._df.iloc[i].to_dict() for i in range(len(search_service._df))]
        return jsonify({"locations": locations})


@app.route("/search", methods=["POST"])
def vibe_search():
    """Main search endpoint with bounded TTL caching."""
    if not initialized or search_service is None:
        return _service_unavailable_response()

    if not request.is_json:
        return jsonify(
            {
                "success": False,
                "error": "Content-Type must be application/json",
            }
        ), 415

    try:
        data = request.get_json()
        logger.info("ML Service: Received /search request with payload: %s", data)

        vibe_desc = data.get("vibeDescription", "").strip()
        max_results = data.get("maxResults", 10)
        try:
            max_results = int(max_results)
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "maxResults must be an integer"}), 400
        max_results = max(1, min(max_results, 25))
        location_filter = data.get("location", None)
        price_range = data.get("priceRange", None)
        if price_range is not None and str(price_range).strip():
            price_key = str(price_range).lower().strip()
            if price_key not in VALID_PRICE_RANGES:
                return jsonify(
                    {
                        "success": False,
                        "error": f"Unknown priceRange: {price_range}. Valid values: {', '.join(sorted(VALID_PRICE_RANGES))}",
                    }
                ), 400

        cache_key = generate_cache_key(vibe_desc, max_results, location_filter, price_range)
        cached_result = search_cache.get(cache_key)
        if cached_result is not None:
            logger.info("Returning cached result for query: '%s'", vibe_desc)
            return jsonify(cached_result)

        if not vibe_desc:
            return jsonify(
                {
                    "success": False,
                    "error": "vibeDescription is required",
                }
            ), 400

        results = search_service.search(
            vibe_desc,
            limit=max_results,
            location_filter=location_filter,
            price_range=price_range,
        )

        if not results:
            response = {
                "success": True,
                "query": vibe_desc,
                "results": [],
                "explanation": "No locations found matching the specified filters.",
                "confidence": None,
            }
            search_cache.set(cache_key, response)
            return jsonify(response)

        confidence_score = float(results[0]["similarity"]) if results else None
        response = {
            "success": True,
            "query": vibe_desc,
            "results": results,
            "explanation": f"Found {len(results)} locations matching your vibe and filters.",
            "confidence": confidence_score,
        }
        search_cache.set(cache_key, response)

        logger.info(
            "ML Service: Returning %s results for query '%s' (cached)",
            len(results),
            vibe_desc,
        )
        return jsonify(response)

    except Exception as exc:
        logger.error("ML Service: Error in /search: %s", exc, exc_info=True)
        return jsonify({"success": False, "error": "Internal server error"}), 500


@app.route("/similar", methods=["POST"])
def similar_locations():
    """Find locations similar to a venue by name, zone, and type attributes."""
    if not initialized or search_service is None:
        return _service_unavailable_response()

    if not request.is_json:
        return jsonify(
            {
                "success": False,
                "error": "Content-Type must be application/json",
            }
        ), 415

    try:
        data = request.get_json()
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"success": False, "error": "name is required"}), 400

        zone = (data.get("zone") or "").strip()
        loc_type = (data.get("loc_type") or "").strip()
        summary = (data.get("summary") or "").strip()
        tags = data.get("tags")

        limit = data.get("limit", 5)
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "limit must be an integer"}), 400
        limit = max(1, min(limit, 25))

        query_parts = [name]
        if zone:
            query_parts.append(zone)
        if loc_type:
            query_parts.append(loc_type)
        if summary:
            query_parts.append(summary)
        if tags:
            if isinstance(tags, list):
                query_parts.extend(str(tag).strip() for tag in tags if tag)
            elif isinstance(tags, str) and tags.strip():
                query_parts.append(tags.strip())

        query_text = " ".join(query_parts)
        results = search_service.find_similar(
            query_text,
            exclude_names=[name],
            limit=limit,
        )
        confidence = float(results[0]["similarity"]) if results else 0.0

        return jsonify(
            {
                "success": True,
                "results": results,
                "confidence": confidence,
            }
        )

    except Exception as exc:
        logger.error("ML Service: Error in /similar: %s", exc, exc_info=True)
        return jsonify({"success": False, "error": "Internal server error"}), 500


@app.errorhandler(Exception)
def handle_exception(exc):
    """Global exception handler."""
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return jsonify({"success": False, "error": "Internal server error"}), 500


logger.info("Attempting to initialize ML service...")
initialization_success = initialize_service()

if not initialization_success:
    logger.error("Service initialization failed: %s", initialization_error)


@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    """Chat endpoint with structured observability.

    Every attempt (including auth/validation failures) emits exactly one
    canonical chat_request event and increments bounded Prometheus metrics.
    """
    import time as _time
    from observability import (
        ChatRequestState,
        finalize_chat_request,
        hash_query,
        _queue_event,
        uuid4,
    )

    # Route-owned request lifecycle: create state BEFORE any early return.
    request_id = uuid4()
    state = ChatRequestState(request_id=request_id)

    # ---- Auth gate -------------------------------------------------------
    auth_error = validate_chat_jwt()
    if auth_error is not None:
        state.mode = "unknown"
        state.status = "error"
        state.error_type = "auth_error"
        state.error_stage = "auth"
        state.error_code = "auth_required"
        state.finish_after_response_construction()
        # auth_error is (response_body, status_code) from chat_auth_error()
        auth_body, auth_status = auth_error
        auth_body.headers["X-Request-ID"] = request_id
        finalize_chat_request(state, queue_sink=_queue_event)
        return auth_body, auth_status

    # ---- Content-type validation -----------------------------------------
    if not request.is_json:
        state.mode = "unknown"
        state.status = "error"
        state.error_type = "validation_error"
        state.error_stage = "validation"
        state.error_code = "invalid_payload"
        state.finish_after_response_construction()
        resp = jsonify({"error": "Content-Type must be application/json"})
        resp.status_code = 415
        resp.headers["X-Request-ID"] = request_id
        finalize_chat_request(state, queue_sink=_queue_event)
        return resp

    response = None
    try:
        data = request.get_json()
        query = data.get("message", "").strip()
        previous_questions = data.get("previous_questions", [])
        if not isinstance(previous_questions, list):
            previous_questions = []
        previous_questions = [str(q) for q in previous_questions if q][-3:]

        previous_responses = data.get("previous_responses", [])
        if not isinstance(previous_responses, list):
            previous_responses = []
        previous_responses = [str(r) for r in previous_responses if r][-3:]

        if not query:
            state.mode = "unknown"
            state.status = "error"
            state.error_type = "validation_error"
            state.error_stage = "validation"
            state.error_code = "message_required"
            state.finish_after_response_construction()
            response = jsonify({"error": "Message is required"})
            response.status_code = 400
            response.headers["X-Request-ID"] = request_id
            finalize_chat_request(state, queue_sink=_queue_event)
            return response

        state.query_hash = hash_query(query)

        # Resolve location filter.
        from chat_service import extract_location_from_query

        location_filter = (data.get("location") or "").strip() or None
        if not location_filter:
            location_filter = extract_location_from_query(query)

        # Call the route wrapper (tests monkeypatch this).
        result_or_tuple = get_ai_response(
            query, previous_questions,
            previous_responses=previous_responses,
            location_filter=location_filter,
        )

        # Handle both ChatExecutionResult and backward-compatible tuple mock.
        from observability import ChatExecutionResult as _CER, ChatExecutionMetadata
        if isinstance(result_or_tuple, _CER):
            result = result_or_tuple
        else:
            # Tuple mock from existing tests — wrap with minimal metadata.
            text, citations = result_or_tuple
            result = _CER(
                text, citations,
                ChatExecutionMetadata(
                    mode="dense", retrieval_started=bool(citations),
                    candidates=len(citations), fallback_triggered=False,
                    retrieval_elapsed_s=0.0, generation_elapsed_s=0.0,
                    error_stage=None, error_code=None,
                ),
            )

        # Transfer metadata from chat execution to request state.
        meta = result.metadata
        state.mode = meta.mode
        state.status = "success" if not meta.fallback_triggered and meta.error_stage is None else (
            "fallback" if meta.fallback_triggered else "error"
        )
        if meta.error_stage:
            state.status = "error" if not meta.fallback_triggered else "fallback"
        state.candidates = meta.candidates
        state.citations_count = len(result.citations)
        state.fallback_triggered = meta.fallback_triggered
        state.retrieval_started = meta.retrieval_started
        state.retrieval_elapsed_s = meta.retrieval_elapsed_s
        state.generation_elapsed_s = meta.generation_elapsed_s
        state.error_stage = meta.error_stage
        state.error_code = meta.error_code
        state.error_type = (
            f"{meta.error_stage}_error" if meta.error_stage else None
        )

        state.finish_after_response_construction()
        response = jsonify({"response": result.text, "citations": result.citations})
        response.headers["X-Request-ID"] = request_id

        logger.info(
            "Chat response: %d citations returned (location_filter=%s)",
            len(result.citations),
            location_filter,
        )

    except Exception as exc:
        logger.error("Error in chat endpoint: %s", exc)
        state.mode = state.mode if state.mode != "unknown" else "unknown"
        state.status = "error"
        state.error_stage = state.error_stage or "response"
        state.error_code = state.error_code or "internal_error"
        state.error_type = "response_error"
        state.finish_after_response_construction()
        response = jsonify({"error": "Internal server error"})
        response.status_code = 500
        response.headers["X-Request-ID"] = request_id

    # Exactly-once finalization (after response/header constructed)
    finalize_chat_request(state, queue_sink=_queue_event)
    return response


@app.route("/metrics")
def metrics_endpoint():
    """Prometheus metrics exposition for the LLM service."""
    from prometheus_client import CollectorRegistry, multiprocess, generate_latest, CONTENT_TYPE_LATEST
    registry = CollectorRegistry()
    multiprocess.MultiProcessCollector(registry)
    data = generate_latest(registry)
    from flask import Response
    return Response(data, content_type=CONTENT_TYPE_LATEST)


def _jwt_verification_key(secret: str) -> bytes:
    """Match Spring JwtTokenProvider base64 decoding; fall back for test secrets."""
    try:
        return base64.b64decode(secret, validate=True)
    except Exception:
        return secret.encode("utf-8")


def validate_chat_jwt():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return chat_auth_error()

    token = auth_header[len("Bearer ") :].strip()
    if not token:
        return chat_auth_error()

    secret = os.getenv("APP_JWT_SECRET")
    if not secret:
        logger.error("APP_JWT_SECRET is required for /api/chat JWT validation")
        return chat_auth_error()

    try:
        key = _jwt_verification_key(secret)
        jwt.decode(token, key, algorithms=["HS512", "HS256"])
        return None
    except InvalidTokenError:
        return chat_auth_error()


def chat_auth_error():
    return jsonify(
        {
            "error": "Authentication required",
            "message": "Authentication required",
            "status": 401,
            "code": "AUTHENTICATION_REQUIRED",
        }
    ), 401


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream_endpoint():
    """SSE streaming chat endpoint.

    Returns ``text/event-stream`` with incremental ``token`` events
    followed by a final ``done`` event containing the full processed
    response and citations array.
    """
    import time as _time
    from observability import (
        ChatRequestState,
        finalize_chat_request,
        hash_query,
        _queue_event,
        uuid4,
    )

    request_id = uuid4()
    state = ChatRequestState(request_id=request_id)

    # ---- Auth gate -------------------------------------------------------
    auth_error = validate_chat_jwt()
    if auth_error is not None:
        state.mode = "unknown"
        state.status = "error"
        state.error_type = "auth_error"
        state.error_stage = "auth"
        state.error_code = "auth_required"
        state.finish_after_response_construction()
        auth_body, auth_status = auth_error
        auth_body.headers["X-Request-ID"] = request_id
        finalize_chat_request(state, queue_sink=_queue_event)
        return auth_body, auth_status

    # ---- Content-type validation -----------------------------------------
    if not request.is_json:
        state.mode = "unknown"
        state.status = "error"
        state.error_type = "validation_error"
        state.error_stage = "validation"
        state.error_code = "invalid_payload"
        state.finish_after_response_construction()
        resp = jsonify({"error": "Content-Type must be application/json"})
        resp.status_code = 415
        resp.headers["X-Request-ID"] = request_id
        finalize_chat_request(state, queue_sink=_queue_event)
        return resp

    try:
        data = request.get_json()
        query = data.get("message", "").strip()
        previous_questions = data.get("previous_questions", [])
        if not isinstance(previous_questions, list):
            previous_questions = []
        previous_questions = [str(q) for q in previous_questions if q][-3:]

        previous_responses = data.get("previous_responses", [])
        if not isinstance(previous_responses, list):
            previous_responses = []
        previous_responses = [str(r) for r in previous_responses if r][-3:]

        if not query:
            state.mode = "unknown"
            state.status = "error"
            state.error_type = "validation_error"
            state.error_stage = "validation"
            state.error_code = "message_required"
            state.finish_after_response_construction()
            resp = jsonify({"error": "Message is required"})
            resp.status_code = 400
            resp.headers["X-Request-ID"] = request_id
            finalize_chat_request(state, queue_sink=_queue_event)
            return resp

        state.query_hash = hash_query(query)

        # Resolve location filter.
        from chat_service import extract_location_from_query

        location_filter = (data.get("location") or "").strip() or None
        if not location_filter:
            location_filter = extract_location_from_query(query)

        # Build the SSE generator.
        from chat_service import stream_chat_response

        generator = stream_chat_response(
            query,
            previous_questions,
            previous_responses=previous_responses,
            search_helper=_chat_search_helper_with_metadata,
            location_filter=location_filter,
        )

        state.mode = "dense"
        state.status = "success"
        state.retrieval_started = True
        state.finish_after_response_construction()
        finalize_chat_request(state, queue_sink=_queue_event)

        from flask import Response
        from flask import stream_with_context

        response = Response(
            stream_with_context(generator),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Request-ID": request_id,
            },
        )
        return response

    except Exception as exc:
        logger.error("Error in stream chat endpoint: %s", exc)
        state.mode = state.mode if state.mode != "unknown" else "unknown"
        state.status = "error"
        state.error_stage = state.error_stage or "response"
        state.error_code = state.error_code or "internal_error"
        state.error_type = "response_error"
        state.finish_after_response_construction()
        finalize_chat_request(state, queue_sink=_queue_event)
        resp = jsonify({"error": "Internal server error"})
        resp.status_code = 500
        resp.headers["X-Request-ID"] = request_id
        return resp


if __name__ == "__main__":
    logger.info("Running Flask development server...")
    app.run(host="0.0.0.0", port=5000, debug=False)
