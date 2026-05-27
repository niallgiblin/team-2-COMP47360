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

    assert "Test Bar" in result
    assert "East Village" in result
    assert "Bar" in result


def test_most_similar_locs_missing_loc_type_falls_back(monkeypatch):
    app_module = _ready_chat_app(monkeypatch, rows=[_LocRow(name="Mystery Spot", zone="SoHo")])

    result = app_module._chat_search_helper("quiet spot")

    assert "Mystery Spot" in result
    assert "SoHo" in result
    assert ": " in result


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
