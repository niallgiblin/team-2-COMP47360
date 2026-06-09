import importlib
import os
import shutil
import sys
import tempfile
import types

# Prevent OpenMP conflict between faiss's bundled libomp and torch's bundled libomp.
# Both ship their own OpenMP runtime; loading both in the same process crashes.
# See: https://github.com/pytorch/pytorch/issues/19964
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"


def load_app(monkeypatch, extra_env=None):
    monkeypatch.setenv("FLASK_CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
    monkeypatch.setenv("APP_JWT_SECRET", "test-secret")
    if extra_env:
        for key, value in extra_env.items():
            monkeypatch.setenv(key, value)
    monkeypatch.setitem(sys.modules, "numpy", types.SimpleNamespace(
        ndarray=object,
    ))
    monkeypatch.setitem(sys.modules, "pandas", types.SimpleNamespace(
        DataFrame=object,
        isna=lambda value: value is None,
        Series=object,
    ))
    monkeypatch.setitem(sys.modules, "torch", types.SimpleNamespace(
        Tensor=object,
        tensor=lambda *args, **kwargs: None,
        float32=object(),
        topk=_stub_topk,
    ))
    monkeypatch.setitem(sys.modules, "sentence_transformers", types.SimpleNamespace(
        SentenceTransformer=object,
        util=types.SimpleNamespace(cos_sim=_stub_cos_sim),
    ))
    monkeypatch.setitem(sys.modules, "faiss", types.SimpleNamespace(
        IndexFlatIP=lambda dim: types.SimpleNamespace(add=lambda vectors: None),
    ))
    monkeypatch.setitem(sys.modules, "requests", types.SimpleNamespace(
        post=lambda *args, **kwargs: None,
        exceptions=types.SimpleNamespace(Timeout=Exception, RequestException=Exception),
    ))
    import loader

    monkeypatch.setattr(loader, "validate_corpus_at_startup", lambda: (True, []))
    monkeypatch.setattr(loader, "verify_file_paths", lambda: (False, ["MODEL_PATH"], []))
    sys.modules.pop("app", None)
    return importlib.import_module("app")


def _setup_observability_env(monkeypatch, tmp_path):
    """Set PROMETHEUS_MULTIPROC_DIR and CHAT_LOG_PATH for observability tests."""
    metrics_dir = tmp_path / "prometheus"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    chat_log_path = str(logs_dir / "chat-requests.jsonl")

    monkeypatch.setenv("PROMETHEUS_MULTIPROC_DIR", str(metrics_dir))
    monkeypatch.setenv("CHAT_LOG_PATH", chat_log_path)

    sys.modules.pop("observability", None)
    sys.modules.pop("app", None)

    return {
        "metrics_dir": metrics_dir,
        "logs_dir": logs_dir,
        "chat_log_path": chat_log_path,
    }


def _clean_observability_modules():
    """Remove observability and app from sys.modules before fresh import."""
    sys.modules.pop("observability", None)
    sys.modules.pop("app", None)


def load_observability_fixtures():
    """Load the observability_cases.json fixture file."""
    import json
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "observability_cases.json")
    with open(fixture_path) as f:
        return json.load(f)


def _stub_cos_sim(query_embedding, location_embeddings):
    scores = [0.95, 0.85, 0.75, 0.65, 0.55]
    tensor_like = types.SimpleNamespace(
        cpu=lambda: types.SimpleNamespace(numpy=lambda: scores)
    )
    return [tensor_like]


def _make_topk_stub(row_count):
    def _topk(similarities, k):
        n = min(k, max(row_count, 1))
        indices = [types.SimpleNamespace(item=lambda i=i: i) for i in range(n)]
        values = [types.SimpleNamespace(item=lambda: 0.9) for _ in range(n)]
        return types.SimpleNamespace(values=values, indices=indices)

    return _topk


def _stub_topk(similarities, k):
    return _make_topk_stub(3)(similarities, k)


class _FakeCrossEncoder:
    """Fake cross-encoder for tests — follows _FakeEncoder pattern.

    Accepts a list of pre-determined scores. Its .predict(pairs) returns
    those scores as a list of floats, padded with 0.0 if the list is longer.
    If no scores list is provided, returns descending scores (n, n-1, ..., 1).
    """

    def __init__(self, model_name="test-cross-encoder", scores=None):
        self.model_name = model_name
        self._target_device = "cpu"
        self._calls = []
        self._scores = scores

    def predict(self, pairs):
        self._calls.append(pairs)
        if self._scores is not None:
            result = list(self._scores[: len(pairs)])
            if len(result) < len(pairs):
                result.extend([0.0] * (len(pairs) - len(result)))
            return [float(s) for s in result]
        return [float(n) for n in range(len(pairs), 0, -1)]


class _LocRow(dict):
    def get(self, key, default=""):
        return super().get(key, default)

    def to_dict(self):
        return dict(self)


class _FakeIloc:
    def __init__(self, rows):
        self._rows = rows

    def __getitem__(self, idx):
        if isinstance(idx, slice):
            return [_LocRow(row) if not isinstance(row, _LocRow) else row for row in self._rows[idx]]
        return self._rows[idx]


class _FakeDf:
    def __init__(self, rows):
        self._rows = [_LocRow(row) if not isinstance(row, _LocRow) else row for row in rows]

    @property
    def iloc(self):
        return _FakeIloc(self._rows)

    @property
    def index(self):
        return types.SimpleNamespace(tolist=lambda: list(range(len(self._rows))))

    def copy(self):
        return _FakeDf(self._rows)

    def __getitem__(self, key):
        if isinstance(key, list):
            filtered = [_FakeDf([self._rows[i]]) for i in key if i < len(self._rows)]
            merged_rows = [self._rows[i] for i in key if i < len(self._rows)]
            result = _FakeDf(merged_rows)
            return result
        raise NotImplementedError(f"Unsupported _FakeDf slice: {key!r}")

    def __len__(self):
        return len(self._rows)


def _default_search_rows():
    return [
        _LocRow(
            id=1,
            name="Blue Note Jazz Club",
            zone="Greenwich Village",
            loc_type="Bar",
            address="131 W 3rd St",
            latitude=40.7308,
            longitude=-74.0020,
            type="Bar",
            price="moderate",
        ),
        _LocRow(
            id=2,
            name="Smalls Jazz Club",
            zone="Greenwich Village",
            loc_type="Bar",
            address="183 W 10th St",
            latitude=40.7348,
            longitude=-74.0022,
            type="Bar",
            price="moderate",
        ),
        _LocRow(
            id=3,
            name="Village Vanguard",
            zone="Greenwich Village",
            loc_type="Bar",
            address="178 7th Ave S",
            latitude=40.7360,
            longitude=-74.0015,
            type="Bar",
            price="expensive",
        ),
    ]


def _row_to_result_dto(row, similarity):
    return {
        "id": row.get("id", 0),
        "name": row.get("name", ""),
        "address": row.get("address", ""),
        "latitude": float(row.get("latitude", 0)),
        "longitude": float(row.get("longitude", 0)),
        "type": row.get("type", ""),
        "price": row.get("price", ""),
        "rating": float(row.get("rating", 0)),
        "zone": row.get("zone", ""),
        "zoneId": row.get("zoneId", 0),
        "similarity": similarity,
    }


class _StubSearchService:
    def __init__(self, rows):
        self._df = _FakeDf(rows)

    def search(self, query_text, limit=10, location_filter=None, price_range=None):
        results = []
        for index, row in enumerate(self._df._rows):
            zone = str(row.get("zone", ""))
            if location_filter and location_filter.lower() not in zone.lower():
                continue
            results.append(_row_to_result_dto(row, 0.9 - index * 0.05))
            if len(results) >= limit:
                break
        return results

    def find_similar(self, query_text, exclude_names=None, limit=5):
        exclude_lower = {str(name).lower().strip() for name in (exclude_names or []) if name}
        results = []
        for index, row in enumerate(self._df._rows):
            name = str(row.get("name", ""))
            if name.lower() in exclude_lower:
                continue
            results.append(_row_to_result_dto(row, 0.9 - index * 0.05))
            if len(results) >= limit:
                break
        return results


def _ready_chat_app(monkeypatch, rows=None, extra_env=None):
    row_data = rows or _default_search_rows()
    app_module = load_app(monkeypatch, extra_env=extra_env)
    app_module.initialized = True
    app_module.model = object()
    app_module.search_service = _StubSearchService(row_data)
    return app_module


def make_bearer_token(secret="test-secret", payload=None):
    import jwt

    body = payload or {"sub": "test-user"}
    return jwt.encode(body, secret, algorithm="HS256")


# ── Observability test fixtures ──────────────────────────────────

import pytest  # noqa: E402


@pytest.fixture
def obs_tmp_path(tmp_path):
    """Temporary directory for observability test artifacts."""
    return tmp_path


@pytest.fixture
def obs_env(monkeypatch, tmp_path):
    """Set up observability env vars for unit tests (NO multiprocess).

    Only sets CHAT_LOG_PATH. Does NOT set PROMETHEUS_MULTIPROC_DIR,
    so Prometheus uses the default process-local registry (testable).
    """
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    chat_log_path = str(logs_dir / "chat-requests.jsonl")
    monkeypatch.setenv("CHAT_LOG_PATH", chat_log_path)
    sys.modules.pop("observability", None)
    sys.modules.pop("app", None)
    return {"logs_dir": logs_dir, "chat_log_path": chat_log_path}


@pytest.fixture
def obs_cases():
    """Load observability fixture cases."""
    return load_observability_fixtures()["cases"]


def pytest_collection_modifyitems(config, items):
    """Auto-skip integration tests unless explicitly selected with -m integration.
    
    Integration tests require Docker or specific multiprocess setup that
    may not be available in local dev. Run with:
        pytest -m integration
    to include them.
    """
    if "integration" not in config.getoption("-m", ""):
        skip_integration = pytest.mark.skip(
            reason="integration test: run with 'pytest -m integration' to include"
        )
        for item in items:
            if "integration" in item.keywords:
                item.add_marker(skip_integration)
