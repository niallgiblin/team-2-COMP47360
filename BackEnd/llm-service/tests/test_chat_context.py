import inspect
import types

import pytest

from chat_service import DEFAULT_HF_CHAT_MODEL, huggingface_chat_api_call
from conftest import _LocRow, _ready_chat_app, load_app


def test_most_similar_locs_includes_loc_type(monkeypatch):
    app_module = _ready_chat_app(
        monkeypatch,
        rows=[_LocRow(name="Test Bar", zone="East Village", loc_type="Bar", type="Bar")],
    )

    result = app_module._chat_search_helper("jazz bars")

    assert len(result) > 0
    assert result[0]["name"] == "Test Bar"
    assert result[0]["zone"] == "East Village"
    assert result[0]["type"] == "Bar"


def test_most_similar_locs_missing_loc_type_falls_back(monkeypatch):
    app_module = _ready_chat_app(monkeypatch, rows=[_LocRow(name="Mystery Spot", zone="SoHo")])

    result = app_module._chat_search_helper("quiet spot")

    assert len(result) > 0
    assert result[0]["name"] == "Mystery Spot"
    assert result[0]["zone"] == "SoHo"
    # type field should still be present (empty string fallback) even without loc_type
    assert "type" in result[0]


def test_most_similar_locs_does_not_use_type_key(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    source = inspect.getsource(app_module._chat_search_helper)

    assert "loc['type']" not in source


def test_default_hf_chat_model_is_not_deprecated_turbo(monkeypatch):
    load_app(monkeypatch)

    assert "-Turbo" not in DEFAULT_HF_CHAT_MODEL
    assert "Llama-3.2-3B-Instruct-Turbo" not in DEFAULT_HF_CHAT_MODEL


def test_huggingface_chat_api_call_uses_hf_chat_model_env(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=30):
        captured["json"] = json

        class Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return {"choices": [{"message": {"content": "ok"}}]}

        return Resp()

    monkeypatch.setenv("HF_TOKEN", "test-token")
    monkeypatch.setenv("HF_CHAT_MODEL", "test/model-id")

    huggingface_chat_api_call(
        [{"role": "user", "content": "hi"}],
        requests_module=types.SimpleNamespace(
            post=fake_post,
            exceptions=types.SimpleNamespace(Timeout=Exception, RequestException=Exception),
        ),
    )

    assert captured["json"]["model"] == "test/model-id"


def test_huggingface_chat_api_call_raises_without_token(monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "your-hugging-face-api-token")

    with pytest.raises(ValueError, match="Hugging Face API token"):
        huggingface_chat_api_call([{"role": "user", "content": "hi"}])


def test_search_helper_with_analysis_skips_hf_rewrite(monkeypatch):
    """A route-supplied QueryAnalysis replaces the HF rewrite_query call."""
    app_module = _ready_chat_app(
        monkeypatch,
        rows=[_LocRow(name="Test Bar", zone="East Village", type="Bar")],
    )

    def _boom(*args, **kwargs):
        raise AssertionError("rewrite_query must not run when analysis is given")

    monkeypatch.setattr(app_module, "rewrite_query", _boom)

    from jev_service import QueryAnalysis

    analysis = QueryAnalysis(
        is_general_chat=False, location="east village", categories=("jazz",),
    )
    result = app_module._chat_search_helper(
        "jazz bars", query_analysis=analysis,
    )
    assert len(result) > 0
    assert result[0]["name"] == "Test Bar"


def test_search_helper_without_analysis_uses_rewrite(monkeypatch):
    """Legacy path (no analysis) still calls the HF rewrite."""
    app_module = _ready_chat_app(
        monkeypatch,
        rows=[_LocRow(name="Test Bar", zone="East Village", type="Bar")],
    )
    seen = {"called": False}

    def _fake_rewrite(query):
        seen["called"] = True
        return f"{query} rewritten"

    monkeypatch.setattr(app_module, "rewrite_query", _fake_rewrite)
    result = app_module._chat_search_helper("jazz bars")
    assert seen["called"] is True
    assert len(result) > 0


def test_resolve_search_query_skips_rewrite_with_analysis(monkeypatch):
    """With a Jev analysis the HF rewrite is skipped and only expand runs."""
    app_module = _ready_chat_app(monkeypatch)

    def _boom(*a, **k):
        raise AssertionError("rewrite_query must not run with an analysis")

    monkeypatch.setattr(app_module, "rewrite_query", _boom)

    from jev_service import QueryAnalysis

    analysis = QueryAnalysis(location="midtown", categories=("jazz",))
    out = app_module._resolve_search_query("comedy clubs", analysis)
    # static expansion applied, but Jev location/category terms are NOT appended
    # (location is applied as a filter, not text)
    assert "comedy" in out
    assert "midtown" not in out


def test_resolve_search_query_skips_rewrite_when_hf_flag_off(monkeypatch):
    """Option-1 prototype: no analysis and rewrite disabled -> raw + expand."""
    app_module = _ready_chat_app(monkeypatch)
    monkeypatch.setattr(app_module, "HF_QUERY_REWRITE_ENABLED", False)

    def _boom(*a, **k):
        raise AssertionError("rewrite_query must not run when disabled")

    monkeypatch.setattr(app_module, "rewrite_query", _boom)
    out = app_module._resolve_search_query("jazz bars")
    assert "jazz" in out


def test_resolve_search_query_compose_flag_appends_jev_terms(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)
    import config

    monkeypatch.setattr(config, "JEV_SEARCH_COMPOSE_ENABLED", True)

    from jev_service import QueryAnalysis

    analysis = QueryAnalysis(location="midtown", categories=("jazz",))
    out = app_module._resolve_search_query("bars", analysis)
    assert "midtown" in out
    assert "jazz" in out
