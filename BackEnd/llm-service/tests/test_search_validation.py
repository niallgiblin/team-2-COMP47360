from conftest import _StubSearchService, _default_search_rows, load_app


def _ready_app(monkeypatch):
    app_module = load_app(monkeypatch)
    app_module.initialized = True
    app_module.model = object()
    app_module.search_service = _StubSearchService(_default_search_rows())
    return app_module


def test_search_rejects_non_integer_max_results(monkeypatch):
    app_module = _ready_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.post("/search", json={"vibeDescription": "jazz", "maxResults": "lots"})

    assert response.status_code == 400
    assert response.get_json()["error"] == "maxResults must be an integer"


def test_search_rejects_unknown_price_range(monkeypatch):
    app_module = _ready_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.post(
        "/search",
        json={"vibeDescription": "jazz", "priceRange": "premium"},
    )

    assert response.status_code == 400
    assert "Unknown priceRange" in response.get_json()["error"]


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
