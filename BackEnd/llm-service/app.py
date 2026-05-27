import logging
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
    DATA_PATH,
    EMBEDDINGS_PATH,
    MODEL_PATH,
    SEARCH_CACHE_MAX_ENTRIES,
    SEARCH_CACHE_TTL_SECONDS,
    SEARCH_OVERFETCH_MULTIPLIER,
    parse_allowed_origins,
)
from loader import verify_file_paths
from search_service import SearchService, SearchStartupError

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
        try:
            logger.info("Attempting to load fallback model from HuggingFace...")
            model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
            logger.warning("Loaded fallback model from HuggingFace")
            return True
        except Exception as fallback_exc:
            logger.error("Fallback model loading also failed: %s", fallback_exc)
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

        files_ok, missing_files = verify_file_paths()
        if not files_ok:
            initialization_error = f"Missing files: {missing_files}"
            return False

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
    return jsonify(
        {
            "status": "healthy",
            "initialized": True,
            "model_loaded": model is not None,
            "data_loaded": search_service is not None,
            "embeddings_loaded": search_service is not None,
            "total_locations": total_locations,
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


def _chat_search_helper(query, limit=5):
    """Return top similar locations as formatted chat retrieval context."""
    if not initialized or search_service is None:
        return "Location search is not available at the moment."

    try:
        results = search_service.search(query, limit=limit)
        if not results:
            return "No similar locations found."

        loc_info_parts = []
        for loc in results:
            loc_type = loc.get("type", "")
            loc_info_parts.append(f"- {loc['name']} ({loc['zone']}): {loc_type}")

        return "Here are some similar locations:\n" + "\n".join(loc_info_parts)
    except Exception as exc:
        logger.error("Error in chat search helper: %s", exc)
        return "I'm having trouble finding similar locations right now."


def get_ai_response(query, previous_questions):
    """Route-owned wrapper delegating prompt assembly and HF call to chat_service."""
    return _chat_get_ai_response(
        query,
        previous_questions,
        search_helper=_chat_search_helper,
    )


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
    """Chat endpoint for AI interactions."""
    auth_error = validate_chat_jwt()
    if auth_error is not None:
        return auth_error

    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 415

    try:
        data = request.get_json()
        query = data.get("message", "").strip()
        previous_questions = data.get("previous_questions", [])
        if not isinstance(previous_questions, list):
            previous_questions = []
        previous_questions = [str(question) for question in previous_questions if question][-3:]

        if not query:
            return jsonify({"error": "Message is required"}), 400

        response = get_ai_response(query, previous_questions)
        return jsonify({"response": response})
    except Exception as exc:
        logger.error("Error in chat endpoint: %s", exc)
        return jsonify({"error": "Internal server error"}), 500


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
        jwt.decode(token, secret, algorithms=["HS256"])
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


if __name__ == "__main__":
    logger.info("Running Flask development server...")
    app.run(host="0.0.0.0", port=5000, debug=False)
