import importlib
import sys
import types


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
    monkeypatch.setitem(sys.modules, "requests", types.SimpleNamespace(
        post=lambda *args, **kwargs: None,
        exceptions=types.SimpleNamespace(Timeout=Exception, RequestException=Exception),
    ))
    sys.modules.pop("app", None)
    return importlib.import_module("app")


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


def _ready_chat_app(monkeypatch, rows=None, extra_env=None):
    row_data = rows or _default_search_rows()
    app_module = load_app(monkeypatch, extra_env=extra_env)
    app_module.initialized = True
    app_module.model = types.SimpleNamespace(
        encode=lambda query, convert_to_tensor=True: types.SimpleNamespace(
            cpu=lambda: types.SimpleNamespace(numpy=lambda: [0.95, 0.85, 0.75])
        )
    )
    app_module.location_embeddings = object()
    app_module.df = _FakeDf(row_data)
    app_module.torch = types.SimpleNamespace(
        Tensor=object,
        tensor=lambda *args, **kwargs: None,
        float32=object(),
        topk=_make_topk_stub(len(app_module.df)),
    )
    return app_module


def make_bearer_token(secret="test-secret", payload=None):
    import jwt

    body = payload or {"sub": "test-user"}
    return jwt.encode(body, secret, algorithm="HS256")
