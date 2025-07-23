# /Users/ng/Desktop/team-2-COMP47360/backend/busyness-service/predictor/busyness.py
import logging
import os
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

def initialize_busyness_models():
    """Initializes all DNN and the final LSTM models from disk."""
    global dnn_models, final_lstm_model
    
    keras.config.enable_unsafe_deserialization()
    logger.info("Starting model initialization...")
    
    dnn_models_path = '/app/models/DNNs'
    lstm_model_path = '/app/models/LSTMs/Fin.keras' # Path to the single final LSTM model
    
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
    if now is None:
        now = datetime.now()
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    hours_list = [current_hour - timedelta(hours=i) for i in reversed(range(12))]
    start = int(hours_list[0].timestamp())
    end = int(hours_list[-1].timestamp())
    return [hours_list, start, end]

def get_last_12_hours_temperature(hours, lat: float = 40.785091, lon: float = -73.968285):
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
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        times = data['hourly']['time']
        temperatures = data['hourly']['temperature_2m']
        tx = [0] * 12
        result = []
        for hour in hours:
            hour_str = hour.strftime('%Y-%m-%dT%H:00')
            if hour_str in times:
                idx = times.index(hour_str)
                result.append(temperatures[idx])
            else:
                result.append(None)
        return zip(result, tx, hours)
    except requests.RequestException as e:
        print(f"Error fetching weather data: {e}")
        return [None] * len(hours)

def prep_data(weather):
    df = pd.DataFrame(weather, columns=['TEMP_C', 'PRECIP_MM', 'day'])
    df['is_weekend'] = (df['day'].dt.weekday >= 5).astype(int)
    us_holidays = holidays.US()
    df['is_us_holiday'] = df['day'].dt.date.apply(lambda x: x in us_holidays).astype(int)
    df['month'] = df['day'].dt.month.astype(int)
    df['day_of_month'] = df['day'].dt.day.astype(int)
    df['hour'] = df['day'].dt.hour.astype(int)
    return df.drop(columns='day')

def compute_last_12(df_input):
    model_names = [
        "4 NET.keras", "12 NET.keras", "13 NET.keras", "24 NET.keras", "41 NET.keras",
        "42 NET.keras", "43 NET.keras", "45 NET.keras", "48 NET.keras", "50 NET.keras",
        "68 NET.keras", "74 NET.keras", "75 NET.keras", "79 NET.keras", "87 NET.keras",
        "88 NET.keras", "90 NET.keras", "100 NET.keras", "105 NET.keras", "107 NET.keras",
        "113 NET.keras", "114 NET.keras", "116 NET.keras", "120 NET.keras", "125 NET.keras",
        "127 NET.keras", "128 NET.keras", "137 NET.keras", "140 NET.keras", "141 NET.keras",
        "142 NET.keras", "143 NET.keras", "144 NET.keras", "148 NET.keras", "151 NET.keras",
        "152 NET.keras", "153 NET.keras", "158 NET.keras", "161 NET.keras", "162 NET.keras",
        "163 NET.keras", "164 NET.keras", "166 NET.keras", "170 NET.keras", "186 NET.keras",
        "194 NET.keras", "202 NET.keras", "209 NET.keras", "211 NET.keras", "224 NET.keras",
        "229 NET.keras", "230 NET.keras", "231 NET.keras", "232 NET.keras", "233 NET.keras",
        "234 NET.keras", "236 NET.keras", "237 NET.keras", "238 NET.keras", "239 NET.keras",
        "243 NET.keras", "244 NET.keras", "246 NET.keras", "249 NET.keras", "261 NET.keras",
        "262 NET.keras", "263 NET.keras"
    ]
    results = {}
    for model_n in model_names:
        model = keras.models.load_model(f"./DNNs/{model_n}")
        pred = model.predict(df_input, verbose=0)
        results[model_n.replace(".keras", "")] = pred.flatten()
    return pd.DataFrame(results)

def preds_to_zone_dict(preds_array, zone_list):
    result = {}
    for i, zone in enumerate(zone_list):
        zone_preds = preds_array[:, i]
        result[str(zone)] = zone_preds.tolist()
    return result

def calculate_busyness():
    hours, start, end = get_hours()
    weather = get_last_12_hours_temperature(hours)
    df = prep_data(weather)
    predictions = compute_last_12(df)
    keras.config.enable_unsafe_deserialization()
    model = keras.models.load_model("./LSTMs/Fin.keras")
    input_for_model = np.expand_dims(predictions, axis=0)
    output = model.predict(input_for_model)[0]
    zones = [
        "4", "12", "13", "24", "41",
        "42", "43", "45", "48", "50",
        "68", "74", "75", "79", "87",
        "88", "90", "100", "105", "107",
        "113", "114", "116", "120", "125",
        "127", "128", "137", "140", "141",
        "142", "143", "144", "148", "151",
        "152", "153", "158", "161", "162",
        "163", "164", "166", "170", "186",
        "194", "202", "209", "211", "224",
        "229", "230", "231", "232", "233",
        "234", "236", "237", "238", "239",
        "243", "244", "246", "249", "261",
        "262", "263"
    ]
    zone_data = preds_to_zone_dict(output, zones)
    return zone_data
