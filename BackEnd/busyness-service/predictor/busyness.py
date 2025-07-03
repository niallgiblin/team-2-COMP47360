import os
import logging
from datetime import datetime, timedelta

import holidays
import numpy as np
import pandas as pd
import requests
from tensorflow import keras

logger = logging.getLogger(__name__)

# --- MONKEY-PATCHES FOR KERAS LAYER COMPATIBILITY ---
# This is the most robust solution for the version conflicts.
# We create a generic patch for the 'dtype' issue and apply it to all problematic layers.

def create_legacy_dtype_patch(layer_class):
    """
    A factory function that creates a patched `from_config` method.
    This patch intercepts the complex 'dtype' dictionary from older Keras models
    and simplifies it to a string ('float32') that modern Keras expects.
    """
    original_from_config = layer_class.from_config

    @classmethod
    def _compatible_from_config(cls, config):
        if isinstance(config.get('dtype'), dict):
            logger.info(f"--- (Generic Patch) Intercepted complex 'dtype' in {cls.__name__}. Simplifying. ---")
            config['dtype'] = 'float32'
        return original_from_config(config)
    
    return _compatible_from_config

# Apply the generic patch to all problematic layer types
problematic_layers = [keras.layers.Dense, keras.layers.BatchNormalization, keras.layers.Activation, keras.layers.Dropout, keras.layers.LSTM, keras.layers.LSTMCell]
for layer in problematic_layers:
    layer.from_config = create_legacy_dtype_patch(layer)

# Apply the specific patch for the InputLayer's constructor argument
_original_input_layer_init = keras.layers.InputLayer.__init__
def _compatible_input_layer_init(self, **kwargs):
    if 'batch_shape' in kwargs:
        logger.info(f"--- (InputLayer Patch) Intercepted legacy 'batch_shape'. Converting to 'input_shape'. ---")
        kwargs['input_shape'] = kwargs.pop('batch_shape')[1:]
    _original_input_layer_init(self, **kwargs)
keras.layers.InputLayer.__init__ = _compatible_input_layer_init

# --- Patch for Lambda Layer ---
# Fixes the 'function' vs 'function_type' key issue in older models.
_original_lambda_from_config = keras.layers.Lambda.from_config
@classmethod
def _compatible_lambda_from_config(cls, config):
    if 'function' in config and 'function_type' not in config:
        logger.info(f"--- (Lambda Patch) Intercepted legacy 'function' key. Renaming to 'function_type'. ---")
        config['function_type'] = config.pop('function')
    return _original_lambda_from_config(config)
keras.layers.Lambda.from_config = _compatible_lambda_from_config

# --- END OF PATCHES ---


# --- Globals for loaded models and configuration ---
dnn_models = {}
lstm_model = None
initialized = False
US_HOLIDAYS = holidays.US()  # Create the holidays object once as a global constant

# List of DNN model files expected
DNN_MODEL_FILES = [
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
ZONES = sorted([name.replace(" NET.keras", "") for name in DNN_MODEL_FILES], key=int)


def initialize_busyness_models():
    """Loads all DNN and LSTM models required for busyness prediction into memory."""
    global dnn_models, lstm_model, initialized

    if initialized:
        return True

    dnn_path = os.getenv('DNN_MODELS_PATH', '/app/models/busyness/dnn')
    lstm_path = os.getenv('LSTM_MODEL_PATH', '/app/models/busyness/lstm/Fin.keras')

    logger.info("Initializing busyness prediction models...")
    try:
        # The custom_objects dictionary is no longer needed for DNNs due to the monkey-patches
        for model_filename in DNN_MODEL_FILES:
            model_path = os.path.join(dnn_path, model_filename)
            if not os.path.exists(model_path):
                logger.error(f"Missing DNN model file: {model_path}")
                return False
            model_key = model_filename.replace(" NET.keras", "").strip()
            dnn_models[model_key] = keras.models.load_model(model_path, compile=False)
        logger.info(f"Loaded {len(dnn_models)} DNN models successfully.")

        if not os.path.exists(lstm_path):
            logger.error(f"Missing LSTM model file: {lstm_path}")
            return False
        
        # The custom_objects dictionary is needed here for the LSTM model.
        lstm_custom_objects = {
            'Functional': keras.Model
        }
        # Load the LSTM model, allowing for Lambda layers and providing the correct Functional class
        lstm_model = keras.models.load_model(
            lstm_path,
            custom_objects=lstm_custom_objects,
            compile=False,
            safe_mode=False  # Required for models with Lambda layers
        )
        logger.info("Loaded LSTM model successfully.")

        initialized = True
        return True
    except Exception as e:
        logger.error(f"Failed to load busyness models: {e}", exc_info=True)
        return False

def _get_last_12_hours_temperature(lat, lon):
    """Fetches weather data for the last 12 hours for a given coordinate."""
    now = datetime.now()
    hours_list = [now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=i) for i in reversed(range(12))]
    
    start_date = hours_list[0].strftime('%Y-%m-%d')
    end_date = hours_list[-1].strftime('%Y-%m-%d')
    
    params = {
        'latitude': lat, 'longitude': lon, 'hourly': 'temperature_2m',
        'start_date': start_date, 'end_date': end_date,
        'timezone': 'America/New_York', 'temperature_unit': 'celsius'
    }
    
    try:
        response = requests.get("https://api.open-meteo.com/v1/forecast", params=params)
        response.raise_for_status()
        data = response.json()
        
        times = data['hourly']['time']
        temperatures = data['hourly']['temperature_2m']
        
        result = []
        for hour in hours_list:
            hour_str = hour.strftime('%Y-%m-%dT%H:00')
            try:
                idx = times.index(hour_str)
                result.append((temperatures[idx], 0, hour)) # temp, precip (dummy), datetime
            except ValueError:
                result.append((None, 0, hour))
        
        return result
        
    except requests.RequestException as e:
        logger.error(f"Error fetching weather data: {e}")
        return [(None, 0, hour) for hour in hours_list]

def _prepare_input_data(weather_data):
    """Prepares the weather data into a format suitable for the DNN models."""
    df = pd.DataFrame(weather_data, columns=['TEMP_C', 'PRECIP_MM', 'day'])
    df['TEMP_C'] = df['TEMP_C'].ffill().bfill() # Fill any missing temperature values

    df['is_weekend'] = (df['day'].dt.weekday >= 5).astype(int)
    df['is_us_holiday'] = df['day'].dt.date.apply(lambda x: x in US_HOLIDAYS).astype(int)

    df['month'] = df['day'].dt.month.astype(int)
    df['day_of_month'] = df['day'].dt.day.astype(int)
    df['hour'] = df['day'].dt.hour.astype(int)

    return df.drop(columns='day')

def _compute_dnn_predictions(df_input):
    """Runs the prepared data through all loaded DNN models."""
    results = {}
    for zone_id in ZONES:
        model = dnn_models.get(zone_id)
        if model:
            pred = model.predict(df_input, verbose=0)
            results[zone_id] = pred.flatten()
        else:
            # Handle case where a model for a zone might be missing
            results[zone_id] = np.zeros(len(df_input))
            
    return pd.DataFrame(results)

def _preds_to_zone_dict(preds_array, zone_list):
    """Formats the final LSTM output into a dictionary keyed by zone."""
    result = {}
    for i, zone in enumerate(zone_list):
        zone_preds = preds_array[:, i]
        result[str(zone)] = zone_preds.tolist()
    return result

def predict_busyness_for_all_zones(lat=40.785091, lon=-73.968285):
    """
    Main function to orchestrate the busyness prediction for all zones.
    """
    if not initialized:
        raise RuntimeError("Busyness prediction models are not initialized.")
    
    assert lstm_model is not None, "LSTM model is not loaded, but service was marked as initialized."

    # 1. Get weather data
    weather_data = _get_last_12_hours_temperature(lat, lon)
    
    # 2. Prepare data for DNNs
    df_prepared = _prepare_input_data(weather_data)
    
    # 3. Get initial predictions from all DNNs
    dnn_predictions = _compute_dnn_predictions(df_prepared)
    
    # 4. Prepare input for the final LSTM model
    lstm_input = np.expand_dims(dnn_predictions.to_numpy(), axis=0)
    
    # 5. Get final predictions from the LSTM
    final_output = lstm_model.predict(lstm_input, verbose=0)[0]
    
    # 6. Format the output
    zone_data = _preds_to_zone_dict(final_output, ZONES)
    
    return zone_data
