# /Users/ng/Desktop/team-2-COMP47360/backend/busyness-service/predictor/busyness.py
import logging
import os
from pathlib import Path
import sys
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import holidays
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.models import load_model
from tensorflow.keras.utils import custom_object_scope
import warnings

# Anchor: predictor/busyness.py → BackEnd/busyness-service/
_BUSYNESS_SERVICE_DIR = Path(__file__).parent.parent.resolve()

# Suppress TensorFlow warnings and configure for CPU
warnings.filterwarnings('ignore')
tf.get_logger().setLevel('ERROR')
tf.config.set_visible_devices([], 'GPU')

logger = logging.getLogger(__name__)

# --- Global Variables ---
dnn_models = {}
final_lstm_model = None
us_holidays = holidays.US()

# --- Model Loading ---

def custom_lambda_layer(x):
    """Custom lambda function to replace problematic Lambda layers during model loading."""
    return x

def load_model_with_fallback(model_path):
    """Load a Keras model with fallback strategies for compatibility."""
    try:
        return load_model(model_path)
    except Exception:
        try:
            with custom_object_scope({'__lambda__': custom_lambda_layer}):
                return load_model(model_path)
        except Exception:
            try:
                return load_model(model_path, compile=False)
            except Exception as e:
                logger.error(f"All loading attempts failed for {model_path}: {str(e)}")
                return None

def verify_file_paths():
    """Verify required model paths exist before attempting to load them.

    Returns (success: bool, missing: list[str]) where `missing` contains
    canonical var-name strings only — never resolved filesystem paths
    (D-08: avoid path disclosure through /health responses).
    """
    dnn_path  = os.getenv('MODEL_PATH',
        str(_BUSYNESS_SERVICE_DIR / 'models' / 'DNNs'))
    lstm_path = os.getenv('LSTM_MODEL_PATH',
        str(_BUSYNESS_SERVICE_DIR / 'models' / 'LSTMs' / 'Fin.keras'))

    missing = []
    if not os.path.isdir(dnn_path):
        missing.append("MODEL_PATH (DNN models directory)")
    if not os.path.isfile(lstm_path):
        missing.append("LSTM_MODEL_PATH (Fin.keras)")

    if missing:
        for m in missing:
            logger.error("Missing required model path: %s", m)
        return False, missing

    logger.info("All required model paths found.")
    return True, []

def initialize_busyness_models():
    """Initializes all DNN and the final LSTM models from disk."""
    global dnn_models, final_lstm_model
    
    keras.config.enable_unsafe_deserialization()
    logger.info("Starting model initialization...")
    
    dnn_models_path = os.getenv('MODEL_PATH',
        str(_BUSYNESS_SERVICE_DIR / 'models' / 'DNNs'))
    lstm_model_path = os.getenv('LSTM_MODEL_PATH',
        str(_BUSYNESS_SERVICE_DIR / 'models' / 'LSTMs' / 'Fin.keras'))
    
    # Load DNN models
    if os.path.exists(dnn_models_path):
        for filename in os.listdir(dnn_models_path):
            if filename.lower().endswith(('.h5', '.keras')):
                zone_name = os.path.splitext(filename)[0]
                model_path = os.path.join(dnn_models_path, filename)
                model = load_model_with_fallback(model_path)
                if model:
                    dnn_models[zone_name] = model
    logger.info(f"Loaded {len(dnn_models)} DNN models.")

    # Load the final LSTM model
    if os.path.exists(lstm_model_path):
        final_lstm_model = load_model_with_fallback(lstm_model_path)
        if final_lstm_model:
            logger.info("Successfully loaded the final LSTM model (Fin.keras).")
        else:
            logger.error("Failed to load the final LSTM model (Fin.keras).")
    else:
        logger.error(f"Final LSTM model not found at {lstm_model_path}")

    if not dnn_models or not final_lstm_model:
        logger.error("Model initialization failed. Not all required models could be loaded.")
        return False
        
    logger.info("Model initialization complete.")
    return True

# --- Data Preparation (Original Logic) ---

def get_hours(now=None):
    """Generates a list of the last 12 hourly datetime objects."""
    if now is None:
        now = datetime.now()
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    return [current_hour - timedelta(hours=i) for i in reversed(range(12))]

def get_last_12_hours_temperature(hours, lat: float, lon: float):
    """Fetches weather data for the last 12 hours from Open-Meteo."""
    if not hours:
        return []
        
    sorted_hours = sorted(hours)
    start_date = sorted_hours[0].strftime('%Y-%m-%d')
    end_date = sorted_hours[-1].strftime('%Y-%m-%d')
    
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        'latitude': lat,
        'longitude': lon,
        'hourly': 'temperature_2m',
        'start_date': start_date,
        'end_date': end_date,
        'timezone': 'America/New_York',
        'temperature_unit': 'celsius'
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        api_times = data['hourly']['time']
        api_temps = data['hourly']['temperature_2m']
        
        results = []
        for hour in hours:
            hour_str = hour.strftime('%Y-%m-%dT%H:00')
            temp = None
            if hour_str in api_times:
                idx = api_times.index(hour_str)
                temp = api_temps[idx]
            # The original model expects 0 for precipitation.
            results.append({'temp': temp, 'precip': 0.0, 'day': hour})
        
        return results
        
    except requests.RequestException as e:
        logger.error(f"Error fetching weather data: {e}. Using default values.")
        # Return default data if API fails
        return [{'temp': 15.0, 'precip': 0.0, 'day': hour} for hour in hours]

def prep_data(weather_data):
    """Prepares the feature DataFrame for the models."""
    if not weather_data:
        return pd.DataFrame()

    df = pd.DataFrame(weather_data)
    
    # Handle missing temperature data by forward-filling, then back-filling
    # The 'method' argument is deprecated; using .ffill() and .bfill() is the modern approach.
    df['temp'] = df['temp'].ffill().bfill()
    df['temp'] = df['temp'].fillna(15.0) # Final fallback

    df.rename(columns={'temp': 'TEMP_C', 'precip': 'PRECIP_MM'}, inplace=True)

    df['is_weekend'] = (df['day'].dt.weekday >= 5).astype(int)
    df['is_us_holiday'] = df['day'].apply(lambda x: x in us_holidays).astype(int)
    df['month'] = df['day'].dt.month
    df['day_of_month'] = df['day'].dt.day
    df['hour'] = df['day'].dt.hour
    
    # Ensure column order matches the training data
    feature_columns = ['TEMP_C', 'PRECIP_MM', 'is_weekend', 'is_us_holiday', 'month', 'day_of_month', 'hour']
    return df[feature_columns]

# --- Prediction Pipeline (Original Logic) ---

def predict_busyness_for_all_zones(lat, lon):
    """
    Main prediction function that orchestrates the entire pipeline:
    1. Fetches last 12 hours of weather.
    2. Prepares data into a feature DataFrame.
    3. Runs data through all DNN models to get a 12-hour prediction sequence for each zone.
    4. Feeds the combined sequence into the final LSTM model for the definitive prediction.
    """
    if not dnn_models or not final_lstm_model:
        logger.error("Prediction pipeline cannot run: models are not initialized.")
        return {}

    try:
        # 1. & 2. Get and prepare data for the last 12 hours
        logger.info("Step 1: Fetching and preparing last 12 hours of data...")
        hours = get_hours()
        weather = get_last_12_hours_temperature(hours, lat, lon)
        df_features = prep_data(weather)

        if df_features.empty:
            logger.error("Feature preparation resulted in an empty DataFrame. Aborting.")
            return {}

        # 3. Run data through all DNN models
        logger.info("Step 2: Generating 12-hour sequences with DNN models...")
        # Sort zone names to ensure consistent column order for the LSTM model
        sorted_zones = sorted(dnn_models.keys())
        
        dnn_predictions = {}
        for zone_name in sorted_zones:
            model = dnn_models[zone_name]
            # Predict for all 12 hours at once
            predictions = model.predict(df_features, verbose=0)
            dnn_predictions[zone_name] = predictions.flatten()
        
        # Create a DataFrame of (12 hours x N zones)
        df_dnn_results = pd.DataFrame(dnn_predictions)

        # 4. Feed the sequence into the final LSTM model
        logger.info("Step 3: Making final prediction with the LSTM meta-model...")
        # Reshape data for LSTM: (batch_size, timesteps, features)
        # Here, batch_size=1, timesteps=12, features=num_zones
        input_for_lstm = np.expand_dims(df_dnn_results.to_numpy(), axis=0)
        
        # The LSTM predicts the next hour's busyness for all zones
        final_prediction_array = final_lstm_model.predict(input_for_lstm, verbose=0)[0].flatten()

        # 5. Format the output
        logger.info("Step 4: Formatting final output.")
        # The output is an array of predictions, one for each zone, in the sorted order
        final_predictions = {
            zone: float(score) for zone, score in zip(sorted_zones, final_prediction_array)
        }
        
        logger.info(f"Successfully generated predictions for {len(final_predictions)} zones.")
        return final_predictions

    except Exception as e:
        logger.error(f"An error occurred during the prediction pipeline: {e}", exc_info=True)
        return {}

def get_next_12_hours(now=None):
    """Generates a list of the next 12 hourly datetime objects starting from the next hour, in America/New_York timezone."""
    import pytz
    ny_tz = pytz.timezone('America/New_York')
    if now is None:
        now = datetime.now(ny_tz)
    else:
        now = now.astimezone(ny_tz)
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    return [current_hour + timedelta(hours=i+1) for i in range(12)]

def get_next_12_hours_temperature(hours, lat: float, lon: float):
    """Fetches weather data for the next 12 hours from Open-Meteo."""
    if not hours:
        return []
    sorted_hours = sorted(hours)
    start_date = sorted_hours[0].strftime('%Y-%m-%d')
    end_date = sorted_hours[-1].strftime('%Y-%m-%d')
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        'latitude': lat,
        'longitude': lon,
        'hourly': 'temperature_2m',
        'start_date': start_date,
        'end_date': end_date,
        'timezone': 'America/New_York',
        'temperature_unit': 'celsius'
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        api_times = data['hourly']['time']
        api_temps = data['hourly']['temperature_2m']
        results = []
        for hour in hours:
            hour_str = hour.strftime('%Y-%m-%dT%H:00')
            temp = None
            if hour_str in api_times:
                idx = api_times.index(hour_str)
                temp = api_temps[idx]
            results.append({'temp': temp, 'precip': 0.0, 'day': hour})
        return results
    except requests.RequestException as e:
        logger.error(f"Error fetching forecast weather data: {e}. Using default values.")
        return [{'temp': 15.0, 'precip': 0.0, 'day': hour} for hour in hours]

def forecast_busyness_for_all_zones(lat, lon):
    """
    Generates a 12-hour forecast time series for each zone using the DNN models.
    Returns a list of dicts: [{LocationID, predictions: [{timestamp, busyness}, ...]}, ...]
    Ensures every zone has exactly 12 hourly predictions, with timestamps in America/New_York timezone.
    """
    if not dnn_models:
        logger.error("Forecast pipeline cannot run: DNN models are not initialized.")
        return []
    try:
        hours = get_next_12_hours()
        weather = get_next_12_hours_temperature(hours, lat, lon)
        df_features = prep_data(weather)
        if df_features.empty:
            logger.error("Feature preparation resulted in an empty DataFrame. Aborting forecast.")
            return []
        sorted_zones = sorted(dnn_models.keys())
        results = []
        for zone_name in sorted_zones:
            model = dnn_models[zone_name]
            preds = model.predict(df_features, verbose=0).flatten()
            zone_preds = []
            for i, hour in enumerate(hours):
                # Always produce 12 predictions, one for each hour
                busyness_val = float(preds[i]) if i < len(preds) else None
                zone_preds.append({
                    'timestamp': hour.isoformat(),
                    'busyness': busyness_val
                })
            # If for any reason zone_preds is not 12, pad with None
            while len(zone_preds) < 12:
                next_hour = hours[0] + timedelta(hours=len(zone_preds))
                zone_preds.append({'timestamp': next_hour.isoformat(), 'busyness': None})
            results.append({
                'LocationID': zone_name,
                'predictions': zone_preds
            })
        return results
    except Exception as e:
        logger.error(f"An error occurred during the forecast pipeline: {e}", exc_info=True)
        return []
