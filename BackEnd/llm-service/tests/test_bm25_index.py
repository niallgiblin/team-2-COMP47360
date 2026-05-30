"""Tests for BM25 sparse lexical index.

Covers exact name match retrieval, edge cases (empty query/corpus),
stop-word handling, score monotonicity, and the 'Blue Note Jazz Club'
scenario using venue-corpus document texts.
"""

import pytest

from bm25_index import _STOP_WORDS, _tokenize, Bm25Index
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
