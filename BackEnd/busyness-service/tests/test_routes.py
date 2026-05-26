def test_health_returns_200_when_initialized(monkeypatch, tmp_path):
    from conftest import ready_busyness_app

    app_module, _calls = ready_busyness_app(monkeypatch, tmp_path)
    client = app_module.app.test_client()

    response = client.get("/health")

    assert response.status_code == 200
    body = response.get_json()
    assert body["success"] is True
    assert body["status"] == "healthy"
    assert body["models_loaded"]["dnn"] == len(app_module.dnn_models)


def test_health_returns_503_when_uninitialized_without_path_details(monkeypatch, tmp_path):
    from conftest import load_busyness_app

    app_module = load_busyness_app(monkeypatch, tmp_path)
    app_module.initialized = False
    app_module.initialization_error = "Missing model paths: ['/app/models/DNNs']"
    client = app_module.app.test_client()

    response = client.get("/health")

    assert response.status_code == 503
    body = response.get_json()
    assert body["success"] is False
    assert body["error"] == "Service is initializing."
    assert "/app/" not in str(body)
    assert str(tmp_path) not in str(body)


def test_busyness_returns_503_while_uninitialized(monkeypatch, tmp_path):
    from conftest import load_busyness_app

    app_module = load_busyness_app(monkeypatch, tmp_path)
    app_module.initialized = False
    app_module.initialization_error = "Traceback at /app/private/path"
    client = app_module.app.test_client()

    response = client.get("/busyness")

    assert response.status_code == 503
    body = response.get_json()
    assert body["success"] is False
    assert body["error"] == "Service is not ready. Please try again later."
    assert "Traceback" not in str(body)
    assert "/app/" not in str(body)


def test_busyness_success_preserves_response_shape(monkeypatch, tmp_path):
    from conftest import ready_busyness_app

    forecast = [{"LocationID": "100 NET", "predictions": [{"timestamp": "t", "busyness": 0.4}]}]
    app_module, _calls = ready_busyness_app(monkeypatch, tmp_path, forecast=forecast)
    client = app_module.app.test_client()

    response = client.get("/busyness?lat=40.75&lon=-73.98")

    assert response.status_code == 200
    body = response.get_json()
    assert set(body.keys()) == {"success", "predictions", "forecast", "cached"}
    assert body["success"] is True
    assert isinstance(body["forecast"], list)
    assert body["forecast"][0]["LocationID"] == "100 NET"


def test_busyness_live_cache_hit_does_not_recompute_live_prediction(monkeypatch, tmp_path):
    from conftest import ready_busyness_app

    app_module, calls = ready_busyness_app(monkeypatch, tmp_path)
    client = app_module.app.test_client()

    first = client.get("/busyness?lat=40.75&lon=-73.98")
    second = client.get("/busyness?lat=40.75&lon=-73.98")

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls["live"] == 1
    assert second.get_json()["cached"] is True


def test_busyness_forecast_cache_hit_does_not_recompute_forecast(monkeypatch, tmp_path):
    from conftest import ready_busyness_app

    app_module, calls = ready_busyness_app(monkeypatch, tmp_path)
    client = app_module.app.test_client()

    first = client.get("/busyness?lat=40.75&lon=-73.98")
    second = client.get("/busyness?lat=40.75&lon=-73.98")

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls["forecast"] == 1
    assert second.get_json()["cached"] is True
