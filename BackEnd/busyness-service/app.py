import concurrent.futures
import logging
import sys
import time
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import os
from collections import OrderedDict

# Import and inspect the predictor module
try:
    from predictor.busyness import (
        forecast_busyness_for_all_zones,
        initialize_busyness_models,
        predict_busyness_for_all_zones,
        verify_file_paths,
        dnn_models
    )
    from predictor import busyness as busyness_module
    IMPORT_SUCCESS = True
    IMPORT_ERROR = None
except Exception as e:
    IMPORT_SUCCESS = False
    IMPORT_ERROR = str(e)
    # Create dummy variables to prevent errors
    dnn_models = {}
    busyness_module = None
    def initialize_busyness_models() -> bool:
        return False
    def verify_file_paths():
        return False, ["predictor.busyness import failed"]
    def predict_busyness_for_all_zones(lat, lon) -> dict:
        return {}
    def forecast_busyness_for_all_zones(lat, lon) -> list:
        return []

# Configure logging with more detailed output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("app")

app = Flask(__name__)

def _parse_allowed_origins():
    configured = os.getenv("FLASK_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]

CORS(app, origins=_parse_allowed_origins(), supports_credentials=False)

def _env_int(name, default):
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid %s=%r; using default %s", name, raw, default)
        return default


# Global state with bounded process-local caching
initialized = False
initialization_error = None
inflight_requests = {}
request_lock = threading.Lock()
LIVE_CACHE_TTL_SECONDS = _env_int("BUSYNESS_LIVE_CACHE_TTL_SECONDS", 30 * 60)
FORECAST_CACHE_TTL_SECONDS = _env_int("BUSYNESS_FORECAST_CACHE_TTL_SECONDS", 30 * 60)
BUSYNESS_CACHE_MAX_ENTRIES = _env_int("BUSYNESS_CACHE_MAX_ENTRIES", 512)
CACHE_COORDINATE_PRECISION = 3
CACHE_BUCKET_SECONDS = 60 * 60


class BoundedTTLCache:
    def __init__(self, max_entries, ttl_seconds, now_func=time.time):
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self.now_func = now_func
        self._items = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            self._cleanup_expired()
            item = self._items.get(key)
            if item is None:
                return None
            timestamp, value = item
            if self.now_func() - timestamp >= self.ttl_seconds:
                self._items.pop(key, None)
                return None
            self._items.move_to_end(key)
            return value

    def set(self, key, value):
        with self._lock:
            self._cleanup_expired()
            self._items[key] = (self.now_func(), value)
            self._items.move_to_end(key)
            while len(self._items) > self.max_entries:
                self._items.popitem(last=False)

    def clear(self):
        with self._lock:
            self._items.clear()

    def _cleanup_expired(self):
        now = self.now_func()
        expired = [
            key for key, (timestamp, _value) in self._items.items()
            if now - timestamp >= self.ttl_seconds
        ]
        for key in expired:
            self._items.pop(key, None)


live_cache = BoundedTTLCache(BUSYNESS_CACHE_MAX_ENTRIES, LIVE_CACHE_TTL_SECONDS)
forecast_cache = BoundedTTLCache(BUSYNESS_CACHE_MAX_ENTRIES, FORECAST_CACHE_TTL_SECONDS)


def _prediction_key(zone_name, zone_names):
    """Map a model zone name to an API prediction dict key.

    Uses the numeric LocationID prefix (e.g. ``100`` from ``100 NET``) when
    prefixes are unique across the artifact set. Falls back to the full zone
    name when a prefix collision would silently overwrite another zone.
    """
    prefix = zone_name.split()[0]
    prefixes = [name.split()[0] for name in zone_names]
    if prefixes.count(prefix) > 1:
        return zone_name
    return prefix


def normalize_predictions(predictions):
    if not predictions:
        return {}
    zone_names = list(predictions.keys())
    valid_scores = [score for score in predictions.values() if score is not None]
    if not valid_scores:
        return {
            _prediction_key(zone, zone_names): 0.0 for zone in zone_names
        }

    min_score = min(valid_scores)
    max_score = max(valid_scores)
    score_range = max_score - min_score
    normalized_predictions = {}
    for zone_name, busyness_score in predictions.items():
        location_id = _prediction_key(zone_name, zone_names)
        if busyness_score is None:
            normalized_predictions[location_id] = 0.0
        elif score_range > 0:
            normalized_predictions[location_id] = (busyness_score - min_score) / score_range
        else:
            normalized_predictions[location_id] = 0.5
    return normalized_predictions


def _cache_bucket(now):
    timestamp = time.time() if now is None else now
    return int(timestamp // CACHE_BUCKET_SECONDS)


def build_cache_key(lat, lon, now=None):
    return (
        round(float(lat), CACHE_COORDINATE_PRECISION),
        round(float(lon), CACHE_COORDINATE_PRECISION),
        _cache_bucket(now),
    )


def build_live_cache_key(lat, lon, now=None):
    return build_cache_key(lat, lon, now)


def build_forecast_cache_key(lat, lon, now=None):
    return build_cache_key(lat, lon, now)


def get_live_predictions(lat, lon, now=None):
    key = build_live_cache_key(lat, lon, now)
    cached = live_cache.get(key)
    if cached is not None:
        return cached, True
    raw_predictions = predict_busyness_for_all_zones(lat, lon)
    normalized = normalize_predictions(raw_predictions)
    live_cache.set(key, normalized)
    return normalized, False


def get_forecast_predictions(lat, lon, now=None):
    key = build_forecast_cache_key(lat, lon, now)
    cached = forecast_cache.get(key)
    if cached is not None:
        return cached, True
    forecast = forecast_busyness_for_all_zones(lat, lon)
    forecast_cache.set(key, forecast)
    return forecast, False


def build_busyness_response(lat, lon, now=None):
    predictions, live_cached = get_live_predictions(lat, lon, now)
    forecast, forecast_cached = get_forecast_predictions(lat, lon, now)
    return {
        "success": True,
        "predictions": predictions,
        "forecast": forecast,
        "cached": live_cached and forecast_cached,
    }

@app.route("/health")
def health():
    """
    Health check endpoint.
    Returns 200 if initialized, 503 otherwise.
    This is used by Docker's healthcheck.
    """
    if initialized:
        return jsonify({
            "status": "healthy",
            "success": True,
            "models_loaded": {
                "dnn": len(dnn_models),
                "lstm": 1 if busyness_module and busyness_module.final_lstm_model is not None else 0
            }
        }), 200
    else:
        if initialization_error:
            logger.warning("Health check failed during initialization: %s", initialization_error)
        return jsonify({
            "status": "unhealthy",
            "success": False,
            "error": "Service is initializing."
        }), 503

@app.route("/busyness", methods=['GET'])
def get_busyness():
    """
    Returns busyness predictions for all zones.
    Accepts optional 'lat' and 'lon' query parameters.
    """
    if not initialized:
        return jsonify({
            "success": False, 
            "error": "Service is not ready. Please try again later."
        }), 503

    lat = request.args.get('lat', default=40.7580, type=float)
    lon = request.args.get('lon', default=-73.9855, type=float)
    cache_key = build_live_cache_key(lat, lon)

    with request_lock:
        existing = inflight_requests.get(cache_key)
        if existing is not None:
            logger.info("Waiting for existing request for cache key %s", cache_key)
            waiter_future = existing
        else:
            inflight_requests[cache_key] = concurrent.futures.Future()
            waiter_future = None

    if waiter_future is not None:
        try:
            return jsonify(waiter_future.result())
        except Exception as e:
            logger.error("Error waiting for existing request: %s", e)
            return jsonify({"success": False, "error": "Internal server error"}), 500

    try:
        logger.info(f"Received /busyness request for lat={lat}, lon={lon}")
        response = build_busyness_response(lat, lon)
        logger.info("Final busyness response generated; cached=%s", response["cached"])

        with request_lock:
            pending = inflight_requests.get(cache_key)
            if pending is not None:
                pending.set_result(response)

        return jsonify(response)

    except Exception as e:
        logger.error(f"Error in /busyness endpoint: {str(e)}", exc_info=True)

        with request_lock:
            pending = inflight_requests.get(cache_key)
            if pending is not None:
                pending.set_exception(e)

        return jsonify({"success": False, "error": "Internal server error"}), 500

    finally:
        with request_lock:
            inflight_requests.pop(cache_key, None)

def initialize_service():
    """Synchronously initialize the service by loading all models."""
    global initialized, initialization_error
    logger.info("Starting synchronous model initialization...")
    try:
        paths_ok, missing = verify_file_paths()
        if not paths_ok:
            initialization_error = f"Missing model paths: {missing}"
            logger.error("Service initialization failed: %s", initialization_error)
            return
        # The logic in busyness.py requires both DNNs and the final LSTM to be loaded.
        success = initialize_busyness_models()
        if success and len(dnn_models) > 0 and busyness_module and busyness_module.final_lstm_model is not None:
            initialized = True
            logger.info(f"✅ Service initialized successfully. Models loaded - DNN: {len(dnn_models)}, LSTM: 1")
        else:
            initialization_error = "Model loading function failed or loaded no models."
            logger.error("❌ Service initialization failed: %s", initialization_error)
    except Exception as e:
        initialization_error = "Initialization error during model loading"
        logger.error("Service initialization failed: %s", e, exc_info=True)

# Initialize the service when the module is imported
if __name__ == "__main__":
    initialize_service()
    app.run(host="0.0.0.0", port=5000, debug=False)
else:
    # Initialize when imported as a module (for Docker)
    initialize_service()
