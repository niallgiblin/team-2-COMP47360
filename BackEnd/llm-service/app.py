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
import requests

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

# Cache for search results
search_cache = {}
SEARCH_CACHE_DURATION = 300  # 5 minutes

def verify_file_paths():
    """Verify that all required files exist before attempting to load them"""
    model_path = os.getenv('MODEL_PATH', '/app/models/sentence-transformers')
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
        model_path = os.getenv('MODEL_PATH', '/app/models/sentence-transformers')
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
    """Load the locations data and embeddings"""
    global df, location_embeddings
    try:
        data_path = os.getenv('DATA_PATH', '/app/data/locations.csv')
        embeddings_path = os.getenv('EMBEDDINGS_PATH', '/app/data/location_embeddings.npy')

        logger.info(f"Loading raw data from {data_path}")
        df_raw = pd.read_csv(data_path)
        logger.info(f"Original data loaded. Shape: {df_raw.shape}")

        logger.info(f"Loading raw embeddings from {embeddings_path}")
        embeddings_raw = np.load(embeddings_path)
        logger.info(f"Original embeddings loaded. Shape: {embeddings_raw.shape}")

        # --- Data Validation and Filtering ---
        # Filter out any locations that do not have a valid zone.
        # This ensures we only work with Manhattan locations and prevents errors.
        initial_rows = len(df_raw)
        valid_indices = df_raw['zone'].notna() & (df_raw['zone'].str.strip() != '')
        
        num_removed = initial_rows - valid_indices.sum()
        if num_removed > 0:
            logger.warning(f"FILTERED: Removed {num_removed} locations with missing or empty zones.")

        # Apply the filter to both the DataFrame and the embeddings to keep them in sync
        df_filtered = df_raw[valid_indices].copy()
        embeddings_filtered = embeddings_raw[valid_indices]
        
        # Reset the DataFrame index to be sequential from 0, which is crucial for lookups
        df_filtered.reset_index(drop=True, inplace=True)
        
        df = df_filtered
        location_embeddings = torch.tensor(embeddings_filtered)
        logger.info(f"Data and embeddings successfully filtered. Final shape: {df.shape}")
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

            # --- Start of refactored validation block ---
            # Validate that all data components are loaded and consistent
            if df is None:
                initialization_error = "Dataframe (df) is None after loading."
                logger.error(initialization_error)
                return False
            
            if location_embeddings is None:
                initialization_error = "Embeddings tensor is None after loading."
                logger.error(initialization_error)
                return False

            if 'id' not in df.columns:
                error_msg = "CRITICAL: The 'locations.csv' file is missing the required 'id' column header."
                initialization_error = error_msg
                logger.error(error_msg)
                return False

            if len(df) != len(location_embeddings):
                error_msg = f"Data mismatch: locations.csv has {len(df)} rows, but embeddings file has {len(location_embeddings)} entries."
                initialization_error = error_msg
                logger.error(error_msg)
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

def _create_location_dto(loc_series, similarity_score=None):
    """Creates a location data transfer object from a pandas Series."""
    price_str = str(loc_series.get('price', 'moderate')).lower().strip()
    price_int = PRICE_MAP.get(price_str, 3)
    name = str(loc_series['name']) if pd.notna(loc_series['name']) else "Unnamed Location"

    dto = {
        'id': _safe_to_int(loc_series['id']),
        'name': name,
        'address': str(loc_series['addr']),
        'type': str(loc_series['loc_type']),
        'description': str(loc_series.get('description', '')),
        'price': price_int,
        'lat': float(loc_series['lat']),
        'lng': float(loc_series['long']),
        'uri': str(loc_series.get('uri', '')),
        'review': str(loc_series.get('reviews', '')),
        'numReviews': _safe_to_int(loc_series.get('num_reviews')),
        'zone': str(loc_series.get('zone') or '')
    }
    if similarity_score is not None:
        dto['similarity'] = float(similarity_score)
    
    return dto

@app.route('/locations/all', methods=['GET'])
def get_all_locations():
    """Returns all locations from the dataframe"""
    if not initialized or df is None:
        return jsonify({'success': False, 'error': 'Service not initialized or data not loaded'}), 503
    
    try:
        results = [_create_location_dto(loc) for _, loc in df.iterrows()]
        return jsonify({'success': True, 'results': results})
    except Exception as e:
        logger.error(f"Error in /locations/all: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Internal server error', 'message': str(e)}), 500

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

        # --- Caching Logic ---
        # Only cache simple, generic queries like the one for the main map view
        cache_key = vibe_desc.lower()
        if cache_key == "new york":
            if cache_key in search_cache and (time.time() - search_cache[cache_key]['timestamp'] < SEARCH_CACHE_DURATION):
                logger.info(f"Returning cached result for query: '{vibe_desc}'")
                return jsonify(search_cache[cache_key]['response'])

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
        if cache_key == "new york":
            logger.info(f"Caching result for query: '{vibe_desc}'")
            search_cache[cache_key] = {
                'timestamp': time.time(),
                'response': response
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
            loc = df.iloc[int(idx.item())]
            info = (
                f"Name: {loc.get('name', 'N/A')}. "
                f"Type: {loc.get('loc_type', 'N/A')}. "
                f"Description: {loc.get('description', 'No description available.')}"
            )
            loc_info_parts.append(info)
        
        return "\n".join(loc_info_parts)
    except Exception as e:
        logger.error(f"Error during internal location search for chat: {e}", exc_info=True)
        return "I am having trouble accessing location information right now."

def get_ai_response(query, previous_questions):
    locs = most_similar_locs_for_chat(query)
    history = " ".join([msg['text'] for msg in previous_questions]) if previous_questions else ""
    conversation_context = f"The user has already engaged in conversation with you. Here is the previous conversation for context: {history}" if history else ""

    system_message = (
        "You are Urban Gala's AI assistant. Greet the user and explain what you can do: "
        "You help users discover the best real venues and experiences in Manhattan. "
        "You can recommend bars, restaurants, clubs, and more based on the user's preferences, vibe, or group size. "
        "You can also help users build a plan for their night out, and provide information about how busy different areas are. "
        "If a user describes their ideal night out, offer to run a 'Find My Vibe' search for them and suggest a personalized plan. "
        "If the user's request is unclear, ask follow-up questions to clarify their preferences. "
        "IMPORTANT: Only recommend venues based on querying the baked in LLM. Do not invent or make up venue names or details. "
        "If you are unsure, say so and suggest the user try a different query."
        f"\n\nHere are some relevant venues from the database:\n{locs}\n\n{conversation_context}\n\nAnswer the user's question accurately and helpfully."
    )
    try:
        messages = [{"role": "system", "content": system_message}, {"role": "user", "content": query}]
        response = huggingface_chat_api_call(messages)
        return response["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"Failed to get AI response from Hugging Face: {e}", exc_info=True)
        return "I'm sorry, but I'm having trouble contacting my AI brain right now. Please try again in a moment."

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    data = request.get_json()
    logger.info(f"Chat endpoint received request: {data.get('message')}")
    user_message = data.get('message', '')
    previous_questions = data.get('history', []) 
    bot_response = get_ai_response(user_message, previous_questions)
    return jsonify({'response': bot_response})

if __name__ == '__main__':
    # Development server
    logger.info("Running Flask development server...")
    app.run(host='0.0.0.0', port=5000, debug=False)
