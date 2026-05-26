import importlib
import sys


def load_app(monkeypatch):
    monkeypatch.setenv("FLASK_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    sys.modules.pop("app", None)
    return importlib.import_module("app")


def test_allowed_origin_receives_cors_header(monkeypatch):
    app_module = load_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
    assert "Access-Control-Allow-Credentials" not in response.headers


def test_rejected_origin_receives_no_cors_header(monkeypatch):
    app_module = load_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.options(
        "/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.headers.get("Access-Control-Allow-Origin") is None
    assert "Access-Control-Allow-Credentials" not in response.headers


def test_unhealthy_health_does_not_leak_initialization_error(monkeypatch):
    app_module = load_app(monkeypatch)
    app_module.initialized = False
    app_module.initialization_error = "/secret/path/missing.pkl import failed"
    client = app_module.app.test_client()

    response = client.get("/health")

    assert response.status_code == 503
    body = response.get_json()
    assert body["error"] == "Service is initializing."
    assert "/secret" not in str(body)
