"""Wave 0 red tests for planned search_service.py FAISS retrieval behavior."""

import os

import numpy as np
import pytest

from conftest import _LocRow, _FakeDf

from search_service import (
    ALLOW_TORCH_FULL_SCAN_FALLBACK,
    REQUIRED_DTO_FIELDS,
    SearchService,
    SearchStartupError,
    build_vector_index,
    create_location_dto,
)


def _tiny_rows():
    return [
        _LocRow(
            id=1,
            name="Sky Lounge",
            address="1 Rooftop Way",
            latitude=40.75,
            longitude=-73.98,
            type="Bar",
            price="expensive",
            rating=4.5,
            zone="Midtown",
            zoneId=10,
        ),
        _LocRow(
            id=2,
            name="Quiet Corner Cafe",
            address="2 Side St",
            latitude=40.73,
            longitude=-74.00,
            type="Cafe",
            price="moderate",
            rating=4.2,
            zone="West Village",
            zoneId=20,
        ),
        _LocRow(
            id=3,
            name="Late Night Slice",
            address="3 Broadway",
            latitude=40.74,
            longitude=-73.99,
            type="Restaurant",
            price="cheap",
            rating=4.0,
            zone="East Village",
            zoneId=30,
        ),
        _LocRow(
            id=4,
            name="Blue Note Jazz Club",
            address="131 W 3rd St",
            latitude=40.7308,
            longitude=-74.0020,
            type="Bar",
            price="moderate",
            rating=4.8,
            zone="Greenwich Village",
            zoneId=40,
        ),
        _LocRow(
            id=5,
            name="Smalls Jazz Club",
            address="183 W 10th St",
            latitude=40.7348,
            longitude=-74.0022,
            type="Bar",
            price="moderate",
            rating=4.7,
            zone="Greenwich Village",
            zoneId=40,
        ),
    ]


def _tiny_embeddings():
    vectors = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.9, 0.1, 0.0, 0.0],
            [0.85, 0.15, 0.0, 0.0],
        ],
        dtype="float32",
    )
    return vectors


class _FakeEncoder:
    def __init__(self, query_vector):
        self._query_vector = np.asarray(query_vector, dtype="float32")

    def encode(self, _query_text, convert_to_numpy=True):
        if convert_to_numpy:
            return self._query_vector.copy()
        return self._query_vector.copy()

    def get_sentence_embedding_dimension(self):
        return int(self._query_vector.shape[0])


def test_build_vector_index_normalizes_and_maps_row_ids():
    raw = np.array([[3.0, 4.0], [0.0, 5.0]], dtype="float32")
    index = build_vector_index(raw)

    assert index.dimensions == 2
    assert len(index.row_ids) == 2
    assert index.row_ids.tolist() == [0, 1]
    assert index.index.ntotal == 2


def test_build_vector_index_rejects_row_count_mismatch():
    df = _FakeDf(_tiny_rows()[:3])
    embeddings = _tiny_embeddings()[:2]

    with pytest.raises(SearchStartupError, match="row-count mismatch"):
        SearchService.from_startup(df, embeddings, encoder=_FakeEncoder([1, 0, 0, 0]))


def test_build_vector_index_rejects_dimension_mismatch():
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()[:, :3]

    with pytest.raises(SearchStartupError, match="dimension"):
        SearchService.from_startup(df, embeddings, encoder=_FakeEncoder([1, 0, 0, 0]))


def test_build_vector_index_rejects_empty_embeddings():
    with pytest.raises(SearchStartupError):
        build_vector_index(np.zeros((0, 4), dtype="float32"))


def test_search_service_over_fetch_then_filters_by_zone_and_price():
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([0.95, 0.05, 0.0, 0.0]),
        over_fetch_multiplier=3,
    )

    results = service.search(
        "rooftop views",
        limit=2,
        location_filter="Greenwich",
        price_range="mid",
    )

    assert len(results) <= 2
    assert all(item["zone"] == "Greenwich Village" for item in results)
    assert all(item["price"] in {"moderate", "mid"} for item in results)


def test_find_similar_excludes_source_name():
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
    )

    results = service.find_similar(
        query_text="Blue Note Jazz Club Greenwich Village Bar",
        exclude_names=["Blue Note Jazz Club"],
        limit=3,
    )

    assert all(item["name"] != "Blue Note Jazz Club" for item in results)


def test_create_location_dto_exposes_stable_fields():
    row = _tiny_rows()[0]
    dto = create_location_dto(row, similarity_score=0.91)

    assert set(dto.keys()) == set(REQUIRED_DTO_FIELDS)
    assert dto["id"] == 1
    assert dto["name"] == "Sky Lounge"
    assert dto["similarity"] == pytest.approx(0.91)


def test_index_construction_failure_raises_controlled_startup_error(monkeypatch):
    def _broken_build(_raw):
        raise RuntimeError("faiss unavailable")

    monkeypatch.setattr("search_service.build_vector_index", _broken_build)

    with pytest.raises(SearchStartupError, match="index construction"):
        SearchService.from_startup(
            _FakeDf(_tiny_rows()),
            _tiny_embeddings(),
            encoder=_FakeEncoder([1, 0, 0, 0]),
        )


def test_no_silent_torch_fallback_without_explicit_flag(monkeypatch):
    monkeypatch.delenv("ALLOW_TORCH_FULL_SCAN_FALLBACK", raising=False)
    monkeypatch.setattr("search_service.ALLOW_TORCH_FULL_SCAN_FALLBACK", False)

    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([1, 0, 0, 0]),
    )

    assert service.uses_faiss_index is True
    with pytest.raises(SearchStartupError):
        service._torch_full_corpus_search("fallback probe")


def test_torch_fallback_allowed_only_when_flag_set(monkeypatch):
    monkeypatch.setenv("ALLOW_TORCH_FULL_SCAN_FALLBACK", "true")
    monkeypatch.setattr("search_service.ALLOW_TORCH_FULL_SCAN_FALLBACK", True)

    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        allow_torch_fallback=True,
    )

    results, confidence = service._torch_full_corpus_search("jazz")
    assert isinstance(results, list)
    assert confidence >= 0.0


# ---------------------------------------------------------------------------
# Persisted-index startup tests (M001/S03/T03)
# ---------------------------------------------------------------------------

def test_from_startup_with_persisted_index(monkeypatch):
    """from_startup loads persisted index when valid faiss.index + metadata exist."""
    import tempfile
    from pathlib import Path

    from test_index_loader import _build_fixture_index

    with tempfile.TemporaryDirectory() as tmp:
        index_dir = Path(tmp) / "index"
        _build_fixture_index(index_dir, n_vectors=5, dimensions=4)

        import config

        # Point MANIFEST_PATH to a non-existent file so manifest validation is skipped.
        monkeypatch.setattr(config, "MANIFEST_PATH", str(Path(tmp) / "nonexistent_manifest.json"))

        df = _FakeDf(_tiny_rows()[:5])
        embeddings = _tiny_embeddings()

        service = SearchService.from_startup(
            df,
            embeddings,
            encoder=_FakeEncoder([1, 0, 0, 0]),
            index_path=str(index_dir),
        )

        assert service._index_source == "persisted"
        assert service.uses_faiss_index is True


def test_from_startup_falls_back_when_index_missing():
    """from_startup falls back to .npy-built when index_path does not exist."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([1, 0, 0, 0]),
        index_path="/nonexistent/path/for/test",
    )

    assert service._index_source == "npy-built"


def test_from_startup_falls_back_on_checksum_mismatch(monkeypatch):
    """from_startup falls back to .npy when persisted index checksum != manifest."""
    import tempfile
    from pathlib import Path

    from test_index_loader import _build_fixture_index, _build_fixture_manifest

    with tempfile.TemporaryDirectory() as tmp:
        index_dir = Path(tmp) / "index"
        manifest_path = Path(tmp) / "manifest.json"

        _build_fixture_index(index_dir, n_vectors=3, dimensions=4, checksum="wrong_checksum")
        _build_fixture_manifest(manifest_path, checksum="correct_checksum")

        import config

        monkeypatch.setattr(config, "MANIFEST_PATH", str(manifest_path))

        df = _FakeDf(_tiny_rows()[:3])
        embeddings = _tiny_embeddings()[:3]

        service = SearchService.from_startup(
            df,
            embeddings,
            encoder=_FakeEncoder([1, 0, 0, 0]),
            index_path=str(index_dir),
        )

        assert service._index_source == "npy-built"
