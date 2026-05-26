import hashlib
from datetime import datetime
from pathlib import Path

import pytest


def _import_busyness(monkeypatch, tmp_path, load_calls=None, fail_load=False):
    from conftest import install_fake_tensorflow, make_model_artifacts
    import importlib
    import sys

    env = make_model_artifacts(tmp_path)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    from conftest import install_fake_science_modules
    install_fake_science_modules(monkeypatch)
    unsafe_calls = install_fake_tensorflow(
        monkeypatch,
        load_calls=load_calls if load_calls is not None else [],
        fail_load=fail_load,
    )
    sys.modules.pop("predictor.busyness", None)
    return importlib.import_module("predictor.busyness"), env, unsafe_calls


def test_verify_model_checksums_accepts_valid_manifest(monkeypatch, tmp_path):
    busyness, env, _unsafe_calls = _import_busyness(monkeypatch, tmp_path)

    success, errors = busyness.verify_model_checksums(
        env["MODEL_PATH"],
        env["LSTM_MODEL_PATH"],
        env["MODEL_CHECKSUMS_PATH"],
    )

    assert success is True
    assert errors == []


def test_verify_model_checksums_rejects_mismatch_before_load(monkeypatch, tmp_path, load_calls):
    busyness, env, _unsafe_calls = _import_busyness(monkeypatch, tmp_path, load_calls=load_calls)
    manifest = Path(env["MODEL_CHECKSUMS_PATH"])
    first_line = manifest.read_text().splitlines()[0]
    manifest.write_text(first_line.replace(first_line[:64], "0" * 64) + "\n")

    success, errors = busyness.verify_file_paths()

    assert success is False
    assert any("Checksum mismatch" in error for error in errors)
    assert load_calls == []


def test_verify_model_checksums_requires_manifest_and_lstm_entry(monkeypatch, tmp_path):
    busyness, env, _unsafe_calls = _import_busyness(monkeypatch, tmp_path)
    Path(env["MODEL_CHECKSUMS_PATH"]).write_text("")

    success, errors = busyness.verify_file_paths()

    assert success is False
    assert any("Missing checksum entry" in error for error in errors)

    Path(env["MODEL_CHECKSUMS_PATH"]).unlink()
    success, errors = busyness.verify_file_paths()
    assert success is False
    assert "MODEL_CHECKSUMS_PATH (checksum manifest)" in errors


def test_load_model_strict_path_does_not_enable_unsafe_deserialization(monkeypatch, tmp_path):
    load_calls = []
    busyness, env, unsafe_calls = _import_busyness(monkeypatch, tmp_path, load_calls=load_calls)

    model = busyness.load_model_with_fallback(env["LSTM_MODEL_PATH"])

    assert model is not None
    assert load_calls
    assert unsafe_calls == []


def test_checksum_failure_prevents_unsafe_deserialization(monkeypatch, tmp_path, load_calls):
    busyness, env, unsafe_calls = _import_busyness(
        monkeypatch,
        tmp_path,
        load_calls=load_calls,
        fail_load=True,
    )
    Path(env["MODEL_CHECKSUMS_PATH"]).write_text("0" * 64 + "  models/LSTMs/Fin.keras\n")

    assert busyness.initialize_busyness_models() is False
    assert load_calls == []
    assert unsafe_calls == []


def test_normalize_predictions_edge_cases(monkeypatch, tmp_path):
    from conftest import load_busyness_app

    app_module = load_busyness_app(monkeypatch, tmp_path)

    assert app_module.normalize_predictions({}) == {}
    assert app_module.normalize_predictions({"100 NET": 2.0, "200 NET": 2.0}) == {
        "100": 0.5,
        "200": 0.5,
    }
    assert app_module.normalize_predictions({"100 NET": None}) == {"100": 0.0}


def test_weather_fallbacks_return_default_rows(monkeypatch, tmp_path):
    busyness, _env, _unsafe_calls = _import_busyness(monkeypatch, tmp_path)
    hours = [datetime(2026, 1, 1, hour) for hour in range(12)]

    def raise_request_exception(*_args, **_kwargs):
        raise busyness.requests.RequestException("network unavailable")

    monkeypatch.setattr(busyness.requests, "get", raise_request_exception)

    live_rows = busyness.get_last_12_hours_temperature(hours, 40.75, -73.98)
    forecast_rows = busyness.get_next_12_hours_temperature(hours, 40.75, -73.98)

    assert len(live_rows) == 12
    assert len(forecast_rows) == 12
    assert all(row["temp"] == 15.0 and row["precip"] == 0.0 for row in live_rows)
    assert all(row["temp"] == 15.0 and row["precip"] == 0.0 for row in forecast_rows)
    assert [row["day"] for row in live_rows] == hours


def test_cache_key_rounds_coordinates_and_buckets_time(monkeypatch, tmp_path):
    from conftest import load_busyness_app

    app_module = load_busyness_app(monkeypatch, tmp_path)

    assert app_module.build_live_cache_key(40.75049, -73.98049, now=3600) == (
        40.75,
        -73.98,
        1,
    )
    assert app_module.build_forecast_cache_key(40.75049, -73.98049, now=7200)[2] == 2


def test_cache_max_entries_and_ttl_are_enforced(monkeypatch, tmp_path):
    from conftest import load_busyness_app

    app_module = load_busyness_app(monkeypatch, tmp_path)
    now = {"value": 0}
    cache = app_module.BoundedTTLCache(max_entries=2, ttl_seconds=10, now_func=lambda: now["value"])

    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    assert cache.get("a") is None
    assert cache.get("b") == 2
    now["value"] = 11
    assert cache.get("b") is None


def test_forecast_busyness_for_all_zones_returns_12_predictions(monkeypatch, tmp_path):
    busyness, _env, _unsafe_calls = _import_busyness(monkeypatch, tmp_path)
    from conftest import FakeModel

    busyness.dnn_models = {"100 NET": FakeModel([0.1] * 12)}
    hours = [datetime(2026, 1, 1, hour) for hour in range(12)]
    monkeypatch.setattr(busyness, "get_next_12_hours", lambda: hours)
    class _Features:
        empty = False

    monkeypatch.setattr(busyness, "prep_data", lambda _weather: _Features())
    monkeypatch.setattr(
        busyness,
        "get_next_12_hours_temperature",
        lambda hours, _lat, _lon: [{"temp": 15.0, "precip": 0.0, "day": hour} for hour in hours],
    )

    result = busyness.forecast_busyness_for_all_zones(40.75, -73.98)

    assert len(result) == 1
    assert result[0]["LocationID"] == "100 NET"
    assert len(result[0]["predictions"]) == 12


@pytest.mark.artifact
def test_real_artifact_loading_when_configured(monkeypatch):
    from conftest import install_fake_science_modules, install_fake_tensorflow
    import importlib
    import os
    import sys

    model_path = os.getenv("MODEL_PATH")
    lstm_path = os.getenv("LSTM_MODEL_PATH")
    checksums_path = os.getenv("MODEL_CHECKSUMS_PATH")
    if not model_path or not lstm_path or not checksums_path:
        pytest.skip("MODEL_PATH, LSTM_MODEL_PATH, and MODEL_CHECKSUMS_PATH are required")
    if not Path(model_path).is_dir() or not Path(lstm_path).is_file() or not Path(checksums_path).is_file():
        pytest.skip("Configured busyness model artifacts or checksum manifest are absent")

    install_fake_science_modules(monkeypatch)
    install_fake_tensorflow(monkeypatch)
    sys.modules.pop("predictor.busyness", None)
    busyness = importlib.import_module("predictor.busyness")
    checks_ok, errors = busyness.verify_file_paths()
    if not checks_ok:
        pytest.skip(f"Configured artifact checks failed: {errors}")

    assert busyness.initialize_busyness_models() is True
    assert len(busyness.dnn_models) > 0
    assert busyness.final_lstm_model is not None
