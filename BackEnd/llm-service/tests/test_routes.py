from conftest import _ready_chat_app, make_bearer_token


def test_health_returns_200_when_initialized(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "healthy"
    assert payload["initialized"] is True


def test_search_missing_vibe_description_returns_400(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.post("/search", json={})

    assert response.status_code == 400
    assert "vibeDescription" in response.get_json()["error"]


def test_search_stubbed_success_returns_results(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.post(
        "/search",
        json={"vibeDescription": "jazz bars", "maxResults": 2},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert isinstance(payload.get("results"), list)
    assert len(payload["results"]) >= 1


def test_similar_missing_name_returns_400(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.post("/similar", json={})

    assert response.status_code == 400
    assert "name" in response.get_json()["error"].lower()


def test_similar_stubbed_success_returns_results(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    client = app_module.app.test_client()

    response = client.post(
        "/similar",
        json={
            "name": "Blue Note Jazz Club",
            "zone": "Greenwich Village",
            "loc_type": "Bar",
            "limit": 2,
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    results = payload.get("results", [])
    assert len(results) >= 1
    result_names = [item["name"] for item in results]
    assert "Blue Note Jazz Club" not in result_names


def test_chat_valid_jwt_stubbed_response(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    monkeypatch.setattr(
        app_module, "get_ai_response",
        lambda query, previous_questions, location_filter=None: ("stubbed reply", []),
    )
    client = app_module.app.test_client()
    token = make_bearer_token()

    response = client.post(
        "/api/chat",
        json={"message": "find jazz bars"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.get_json() == {"response": "stubbed reply", "citations": []}


def test_chat_accepts_previous_questions_and_truncates(monkeypatch):
    captured = {"previous_questions": None}

    def capture_previous_questions(query, previous_questions, location_filter=None):
        captured["previous_questions"] = previous_questions
        captured["location_filter"] = location_filter
        return "ok", []

    app_module = _ready_chat_app(monkeypatch)
    monkeypatch.setattr(app_module, "get_ai_response", capture_previous_questions)
    client = app_module.app.test_client()
    token = make_bearer_token()

    response = client.post(
        "/api/chat",
        json={
            "message": "latest question",
            "previous_questions": ["q1", "q2", "q3", "q4", "q5"],
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert captured["previous_questions"] is not None
    assert len(captured["previous_questions"]) <= 3


def test_chat_explicit_location_field(monkeypatch):
    captured = {}

    def capture_location(query, previous_questions, location_filter=None):
        captured["location_filter"] = location_filter
        return "ok", []

    app_module = _ready_chat_app(monkeypatch)
    monkeypatch.setattr(app_module, "get_ai_response", capture_location)
    client = app_module.app.test_client()
    token = make_bearer_token()

    response = client.post(
        "/api/chat",
        json={"message": "find a bar", "location": "Midtown"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert captured["location_filter"] == "Midtown"


def test_chat_auto_extracts_location_from_query(monkeypatch):
    captured = {}

    def capture_location(query, previous_questions, location_filter=None):
        captured["location_filter"] = location_filter
        return "ok", []

    app_module = _ready_chat_app(monkeypatch)
    monkeypatch.setattr(app_module, "get_ai_response", capture_location)
    # Seed known zones so extraction works
    monkeypatch.setattr(
        "chat_service._KNOWN_ZONES",
        {"east village", "west village", "midtown center", "midtown east"},
    )
    client = app_module.app.test_client()
    token = make_bearer_token()

    response = client.post(
        "/api/chat",
        json={"message": "bars in the East Village"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert captured["location_filter"] == "east village"


def test_chat_location_field_takes_precedence_over_auto_extraction(monkeypatch):
    captured = {}

    def capture_location(query, previous_questions, location_filter=None):
        captured["location_filter"] = location_filter
        return "ok", []

    app_module = _ready_chat_app(monkeypatch)
    monkeypatch.setattr(app_module, "get_ai_response", capture_location)
    monkeypatch.setattr(
        "chat_service._KNOWN_ZONES",
        {"east village", "upper west side north"},
    )
    client = app_module.app.test_client()
    token = make_bearer_token()

    # Explicit location should win even though query mentions East Village
    response = client.post(
        "/api/chat",
        json={"message": "bars in the East Village", "location": "upper west side"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert captured["location_filter"] == "upper west side"
