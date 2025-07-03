import numpy as np
import pandas as pd
import torch
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer, util
import os
import logging
import time
import threading
from typing import Optional
import sys

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

# Global variables
model: Optional[SentenceTransformer] = None
df: Optional[pd.DataFrame] = None
location_embeddings: Optional[torch.Tensor] = None
initialized = False
initialization_error = None
initialization_lock = threading.Lock()

def verify_file_paths():
    """Verify that all required files exist before attempting to load them"""
    model_path = os.getenv('MODEL_PATH', '/app/models/sentence-transformer')
    data_path = os.getenv('DATA_PATH', '/app/data/locations.csv')
    embeddings_path = os.getenv('EMBEDDINGS_PATH', '/app/data/location_embeddings.npy')
    
    missing_files = []
    
    if not os.path.exists(model_path):
        missing_files.append(f"Model path: {model_path}")
    if not os.path.exists(data_path):
        missing_files.append(f"Data path: {data_path}")
    if not os.path.exists(embeddings_path):
        missing_files.append(f"Embeddings path: {embeddings_path}")
    
    if missing_files:
        logger.error("Missing required files:")
        for missing in missing_files:
            logger.error(f"  - {missing}")
        return False, missing_files
    
    logger.info("All required files found")
    return True, []

def load_model():
    """Load the sentence transformer model"""
    global model
    try:
        model_path = os.getenv('MODEL_PATH', '/app/models/sentence-transformer')
        logger.info(f"Loading model from {model_path}")
        
        # Force CPU usage to avoid GPU-related issues in containers
        model = SentenceTransformer(model_path, device='cpu')
        logger.info("Model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Model loading failed: {str(e)}", exc_info=True)
        return False

def load_data():
    """Load the locations data and embeddings"""
    global df, location_embeddings
    try:
        data_path = os.getenv('DATA_PATH', '/app/data/locations.csv')
        embeddings_path = os.getenv('EMBEDDINGS_PATH', '/app/data/location_embeddings.npy')

        logger.info(f"Loading data from {data_path}")
        df = pd.read_csv(data_path)
        logger.info(f"Data loaded successfully. Shape: {df.shape}")

        logger.info(f"Loading embeddings from {embeddings_path}")
        embeddings_np = np.load(embeddings_path)
        location_embeddings = torch.tensor(embeddings_np)
        logger.info(f"Embeddings loaded successfully. Shape: {location_embeddings.shape}")

        return True
    except Exception as e:
        logger.error(f"Failed to load data: {str(e)}", exc_info=True)
        return False

def initialize_service():
    """Initialize the ML service with proper error handling"""
    global initialized, initialization_error
    
    with initialization_lock:
        if initialized:
            return True
            
        logger.info("Starting service initialization...")
        initialization_error = None
        
        try:
            # First verify all files exist
            files_ok, missing_files = verify_file_paths()
            if not files_ok:
                initialization_error = f"Missing files: {', '.join(missing_files)}"
                logger.error(initialization_error)
                return False
            
            # Load model and data
            if not load_model():
                initialization_error = "Failed to load model"
                return False
                
            if not load_data():
                initialization_error = "Failed to load data"
                return False
            
            initialized = True
            logger.info("Service initialization complete")
            return True
            
        except Exception as e:
            initialization_error = f"Initialization failed: {str(e)}"
            logger.error(initialization_error, exc_info=True)
            return False

@app.route("/health")
def health():
    """Health check endpoint with detailed status"""
    try:
        if initialized:
            return jsonify({
                "status": "healthy", 
                "success": True,
                "model_loaded": model is not None,
                "data_loaded": df is not None,
                "embeddings_loaded": location_embeddings is not None,
                "data_shape": df.shape if df is not None else None,
                "embeddings_shape": list(location_embeddings.shape) if location_embeddings is not None else None
            }), 200
        else:
            return jsonify({
                "status": "unhealthy", 
                "success": False,
                "error": initialization_error or "Service not initialized",
                "model_loaded": model is not None,
                "data_loaded": df is not None,
                "embeddings_loaded": location_embeddings is not None
            }), 503
    except Exception as e:
        logger.error(f"Health check error: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "success": False,
            "error": str(e)
        }), 500

@app.route('/search', methods=['POST'])
def vibe_search():
    """Main search endpoint"""
    if not initialized:
        return jsonify({
            'success': False, 
            'error': 'Service not initialized',
            'details': initialization_error
        }), 503
    
    # Ensure all components are loaded
    if model is None or df is None or location_embeddings is None:
        return jsonify({
            'success': False,
            'error': 'Service components not properly loaded'
        }), 503

    if not request.is_json:
        return jsonify({
            'success': False, 
            'error': 'Content-Type must be application/json'
        }), 415

    try:
        data = request.get_json()
        logger.info(f"ML Service: Received /search request with payload: {data}")

        vibe_desc = data.get('vibeDescription', '').strip()
        max_results = data.get('maxResults', 10)
        location_filter = data.get('location', None)
        price_range = data.get('priceRange', None)

        if not vibe_desc:
            return jsonify({
                'success': False, 
                'error': 'vibeDescription is required'
            }), 400

        # Encode vibe description
        logger.info(f"Encoding query: {vibe_desc}")
        query_embedding = model.encode(vibe_desc, convert_to_tensor=True).cpu()
        similarities = util.cos_sim(query_embedding, location_embeddings)[0]
        similarity_scores = similarities.cpu().numpy()

        # Start with all data
        filtered_df = df.copy()

        # Apply location filter
        if location_filter:
            logger.info(f"Applying location filter: {location_filter}")
            filtered_df = filtered_df[
                filtered_df['zone'].str.contains(location_filter, case=False, na=False)
            ]

        # Apply price filter
        if price_range:
            logger.info(f"Applying price filter: {price_range}")
            price_map = {
                'budget': ['very cheap', 'cheap'],
                'mid': ['moderate', 'mid'],
                'luxury': ['expensive', 'luxury']
            }
            allowed_prices = price_map.get(price_range.lower(), None)
            if allowed_prices:
                price_pattern = '|'.join(allowed_prices)
                filtered_df = filtered_df[
                    filtered_df['price'].str.contains(price_pattern, case=False, na=False)
                ]

        # Get indices of filtered locations
        filtered_indices = filtered_df.index.tolist()
        logger.info(f"Filtered to {len(filtered_indices)} locations")

        if not filtered_indices:
            return jsonify({
                'success': True,
                'query': vibe_desc,
                'results': [],
                'explanation': "No locations found matching the specified filters.",
                'confidence': None
            })

        # Get similarity scores for filtered indices
        filtered_scores = [(idx, similarity_scores[idx]) for idx in filtered_indices]
        filtered_scores.sort(key=lambda x: float(x[1]), reverse=True)

        # Get top results
        top_results = filtered_scores[:max_results]

        # Build response
        results = []
        for idx, score in top_results:
            loc = df.iloc[idx]

            # Map price string to integer
            price_str = str(loc.get('price', 'moderate')).lower()
            price_int = 1  # Default to budget
            if 'moderate' in price_str or 'mid' in price_str:
                price_int = 2
            elif 'expensive' in price_str or 'luxury' in price_str:
                price_int = 3

            results.append({
                'id': int(idx),
                'name': str(loc['name']),
                'address': str(loc['addr']),
                'type': str(loc['loc_type']),
                'description': str(loc['description']),
                'similarity': float(score),
                'price': price_int,
                'latitude': float(loc['lat']),
                'longitude': float(loc['long']),
                'uri': str(loc.get('uri', '')),
                'reviews': str(loc.get('reviews', '')),
                'num_reviews': int(loc.get('num_reviews', 0))
            })

        response = {
            'success': True,
            'query': vibe_desc,
            'results': results,
            'explanation': f"Found {len(results)} locations matching your vibe and filters.",
            'confidence': None
        }

        logger.info(f"ML Service: Returning {len(results)} results for query '{vibe_desc}'")
        return jsonify(response)

    except Exception as e:
        logger.error(f"ML Service: Error in /search: {str(e)}", exc_info=True)
        return jsonify({
            'success': False, 
            'error': 'Internal server error', 
            'message': str(e)
        }), 500

@app.errorhandler(Exception)
def handle_exception(e):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# Initialize service when module is loaded
logger.info("Attempting to initialize ML service...")
initialization_success = initialize_service()

if not initialization_success:
    logger.error(f"Service initialization failed: {initialization_error}")
    # Don't exit - let the container start so we can debug via health endpoint

if __name__ == '__main__':
    # Development server
    logger.info("Running Flask development server...")
    app.run(host='0.0.0.0', port=5000, debug=False)