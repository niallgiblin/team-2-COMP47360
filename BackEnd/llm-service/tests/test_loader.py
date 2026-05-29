"""Wave 0 red tests for planned loader.py startup validation."""

from pathlib import Path

import numpy as np
import pytest

from conftest import _FakeDf, _LocRow

from loader import (
    DATA_PATH,
    EMBEDDINGS_PATH,
    INDEX_PATH,
    MANIFEST_PATH,
    MODEL_PATH,
    StartupLoadError,
    validate_corpus_at_startup,
    validate_embeddings_matrix,
    validate_index_metadata,
    validate_startup_data,
    verify_file_paths,
)


def test_verify_file_paths_reports_variable_names_only(monkeypatch, tmp_path):
    missing_dir = tmp_path / "missing-model"
    data_file = tmp_path / "locations.csv"
    emb_file = tmp_path / "embeddings.npy"
    manifest_file = tmp_path / "manifest.json"
    data_file.write_text("id,name\n1,Test\n", encoding="utf-8")
    manifest_file.write_text("{}", encoding="utf-8")
    np.save(emb_file, np.ones((1, 4), dtype="float32"))

    monkeypatch.setenv("MODEL_PATH", str(missing_dir))
    monkeypatch.setenv("DATA_PATH", str(data_file))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(emb_file))
    monkeypatch.setenv("MANIFEST_PATH", str(manifest_file))

    ok, missing, _warnings = verify_file_paths()

    assert ok is False
    assert missing == ["MODEL_PATH"]
    assert not any(str(tmp_path) in item for item in missing)
    assert not any("\\" in item or "/" in item for item in missing)


def test_verify_file_paths_accepts_present_files(monkeypatch, tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    data_file = tmp_path / "venues.csv"
    emb_file = tmp_path / "embeddings.npy"
    manifest_file = tmp_path / "manifest.json"
    data_file.write_text("id,name\n1,Test\n", encoding="utf-8")
    manifest_file.write_text("{}", encoding="utf-8")
    np.save(emb_file, np.ones((1, 4), dtype="float32"))

    monkeypatch.setenv("MODEL_PATH", str(model_dir))
    monkeypatch.setenv("DATA_PATH", str(data_file))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(emb_file))
    monkeypatch.setenv("MANIFEST_PATH", str(manifest_file))

    ok, missing, _warnings = verify_file_paths()

    assert ok is True
    assert missing == []


def test_validate_embeddings_matrix_requires_non_empty_2d():
    with pytest.raises(StartupLoadError, match="non-empty 2D"):
        validate_embeddings_matrix(np.array([], dtype="float32"))

    with pytest.raises(StartupLoadError, match="non-empty 2D"):
        validate_embeddings_matrix(np.array([1.0, 2.0], dtype="float32"))


def test_validate_startup_data_requires_row_count_parity():
    rows = [
        _LocRow(id=1, name="A"),
        _LocRow(id=2, name="B"),
    ]
    df = _FakeDf(rows)
    embeddings = np.ones((1, 4), dtype="float32")

    with pytest.raises(StartupLoadError, match="row count"):
        validate_startup_data(df, embeddings)


def test_validate_startup_data_passes_matching_rows():
    rows = [_LocRow(id=1, name="A"), _LocRow(id=2, name="B")]
    df = _FakeDf(rows)
    embeddings = np.ones((2, 4), dtype="float32")

    validate_startup_data(df, embeddings)


def test_loader_exports_path_variable_names():
    assert MODEL_PATH == "MODEL_PATH"
    assert DATA_PATH == "DATA_PATH"
    assert EMBEDDINGS_PATH == "EMBEDDINGS_PATH"
    assert INDEX_PATH == "INDEX_PATH"
    assert MANIFEST_PATH == "MANIFEST_PATH"


def test_missing_file_list_never_leaks_resolved_paths(monkeypatch, tmp_path):
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "secret-model-path"))
    monkeypatch.setenv("DATA_PATH", str(tmp_path / "secret-data.csv"))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(tmp_path / "secret.npy"))

    ok, missing, _warnings = verify_file_paths()

    assert ok is False
    for name in missing:
        assert name in {"MODEL_PATH", "DATA_PATH", "EMBEDDINGS_PATH", "MANIFEST_PATH"}
        assert "secret" not in name


def test_validate_corpus_at_startup_fails_missing_manifest(monkeypatch, tmp_path):
    import loader

    service_dir = tmp_path / "service"
    service_dir.mkdir()
    corpus_root = service_dir / "corpus" / "v1"
    corpus_root.mkdir(parents=True)
    (corpus_root / "venues.csv").write_text("id\n1\n", encoding="utf-8")
    (corpus_root / "SCHEMA.md").write_text("# schema\n", encoding="utf-8")

    monkeypatch.setattr(loader, "__file__", str(service_dir / "loader.py"))
    monkeypatch.setenv("CORPUS_VERSION", "v1")
    monkeypatch.setenv("DATA_PATH", str(corpus_root / "venues.csv"))
    monkeypatch.setenv("MANIFEST_PATH", str(corpus_root / "manifest.json"))

    ok, messages = validate_corpus_at_startup()

    assert ok is False
    assert "MANIFEST_PATH" in messages


def test_validate_corpus_at_startup_fails_mismatched_data_path(monkeypatch, tmp_path):
    import loader

    fixture = Path(__file__).resolve().parent / "fixtures" / "corpus_v1"
    service_dir = tmp_path / "service"
    service_dir.mkdir()
    corpus_root = service_dir / "corpus" / "v1"
    corpus_root.mkdir(parents=True)
    for name in ("venues.csv", "manifest.json", "SCHEMA.md"):
        (corpus_root / name).write_text((fixture / name).read_text(encoding="utf-8"), encoding="utf-8")

    alternate_csv = tmp_path / "alternate.csv"
    alternate_csv.write_text("id\n1\n", encoding="utf-8")

    monkeypatch.setattr(loader, "__file__", str(service_dir / "loader.py"))
    monkeypatch.setenv("CORPUS_VERSION", "v1")
    monkeypatch.setenv("DATA_PATH", str(alternate_csv))
    monkeypatch.setenv("MANIFEST_PATH", str(corpus_root / "manifest.json"))

    ok, messages = validate_corpus_at_startup()

    assert ok is False
    assert messages == ["DATA_PATH"]


def test_validate_corpus_at_startup_fails_mismatched_manifest_path(monkeypatch, tmp_path):
    import loader

    fixture = Path(__file__).resolve().parent / "fixtures" / "corpus_v1"
    service_dir = tmp_path / "service"
    service_dir.mkdir()
    corpus_root = service_dir / "corpus" / "v1"
    corpus_root.mkdir(parents=True)
    for name in ("venues.csv", "manifest.json", "SCHEMA.md"):
        (corpus_root / name).write_text((fixture / name).read_text(encoding="utf-8"), encoding="utf-8")

    alternate_manifest = tmp_path / "alternate-manifest.json"
    alternate_manifest.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(loader, "__file__", str(service_dir / "loader.py"))
    monkeypatch.setenv("CORPUS_VERSION", "v1")
    monkeypatch.setenv("DATA_PATH", str(corpus_root / "venues.csv"))
    monkeypatch.setenv("MANIFEST_PATH", str(alternate_manifest))

    ok, messages = validate_corpus_at_startup()

    assert ok is False
    assert messages == ["MANIFEST_PATH"]


def test_validate_corpus_at_startup_warns_checksum_mismatch(monkeypatch, tmp_path):
    import loader

    fixture = Path(__file__).resolve().parent / "fixtures" / "corpus_v1"
    service_dir = tmp_path / "service"
    service_dir.mkdir()
    corpus_root = service_dir / "corpus" / "v1"
    corpus_root.mkdir(parents=True)
    for name in ("venues.csv", "manifest.json", "SCHEMA.md"):
        (corpus_root / name).write_text((fixture / name).read_text(encoding="utf-8"), encoding="utf-8")

    venues = corpus_root / "venues.csv"
    venues.write_text(venues.read_text(encoding="utf-8") + "\n", encoding="utf-8")

    monkeypatch.setattr(loader, "__file__", str(service_dir / "loader.py"))
    monkeypatch.setenv("CORPUS_VERSION", "v1")
    monkeypatch.setenv("DATA_PATH", str(corpus_root / "venues.csv"))
    monkeypatch.setenv("MANIFEST_PATH", str(corpus_root / "manifest.json"))

    ok, messages = validate_corpus_at_startup()

    assert ok is True
    assert any("Checksum mismatch" in message for message in messages)
def test_verify_file_paths_includes_manifest_path(monkeypatch, tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    data_file = tmp_path / "venues.csv"
    emb_file = tmp_path / "embeddings.npy"
    data_file.write_text("id,name\n1,Test\n", encoding="utf-8")
    np.save(emb_file, np.ones((1, 4), dtype="float32"))
    missing_manifest = tmp_path / "missing-manifest.json"

    monkeypatch.setenv("MODEL_PATH", str(model_dir))
    monkeypatch.setenv("DATA_PATH", str(data_file))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(emb_file))
    monkeypatch.setenv("MANIFEST_PATH", str(missing_manifest))

    ok, missing, _warnings = verify_file_paths()

    assert ok is False
    assert "MANIFEST_PATH" in missing
    assert not any(str(tmp_path) in item for item in missing)
    assert not any("\\" in item or "/" in item for item in missing)


def test_default_data_path_relative_corpus():
    import importlib

    import config

    importlib.reload(config)
    assert config.DATA_PATH.endswith("corpus/v1/venues.csv")


def test_row_count_matches_embeddings():
    import importlib

    import config
    import pandas as pd

    importlib.reload(config)
    npy_path = Path(config.EMBEDDINGS_PATH)
    if not npy_path.is_file():
        pytest.skip("location_embeddings.npy not present locally")

    df = pd.read_csv(config.DATA_PATH)
    embeddings = np.load(npy_path)
    assert len(df) == embeddings.shape[0]


def test_production_corpus_layout():
    from venue_corpus.validate import validate_corpus_dir

    prod_root = Path(__file__).resolve().parent.parent / "corpus" / "v1"
    if not (prod_root / "venues.csv").is_file():
        pytest.skip("production corpus/v1 not present")

    errors = validate_corpus_dir(prod_root)
    assert errors == []


def test_verify_file_paths_warns_missing_index(monkeypatch, tmp_path):
    """INDEX_PATH pointing to nonexistent dir should trigger optional warning, not hard failure."""
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    data_file = tmp_path / "venues.csv"
    data_file.write_text("id,name\n1,Test\n", encoding="utf-8")
    emb_file = tmp_path / "embeddings.npy"
    np.save(emb_file, np.ones((1, 4), dtype="float32"))
    manifest_file = tmp_path / "manifest.json"
    manifest_file.write_text("{}", encoding="utf-8")
    missing_index = tmp_path / "nonexistent-index"

    monkeypatch.setenv("MODEL_PATH", str(model_dir))
    monkeypatch.setenv("DATA_PATH", str(data_file))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(emb_file))
    monkeypatch.setenv("MANIFEST_PATH", str(manifest_file))
    monkeypatch.setenv("INDEX_PATH", str(missing_index))

    ok, missing, warnings = verify_file_paths()

    assert ok is True
    assert missing == []
    assert any("INDEX_PATH" in w for w in warnings)
    assert any("fall back" in w for w in warnings)


def test_verify_file_paths_warns_incomplete_index_files(monkeypatch, tmp_path):
    """INDEX_PATH dir exists but faiss.index missing — warning, not failure."""
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    data_file = tmp_path / "venues.csv"
    data_file.write_text("id,name\n1,Test\n", encoding="utf-8")
    emb_file = tmp_path / "embeddings.npy"
    np.save(emb_file, np.ones((1, 4), dtype="float32"))
    manifest_file = tmp_path / "manifest.json"
    manifest_file.write_text("{}", encoding="utf-8")
    index_dir = tmp_path / "index"
    index_dir.mkdir()

    monkeypatch.setenv("MODEL_PATH", str(model_dir))
    monkeypatch.setenv("DATA_PATH", str(data_file))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(emb_file))
    monkeypatch.setenv("MANIFEST_PATH", str(manifest_file))
    monkeypatch.setenv("INDEX_PATH", str(index_dir))

    ok, missing, warnings = verify_file_paths()

    assert ok is True
    assert missing == []
    assert any("faiss.index missing" in w for w in warnings)


def test_validate_index_metadata_missing_dir(monkeypatch, tmp_path):
    missing = tmp_path / "no-such-index"
    monkeypatch.setenv("INDEX_PATH", str(missing))
    exists, meta_ok, detail = validate_index_metadata()
    assert exists is False
    assert meta_ok is False


def test_validate_index_metadata_dir_exists_no_files(monkeypatch, tmp_path):
    index_dir = tmp_path / "index"
    index_dir.mkdir()
    monkeypatch.setenv("INDEX_PATH", str(index_dir))
    exists, meta_ok, detail = validate_index_metadata()
    assert exists is False  # no faiss.index
    assert meta_ok is False


def test_validate_index_metadata_valid(monkeypatch, tmp_path):
    index_dir = tmp_path / "index"
    index_dir.mkdir()
    (index_dir / "faiss.index").write_text("dummy", encoding="utf-8")
    import json

    metadata = {
        "build_timestamp": "2025-01-01T00:00:00",
        "corpus_checksum": "abc123",
        "row_count": 10,
        "dimensions": 384,
        "index_type": "faiss.IndexFlatIP",
    }
    (index_dir / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    monkeypatch.setenv("INDEX_PATH", str(index_dir))
    exists, meta_ok, detail = validate_index_metadata()
    assert exists is True
    assert meta_ok is True
    assert detail == ""


def test_validate_index_metadata_missing_fields(monkeypatch, tmp_path):
    index_dir = tmp_path / "index"
    index_dir.mkdir()
    (index_dir / "faiss.index").write_text("dummy", encoding="utf-8")
    import json

    (index_dir / "metadata.json").write_text(
        json.dumps({"build_timestamp": "x"}), encoding="utf-8"
    )
    monkeypatch.setenv("INDEX_PATH", str(index_dir))
    exists, meta_ok, detail = validate_index_metadata()
    assert exists is True
    assert meta_ok is False
    assert "missing fields" in detail


def test_validate_index_metadata_unreadable_json(monkeypatch, tmp_path):
    index_dir = tmp_path / "index"
    index_dir.mkdir()
    (index_dir / "faiss.index").write_text("dummy", encoding="utf-8")
    (index_dir / "metadata.json").write_text("not json", encoding="utf-8")
    monkeypatch.setenv("INDEX_PATH", str(index_dir))
    exists, meta_ok, detail = validate_index_metadata()
    assert exists is True
    assert meta_ok is False
    assert "unreadable" in detail


def test_validate_index_metadata_bad_dimensions(monkeypatch, tmp_path):
    index_dir = tmp_path / "index"
    index_dir.mkdir()
    (index_dir / "faiss.index").write_text("dummy", encoding="utf-8")
    import json

    metadata = {
        "build_timestamp": "2025-01-01T00:00:00",
        "corpus_checksum": "abc123",
        "row_count": 10,
        "dimensions": 0,
        "index_type": "faiss.IndexFlatIP",
    }
    (index_dir / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    monkeypatch.setenv("INDEX_PATH", str(index_dir))
    exists, meta_ok, detail = validate_index_metadata()
    assert exists is True
    assert meta_ok is False
    assert "dimensions" in detail
