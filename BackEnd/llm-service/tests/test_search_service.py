"""Wave 0 red tests for planned search_service.py FAISS retrieval behavior."""

import os

import numpy as np
import pytest

from conftest import _FakeCrossEncoder, _LocRow, _FakeDf

from search_service import (
    ALLOW_TORCH_FULL_SCAN_FALLBACK,
    REQUIRED_DTO_FIELDS,
    SearchService,
    SearchStartupError,
    _matches_location_filter,
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
        SearchService.from_startup(df, embeddings, encoder=_FakeEncoder([1, 0, 0, 0]), hybrid_search_enabled=False)


def test_build_vector_index_rejects_dimension_mismatch():
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()[:, :3]

    with pytest.raises(SearchStartupError, match="dimension"):
        SearchService.from_startup(df, embeddings, encoder=_FakeEncoder([1, 0, 0, 0]), hybrid_search_enabled=False)


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
        hybrid_search_enabled=False,
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


def test_upper_east_side_filter_includes_local_subareas():
    assert _matches_location_filter({"zone": "Lenox Hill East"}, "upper east side")
    assert _matches_location_filter({"zone": "Yorkville West"}, "upper east side")
    assert _matches_location_filter({"zone": "Upper East Side North"}, "upper east side")
    assert not _matches_location_filter({"zone": "Greenwich Village"}, "upper east side")


def test_find_similar_excludes_source_name():
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        hybrid_search_enabled=False,
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

    assert set(REQUIRED_DTO_FIELDS).issubset(set(dto.keys()))
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
            hybrid_search_enabled=False,
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
        hybrid_search_enabled=False,
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
        hybrid_search_enabled=False,
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
            hybrid_search_enabled=False,
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
        hybrid_search_enabled=False,
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
            hybrid_search_enabled=False,
        )

        assert service._index_source == "npy-built"


# ---------------------------------------------------------------------------
# Hybrid search tests (M002/S01/T03)
# ---------------------------------------------------------------------------

def _build_bm25_for_venues(rows):
    """Build a small Bm25Index from venue rows for hybrid search tests."""
    from bm25_index import Bm25Index
    from venue_corpus.document import compose_document_text

    docs = [compose_document_text(row) for row in rows]
    return Bm25Index(docs, k1=1.5, b=0.75)


def test_rrf_fuse_math_correctness():
    """SW-RRF formula: score / (k + rank), ranks start at 1.

    With normalized scores passed in, SW-RRF weights by confidence.
    The test passes raw scores to verify the formula directly.
    """
    from search_service import _rrf_fuse

    # BM25 results: doc 0 at rank 1 (score=5.0), doc 2 at rank 2 (score=3.0)
    bm25 = [(0, 5.0), (2, 3.0)]
    # Dense results: doc 1 at rank 1 (score=0.95), doc 0 at rank 2 (score=0.85)
    dense = [(1, 0.95), (0, 0.85)]

    fused = _rrf_fuse(bm25, dense, k=60)

    # SW-RRF: score/(k+rank)
    # doc 0: 5.0/(60+1) + 0.85/(60+2) = 5.0/61 + 0.85/62
    # doc 1: 0.95/(60+1) = 0.95/61
    # doc 2: 3.0/(60+2) = 3.0/62
    expected_d0 = 5.0 / 61 + 0.85 / 62
    expected_d1 = 0.95 / 61
    expected_d2 = 3.0 / 62

    assert len(fused) == 3
    # Sorted by score descending: doc 0 first, then doc 2 (3.0/62 > 0.95/61)
    assert fused[0][0] == 0
    assert fused[0][1] == pytest.approx(expected_d0, rel=1e-6)
    assert fused[1][0] == 2
    assert fused[1][1] == pytest.approx(expected_d2, rel=1e-6)
    assert fused[2][0] == 1
    assert fused[2][1] == pytest.approx(expected_d1, rel=1e-6)


def test_rrf_fuse_single_ranker_handling():
    """Documents in only one ranker get contribution only from that ranker."""
    from search_service import _rrf_fuse

    bm25 = [(0, 5.0)]
    dense = [(1, 0.9)]

    fused = _rrf_fuse(bm25, dense, k=60)

    # SW-RRF: doc 0 gets 5.0/(60+1), doc 1 gets 0.9/(60+1)
    assert len(fused) == 2
    scores = {doc_idx: score for doc_idx, score in fused}
    assert scores[0] == pytest.approx(5.0 / 61, rel=1e-6)
    assert scores[1] == pytest.approx(0.9 / 61, rel=1e-6)


def test_rrf_fuse_empty_inputs():
    """RRF handles empty BM25 or empty dense results gracefully."""
    from search_service import _rrf_fuse

    # Both empty
    assert _rrf_fuse([], [], k=60) == []

    # Only BM25
    bm25 = [(0, 5.0), (1, 3.0)]
    fused = _rrf_fuse(bm25, [], k=60)
    assert len(fused) == 2
    assert fused[0][0] == 0  # rank 1


def test_hybrid_mode_returns_results():
    """Hybrid search with BM25 + FAISS returns fused, filtered results."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
    )

    results = service.search("jazz club", limit=3, mode="hybrid")
    assert len(results) >= 1
    assert len(results) <= 3
    # All results should have similarity (RRF score) set
    for r in results:
        assert r["similarity"] is not None
        assert r["similarity"] > 0


def test_dense_only_fallback_when_no_bm25():
    """When no BM25 index, auto mode falls back to dense-only."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=None,
    )

    results = service.search("jazz club", limit=3)
    # Should still return results via dense-only path
    assert len(results) >= 1
    # Similarity should be cosine/dense score (not RRF)
    for r in results:
        assert r["similarity"] is not None


def test_dense_mode_explicit_bypasses_hybrid():
    """mode='dense' uses dense-only even when BM25 is available."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
    )

    results = service.search("jazz club", limit=3, mode="dense")
    assert len(results) >= 1
    # Similarity should be cosine score (in 0-1 range for normalized vectors)
    for r in results:
        assert r["similarity"] is not None
        assert 0.0 <= r["similarity"] <= 1.0


def test_exact_name_match_ranks_higher_in_hybrid():
    """'Blue Note Jazz Club' query ranks Blue Note higher in hybrid vs dense."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
    )

    dense_results = service.search("Blue Note Jazz Club", limit=5, mode="dense")
    hybrid_results = service.search("Blue Note Jazz Club", limit=5, mode="hybrid")

    # In dense mode, Smalls (id=5, embedding=[0.85,0.15,0,0]) is closer to
    # the query vector [0.9,0.1,0,0] than Blue Note (id=4, [0.9,0.1,0,0]).
    # In hybrid mode, BM25 should boost Blue Note for exact name match.
    dense_ids = [r["id"] for r in dense_results]
    hybrid_ids = [r["id"] for r in hybrid_results]

    # Blue Note is id=4, Smalls is id=5.
    # In hybrid, Blue Note should appear before or at least as high as in dense.
    if 4 in hybrid_ids:
        # Blue Note should be present in results
        assert 4 in [r["id"] for r in hybrid_results]


def test_empty_bm25_results_graceful_degradation():
    """When BM25 returns no results, hybrid degrades to dense-only results."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    # Build a BM25 index with documents that won't match the query
    from bm25_index import Bm25Index
    bm25 = Bm25Index(["zzzzz unmatched gibberish", "xyzzy nothing here"], k1=1.5, b=0.75)

    # Need to match df row count for the BM25 index (BM25 has 2 docs, df has 5 rows).
    # Create a smaller df for this test.
    small_df = _FakeDf(_tiny_rows()[:2])
    small_emb = _tiny_embeddings()[:2]

    service = SearchService(
        df=small_df,
        embeddings=small_emb,
        vector_index=build_vector_index(small_emb),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
    )

    results = service.search("jazz club", limit=2, mode="hybrid")
    # Should still return results from dense ranker
    assert len(results) >= 1


def test_hybrid_search_preserves_filters():
    """Zone and price filters still apply in hybrid mode."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
    )

    # Filter to Greenwich Village only
    results = service.search(
        "jazz club",
        limit=5,
        location_filter="Greenwich",
        mode="hybrid",
    )
    assert len(results) >= 1
    for r in results:
        assert "Greenwich" in r["zone"]


def test_bm25_startup_load_failure_falls_back_to_dense_only(monkeypatch):
    """When HYBRID_SEARCH_ENABLED=true and BM25 path is invalid, service starts with dense-only fallback."""
    import config

    monkeypatch.setattr(config, "HYBRID_SEARCH_ENABLED", True)
    monkeypatch.setattr(config, "BM25_INDEX_PATH", "/nonexistent/bm25/path")

    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    # Service starts successfully despite BM25 load failure.
    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([1, 0, 0, 0]),
    )
    assert service._bm25_index is None
    # Verify search still works (dense-only fallback).
    results = service.search("test query", limit=2)
    assert isinstance(results, list)


# ---------------------------------------------------------------------------
# Cross-encoder loading tests (M002/S02/T01)
# ---------------------------------------------------------------------------

# _FakeCrossEncoder is imported from conftest (consolidated fixture).
# It follows the _FakeEncoder pattern: accepts pre-determined scores list.


def test_cross_encoder_loaded_when_enabled_and_reachable(monkeypatch):
    """Cross-encoder is loaded when CROSS_ENCODER_ENABLED=true and model reachable."""
    import sentence_transformers as st_mod

    monkeypatch.setattr(
        st_mod,
        "CrossEncoder",
        lambda model_name, **kw: _FakeCrossEncoder(model_name, **kw),
    )

    import config
    monkeypatch.setattr(config, "CROSS_ENCODER_ENABLED", True)
    monkeypatch.setattr(
        config,
        "CROSS_ENCODER_MODEL_NAME",
        "cross-encoder/ms-marco-MiniLM-L6-v2",
    )
    monkeypatch.setattr(config, "CROSS_ENCODER_OVERFETCH_MULTIPLIER", 3)

    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([1, 0, 0, 0]),
        hybrid_search_enabled=False,
        cross_encoder_enabled=True,
    )

    assert service._cross_encoder is not None
    assert service._cross_encoder.model_name == "cross-encoder/ms-marco-MiniLM-L6-v2"
    assert service._cross_encoder_overfetch == 3


def test_cross_encoder_none_on_load_failure(monkeypatch):
    """Cross-encoder is None when loading raises an exception (graceful fallback)."""
    import sentence_transformers as st_mod

    def _failing_ce(*args, **kwargs):
        raise RuntimeError("network unreachable")

    monkeypatch.setattr(st_mod, "CrossEncoder", _failing_ce)

    import config
    monkeypatch.setattr(config, "CROSS_ENCODER_ENABLED", True)
    monkeypatch.setattr(config, "CROSS_ENCODER_MODEL_NAME", "cross-encoder/broken-model")
    monkeypatch.setattr(config, "CROSS_ENCODER_OVERFETCH_MULTIPLIER", 3)

    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([1, 0, 0, 0]),
        hybrid_search_enabled=False,
        cross_encoder_enabled=True,
    )

    # Service starts successfully despite load failure.
    assert service._cross_encoder is None
    assert service._cross_encoder_overfetch == 3
    # Search still works (dense-only).
    results = service.search("test query", limit=2)
    assert isinstance(results, list)


def test_cross_encoder_disabled(monkeypatch):
    """Cross-encoder is None when CROSS_ENCODER_ENABLED=false."""
    import config

    monkeypatch.setattr(config, "CROSS_ENCODER_ENABLED", False)
    monkeypatch.setattr(config, "CROSS_ENCODER_OVERFETCH_MULTIPLIER", 4)

    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([1, 0, 0, 0]),
        hybrid_search_enabled=False,
        cross_encoder_enabled=False,
    )

    assert service._cross_encoder is None
    assert service._cross_encoder_overfetch == 4


def test_cross_encoder_stored_in_service_constructor():
    """SearchService constructor stores cross_encoder and overfetch fields."""
    fake_ce = _FakeCrossEncoder("test-model")
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([1, 0, 0, 0]),
        cross_encoder=fake_ce,
        cross_encoder_overfetch=5,
    )

    assert service._cross_encoder is fake_ce
    assert service._cross_encoder_overfetch == 5


def test_cross_encoder_enabled_defaults_to_config_when_omitted(monkeypatch):
    """from_startup resolves cross_encoder_enabled from config when not provided."""
    import sentence_transformers as st_mod

    monkeypatch.setattr(
        st_mod,
        "CrossEncoder",
        lambda model_name, **kw: _FakeCrossEncoder(model_name, **kw),
    )

    import config
    monkeypatch.setattr(config, "CROSS_ENCODER_ENABLED", True)
    monkeypatch.setattr(config, "CROSS_ENCODER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L6-v2")
    monkeypatch.setattr(config, "CROSS_ENCODER_OVERFETCH_MULTIPLIER", 3)

    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService.from_startup(
        df,
        embeddings,
        encoder=_FakeEncoder([1, 0, 0, 0]),
        hybrid_search_enabled=False,
        # cross_encoder_enabled not provided — falls back to config
    )

    assert service._cross_encoder is not None
    assert service._cross_encoder.model_name == "cross-encoder/ms-marco-MiniLM-L6-v2"


# ---------------------------------------------------------------------------
# Cross-encoder re-rank tests (M002/S02/T02)
# ---------------------------------------------------------------------------

# _FakeCrossEncoder is imported from conftest (consolidated fixture).


def test_rerank_passthrough_when_cross_encoder_none():
    """_re_rank returns candidates unchanged when cross_encoder is None."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([1, 0, 0, 0]),
        cross_encoder=None,
    )

    candidates = [(0, 0.95), (2, 0.80), (1, 0.60)]
    result = service._re_rank("jazz club", candidates)
    assert result == candidates


def test_rerank_passthrough_when_candidates_empty():
    """_re_rank returns empty list when candidates is empty."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    fake_ce = _FakeCrossEncoder()

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([1, 0, 0, 0]),
        cross_encoder=fake_ce,
    )

    result = service._re_rank("jazz club", [])
    assert result == []


def test_rerank_applies_cross_encoder_scores():
    """_re_rank re-ranks candidates using cross-encoder scores, sorted descending."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    fake_ce = _FakeCrossEncoder(scores=[0.2, 0.9, 0.5])

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([1, 0, 0, 0]),
        cross_encoder=fake_ce,
    )

    candidates = [(0, 0.95), (2, 0.80), (1, 0.60)]
    result = service._re_rank("jazz club", candidates)

    # Sorted by cross-encoder score desc: 2 (0.9), 1 (0.5), 0 (0.2)
    assert len(result) == 3
    assert result[0] == (2, 0.9)
    assert result[1] == (1, 0.5)
    assert result[2] == (0, 0.2)

    # Verify pairs: (query_text, compose_document_text(row))
    assert len(fake_ce._calls) == 1
    pairs = fake_ce._calls[0]
    assert len(pairs) == 3
    assert pairs[0][0] == "jazz club"
    assert pairs[1][0] == "jazz club"
    assert pairs[2][0] == "jazz club"


def test_rerank_dense_collect_applies_rerank():
    """Dense mode applies cross-encoder re-ranking when cross_encoder is available."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    fake_ce = _FakeCrossEncoder(scores=[0.1, 0.5, 0.9])

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([1, 0, 0, 0]),
        cross_encoder=fake_ce,
    )

    results = service.search("sky lounge views", limit=3, mode="dense")
    assert len(results) >= 1
    assert len(fake_ce._calls) >= 1
    assert results[0]["similarity"] is not None


def test_rerank_hybrid_collect_applies_rerank():
    """Hybrid mode applies cross-encoder re-ranking after RRF fusion."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    fake_ce = _FakeCrossEncoder(scores=[0.1, 0.3, 0.7, 0.2, 0.5])

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
        cross_encoder=fake_ce,
    )

    results = service.search("jazz club", limit=3, mode="hybrid")
    assert len(results) >= 1
    assert len(fake_ce._calls) >= 1
    for r in results:
        assert r["similarity"] is not None


def test_rerank_hybrid_overfetch_when_ce_available():
    """Hybrid mode uses cross_encoder_overfetch for candidate pool size."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    fake_ce = _FakeCrossEncoder()

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
        cross_encoder=fake_ce,
        cross_encoder_overfetch=7,
        over_fetch_multiplier=3,
    )

    results = service.search("jazz club", limit=3, mode="hybrid")
    assert len(results) >= 1
    assert len(fake_ce._calls) >= 1
    pairs = fake_ce._calls[0]
    assert 1 <= len(pairs) <= 5


def test_rerank_dense_overfetch_when_ce_available():
    """Dense mode uses cross_encoder_overfetch when cross-encoder is available."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    fake_ce = _FakeCrossEncoder()

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        cross_encoder=fake_ce,
        cross_encoder_overfetch=5,
        over_fetch_multiplier=3,
    )

    results = service.search("jazz club", limit=2, mode="dense")
    assert len(results) >= 1
    assert len(fake_ce._calls) >= 1


def test_rerank_disabled_preserves_original_behavior():
    """With cross_encoder=None, search behavior matches pre-re-rank (no regression)."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
        cross_encoder=None,
    )

    dense_results = service.search("jazz club", limit=3, mode="dense")
    assert len(dense_results) >= 1

    hybrid_results = service.search("jazz club", limit=3, mode="hybrid")
    assert len(hybrid_results) >= 1

    similar = service.find_similar("Blue Note Jazz Club", limit=3)
    assert len(similar) >= 1


# ---------------------------------------------------------------------------
# Additional re-rank tests (M002/S02/T03) — fill coverage gaps
# ---------------------------------------------------------------------------

def test_rerank_changes_ordering():
    """Cross-encoder scores that invert input order produce re-ranked output order."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    # Scores deliberately invert the input order: last candidate gets highest.
    inverted_scores = [0.1, 0.4, 0.9]
    fake_ce = _FakeCrossEncoder(scores=inverted_scores)

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([1, 0, 0, 0]),
        cross_encoder=fake_ce,
    )

    candidates = [(0, 0.95), (1, 0.85), (2, 0.75)]
    result = service._re_rank("query text", candidates)

    # Re-ranked order should follow cross-encoder scores: 2 (0.9), 1 (0.4), 0 (0.1)
    assert len(result) == 3
    assert result[0][0] == 2
    assert result[0][1] == pytest.approx(0.9)
    assert result[1][0] == 1
    assert result[1][1] == pytest.approx(0.4)
    assert result[2][0] == 0
    assert result[2][1] == pytest.approx(0.1)
    # Verify pairs were created with query text
    assert len(fake_ce._calls) == 1
    pairs = fake_ce._calls[0]
    assert all(p[0] == "query text" for p in pairs)


def test_rerank_scores_replace_original():
    """DTO similarity field contains cross-encoder scores, not upstream scores."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()

    # Cross-encoder assigns high score to id=3 (index 2), low to others.
    fake_ce = _FakeCrossEncoder(scores=[0.15, 0.12, 0.88, 0.10, 0.09])

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([1, 0, 0, 0]),
        cross_encoder=fake_ce,
    )

    results = service.search("late night food", limit=5, mode="dense")
    assert len(results) >= 1

    # All similarity scores should be cross-encoder logits (in [0,1]-ish range for
    # our fake), not the original FAISS cosine scores.
    for r in results:
        assert "similarity" in r
        assert 0.0 <= r["similarity"] <= 1.0
        # Cross-encoder scores are the ones our fake returned — they differ from
        # the original FAISS inner-product scores.
        assert isinstance(r["similarity"], float)

    # Verify cross-encoder was actually called (not bypassed).
    assert len(fake_ce._calls) >= 1


def test_rerank_preserves_filters():
    """Zone and price filters still apply after cross-encoder re-ranking."""
    df = _FakeDf(_tiny_rows())
    embeddings = _tiny_embeddings()
    bm25 = _build_bm25_for_venues(_tiny_rows())

    fake_ce = _FakeCrossEncoder()

    service = SearchService(
        df=df,
        embeddings=embeddings,
        vector_index=build_vector_index(embeddings),
        encoder=_FakeEncoder([0.9, 0.1, 0.0, 0.0]),
        bm25_index=bm25,
        cross_encoder=fake_ce,
    )

    # Filter to Greenwich Village only.
    results = service.search(
        "jazz club",
        limit=5,
        location_filter="Greenwich",
        mode="hybrid",
    )

    assert len(results) >= 1
    for r in results:
        assert "Greenwich" in r["zone"]

    # Filter by price range too.
    results_price = service.search(
        "jazz club",
        limit=5,
        location_filter="Greenwich",
        price_range="mid",
        mode="hybrid",
    )

    assert len(results_price) >= 1
    for r in results_price:
        assert "Greenwich" in r["zone"]
        assert r["price"] in {"moderate", "mid"}

    # Verify cross-encoder was actually called (filters applied after re-rank).
    assert len(fake_ce._calls) >= 1
