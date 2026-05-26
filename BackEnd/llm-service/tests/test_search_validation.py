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


def _ready_app(monkeypatch):
    app_module = load_app(monkeypatch)
    app_module.initialized = True
    app_module.model = object()
    app_module.df = object()
    app_module.location_embeddings = object()
    return app_module


def test_search_rejects_non_integer_max_results(monkeypatch):
    app_module = _ready_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.post("/search", json={"vibeDescription": "jazz", "maxResults": "lots"})

    assert response.status_code == 400
    assert response.get_json()["error"] == "maxResults must be an integer"


def test_search_clamps_excessive_max_results(monkeypatch):
    app_module = _ready_app(monkeypatch)
    captured = {}

    def fake_generate_cache_key(vibe_desc, max_results, location_filter=None, price_range=None):
        captured["max_results"] = max_results
        return "cache-key"

    monkeypatch.setattr(app_module, "generate_cache_key", fake_generate_cache_key)
    monkeypatch.setattr(app_module, "cleanup_cache", lambda: None)
    client = app_module.app.test_client()

    response = client.post("/search", json={"vibeDescription": "jazz", "maxResults": 500})

    assert response.status_code != 400
    assert captured["max_results"] == 25
