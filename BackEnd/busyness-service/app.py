import logging
import sys
import time
from flask import Flask, jsonify, request
from flask_cors import CORS

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

# Global state
initialized = False
initialization_error = None
cache = None # This will now be cached indefinitely after the first call

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
        return jsonify({
            "status": "unhealthy",
            "success": False,
            "error": initialization_error or "Service is initializing."
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

    global cache
    # Check cache first
    if cache:
        logger.info("Returning cached busyness predictions (cached indefinitely).")
        # Also return forecast (not cached for now)
        lat = request.args.get('lat', default=40.7580, type=float)
        lon = request.args.get('lon', default=-73.9855, type=float)
        from predictor.busyness import forecast_busyness_for_all_zones
        forecast = forecast_busyness_for_all_zones(lat, lon)
        return jsonify({"success": True, "predictions": cache, "forecast": forecast, "cached": True})

    try:
        # Use provided lat/lon or default to a central Manhattan location (Times Square)
        lat = request.args.get('lat', default=40.7580, type=float)
        lon = request.args.get('lon', default=-73.9855, type=float)
        
        logger.info(f"Received /busyness request for lat={lat}, lon={lon}")
        predictions = predict_busyness_for_all_zones(lat, lon)

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

        # Update cache
        cache = normalized_predictions
        logger.info("Busyness predictions generated and cached.")

        # Also return forecast
        from predictor.busyness import forecast_busyness_for_all_zones
        forecast = forecast_busyness_for_all_zones(lat, lon)

        return jsonify({
            "success": True,
            "predictions": normalized_predictions,
            "forecast": forecast,
            "cached": False
        })

    except Exception as e:
        logger.error(f"Error in /busyness endpoint: {str(e)}", exc_info=True)
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
            logger.error(f"❌ {initialization_error}")
    except Exception as e:
        initialization_error = f"An exception occurred during initialization: {str(e)}"
        logger.error(f"❌ {initialization_error}", exc_info=True)

# Initialize service when the module is loaded.
# This will run once in each Gunicorn worker process.
initialize_service()

# Start the Flask app
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)