import logging
import sys
import time
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading

# Import and inspect the predictor module
try:
    from predictor.busyness import (
        initialize_busyness_models,
        predict_busyness_for_all_zones,
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
    def predict_busyness_for_all_zones(lat, lon) -> dict:
        return {}

# Configure logging with more detailed output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("app")

app = Flask(__name__)
CORS(app)

# Global state with improved caching
initialized = False
initialization_error = None
cache = None
cache_timestamp = None
cache_duration = 30 * 60  # 30 minutes cache duration
pending_request = None
request_lock = threading.Lock()

@app.route("/ping")
def ping():
    """
    Simple ping endpoint for basic connectivity testing.
    Always returns 200 if the service is running.
    """
    return jsonify({"status": "ok", "message": "pong"}), 200

@app.route("/health")
def health():
    """
    Health check endpoint.
    Returns 200 if initialized, 503 otherwise.
    This is used by Docker's healthcheck.
    """
    try:
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
            return jsonify({
                "status": "unhealthy",
                "success": False,
                "error": initialization_error or "Service is initializing."
            }), 503
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}", exc_info=True)
        return jsonify({
            "status": "unhealthy",
            "success": False,
            "error": f"Health check error: {str(e)}"
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
            "error": "Service is not ready. Please try again later.",
            "details": initialization_error 
        }), 503

    global cache, cache_timestamp, pending_request
    
    # Check if we have valid cached data
    current_time = time.time()
    if cache and cache_timestamp and (current_time - cache_timestamp) < cache_duration:
        logger.info("Returning cached busyness predictions (cache valid for %d more seconds)", 
                   cache_duration - (current_time - cache_timestamp))
        
        # Also return forecast (not cached for now)
        lat = request.args.get('lat', default=40.7580, type=float)
        lon = request.args.get('lon', default=-73.9855, type=float)
        from predictor.busyness import forecast_busyness_for_all_zones
        forecast = forecast_busyness_for_all_zones(lat, lon)
        logger.info("🔍 [DEBUG] Returning cached response with forecast: %s", forecast)
        return jsonify({"success": True, "predictions": cache, "forecast": forecast, "cached": True})

    # Check if there's already a pending request
    with request_lock:
        if pending_request:
            logger.info("Waiting for existing request to complete")
            try:
                result = pending_request.result()
                return jsonify(result)
            except Exception as e:
                logger.error("Error waiting for existing request: %s", e)
                pending_request = None
        
        # Create new request
        import concurrent.futures
        pending_request = concurrent.futures.Future()
    
    try:
        # Use provided lat/lon or default to a central Manhattan location (Times Square)
        lat = request.args.get('lat', default=40.7580, type=float)
        lon = request.args.get('lon', default=-73.9855, type=float)
        
        logger.info(f"Received /busyness request for lat={lat}, lon={lon}")
        predictions = predict_busyness_for_all_zones(lat, lon)
        logger.info("🔍 [DEBUG] Raw predictions from model: %s", predictions)

        # Normalize the raw scores to a 0-1 range for frontend display.
        valid_scores = [score for score in predictions.values() if score is not None]
        if not valid_scores:
            # If all scores are None, return a dict of zeros
            normalized_predictions = {zone.split()[0]: 0.0 for zone in predictions.keys()}
        else:
            min_score = min(valid_scores)
            max_score = max(valid_scores)
            score_range = max_score - min_score

            normalized_predictions = {}
            for zone_name, busyness_score in predictions.items():
                location_id = zone_name.split()[0]
                if busyness_score is None:
                    normalized_predictions[location_id] = 0.0
                elif score_range > 0:
                    # Apply Min-Max scaling to get a value between 0 and 1
                    normalized_score = (busyness_score - min_score) / score_range
                    normalized_predictions[location_id] = normalized_score
                else:
                    # All scores are the same, so they can be considered neutral (0.5)
                    normalized_predictions[location_id] = 0.5

        logger.info("🔍 [DEBUG] Normalized predictions: %s", normalized_predictions)

        # Update cache
        cache = normalized_predictions
        cache_timestamp = current_time
        logger.info("Busyness predictions generated and cached for %d seconds", cache_duration)

        # Also return forecast
        from predictor.busyness import forecast_busyness_for_all_zones
        forecast = forecast_busyness_for_all_zones(lat, lon)
        logger.info("🔍 [DEBUG] Generated forecast: %s", forecast)

        response = {
            "success": True,
            "predictions": normalized_predictions,
            "forecast": forecast,
            "cached": False
        }
        logger.info("🔍 [DEBUG] Final response: %s", response)
        
        # Set the result for any waiting requests
        with request_lock:
            if pending_request:
                pending_request.set_result(response)
                pending_request = None
        
        return jsonify(response)

    except Exception as e:
        logger.error(f"Error in /busyness endpoint: {str(e)}", exc_info=True)
        
        # Set the error for any waiting requests
        with request_lock:
            if pending_request:
                pending_request.set_exception(e)
                pending_request = None
        
        return jsonify({"success": False, "error": "Internal server error"}), 500

def initialize_service():
    """Synchronously initialize the service by loading all models."""
    global initialized, initialization_error
    logger.info("Starting synchronous model initialization...")
    try:
        # The logic in busyness.py requires both DNNs and the final LSTM to be loaded.
        success = initialize_busyness_models()
        if success and len(dnn_models) > 0 and busyness_module and busyness_module.final_lstm_model is not None:
            initialized = True
            logger.info(f"✅ Service initialized successfully. Models loaded - DNN: {len(dnn_models)}, LSTM: 1")
        else:
            initialization_error = "Model loading function failed or loaded no models."
            logger.error("❌ Service initialization failed: %s", initialization_error)
            # Don't set initialized to False here, let it remain False
    except Exception as e:
        initialization_error = f"Initialization error: {str(e)}"
        logger.error("❌ Service initialization failed: %s", initialization_error, exc_info=True)
        # Don't set initialized to False here, let it remain False
    
    # Log final status
    if initialized:
        logger.info("✅ Service is ready to handle requests")
    else:
        logger.error("❌ Service is not ready - initialization failed")

# Initialize the service when the module is imported
if __name__ == "__main__":
    initialize_service()
    app.run(host="0.0.0.0", port=5000, debug=False)
else:
    # Initialize when imported as a module (for Docker)
    initialize_service()