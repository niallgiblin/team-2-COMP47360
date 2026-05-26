import hashlib
import importlib
import sys
import types
from pathlib import Path

import pytest


class FakeModel:
    def __init__(self, values=None):
        self.values = values or [0.2] * 12
        self.calls = 0

    def predict(self, _features, verbose=0):
        self.calls += 1
        return _FakePrediction(self.values)


class _FakePrediction:
    def __init__(self, values):
        self._values = values

    def flatten(self):
        return list(self._values)


def _write_checksum_manifest(files, manifest_path, service_root):
    lines = []
    for file_path in files:
        digest = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
        relative = Path(file_path).resolve().relative_to(service_root.resolve())
        lines.append(f"{digest}  {relative}")
    manifest_path.write_text("\n".join(lines) + "\n")


def make_model_artifacts(tmp_path):
    service_root = Path(__file__).resolve().parents[1]
    model_root = service_root / ".pytest_cache" / "model-artifacts"
    dnn_dir = model_root / "DNNs"
    lstm_dir = model_root / "LSTMs"
    dnn_dir.mkdir(parents=True, exist_ok=True)
    lstm_dir.mkdir(parents=True, exist_ok=True)
    dnn_model = dnn_dir / "100 NET.keras"
    lstm_model = lstm_dir / "Fin.keras"
    dnn_model.write_bytes(b"fake dnn model")
    lstm_model.write_bytes(b"fake lstm model")
    manifest = model_root / "checksums.sha256"
    dnn_relative = dnn_model.resolve().relative_to(service_root.resolve())
    lstm_relative = lstm_model.resolve().relative_to(service_root.resolve())
    lines = [
        f"{hashlib.sha256(dnn_model.read_bytes()).hexdigest()}  {dnn_relative}",
        f"{hashlib.sha256(lstm_model.read_bytes()).hexdigest()}  {lstm_relative}",
    ]
    manifest.write_text("\n".join(lines) + "\n")
    return {
        "MODEL_PATH": str(dnn_dir),
        "LSTM_MODEL_PATH": str(lstm_model),
        "MODEL_CHECKSUMS_PATH": str(manifest),
    }


def install_fake_tensorflow(monkeypatch, load_calls=None, fail_load=False):
    load_calls = load_calls if load_calls is not None else []

    tensorflow = types.ModuleType("tensorflow")
    keras_module = types.ModuleType("tensorflow.keras")
    models_module = types.ModuleType("tensorflow.keras.models")
    utils_module = types.ModuleType("tensorflow.keras.utils")

    unsafe_calls = []

    def load_model(path, *args, **kwargs):
        load_calls.append((str(path), kwargs))
        if fail_load:
            raise RuntimeError("fake load failure")
        return FakeModel()

    class _CustomObjectScope:
        def __init__(self, _objects):
            pass

        def __enter__(self):
            return None

        def __exit__(self, exc_type, exc, tb):
            return False

    keras_module.config = types.SimpleNamespace(
        enable_unsafe_deserialization=lambda: unsafe_calls.append(True)
    )
    models_module.load_model = load_model
    utils_module.custom_object_scope = _CustomObjectScope
    keras_module.models = models_module
    keras_module.utils = utils_module
    tensorflow.keras = keras_module
    tensorflow.get_logger = lambda: types.SimpleNamespace(setLevel=lambda _level: None)
    tensorflow.config = types.SimpleNamespace(set_visible_devices=lambda *_args, **_kwargs: None)

    monkeypatch.setitem(sys.modules, "tensorflow", tensorflow)
    monkeypatch.setitem(sys.modules, "tensorflow.keras", keras_module)
    monkeypatch.setitem(sys.modules, "tensorflow.keras.models", models_module)
    monkeypatch.setitem(sys.modules, "tensorflow.keras.utils", utils_module)
    return unsafe_calls


def install_fake_science_modules(monkeypatch):
    numpy_module = types.ModuleType("numpy")
    numpy_module.expand_dims = lambda value, axis=0: value
    numpy_module.array = lambda value: _FakePrediction(value)
    pandas_module = types.ModuleType("pandas")
    pandas_module.DataFrame = lambda *args, **kwargs: object()
    requests_module = types.ModuleType("requests")
    requests_module.RequestException = RuntimeError
    requests_module.get = lambda *args, **kwargs: None
    holidays_module = types.ModuleType("holidays")
    holidays_module.US = lambda: set()
    monkeypatch.setitem(sys.modules, "numpy", numpy_module)
    monkeypatch.setitem(sys.modules, "pandas", pandas_module)
    monkeypatch.setitem(sys.modules, "requests", requests_module)
    monkeypatch.setitem(sys.modules, "holidays", holidays_module)


@pytest.fixture
def load_calls():
    return []


def load_busyness_app(monkeypatch, tmp_path, extra_env=None, fail_load=False, load_calls=None):
    monkeypatch.setenv("FLASK_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    artifact_env = make_model_artifacts(tmp_path)
    artifact_env.update(extra_env or {})
    for key, value in artifact_env.items():
        monkeypatch.setenv(key, value)
    install_fake_science_modules(monkeypatch)
    install_fake_tensorflow(monkeypatch, load_calls=load_calls, fail_load=fail_load)
    for module_name in ["app", "predictor.busyness", "predictor"]:
        sys.modules.pop(module_name, None)
    return importlib.import_module("app")


def ready_busyness_app(monkeypatch, tmp_path, predictions=None, forecast=None):
    app_module = load_busyness_app(monkeypatch, tmp_path)
    app_module.initialized = True
    app_module.initialization_error = None
    calls = {"live": 0, "forecast": 0}
    app_module.live_cache.clear()
    app_module.forecast_cache.clear()

    def fake_live(_lat, _lon):
        calls["live"] += 1
        return predictions or {"100 NET": 0.2, "200 NET": 0.8}

    def fake_forecast(_lat, _lon):
        calls["forecast"] += 1
        return forecast or [
            {
                "LocationID": "100 NET",
                "predictions": [
                    {"timestamp": f"2026-01-01T{i:02d}:00:00-05:00", "busyness": 0.1}
                    for i in range(12)
                ],
            }
        ]

    monkeypatch.setattr(app_module, "predict_busyness_for_all_zones", fake_live)
    monkeypatch.setattr(app_module, "forecast_busyness_for_all_zones", fake_forecast)
    return app_module, calls
