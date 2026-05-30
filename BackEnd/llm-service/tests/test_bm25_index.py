"""Tests for BM25 sparse lexical index.

Covers exact name match retrieval, edge cases (empty query/corpus),
stop-word handling, score monotonicity, the 'Blue Note Jazz Club'
scenario using venue-corpus document texts, and persistence
round-trip (save → load → verify).
"""

import json
import pickle
import tempfile
from pathlib import Path

import pytest

from bm25_index import _STOP_WORDS, _tokenize, Bm25Index
from retrieval.bm25_loader import (
    Bm25LoadError,
    load_bm25_index,
    save_bm25_index,
    write_bm25_metadata,
)
from venue_corpus.document import compose_document_text

# ---------------------------------------------------------------------------
# Helper: build venue document texts matching the real embed pipeline
# ---------------------------------------------------------------------------


def _venue_doc(name, zone="Greenwich Village", loc_type="Bar",
               price="moderate", description="", tags="", summary="",
               info="", reviews=""):
    """Build a single labelled-line document text using compose_document_text."""
    from conftest import _LocRow

    row = _LocRow(
        name=name,
        zone=zone,
        loc_type=loc_type,
        price=price,
        description=description,
        tags=tags,
        summary=summary,
        Info=info,
        reviews=reviews,
    )
    return compose_document_text(row)


# Corpus of 6 venue documents simulating real data.
_VENUE_CORPUS = [
    _venue_doc(
        name="Blue Note Jazz Club",
        description="jazz club, live music, bar",
        tags="jazz, music, nightlife, bar",
        summary="Legendary jazz club with nightly live performances.",
        info="Name of location: Blue Note Jazz Club. Zone in NYC: Greenwich Village",
    ),
    _venue_doc(
        name="Smalls Jazz Club",
        description="intimate jazz club, live music",
        tags="jazz, music, nightlife, cocktails",
        summary="Intimate basement jazz club in Greenwich Village.",
    ),
    _venue_doc(
        name="Village Vanguard",
        description="historic jazz club, live music venue",
        tags="jazz, music, iconic",
        summary="Iconic triangular basement venue for live jazz since 1935.",
    ),
    _venue_doc(
        name="Central Park",
        description="large public park, green space",
        tags="park, nature, outdoor",
        summary="Iconic urban park in Manhattan with walking paths and lakes.",
    ),
    _venue_doc(
        name="The Dead Rabbit",
        description="irish pub, cocktails, gastropub",
        tags="pub, cocktails, irish, food",
        summary="Award-winning Irish pub with cocktail bar and dining.",
    ),
    _venue_doc(
        name="Blue Note Hawaii",
        description="jazz club, live music, Hawaiian venue",
        tags="jazz, music, hawaii",
        summary="Legendary jazz club brand with a Hawaiian outpost.",
    ),
]


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------


class TestTokenization:
    """Low-level tokenizer behaviour."""

    def test_lowercases(self):
        tokens = _tokenize("Blue Note Jazz CLUB")
        assert "club" in tokens
        assert "CLUB" not in tokens

    def test_filters_stop_words(self):
        tokens = _tokenize("the blue note and the jazz club")
        assert "the" not in tokens
        assert "and" not in tokens
        assert "blue" in tokens
        assert "note" in tokens
        assert "jazz" in tokens
        assert "club" in tokens

    def test_empty_string_returns_empty(self):
        assert _tokenize("") == []
        assert _tokenize("   ") == []

    def test_punctuation_removed(self):
        tokens = _tokenize("hello, world! test.")
        assert tokens == ["hello", "world", "test"]

    def test_numbers_preserved(self):
        tokens = _tokenize("room 42 level 3")
        assert "42" in tokens
        assert "3" in tokens


class TestStopWordSet:
    """Basic sanity checks on the stop-word set."""

    def test_common_stop_words_present(self):
        assert "the" in _STOP_WORDS
        assert "a" in _STOP_WORDS
        assert "an" in _STOP_WORDS
        assert "and" in _STOP_WORDS
        assert "or" in _STOP_WORDS
        assert "of" in _STOP_WORDS
        assert "in" in _STOP_WORDS
        assert "is" in _STOP_WORDS
        assert "it" in _STOP_WORDS
        assert "to" in _STOP_WORDS

    def test_meaningful_words_not_present(self):
        assert "jazz" not in _STOP_WORDS
        assert "club" not in _STOP_WORDS
        assert "park" not in _STOP_WORDS
        assert "venue" not in _STOP_WORDS

    def test_stop_word_count_approx_150(self):
        # Should be roughly 150 — allow a range.
        assert 130 <= len(_STOP_WORDS) <= 170


# ---------------------------------------------------------------------------
# BM25 Index construction
# ---------------------------------------------------------------------------


class TestBm25IndexConstruction:
    """Index builder behaviour for various corpus shapes."""

    def test_empty_corpus(self):
        idx = Bm25Index([])
        assert idx.doc_count == 0
        assert idx.avgdl == 0.0
        assert idx.search("query") == []

    def test_single_document(self):
        idx = Bm25Index(["blue note jazz club"])
        assert idx.doc_count == 1
        assert idx.avgdl > 0
        results = idx.search("blue note")
        assert len(results) == 1
        assert results[0][0] == 0
        assert results[0][1] > 0

    def test_configurable_k1_b(self):
        idx_default = Bm25Index(["jazz club"], k1=1.5, b=0.75)
        idx_custom = Bm25Index(["jazz club"], k1=2.0, b=0.5)
        assert idx_default.k1 == 1.5
        assert idx_default.b == 0.75
        assert idx_custom.k1 == 2.0
        assert idx_custom.b == 0.5

    def test_doc_count_matches_input(self):
        idx = Bm25Index(_VENUE_CORPUS)
        assert idx.doc_count == len(_VENUE_CORPUS)

    def test_avgdl_positive_for_nonempty_corpus(self):
        idx = Bm25Index(_VENUE_CORPUS)
        assert idx.avgdl > 0

    def test_repr(self):
        idx = Bm25Index(["a document", "another document"])
        r = repr(idx)
        assert "Bm25Index" in r
        assert "doc_count=2" in r


# ---------------------------------------------------------------------------
# BM25 Search
# ---------------------------------------------------------------------------


class TestBm25Search:
    """Search behaviour and scoring."""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.idx = Bm25Index(_VENUE_CORPUS)

    def test_exact_name_match_top_result(self):
        results = self.idx.search("Blue Note Jazz Club", top_k=3)
        assert len(results) >= 1
        # Document 0 is "Blue Note Jazz Club"
        assert results[0][0] == 0
        assert results[0][1] > 0

    def test_blue_note_jazz_club_scenario(self):
        """Exact venue name query returns the correct venue first."""
        results = self.idx.search("Blue Note Jazz Club", top_k=5)
        assert len(results) >= 1
        top_doc_idx = results[0][0]
        top_doc_text = _VENUE_CORPUS[top_doc_idx]
        assert "Blue Note Jazz Club" in top_doc_text
        # Blue Note Hawaii should NOT be top result for "Blue Note Jazz Club"
        # because "Jazz Club" discriminates.
        top_pair = results[0]
        assert top_pair[1] > 0

    def test_partial_name_match_finds_correct_venue(self):
        """Querying 'Smalls' alone should retrieve Smalls Jazz Club."""
        results = self.idx.search("Smalls", top_k=3)
        assert len(results) >= 1
        top_idx = results[0][0]
        assert "Smalls Jazz Club" in _VENUE_CORPUS[top_idx]

    def test_keyword_search_retrieves_relevant(self):
        """Querying 'jazz' should retrieve multiple jazz venues."""
        results = self.idx.search("jazz", top_k=10)
        jazz_indices = [r[0] for r in results]
        # At least Blue Note Jazz Club and Smalls Jazz Club
        assert 0 in jazz_indices
        assert 1 in jazz_indices

    def test_irrelevant_query_scores_low_or_zero(self):
        """A term not in the corpus should not inflate scores."""
        results = self.idx.search("xylophone", top_k=5)
        # "xylophone" is OOV — all scores should be 0, yielding empty results
        assert results == []

    def test_empty_query_returns_empty(self):
        assert self.idx.search("") == []
        assert self.idx.search("   ") == []

    def test_stop_word_only_query_returns_empty(self):
        """A query composed entirely of stop words has no content-bearing terms."""
        results = self.idx.search("the and of in", top_k=5)
        assert results == []

    def test_score_monotonicity(self):
        """Scores must be strictly non-increasing from top to bottom."""
        results = self.idx.search("jazz club", top_k=6)
        assert len(results) >= 2
        scores = [r[1] for r in results]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1], (
                f"Score at position {i} ({scores[i]}) < position {i + 1} ({scores[i + 1]})"
            )

    def test_top_k_limits_results(self):
        results = self.idx.search("jazz", top_k=2)
        assert len(results) <= 2

    def test_top_k_zero_returns_empty(self):
        results = self.idx.search("jazz", top_k=0)
        assert results == []

    def test_no_duplicate_indices(self):
        """Each document should appear at most once in results."""
        results = self.idx.search("jazz club music", top_k=10)
        indices = [r[0] for r in results]
        assert len(indices) == len(set(indices))

    def test_query_with_stop_words_still_works(self):
        """Stop words are removed; content words drive the results."""
        results = self.idx.search("the blue note", top_k=3)
        assert len(results) >= 1
        # "the" is removed, "blue" and "note" match
        top_idx = results[0][0]
        assert top_idx in (0, 5)  # Blue Note Jazz Club or Blue Note Hawaii

    def test_hawaii_query_finds_hawaii_venue(self):
        results = self.idx.search("Hawaii", top_k=3)
        assert len(results) >= 1
        top_idx = results[0][0]
        assert "Blue Note Hawaii" in _VENUE_CORPUS[top_idx]


# ---------------------------------------------------------------------------
# Persistence: save / load round-trip
# ---------------------------------------------------------------------------


def _manifest_for_checksum(checksum: str) -> dict:
    """Minimal valid manifest dict for checksum validation."""
    return {
        "corpus_version": "v1",
        "schema_version": "1.0.0",
        "created_at": "2025-01-15T10:00:00Z",
        "venues_csv": {
            "path": "venues.csv",
            "sha256": checksum,
            "row_count": 6,
            "columns": ["id", "name", "description"],
        },
        "document_model": {
            "format": "labeled_lines",
            "one_document_per_venue": True,
            "embed_fields": ["name", "description"],
            "metadata_fields": ["id"],
        },
    }


def _write_manifest(path: Path, checksum: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(_manifest_for_checksum(checksum), fh, indent=2)


class TestBm25PersistenceRoundTrip:
    """Verify that a BM25 index survives save → load with identical scores."""

    def test_round_trip_preserves_scores(self):
        """Build → save → load → scores must be identical."""
        idx = Bm25Index(_VENUE_CORPUS)
        queries = [
            "Blue Note Jazz Club",
            "Smalls",
            "jazz",
            "Hawaii",
        ]

        # Capture pre-save scores.
        pre_scores = {}
        for q in queries:
            pre_scores[q] = idx.search(q, top_k=10)

        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            save_bm25_index(idx, index_dir)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test-abc123",
                row_count=idx._doc_count,
            )

            loaded = load_bm25_index(index_dir)

            for q in queries:
                post_scores = loaded.search(q, top_k=10)
                assert len(post_scores) == len(pre_scores[q]), (
                    f"Result count mismatch for query '{q}': "
                    f"{len(post_scores)} vs {len(pre_scores[q])}"
                )
                for (pre_idx, pre_score), (post_idx, post_score) in zip(
                    pre_scores[q], post_scores
                ):
                    assert pre_idx == post_idx, (
                        f"Doc index mismatch for query '{q}': "
                        f"{pre_idx} vs {post_idx}"
                    )
                    assert pre_score == pytest.approx(post_score), (
                        f"Score mismatch for query '{q}', doc {pre_idx}: "
                        f"{pre_score} vs {post_score}"
                    )

    def test_round_trip_empty_corpus(self):
        """Empty corpus round-trip preserves empty state."""
        idx = Bm25Index([])
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            save_bm25_index(idx, index_dir)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test-empty",
                row_count=0,
            )
            loaded = load_bm25_index(index_dir)

            assert loaded._doc_count == 0
            assert loaded._avgdl == 0.0
            assert loaded.search("anything") == []

    def test_round_trip_preserves_parameters(self):
        """k1 and b parameters must be preserved through round-trip."""
        idx = Bm25Index(["doc one", "doc two"], k1=2.5, b=0.3)
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            save_bm25_index(idx, index_dir)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test-params",
                row_count=2,
            )
            loaded = load_bm25_index(index_dir)

            assert loaded.k1 == 2.5
            assert loaded.b == 0.3


class TestBm25LoadErrorPaths:
    """Negative tests for BM25 loader error paths."""

    def test_missing_index_directory(self):
        with pytest.raises(Bm25LoadError, match="BM25 index directory not found"):
            load_bm25_index("/nonexistent/bm25/path/99999")

    def test_missing_pkl_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            # Write metadata but no bm25.pkl.
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test",
                row_count=0,
            )
            with pytest.raises(Bm25LoadError, match="BM25 index file not found"):
                load_bm25_index(index_dir)

    def test_missing_metadata_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            # Write pickle but no metadata.
            (index_dir / "bm25.pkl").write_bytes(b"not valid pickle")
            with pytest.raises(Bm25LoadError, match="Metadata file not found"):
                load_bm25_index(index_dir)

    def test_missing_required_metadata_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)

            idx = Bm25Index(_VENUE_CORPUS)
            save_bm25_index(idx, index_dir)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test",
                row_count=idx._doc_count,
            )

            # Remove a required field.
            md_path = index_dir / "metadata.json"
            with open(md_path, encoding="utf-8") as fh:
                md = json.load(fh)
            del md["corpus_checksum"]
            with open(md_path, "w", encoding="utf-8") as fh:
                json.dump(md, fh)

            with pytest.raises(Bm25LoadError, match="missing required fields"):
                load_bm25_index(index_dir)

    def test_wrong_index_type(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)

            idx = Bm25Index(_VENUE_CORPUS)
            save_bm25_index(idx, index_dir)

            md_path = index_dir / "metadata.json"
            md_path.write_text(json.dumps({
                "build_timestamp": "2025-01-15T10:00:00Z",
                "corpus_checksum": "test",
                "row_count": idx._doc_count,
                "bm25_version": "1.0.0",
                "index_type": "not-bm25",
            }))

            with pytest.raises(Bm25LoadError, match="Unsupported index_type"):
                load_bm25_index(index_dir)

    def test_empty_build_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)

            idx = Bm25Index(_VENUE_CORPUS)
            save_bm25_index(idx, index_dir)

            md_path = index_dir / "metadata.json"
            md_path.write_text(json.dumps({
                "build_timestamp": "",
                "corpus_checksum": "test",
                "row_count": idx._doc_count,
                "bm25_version": "1.0.0",
                "index_type": "bm25",
            }))

            with pytest.raises(Bm25LoadError, match="must not be empty"):
                load_bm25_index(index_dir)

    def test_row_count_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)

            idx = Bm25Index(_VENUE_CORPUS)
            save_bm25_index(idx, index_dir)

            md_path = index_dir / "metadata.json"
            md_path.write_text(json.dumps({
                "build_timestamp": "2025-01-15T10:00:00Z",
                "corpus_checksum": "test",
                "row_count": 999,
                "bm25_version": "1.0.0",
                "index_type": "bm25",
            }))

            with pytest.raises(Bm25LoadError, match="does not match"):
                load_bm25_index(index_dir)

    def test_corrupt_pickle(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            (index_dir / "bm25.pkl").write_bytes(b"this is not a valid pickle")
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test",
                row_count=6,
            )
            with pytest.raises(Bm25LoadError, match="Failed to read BM25 index"):
                load_bm25_index(index_dir)

    def test_pickle_not_a_dict(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            with open(index_dir / "bm25.pkl", "wb") as fh:
                pickle.dump(["not", "a", "dict"], fh)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test",
                row_count=6,
            )
            with pytest.raises(Bm25LoadError, match="BM25 pickle must contain a dict"):
                load_bm25_index(index_dir)

    def test_pickle_missing_required_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            with open(index_dir / "bm25.pkl", "wb") as fh:
                pickle.dump({"k1": 1.5, "b": 0.75}, fh)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="test",
                row_count=6,
            )
            with pytest.raises(Bm25LoadError, match="missing required keys"):
                load_bm25_index(index_dir)

    def test_bm25_load_error_is_exception_subclass(self):
        assert issubclass(Bm25LoadError, Exception)

    def test_checksum_validation_with_manifest(self):
        """load_bm25_index validates corpus_checksum against manifest."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            index_dir = tmp_path / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            manifest_path = tmp_path / "manifest.json"

            idx = Bm25Index(_VENUE_CORPUS)
            save_bm25_index(idx, index_dir)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="match123",
                row_count=idx._doc_count,
            )
            _write_manifest(manifest_path, "match123")

            # Matching checksums — no error.
            loaded = load_bm25_index(index_dir, manifest_path=manifest_path)
            assert loaded._doc_count == idx._doc_count

            # Mismatched checksums — should raise.
            _write_manifest(manifest_path, "different456")
            with pytest.raises(Bm25LoadError, match="checksum mismatch"):
                load_bm25_index(index_dir, manifest_path=manifest_path)

    def test_manifest_missing_checksum_raises(self):
        """Raises when manifest lacks venues_csv.sha256."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            index_dir = tmp_path / "bm25"
            index_dir.mkdir(parents=True, exist_ok=True)
            manifest_path = tmp_path / "manifest.json"

            idx = Bm25Index(_VENUE_CORPUS)
            save_bm25_index(idx, index_dir)
            write_bm25_metadata(
                index_dir / "metadata.json",
                corpus_checksum="abc123",
                row_count=idx._doc_count,
            )

            # Write manifest without sha256.
            bad_manifest = _manifest_for_checksum("abc123")
            del bad_manifest["venues_csv"]["sha256"]
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            with open(manifest_path, "w", encoding="utf-8") as fh:
                json.dump(bad_manifest, fh)

            with pytest.raises(Bm25LoadError, match="missing required keys"):
                load_bm25_index(index_dir, manifest_path=manifest_path)
