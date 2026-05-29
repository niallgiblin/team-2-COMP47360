"""Wave 0 red tests for planned loader.py startup validation."""

from pathlib import Path

import numpy as np
import pytest

from conftest import _FakeDf, _LocRow

from loader import (
    DATA_PATH,
    EMBEDDINGS_PATH,
    MODEL_PATH,
    StartupLoadError,
    validate_embeddings_matrix,
    validate_startup_data,
    verify_file_paths,
)


def test_verify_file_paths_reports_variable_names_only(monkeypatch, tmp_path):
    missing_dir = tmp_path / "missing-model"
    data_file = tmp_path / "locations.csv"
    emb_file = tmp_path / "embeddings.npy"
    data_file.write_text("id,name\n1,Test\n", encoding="utf-8")
    np.save(emb_file, np.ones((1, 4), dtype="float32"))

    monkeypatch.setenv("MODEL_PATH", str(missing_dir))
    monkeypatch.setenv("DATA_PATH", str(data_file))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(emb_file))

    ok, missing = verify_file_paths()

    assert ok is False
    assert missing == ["MODEL_PATH"]
    assert not any(str(tmp_path) in item for item in missing)
    assert not any("\\" in item or "/" in item for item in missing)


def test_verify_file_paths_accepts_present_files(monkeypatch, tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    data_file = tmp_path / "locations.csv"
    emb_file = tmp_path / "embeddings.npy"
    data_file.write_text("id,name\n1,Test\n", encoding="utf-8")
    np.save(emb_file, np.ones((1, 4), dtype="float32"))

    monkeypatch.setenv("MODEL_PATH", str(model_dir))
    monkeypatch.setenv("DATA_PATH", str(data_file))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(emb_file))

    ok, missing = verify_file_paths()

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


def test_missing_file_list_never_leaks_resolved_paths(monkeypatch, tmp_path):
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "secret-model-path"))
    monkeypatch.setenv("DATA_PATH", str(tmp_path / "secret-data.csv"))
    monkeypatch.setenv("EMBEDDINGS_PATH", str(tmp_path / "secret.npy"))

    ok, missing = verify_file_paths()

    assert ok is False
    for name in missing:
        assert name in {"MODEL_PATH", "DATA_PATH", "EMBEDDINGS_PATH"}
        assert "secret" not in name


@pytest.mark.xfail(reason="unblocks in 11-03 — loader.py must add MANIFEST_PATH check")
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

    ok, missing = verify_file_paths()

    assert ok is False
    assert "MANIFEST_PATH" in missing
    assert not any(str(tmp_path) in item for item in missing)
    assert not any("\\" in item or "/" in item for item in missing)


@pytest.mark.xfail(reason="unblocks in 11-03 — config.DATA_PATH default moves to corpus/v1/venues.csv")
def test_default_data_path_relative_corpus():
    import importlib

    import config

    importlib.reload(config)
    assert config.DATA_PATH.endswith("corpus/v1/venues.csv")
