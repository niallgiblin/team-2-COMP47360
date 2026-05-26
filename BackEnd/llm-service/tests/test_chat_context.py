import importlib
import sys
import types

import pytest


def load_app(monkeypatch, extra_env=None):
    monkeypatch.setenv("FLASK_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    monkeypatch.setenv("APP_JWT_SECRET", "test-secret")
    if extra_env:
        for key, value in extra_env.items():
            monkeypatch.setenv(key, value)
    monkeypatch.setitem(sys.modules, "numpy", types.SimpleNamespace())
    monkeypatch.setitem(sys.modules, "pandas", types.SimpleNamespace(
        DataFrame=object,
        isna=lambda value: value is None,
    ))
    monkeypatch.setitem(sys.modules, "torch", types.SimpleNamespace(
        Tensor=object,
        tensor=lambda *args, **kwargs: None,
        float32=object(),
        topk=lambda similarities, k: types.SimpleNamespace(
            values=[types.SimpleNamespace(item=lambda: 0.9)],
            indices=[types.SimpleNamespace(item=lambda: 0)],
        ),
    ))
    monkeypatch.setitem(sys.modules, "sentence_transformers", types.SimpleNamespace(
        SentenceTransformer=object,
        util=types.SimpleNamespace(cos_sim=lambda *args, **kwargs: [[0.9, 0.1]]),
    ))
    monkeypatch.setitem(sys.modules, "requests", types.SimpleNamespace(
        post=lambda *args, **kwargs: None,
        exceptions=types.SimpleNamespace(Timeout=Exception, RequestException=Exception),
    ))
    sys.modules.pop("app", None)
    return importlib.import_module("app")


class _LocRow(dict):
    def get(self, key, default=""):
        return super().get(key, default)


class _FakeIloc:
    def __init__(self, rows):
        self._rows = rows

    def __getitem__(self, idx):
        return self._rows[idx]


class _FakeDf:
    def __init__(self, rows):
        self.iloc = _FakeIloc(rows)


def _ready_chat_app(monkeypatch, rows=None, extra_env=None):
    app_module = load_app(monkeypatch, extra_env=extra_env)
    app_module.initialized = True
    app_module.model = types.SimpleNamespace(
        encode=lambda query, convert_to_tensor=True: types.SimpleNamespace(cpu=lambda: object())
    )
    app_module.location_embeddings = object()
    app_module.df = _FakeDf(rows or [_LocRow(name="Test Bar", zone="East Village", loc_type="Bar")])
    return app_module


def test_most_similar_locs_includes_loc_type(monkeypatch):
    app_module = _ready_chat_app(monkeypatch)

    result = app_module.most_similar_locs_for_chat("jazz bars")

    assert "Test Bar" in result
    assert "East Village" in result
    assert "Bar" in result


def test_most_similar_locs_missing_loc_type_falls_back(monkeypatch):
    app_module = _ready_chat_app(monkeypatch, rows=[_LocRow(name="Mystery Spot", zone="SoHo")])

    result = app_module.most_similar_locs_for_chat("quiet spot")

    assert "Mystery Spot" in result
    assert "SoHo" in result
    assert ": " in result


def test_most_similar_locs_does_not_use_type_key(monkeypatch):
    import inspect

    app_module = _ready_chat_app(monkeypatch)
    source = inspect.getsource(app_module.most_similar_locs_for_chat)

    assert "loc['type']" not in source


def test_default_hf_chat_model_is_not_deprecated_turbo(monkeypatch):
    app_module = load_app(monkeypatch)

    assert "-Turbo" not in app_module.DEFAULT_HF_CHAT_MODEL
    assert "Llama-3.2-3B-Instruct-Turbo" not in app_module.DEFAULT_HF_CHAT_MODEL


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

    app_module = load_app(
        monkeypatch,
        extra_env={"HF_TOKEN": "test-token", "HF_CHAT_MODEL": "test/model-id"},
    )
    app_module.requests = types.SimpleNamespace(
        post=fake_post,
        exceptions=types.SimpleNamespace(Timeout=Exception, RequestException=Exception),
    )

    app_module.huggingface_chat_api_call([{"role": "user", "content": "hi"}])

    assert captured["json"]["model"] == "test/model-id"


def test_huggingface_chat_api_call_raises_without_token(monkeypatch):
    app_module = load_app(monkeypatch, extra_env={"HF_TOKEN": "your-hugging-face-api-token"})

    with pytest.raises(ValueError, match="Hugging Face API token"):
        app_module.huggingface_chat_api_call([{"role": "user", "content": "hi"}])
