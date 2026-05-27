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
import hashlib
import jwt
from chat_service import get_ai_response as _chat_get_ai_response
from jwt import InvalidTokenError

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

def _parse_allowed_origins():
    configured = os.getenv("FLASK_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]

CORS(app, origins=_parse_allowed_origins(), supports_credentials=False)

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
        missing_files.append("MODEL_PATH")
    if not os.path.exists(data_path):
        missing_files.append("DATA_PATH")
    if not os.path.exists(embeddings_path):
        missing_files.append("EMBEDDINGS_PATH")
    
    if missing_files:
        logger.error("Missing required files:")
        for missing in missing_files:
            logger.error("  - %s", missing)
        logger.debug(
            "Resolved paths: MODEL_PATH=%s DATA_PATH=%s EMBEDDINGS_PATH=%s",
            model_path,
            data_path,
            embeddings_path,
        )
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


def find_similar_by_embedding(query_text, exclude_names=None, limit=5, candidate_indices=None):
    """Find top similar locations by cosine similarity on precomputed embeddings."""
    exclude_names = exclude_names or []
    exclude_lower = {str(n).lower().strip() for n in exclude_names if n}

    query_embedding = model.encode(query_text, convert_to_tensor=True).cpu()
    similarities = util.cos_sim(query_embedding, location_embeddings)[0]
    similarity_scores = similarities.cpu().numpy()

    if candidate_indices is not None:
        scored = [(idx, similarity_scores[idx]) for idx in candidate_indices]
        scored.sort(key=lambda x: float(x[1]), reverse=True)
        iter_pairs = scored
    else:
        k = min(len(df), max(limit + len(exclude_lower), limit * 2))
        top_results = torch.topk(similarities, k=k)
        iter_pairs = [
            (idx.item(), val.item())
            for val, idx in zip(top_results.values, top_results.indices)
        ]

    results = []
    for idx, score in iter_pairs:
        if len(results) >= limit:
            break
        loc = df.iloc[idx]
        name = str(loc.get('name', ''))
        if name.lower() in exclude_lower:
            continue
        results.append(_create_location_dto(loc, score))

    confidence = float(results[0]['similarity']) if results else 0.0
    return results, confidence

if os.environ.get('FLASK_ENV') == 'development':
    @app.route('/locations/all', methods=['GET'])
    def get_all_locations():
        """Get all locations (for debugging; development only)"""
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
        try:
            max_results = int(max_results)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'maxResults must be an integer'}), 400
        max_results = max(1, min(max_results, 25))
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

        logger.info(f"Encoding query: {vibe_desc}")
        results, confidence_score = find_similar_by_embedding(
            vibe_desc,
            limit=max_results,
            candidate_indices=filtered_indices,
        )

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
            'error': 'Internal server error'
        }), 500

@app.route('/similar', methods=['POST'])
def similar_locations():
    """Find locations similar to a venue by name, zone, and type attributes."""
    if not initialized:
        return jsonify({
            'success': False,
            'error': 'Service not initialized',
            'details': initialization_error
        }), 503

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
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({
                'success': False,
                'error': 'name is required'
            }), 400

        zone = (data.get('zone') or '').strip()
        loc_type = (data.get('loc_type') or '').strip()
        summary = (data.get('summary') or '').strip()
        tags = data.get('tags')

        limit = data.get('limit', 5)
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': 'limit must be an integer'}), 400
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
                query_parts.extend(str(t).strip() for t in tags if t)
            elif isinstance(tags, str) and tags.strip():
                query_parts.append(tags.strip())

        query_text = ' '.join(query_parts)
        results, confidence = find_similar_by_embedding(
            query_text,
            exclude_names=[name],
            limit=limit,
        )

        return jsonify({
            'success': True,
            'results': results,
            'confidence': confidence,
        })

    except Exception as e:
        logger.error(f"ML Service: Error in /similar: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error'
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

# --- Chatbot Logic ---

def _chat_search_helper(query, limit=5):
    """Return top similar locations as formatted chat retrieval context."""
    if not initialized or model is None or df is None or location_embeddings is None:
        return "Location search is not available at the moment."

    try:
        query_embedding = model.encode(query, convert_to_tensor=True).cpu()
        similarities = util.cos_sim(query_embedding, location_embeddings)[0]
        top_results = torch.topk(similarities, k=limit)

        loc_info_parts = []
        for _, idx in zip(top_results.values, top_results.indices):
            loc = df.iloc[idx.item()]
            loc_type = loc.get("loc_type", "") if hasattr(loc, "get") else loc["loc_type"]
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

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """Chat endpoint for AI interactions"""
    auth_error = validate_chat_jwt()
    if auth_error is not None:
        return auth_error

    if not request.is_json:
        return jsonify({'error': 'Content-Type must be application/json'}), 415
    
    try:
        data = request.get_json()
        query = data.get('message', '').strip()
        previous_questions = data.get('previous_questions', [])
        if not isinstance(previous_questions, list):
            previous_questions = []
        previous_questions = [str(q) for q in previous_questions if q][-3:]
        
        if not query:
            return jsonify({'error': 'Message is required'}), 400
        
        response = get_ai_response(query, previous_questions)
        return jsonify({'response': response})
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return jsonify({'error': 'Internal server error'}), 500

def validate_chat_jwt():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return chat_auth_error()

    token = auth_header[len("Bearer "):].strip()
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
    return jsonify({
        "error": "Authentication required",
        "message": "Authentication required",
        "status": 401,
        "code": "AUTHENTICATION_REQUIRED"
    }), 401

if __name__ == '__main__':
    # Development server
    logger.info("Running Flask development server...")
    app.run(host='0.0.0.0', port=5000, debug=False)
