"""Wave 0 retrieval relevance/parity evaluation for planned FAISS search_service."""

import numpy as np
import pytest

from conftest import _FakeDf, _LocRow

from search_service import SearchService, SearchStartupError, build_vector_index, current_cosine_top_k


REFERENCE_EXAMPLES = [
    {
        "id": "vibe_rooftop",
        "kind": "search",
        "query": "rooftop bar with skyline views",
        "location_filter": None,
        "price_range": None,
        "limit": 3,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Rooftop-aligned vector should rank Sky Lounge first.",
    },
    {
        "id": "vibe_quiet_date",
        "kind": "search",
        "query": "quiet intimate date spot",
        "location_filter": None,
        "price_range": None,
        "limit": 3,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Quiet cafe vector ranks highest.",
    },
    {
        "id": "vibe_late_night_cheap",
        "kind": "search",
        "query": "cheap late night food",
        "location_filter": None,
        "price_range": None,
        "limit": 3,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Cheap slice venue should lead late-night cheap intent.",
    },
    {
        "id": "vibe_tourist_friendly",
        "kind": "search",
        "query": "tourist friendly landmark venue",
        "location_filter": None,
        "price_range": None,
        "limit": 2,
        "mode": "explicit",
        "expected_top_k": [1, 4],
        "label": "Accept",
        "rationale": "Curated fixture expects rooftop then jazz landmark.",
    },
    {
        "id": "vibe_artsy_cultural",
        "kind": "search",
        "query": "artsy cultural jazz performance",
        "location_filter": None,
        "price_range": None,
        "limit": 3,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Jazz club vectors dominate artsy cultural intent.",
    },
    {
        "id": "filter_zone_only",
        "kind": "search",
        "query": "live music",
        "location_filter": "Greenwich",
        "price_range": None,
        "limit": 2,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Zone filter must constrain Greenwich Village venues.",
    },
    {
        "id": "filter_price_only",
        "kind": "search",
        "query": "nightlife spot",
        "location_filter": None,
        "price_range": "budget",
        "limit": 2,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Budget filter should surface cheap venues only.",
    },
    {
        "id": "filter_zone_and_price",
        "kind": "search",
        "query": "cozy hangout",
        "location_filter": "Greenwich",
        "price_range": "mid",
        "limit": 2,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Combined filters require zone and price agreement.",
    },
    {
        "id": "filter_empty_result",
        "kind": "search",
        "query": "exclusive luxury lounge",
        "location_filter": "Harlem",
        "price_range": "luxury",
        "limit": 3,
        "mode": "explicit",
        "expected_top_k": [],
        "label": "Accept",
        "rationale": "No fixture rows satisfy impossible filter combo.",
    },
    {
        "id": "similar_same_type",
        "kind": "similar",
        "query": "Blue Note Jazz Club Greenwich Village Bar",
        "exclude_names": ["Blue Note Jazz Club"],
        "limit": 2,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Similar jazz bars should rank without source venue.",
    },
    {
        "id": "similar_same_zone_diff_type",
        "kind": "similar",
        "query": "Quiet Corner Cafe West Village Cafe",
        "exclude_names": ["Quiet Corner Cafe"],
        "limit": 2,
        "mode": "explicit",
        "expected_top_k": [4, 5],
        "label": "Accept",
        "rationale": "Same-zone jazz venues are acceptable similar picks.",
    },
    {
        "id": "similar_source_exclusion",
        "kind": "similar",
        "query": "Smalls Jazz Club Greenwich Village Bar",
        "exclude_names": ["Smalls Jazz Club"],
        "limit": 3,
        "mode": "cosine_parity",
        "label": "Reject",
        "rationale": "Source-name exclusion is mandatory for /similar contract.",
    },
    {
        "id": "similar_sparse_tags",
        "kind": "similar",
        "query": "Late Night Slice",
        "exclude_names": ["Late Night Slice"],
        "limit": 2,
        "mode": "cosine_parity",
        "label": "Accept",
        "rationale": "Sparse tag/summary similar query still returns stable ids.",
    },
    {
        "id": "edge_empty_query",
        "kind": "search",
        "query": "",
        "location_filter": None,
        "price_range": None,
        "limit": 3,
        "mode": "explicit",
        "expected_top_k": [],
        "label": "Reject",
        "rationale": "Empty vibe query must not return arbitrary top-k.",
    },
    {
        "id": "edge_invalid_limit",
        "kind": "search",
        "query": "jazz",
        "location_filter": None,
        "price_range": None,
        "limit": 0,
        "mode": "explicit",
        "expected_top_k": [],
        "label": "Reject",
        "rationale": "Non-positive limits must not leak unbounded results.",
    },
    {
        "id": "edge_dimension_mismatch",
        "kind": "startup",
        "query": "dimension probe",
        "limit": 1,
        "mode": "explicit",
        "expected_error": "dimension",
        "label": "Reject",
        "rationale": "Embedding/index dimension mismatch must fail at startup.",
    },
]


def _fixture_rows():
    return [
        _LocRow(id=1, name="Sky Lounge", zone="Midtown", type="Bar", price="expensive"),
        _LocRow(id=2, name="Quiet Corner Cafe", zone="West Village", type="Cafe", price="moderate"),
        _LocRow(id=3, name="Late Night Slice", zone="East Village", type="Restaurant", price="cheap"),
        _LocRow(id=4, name="Blue Note Jazz Club", zone="Greenwich Village", type="Bar", price="moderate"),
        _LocRow(id=5, name="Smalls Jazz Club", zone="Greenwich Village", type="Bar", price="moderate"),
        _LocRow(id=6, name="Village Vanguard", zone="Greenwich Village", type="Bar", price="expensive"),
    ]


def _fixture_embeddings():
    return np.array(
        [
            [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, 1.0, 0.1, 0.0],
            [0.0, 0.0, 0.0, 0.9, 0.2, 0.0],
            [0.0, 0.0, 0.0, 0.8, 0.3, 0.0],
        ],
        dtype="float32",
    )


def _query_vectors():
    return {
        "rooftop bar with skyline views": np.array([0.95, 0.05, 0.0, 0.0, 0.0, 0.0], dtype="float32"),
        "quiet intimate date spot": np.array([0.05, 0.95, 0.0, 0.0, 0.0, 0.0], dtype="float32"),
        "cheap late night food": np.array([0.0, 0.05, 0.95, 0.0, 0.0, 0.0], dtype="float32"),
        "tourist friendly landmark venue": np.array([0.9, 0.0, 0.0, 0.1, 0.0, 0.0], dtype="float32"),
        "artsy cultural jazz performance": np.array([0.0, 0.0, 0.0, 0.85, 0.4, 0.1], dtype="float32"),
        "live music": np.array([0.0, 0.0, 0.0, 0.7, 0.65, 0.5], dtype="float32"),
        "nightlife spot": np.array([0.0, 0.0, 0.8, 0.2, 0.1, 0.0], dtype="float32"),
        "cozy hangout": np.array([0.0, 0.0, 0.0, 0.75, 0.7, 0.4], dtype="float32"),
        "exclusive luxury lounge": np.array([0.2, 0.0, 0.0, 0.0, 0.0, 0.0], dtype="float32"),
        "Blue Note Jazz Club Greenwich Village Bar": np.array([0.0, 0.0, 0.0, 0.99, 0.05, 0.0], dtype="float32"),
        "Quiet Corner Cafe West Village Cafe": np.array([0.0, 0.0, 0.0, 0.99, 0.05, 0.0], dtype="float32"),
        "Smalls Jazz Club Greenwich Village Bar": np.array([0.0, 0.0, 0.0, 0.2, 0.98, 0.0], dtype="float32"),
        "Late Night Slice": np.array([0.0, 0.0, 0.99, 0.0, 0.0, 0.0], dtype="float32"),
        "": np.zeros(6, dtype="float32"),
        "jazz": np.array([0.0, 0.0, 0.0, 0.8, 0.75, 0.6], dtype="float32"),
        "dimension probe": np.array([1.0, 0.0, 0.0], dtype="float32"),
    }


class _Encoder:
    def __init__(self, vectors_by_query):
        self._vectors_by_query = vectors_by_query

    def encode(self, query_text, convert_to_numpy=True):
        vector = self._vectors_by_query[query_text]
        return vector.copy()


def test_reference_examples_has_exactly_sixteen_cases():
    assert len(REFERENCE_EXAMPLES) == 16


@pytest.fixture
def relevance_service():
    rows = _fixture_rows()
    embeddings = _fixture_embeddings()
    encoder = _Encoder(_query_vectors())
    return SearchService.from_startup(_FakeDf(rows), embeddings, encoder=encoder)


@pytest.mark.parametrize("example", REFERENCE_EXAMPLES, ids=[item["id"] for item in REFERENCE_EXAMPLES])
def test_retrieval_relevance_example(example, relevance_service):
    if example["kind"] == "startup":
        rows = _fixture_rows()
        bad_embeddings = _fixture_embeddings()[:, :3]
        with pytest.raises(SearchStartupError, match=example["expected_error"]):
            SearchService.from_startup(_FakeDf(rows), bad_embeddings, encoder=_Encoder(_query_vectors()))
        return

    if example["kind"] == "search":
        results = relevance_service.search(
            example["query"],
            limit=example["limit"],
            location_filter=example.get("location_filter"),
            price_range=example.get("price_range"),
        )
    else:
        results = relevance_service.find_similar(
            query_text=example["query"],
            exclude_names=example.get("exclude_names", []),
            limit=example["limit"],
        )

    result_ids = [item["id"] for item in results]

    if example["mode"] == "explicit":
        assert result_ids == example["expected_top_k"], example["rationale"]
        return

    baseline_ids = current_cosine_top_k(
        query_vector=_query_vectors()[example["query"]],
        embeddings=_fixture_embeddings(),
        df=_FakeDf(_fixture_rows()),
        limit=example["limit"],
        location_filter=example.get("location_filter"),
        price_range=example.get("price_range"),
        exclude_names=example.get("exclude_names"),
    )
    assert result_ids == baseline_ids, example["rationale"]

    if example["label"] == "Reject" and example["id"] == "similar_source_exclusion":
        assert all(name not in example.get("exclude_names", []) for name in [row["name"] for row in _fixture_rows() if row["id"] in result_ids])
