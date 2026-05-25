import numpy as np
import pandas as pd
import torch
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer, util
import os
from pathlib import Path
import logging
import time
import threading
from typing import Optional
import sys
import requests
import hashlib
import pickle

# Anchor: BackEnd/llm-service/ from app.py (D-10)
_LLM_SERVICE_DIR = Path(__file__).parent.resolve()

# Helper function for safe type conversion
def _safe_to_int(value, default=0):
    """Safely convert a value to an integer, handling pandas/numpy NaN."""
    if pd.isna(value):
        return default
    try:
        # Convert to float first to handle string representations of floats
        return int(float(value))
    except (ValueError, TypeError):
        return default

# Global constant for price mapping
PRICE_MAP = {
    'very cheap': 1, 'cheap': 2, 'moderate': 3, 'mid': 3,
    'expensive': 4, 'very expensive': 5, 'luxury': 5
}

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

# Enhanced cache for search results with better key generation
search_cache = {}
SEARCH_CACHE_DURATION = 300  # 5 minutes
MAX_CACHE_SIZE = 1000  # Maximum number of cached results

def generate_cache_key(vibe_desc, max_results, location_filter=None, price_range=None):
    """Generate a unique cache key for search parameters"""
    key_parts = [
        vibe_desc.lower().strip(),
        str(max_results),
        str(location_filter).lower() if location_filter else '',
        str(price_range).lower() if price_range else ''
    ]
    key_string = '|'.join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()

def cleanup_cache():
    """Remove expired entries from cache"""
    current_time = time.time()
    expired_keys = [
        key for key, value in search_cache.items()
        if current_time - value['timestamp'] > SEARCH_CACHE_DURATION
    ]
    for key in expired_keys:
        del search_cache[key]
    
    # If cache is still too large, remove oldest entries
    if len(search_cache) > MAX_CACHE_SIZE:
        sorted_items = sorted(search_cache.items(), key=lambda x: x[1]['timestamp'])
        for key, _ in sorted_items[:len(sorted_items) - MAX_CACHE_SIZE]:
            del search_cache[key]

def verify_file_paths():
    """Verify that all required files exist before attempting to load them"""
    model_path = os.getenv('MODEL_PATH', str(_LLM_SERVICE_DIR / 'models' / 'sentence-transformers'))
    data_path = os.getenv('DATA_PATH', str(_LLM_SERVICE_DIR / 'data' / 'locations.csv'))
    embeddings_path = os.getenv('EMBEDDINGS_PATH', str(_LLM_SERVICE_DIR / 'data' / 'location_embeddings.npy'))
    
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
        model_path = os.getenv('MODEL_PATH', str(_LLM_SERVICE_DIR / 'models' / 'sentence-transformers'))
        logger.info(f"Loading model from {model_path}")
        
        # Check if model files exist
        config_path = os.path.join(model_path, 'config.json')
        if not os.path.exists(config_path):
            logger.error(f"Model config.json not found at {config_path}")
            return False
        
        # Force CPU usage to avoid GPU-related issues in containers
        model = SentenceTransformer(model_path, device='cpu')
        logger.info("Model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Model loading failed: {str(e)}", exc_info=True)
        
        # Try to load from HuggingFace as fallback
        try:
            logger.info("Attempting to load fallback model from HuggingFace...")
            model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
            logger.warning("Loaded fallback model from HuggingFace")
            return True
        except Exception as fallback_e:
            logger.error(f"Fallback model loading also failed: {str(fallback_e)}")
            return False

def load_data():
    """Load location data and pre-computed embeddings"""
    global df, location_embeddings
    try:
        data_path = os.getenv('DATA_PATH', str(_LLM_SERVICE_DIR / 'data' / 'locations.csv'))
        embeddings_path = os.getenv('EMBEDDINGS_PATH', str(_LLM_SERVICE_DIR / 'data' / 'location_embeddings.npy'))
        
        logger.info(f"Loading data from {data_path}")
        df = pd.read_csv(data_path)
        logger.info(f"Loaded {len(df)} locations")
        
        logger.info(f"Loading embeddings from {embeddings_path}")
        location_embeddings = np.load(embeddings_path)
        location_embeddings = torch.tensor(location_embeddings, dtype=torch.float32)
        logger.info(f"Loaded embeddings with shape {location_embeddings.shape}")
        
        return True
    except Exception as e:
        logger.error(f"Data loading failed: {str(e)}", exc_info=True)
        return False

def initialize_service():
    """Initialize the ML service with model and data"""
    global initialized, initialization_error
    
    with initialization_lock:
        if initialized:
            return True
            
        logger.info("Starting service initialization...")
        
        # Verify files first
        files_ok, missing_files = verify_file_paths()
        if not files_ok:
            initialization_error = f"Missing files: {missing_files}"
            return False
        
        # Load model and data
        model_ok = load_model()
        data_ok = load_data()
        
        if model_ok and data_ok:
            initialized = True
            logger.info("Service initialization completed successfully")
            return True
        else:
            initialization_error = "Failed to load model or data"
            return False

@app.route("/health")
def health():
    """Health check endpoint"""
    if not initialized:
        return jsonify({
            'status': 'unhealthy',
            'initialized': False,
            'error': initialization_error
        }), 503
    
    # Check if all components are loaded
    if model is None or df is None or location_embeddings is None:
        return jsonify({
            'status': 'unhealthy',
            'initialized': False,
            'error': 'Service components not properly loaded'
        }), 503
    
    return jsonify({
        'status': 'healthy',
        'initialized': True,
        'model_loaded': model is not None,
        'data_loaded': df is not None,
        'embeddings_loaded': location_embeddings is not None,
        'total_locations': len(df) if df is not None else 0
    })

def _create_location_dto(loc_series, similarity_score=None):
    """Create a location DTO from a pandas series"""
    return {
        'id': _safe_to_int(loc_series.get('id', 0)),
        'name': str(loc_series.get('name', '')),
        'address': str(loc_series.get('address', '')),
        'latitude': float(loc_series.get('latitude', 0)),
        'longitude': float(loc_series.get('longitude', 0)),
        'type': str(loc_series.get('type', '')),
        'price': str(loc_series.get('price', '')),
        'rating': float(loc_series.get('rating', 0)),
        'zone': str(loc_series.get('zone', '')),
        'zoneId': _safe_to_int(loc_series.get('zoneId', 0)),
        'similarity': float(similarity_score) if similarity_score is not None else None
    }

@app.route('/locations/all', methods=['GET'])
def get_all_locations():
    """Get all locations (for debugging)"""
    if not initialized:
        return jsonify({'error': 'Service not initialized'}), 503
    
    locations = [df.iloc[i].to_dict() for i in range(len(df))]
    return jsonify({'locations': locations})

@app.route('/search', methods=['POST'])
def vibe_search():
    """Main search endpoint with enhanced caching"""
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

        # --- Enhanced Caching Logic ---
        cache_key = generate_cache_key(vibe_desc, max_results, location_filter, price_range)
        
        # Clean up expired cache entries
        cleanup_cache()
        
        # Check cache
        if cache_key in search_cache:
            cached_result = search_cache[cache_key]
            if time.time() - cached_result['timestamp'] < SEARCH_CACHE_DURATION:
                logger.info(f"Returning cached result for query: '{vibe_desc}'")
                return jsonify(cached_result['response'])

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
            response = {
                'success': True,
                'query': vibe_desc,
                'results': [],
                'explanation': "No locations found matching the specified filters.",
                'confidence': None
            }
            
            # Cache empty results too
            search_cache[cache_key] = {
                'timestamp': time.time(),
                'response': response
            }
            
            return jsonify(response)

        # Get similarity scores for filtered indices
        filtered_scores = [(idx, similarity_scores[idx]) for idx in filtered_indices]
        filtered_scores.sort(key=lambda x: float(x[1]), reverse=True)

        # Get top results
        top_results = filtered_scores[:max_results]

        # Build response
        results = []
        for idx, score in top_results:
            loc = df.iloc[idx]
            results.append(_create_location_dto(loc, score))

        # Determine confidence score from the top result's similarity score
        confidence_score = float(top_results[0][1]) if top_results else 0.0

        response = {
            'success': True,
            'query': vibe_desc,
            'results': results,
            'explanation': f"Found {len(results)} locations matching your vibe and filters.",
            'confidence': confidence_score
        }

        # --- Cache Update ---
        search_cache[cache_key] = {
            'timestamp': time.time(),
            'response': response
        }

        logger.info(f"ML Service: Returning {len(results)} results for query '{vibe_desc}' (cached)")
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

# --- Chatbot Logic (Merged) ---

CHAT_API_URL = "https://router.huggingface.co/together/v1/chat/completions"
HF_HEADERS = {
    "Authorization": f"Bearer {os.environ.get('HF_TOKEN')}",
}

def huggingface_chat_api_call(messages, model="meta-llama/Llama-3.2-3B-Instruct-Turbo"):
    """Make a call to the Hugging Face chat completions API"""
    token = os.environ.get('HF_TOKEN')
    if not token or token == "your-hugging-face-api-token":
        logger.error("CRITICAL: HF_TOKEN environment variable is not set or is using a placeholder value.")
        raise ValueError("Hugging Face API token is missing or invalid.")

    logger.info("Making request to Hugging Face API...")
    payload = {"messages": messages, "model": model, "max_tokens": 400, "temperature": 0.4, "top_p": 0.9}
    
    try:
        # Add a 30-second timeout to prevent indefinite hanging
        response = requests.post(CHAT_API_URL, headers=HF_HEADERS, json=payload, timeout=30)
        response.raise_for_status()
        logger.info("Successfully received response from Hugging Face API.")
        return response.json()
    except requests.exceptions.Timeout:
        logger.error("Request to Hugging Face API timed out.")
        raise
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling Hugging Face API: {e}")
        if e.response is not None:
            logger.error(f"Response status: {e.response.status_code}, Body: {e.response.text}")
        raise

def most_similar_locs_for_chat(query):
    """
    Finds the top 5 most similar locations by calling the core ML logic directly.
    This is a simplified, internal version of the main /search endpoint.
    """
    global model, df, location_embeddings
    if not initialized or model is None or df is None or location_embeddings is None:
        return "Location search is not available at the moment."

    try:
        query_embedding = model.encode(query, convert_to_tensor=True).cpu()
        similarities = util.cos_sim(query_embedding, location_embeddings)[0]
        
        top_results = torch.topk(similarities, k=5)
        
        loc_info_parts = []
        for _, idx in zip(top_results.values, top_results.indices):
            loc = df.iloc[idx.item()]
            loc_info_parts.append(f"- {loc['name']} ({loc['zone']}): {loc['type']}")
        
        return "Here are some similar locations:\n" + "\n".join(loc_info_parts)
    except Exception as e:
        logger.error(f"Error in most_similar_locs_for_chat: {e}")
        return "I'm having trouble finding similar locations right now."

def get_ai_response(query, previous_questions):
    """Get AI response using Hugging Face API"""
    try:
        # Build context from previous questions and current query
        context_parts = []
        if previous_questions:
            context_parts.append("Previous conversation:")
            for q in previous_questions[-3:]:  # Last 3 questions for context
                context_parts.append(f"- User: {q}")
        
        context_parts.append(f"Current query: {query}")
        
        # Get similar locations for context
        similar_locs = most_similar_locs_for_chat(query)
        
        messages = [
            {"role": "system", "content": f"You are a helpful AI assistant for a Manhattan nightlife app. You have access to information about venues in Manhattan. Here's what you know about similar locations:\n{similar_locs}\n\nProvide helpful, concise responses about Manhattan nightlife and venues."},
            {"role": "user", "content": "\n".join(context_parts)}
        ]
        
        response = huggingface_chat_api_call(messages)
        return response['choices'][0]['message']['content']
    except Exception as e:
        logger.error(f"Error getting AI response: {e}")
        return "I'm having trouble processing your request right now. Please try again later."

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """Chat endpoint for AI interactions"""
    if not request.is_json:
        return jsonify({'error': 'Content-Type must be application/json'}), 415
    
    try:
        data = request.get_json()
        query = data.get('message', '').strip()
        previous_questions = data.get('previous_questions', [])
        
        if not query:
            return jsonify({'error': 'Message is required'}), 400
        
        response = get_ai_response(query, previous_questions)
        return jsonify({'response': response})
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Development server
    logger.info("Running Flask development server...")
    app.run(host='0.0.0.0', port=5000, debug=False)
