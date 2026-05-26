import importlib
import sys
import types


def load_app(monkeypatch):
    monkeypatch.setenv("FLASK_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    monkeypatch.setenv("APP_JWT_SECRET", "test-secret")
    monkeypatch.setitem(sys.modules, "numpy", types.SimpleNamespace())
    monkeypatch.setitem(sys.modules, "pandas", types.SimpleNamespace(
        DataFrame=object,
        isna=lambda value: value is None,
    ))
    monkeypatch.setitem(sys.modules, "torch", types.SimpleNamespace(Tensor=object, tensor=lambda *args, **kwargs: None, float32=object()))
    monkeypatch.setitem(sys.modules, "sentence_transformers", types.SimpleNamespace(
        SentenceTransformer=object,
        util=types.SimpleNamespace(cos_sim=lambda *args, **kwargs: []),
    ))
    monkeypatch.setitem(sys.modules, "requests", types.SimpleNamespace(
        post=lambda *args, **kwargs: None,
        exceptions=types.SimpleNamespace(Timeout=Exception, RequestException=Exception),
    ))
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


def test_chat_without_bearer_auth_returns_401_before_generation(monkeypatch):
    app_module = load_app(monkeypatch)
    called = {"value": False}

    def fail_if_called(*args, **kwargs):
        called["value"] = True
        return "should not be called"

    monkeypatch.setattr(app_module, "get_ai_response", fail_if_called)
    client = app_module.app.test_client()

    response = client.post("/api/chat", json={"message": "find jazz bars"})

    assert response.status_code == 401
    assert response.get_json()["error"] == "Authentication required"
    assert called["value"] is False
