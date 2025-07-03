import logging
import sys
import threading

from flask import Flask, jsonify, request
from flask_cors import CORS

from predictor.busyness import initialize_busyness_models, predict_busyness_for_all_zones

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Global state
initialized = False
initialization_error = None
initialization_lock = threading.Lock()

def initialize_service():
    """Initialize the busyness prediction models."""
    global initialized, initialization_error
    with initialization_lock:
        if initialized:
            return
        logger.info("Starting busyness service initialization...")
        try:
            if not initialize_busyness_models():
                initialization_error = "Failed to load busyness models"
                logger.error(initialization_error)
            else:
                initialized = True
                logger.info("Busyness service initialization complete.")
        except Exception as e:
            initialization_error = f"An unexpected error occurred: {str(e)}"
            logger.error(initialization_error, exc_info=True)

@app.route("/health")
def health():
    """Health check endpoint."""
    if initialized:
        return jsonify({"status": "healthy", "success": True}), 200
    else:
        return jsonify({
            "status": "unhealthy",
            "success": False,
            "error": initialization_error or "Service is initializing"
        }), 503

@app.route('/busyness', methods=['GET'])
def predict_busyness():
    """Endpoint to predict busyness for all zones."""
    if not initialized:
        return jsonify({'success': False, 'error': 'Service not initialized'}), 503

    try:
        lat = request.args.get('lat', default=40.785091, type=float)
        lon = request.args.get('lon', default=-73.968285, type=float)
        busyness_predictions = predict_busyness_for_all_zones(lat, lon)
        return jsonify({'success': True, 'predictions': busyness_predictions})
    except Exception as e:
        logger.error(f"Error in /busyness: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Internal server error'}), 500

# Start initialization in a background thread
init_thread = threading.Thread(target=initialize_service)
init_thread.daemon = True
init_thread.start()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
