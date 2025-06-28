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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

model: Optional[SentenceTransformer] = None
df: Optional[pd.DataFrame] = None
location_embeddings: Optional[torch.Tensor] = None
initialized = False
initialization_lock = threading.Lock()

def load_model():
    global model
    try:
        model_path = os.getenv('MODEL_PATH', '/app/models/sentence-transformer')
        logger.info(f"Loading model from {model_path}")

        model = SentenceTransformer(model_path, device='cpu')
        logger.info("Model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Model loading failed: {str(e)}", exc_info=True)
        return False

def load_data():
    global df, location_embeddings
    try:
        data_path = os.getenv('DATA_PATH', '/app/data/locations.csv')
        embeddings_path = os.getenv('EMBEDDINGS_PATH', '/app/data/location_embeddings.npy')

        logger.info(f"Loading data from {data_path}")
        df = pd.read_csv(data_path)

        logger.info(f"Loading embeddings from {embeddings_path}")
        location_embeddings = torch.tensor(np.load(embeddings_path))

        logger.info("Data and embeddings loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to load data: {str(e)}", exc_info=True)
        return False

def initialize_service():
    global initialized
    
    with initialization_lock:
        if initialized:
            return True
            
        logger.info("Starting service initialization...")
        max_retries = 3
        retry_delay = 5
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Initialization attempt {attempt + 1}/{max_retries}")
                if load_model() and load_data():
                    initialized = True
                    logger.info("Service initialization complete")
                    return True
            except Exception as e:
                logger.error(f"Initialization failed: {str(e)}", exc_info=True)
            
            if attempt < max_retries - 1:
                logger.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
        
        logger.critical("Service failed to initialize after multiple attempts")
        return False

def ensure_initialized():
    """Ensure service is initialized before handling requests"""
    if not initialized:
        logger.info("Service not initialized, attempting initialization...")
        if not initialize_service():
            return False
    return True

@app.route("/health")
def health():
    if ensure_initialized():
        return jsonify({"status": "healthy", "success": True}), 200
    else:
        return jsonify({"status": "initializing", "success": False}), 503

@app.route('/search', methods=['POST'])
def vibe_search():
    if not ensure_initialized():
        return jsonify({
            'success': False, 
            'error': 'Service initializing, try again later'
        }), 503
    
    # Assertions to help static analysis
    assert model is not None, "Model should be loaded if service is initialized"
    assert df is not None, "DataFrame should be loaded if service is initialized"
    assert location_embeddings is not None, "Location embeddings should be loaded if service is initialized"

    if not request.is_json:
        return jsonify({'success': False, 'error': 'Content-Type must be application/json'}), 415

    try:
        data = request.get_json()
        logger.info(f"ML Service: Received /search request with payload: {data}")

        vibe_desc = data.get('vibeDescription', '').strip()
        max_results = data.get('maxResults', 10)
        location_filter = data.get('location', None)
        price_range = data.get('priceRange', None)
        time_of_day = data.get('timeOfDay', None)

        if not vibe_desc:
            return jsonify({'success': False, 'error': 'vibeDescription is required'}), 400

        # Encode vibe description
        query_embedding = model.encode(vibe_desc, convert_to_tensor=True).cpu()
        similarities = util.cos_sim(query_embedding, location_embeddings)[0]
        similarity_scores = similarities.cpu().numpy()

        # Filter by location if provided
        filtered_df = df
        if location_filter:
            filtered_df = filtered_df[filtered_df['zone'].str.contains(location_filter, case=False, na=False)]

        # Filter by priceRange (example logic)
        if price_range:
            price_map = {
                'budget': ['very cheap', 'cheap'],
                'mid': ['moderate', 'mid'],
                'luxury': ['expensive', 'luxury']
            }
            allowed_prices = price_map.get(price_range.lower(), None)
            if allowed_prices:
                filtered_df = filtered_df[filtered_df['price'].str.contains('|'.join(allowed_prices), case=False, na=False)]

        # Get indices of filtered locations
        filtered_indices = filtered_df.index.tolist()

        # Get similarity scores only for filtered indices
        filtered_scores = [(idx, similarity_scores[idx]) for idx in filtered_indices]
        filtered_scores.sort(key=lambda x: float(x[1]), reverse=True)

        # Pick top max_results
        top_results = filtered_scores[:max_results]

        results = []
        for idx, score in top_results:
            loc = df.iloc[idx]

            # Map string price to an integer that matches the database schema
            price_str = str(loc.get('price', 'moderate')).lower()
            price_int = 1  # Default to budget (1)
            if 'moderate' in price_str or 'mid' in price_str:
                price_int = 2
            elif 'expensive' in price_str or 'luxury' in price_str:
                price_int = 3

            # Use the dataframe index as the location ID since there's no 'id' column
            location_id = int(idx)

            results.append({
                'id': location_id,
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
            'explanation': f"Returned top {len(results)} locations matching vibe and filters.",
            'confidence': None
        }

        logger.info(f"ML Service: Returning {len(results)} results for query '{vibe_desc}'")
        return jsonify(response)

    except Exception as e:
        logger.error(f"ML Service: Error in /search: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Internal server error', 'message': str(e)}), 500

# For direct Python execution (development)
if __name__ == '__main__':
    logger.info("Starting service initialization for development...")
    if initialize_service():
        logger.info("Running Flask development server...")
        app.run(host='0.0.0.0', port=5000, debug=True)
    else:
        logger.critical("Failed to initialize service")
        exit(1)