"""Tests for Jev re-ranking (jev_service.rerank + search_service wiring)."""

from __future__ import annotations

import pytest

from conftest import _FakeCrossEncoder, _FakeDf, _LocRow
from jev_service import (
    JevError,
    build_rerank_questions,
    rerank,
)
from search_service import SearchService, build_vector_index


@pytest.fixture(autouse=True)
def _enable_rerank(monkeypatch):
    """rerank() is gated by JEV_RERANK_ENABLED (default false in config)."""
    import config

    monkeypatch.setattr(config, "JEV_RERANK_ENABLED", True)


class _FakeResponseClient:
    """Injected stand-in for JevClient returning Score answers."""

    def __init__(self, scores=None, error=None, available=True):
        self._scores = scores or {}
        self._error = error
        self.available = available
        self.calls = []

    def system_one(self, state, questions, **kwargs):
        self.calls.append((state, questions))
        if self._error:
            raise self._error
        return {
            key: {"type": "score", "score": self._scores[key],
                  "legend": {str(i): f"l{i}" for i in range(5)},
                  "probabilities": {str(i): (0.7 if i == round(self._scores[key]) else 0.075)
                                    for i in range(5)},
                  "confidence": 0.8}
            for key in questions
        }


class TestRerankQuestions:
    def test_one_score_question_per_candidate(self):
        questions = build_rerank_questions(3)
        assert set(questions) == {"rel_0", "rel_1", "rel_2"}
        assert all(q["type"] == "score" for q in questions.values())
        assert all(len(q["criteria"]) == 5 for q in questions.values())


class TestRerank:
    def test_returns_aligned_unit_scores(self):
        client = _FakeResponseClient(scores={"rel_0": 4, "rel_1": 0, "rel_2": 2})
        scores = rerank(
            "rooftop bar", ["doc a", "doc b", "doc c"],
            client=client, enabled=True,
        )
        assert scores == [1.0, 0.0, 0.5]

    def test_disabled_returns_none(self):
        client = _FakeResponseClient(scores={"rel_0": 4})
        assert rerank("q", ["a"], client=client, enabled=False) is None

    def test_empty_documents_returns_none(self):
        assert rerank("q", [], client=_FakeResponseClient(), enabled=True) is None

    def test_error_returns_none(self):
        assert rerank(
            "q", ["a"], client=_FakeResponseClient(error=JevError("boom")),
            enabled=True,
        ) is None

    def test_caps_at_max_candidates_and_pads(self):
        docs = [f"doc {i}" for i in range(10)]
        client = _FakeResponseClient(scores={f"rel_{i}": 4 for i in range(3)})
        scores = rerank("q", docs, client=client, enabled=True, max_candidates=3)
        assert len(scores) == 10
        assert scores[:3] == [1.0, 1.0, 1.0]
        assert scores[3:] == [0.0] * 7  # beyond cap → neutral
        state, questions = client.calls[0]
        assert len(questions) == 3


# ---------------------------------------------------------------------------
# SearchService wiring
# ---------------------------------------------------------------------------


def _service_row(idx):
    return _LocRow(
        id=idx, name=f"Venue {idx}", address=f"{idx} St",
        latitude=40.7, longitude=-74.0, type="Bar", price="moderate",
        rating=4.0, zone="Midtown", zoneId=1,
    )


def _service():
    import numpy as np

    rows = [_service_row(i) for i in range(1, 6)]
    emb = np.array(
        [[1.0, 0.0], [0.9, 0.1], [0.8, 0.2], [0.7, 0.3], [0.6, 0.4]],
        dtype="float32",
    )
    return SearchService(
        df=_FakeDf(rows),
        embeddings=emb,
        vector_index=build_vector_index(emb),
        encoder=None,
        jev_rerank=True,
        jev_rerank_overfetch=3,
        jev_rerank_max_candidates=3,
    )


class TestSearchServiceJevRerank:
    def test_rerank_prefers_jev_and_reorders(self, monkeypatch):
        service = _service()
        candidates = [(0, 0.9), (1, 0.8), (2, 0.7), (3, 0.6)]
        # Jev says candidate 2 is best, then 0, then 1; candidate 3 beyond cap.
        monkeypatch.setattr(
            "jev_service.rerank",
            lambda q, docs, **k: [0.2, 0.1, 0.95],
        )
        ranked = service._re_rank("jazz", candidates)
        assert [idx for idx, _ in ranked] == [2, 0, 1, 3]
        assert ranked[0][1] == pytest.approx(0.95)

    def test_falls_back_to_upstream_when_jev_returns_none(self, monkeypatch):
        service = _service()
        monkeypatch.setattr("jev_service.rerank", lambda q, docs, **k: None)
        candidates = [(0, 0.9), (1, 0.8)]
        assert service._re_rank("jazz", candidates) == candidates

    def test_overfetch_uses_jev_multiplier(self):
        service = _service()
        assert service._overfetch() == 3
        service._jev_rerank = False
        service._cross_encoder = None
        assert service._overfetch() == service._over_fetch_multiplier
