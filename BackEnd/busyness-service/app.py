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
        dnn_models,
        calculate_busyness
    )
    from predictor import busyness as busyness_module
    from datetime import datetime, timedelta
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
cache = None

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
    Returns live and forecast busyness predictions for all zones.
    """
    if not initialized:
        return jsonify({
            "success": False, 
            "error": "Service is not ready. Please try again later.",
            "details": initialization_error 
        }), 503

    global cache
    if cache is not None:
        logger.info("Returning cached busyness predictions.")
        return jsonify(cache)

    try:
        # Get both live and forecast predictions for all zones
        zone_data = calculate_busyness()  # {zone: [v1, v2, ..., v12]}

        now = datetime.now()
        live_busyness = {}
        predictions = {}

        for zone, values in zone_data.items():
            if not values:
                continue
            live_busyness[zone] = float(values[0])  # first value is 'live'
            predictions[zone] = [
                {"timestamp": (now + timedelta(hours=i)).isoformat(), "busyness": float(val)}
                for i, val in enumerate(values)
            ]

        cache = {
            "success": True,
            "live_busyness": live_busyness,
            "predictions": predictions
        }
        return jsonify(cache)

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