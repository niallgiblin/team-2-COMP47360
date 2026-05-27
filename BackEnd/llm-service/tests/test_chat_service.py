"""Wave 0 red tests for planned chat_service.py helpers."""

import types

import pytest

from chat_service import HF_CHAT_MODEL, build_chat_messages, get_ai_response, huggingface_chat_api_call


def test_build_chat_messages_truncates_previous_questions_to_three():
    previous = [f"question-{index}" for index in range(6)]
    messages = build_chat_messages(
        query="find jazz bars",
        previous_questions=previous,
        retrieval_context="- Blue Note (Greenwich Village): Bar",
    )

    user_content = messages[-1]["content"]
    assert user_content.count("- User:") == 3
    assert "question-3" in user_content
    assert "question-0" not in user_content
    assert "Current query: find jazz bars" in user_content


def test_build_chat_messages_wires_top_five_retrieval_context(monkeypatch):
    captured = {}

    def fake_search(_query, limit=5):
        captured["limit"] = limit
        return "- Smalls Jazz Club (Greenwich Village): Bar"

    messages = build_chat_messages(
        query="late night jazz",
        previous_questions=[],
        search_helper=fake_search,
    )

    assert captured["limit"] == 5
    assert "Smalls Jazz Club" in messages[0]["content"]


def test_huggingface_chat_api_call_uses_hf_chat_model_and_timeout(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=30):
        captured["timeout"] = timeout
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

    assert captured["timeout"] == 30
    assert captured["json"]["model"] == "test/model-id"


def test_huggingface_chat_api_call_raises_without_token_and_does_not_log_secret(caplog, monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "your-hugging-face-api-token")

    with pytest.raises(ValueError, match="Hugging Face API token"):
        huggingface_chat_api_call([{"role": "user", "content": "hi"}])

    assert "your-hugging-face-api-token" not in caplog.text


def test_get_ai_response_delegates_to_search_helper_and_hf_call(monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "test-token")

    search_calls = []

    def fake_search(query, limit=5):
        search_calls.append((query, limit))
        return "- Venue (Zone): Bar"

    hf_calls = []

    def fake_hf(messages, model=None, requests_module=None):
        hf_calls.append(messages)
        return {"choices": [{"message": {"content": "stubbed reply"}}]}

    reply = get_ai_response(
        query="where should I go?",
        previous_questions=["earlier question"],
        search_helper=fake_search,
        hf_call=fake_hf,
    )

    assert reply == "stubbed reply"
    assert search_calls == [("where should I go?", 5)]
    assert hf_calls
    assert HF_CHAT_MODEL


def test_get_ai_response_does_not_perform_jwt_validation():
    source = open(__file__, encoding="utf-8").read()
    assert "validate_chat_jwt" not in source
    assert "jwt.decode" not in source
