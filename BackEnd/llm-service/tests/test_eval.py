"""Tests for the RAG evaluation harness — benchmark validation and recall computation."""

import csv
import json
import sys
from pathlib import Path
from unittest import mock

import pytest


BENCHMARK_PATH = Path(__file__).resolve().parent.parent / "data" / "benchmark.jsonl"
CORPUS_CSV_PATH = Path(__file__).resolve().parent.parent / "corpus" / "v1" / "venues.csv"

VALID_CATEGORIES = {"retrieval", "filtered", "conversational", "adversarial", "abstention"}
MIN_QUESTIONS_TOTAL = 35
MAX_QUESTIONS_TOTAL = 45
MIN_PER_CATEGORY = 5


def _load_venue_ids():
    """Load set of valid venue IDs from the corpus CSV."""
    if not CORPUS_CSV_PATH.exists():
        raise FileNotFoundError(f"Corpus CSV not found: {CORPUS_CSV_PATH}")
    ids = set()
    with open(CORPUS_CSV_PATH, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ids.add(int(row["id"]))
    return ids


def test_benchmark_valid():
    """Validate the benchmark.jsonl file — schema, IDs, categories, and counts."""
    # 1. File must exist
    assert BENCHMARK_PATH.exists(), f"benchmark.jsonl not found at {BENCHMARK_PATH}"

    venue_ids = _load_venue_ids()
    entries = []

    with open(BENCHMARK_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue  # skip comments and blank lines
            entries.append(json.loads(line))

    # 2. Total count within range
    n = len(entries)
    assert MIN_QUESTIONS_TOTAL <= n <= MAX_QUESTIONS_TOTAL, (
        f"Expected {MIN_QUESTIONS_TOTAL}-{MAX_QUESTIONS_TOTAL} entries, got {n}"
    )

    categories_seen = set()
    category_counts = {}
    ids_seen = set()

    for entry in entries:
        eid = entry["id"]
        # 3. id must be unique and string
        assert isinstance(eid, str), f"Entry {eid}: id must be a string"
        assert eid not in ids_seen, f"Duplicate entry id: {eid}"
        ids_seen.add(eid)

        # 4. Required fields present
        for field in ("id", "category", "query", "expected_venue_ids", "filters", "description"):
            assert field in entry, f"{eid}: missing required field '{field}'"

        # 5. Category must be valid
        cat = entry["category"]
        assert cat in VALID_CATEGORIES, f"{eid}: invalid category '{cat}'"
        categories_seen.add(cat)
        category_counts[cat] = category_counts.get(cat, 0) + 1

        # 6. query must be non-empty string
        query = entry["query"]
        assert isinstance(query, str) and query.strip(), f"{eid}: query must be non-empty string"

        # 7. description must be non-empty string
        desc = entry["description"]
        assert isinstance(desc, str) and desc.strip(), f"{eid}: description must be non-empty string"

        # 8. expected_venue_ids must be a list
        expected = entry["expected_venue_ids"]
        assert isinstance(expected, list), f"{eid}: expected_venue_ids must be a list"

        # 9. All expected venue IDs must exist in corpus
        for vid in expected:
            assert vid in venue_ids, f"{eid}: expected_venue_id {vid} not found in corpus"

        # 10. If abstention, expected_venue_ids must be empty
        if cat == "abstention":
            assert len(expected) == 0, (
                f"{eid}: abstention entries must have empty expected_venue_ids"
            )

        # 11. filters must be null or a dict with optional location/price_range only
        filters = entry["filters"]
        if filters is not None:
            assert isinstance(filters, dict), f"{eid}: filters must be null or dict"
            for k in filters:
                assert k in ("location", "price_range"), (
                    f"{eid}: unexpected filter key '{k}'"
                )

    # 12. All five categories must be present
    for cat in VALID_CATEGORIES:
        assert cat in categories_seen, f"Missing category: {cat}"

    # 13. At least MIN_PER_CATEGORY per category
    for cat in VALID_CATEGORIES:
        count = category_counts.get(cat, 0)
        assert count >= MIN_PER_CATEGORY, (
            f"Category '{cat}' has {count} questions, need at least {MIN_PER_CATEGORY}"
        )

    # 14. Check for sequential ordering of IDs (Q001, Q002, ...)
    for i, entry in enumerate(entries):
        expected_id = f"Q{i + 1:03d}"
        assert entry["id"] == expected_id, (
            f"Expected id '{expected_id}' at position {i}, got '{entry['id']}'"
        )


# ---------------------------------------------------------------------------
# test_eval_runner — pure-function and CLI tests (no model/FAISS required)
# ---------------------------------------------------------------------------


class TestRecallAtK:
    """Pure-function tests for compute_recall_at_k."""

    def _import_compute(self):
        # Add the scripts dir to path and import the helper.
        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from run_eval import compute_recall_at_k

        return compute_recall_at_k

    def test_perfect_recall(self):
        fn = self._import_compute()
        assert fn([1, 2, 3], [1, 2, 3, 4, 5], k=5) == 1.0

    def test_partial_recall(self):
        fn = self._import_compute()
        # 2 of 3 expected found → 0.6667
        assert fn([1, 2, 3], [1, 2, 99, 100, 101], k=5) == pytest.approx(2 / 3)

    def test_zero_recall(self):
        fn = self._import_compute()
        assert fn([1, 2, 3], [99, 100, 101, 102, 103], k=5) == 0.0

    def test_empty_expected(self):
        """Empty expected_venue_ids must return 1.0 (perfect by definition)."""
        fn = self._import_compute()
        assert fn([], [1, 2, 3], k=5) == 1.0

    def test_k_truncation(self):
        fn = self._import_compute()
        # expected has 3 items; the first is in position 3 of results.
        # Only first 2 results are considered → not found.
        assert fn([100], [1, 2, 3, 100, 101], k=3) == 0.0
        # With k=4 the match at index 3 is included.
        assert fn([100], [1, 2, 3, 100, 101], k=4) == 1.0


class TestCitationAccuracy:
    """Pure-function tests for check_citation_accuracy."""

    def _import_check(self):
        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from run_eval import check_citation_accuracy

        return check_citation_accuracy

    def _make_result(self, vid, name, zone="Lower East Side", addr="123 Main St", sim=0.85, typ="Bar"):
        return {
            "id": vid,
            "name": name,
            "address": addr,
            "latitude": 40.71,
            "longitude": -73.99,
            "type": typ,
            "price": "moderate",
            "rating": 4.5,
            "zone": zone,
            "zoneId": 1,
            "similarity": sim,
        }

    def _mock_chat_service(self, citations=None):
        """Create a mock chat_service module for citation checks."""
        mock_chat = mock.MagicMock()
        mock_chat.format_retrieval_context.return_value = (
            "context",
            citations if citations is not None else [],
        )
        return mock.patch.dict(sys.modules, {"chat_service": mock_chat})

    def test_valid_citations(self):
        fn = self._import_check()
        results = [
            self._make_result(10, "The Jazz Gallery"),
            self._make_result(20, "Death & Co"),
        ]
        with self._mock_chat_service(citations=[
            {"venue_id": 10, "name": "The Jazz Gallery", "snippet": "A jazz club"},
            {"venue_id": 20, "name": "Death & Co", "snippet": "A cocktail bar"},
        ]):
            ok, detail = fn(results)
        assert ok, f"expected valid citations, got: {detail}"

    def test_empty_results(self):
        fn = self._import_check()
        ok, detail = fn([])
        assert ok, f"expected valid (empty), got: {detail}"

    def test_missing_venue_id(self):
        """A result with id=0 should cause citation check to flag it."""
        fn = self._import_check()
        results = [self._make_result(0, "No ID Venue")]
        with self._mock_chat_service(citations=[
            {"venue_id": 0, "name": "No ID Venue", "snippet": "a snippet"},
        ]):
            ok, detail = fn(results)
        assert not ok, "should fail when venue_id is zero/missing"
        assert "venue_id" in detail.lower()

    def test_empty_name(self):
        fn = self._import_check()
        results = [self._make_result(10, "")]
        with self._mock_chat_service(citations=[
            {"venue_id": 10, "name": "", "snippet": "a snippet"},
        ]):
            ok, detail = fn(results)
        assert not ok, "should fail when name is empty"
        assert "name" in detail.lower()


class TestEvalRunnerCLI:
    """Lightweight CLI and benchmark-loading tests."""

    def _import_main_and_load(self):
        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from run_eval import _load_benchmark, _parse_args

        return _load_benchmark, _parse_args

    def test_parse_args_defaults(self):
        _, _parse_args = self._import_main_and_load()
        args = _parse_args([])
        assert args.threshold_recall == 0.60
        assert args.threshold_abstention == 0.70
        assert args.report is None
        assert "benchmark.jsonl" in args.benchmark

    def test_parse_args_custom(self):
        _, _parse_args = self._import_main_and_load()
        args = _parse_args(
            ["--benchmark", "data/benchmark.jsonl", "--threshold-recall", "0.50",
             "--threshold-abstention", "0.60", "--report", "out.json"]
        )
        assert args.threshold_recall == 0.50
        assert args.threshold_abstention == 0.60
        assert args.report == "out.json"

    def test_load_benchmark_file(self):
        _load_benchmark, _ = self._import_main_and_load()
        if not BENCHMARK_PATH.exists():
            pytest.skip("benchmark.jsonl not available")

        entries = _load_benchmark(BENCHMARK_PATH)
        assert MIN_QUESTIONS_TOTAL <= len(entries) <= MAX_QUESTIONS_TOTAL
        assert all(isinstance(e, dict) for e in entries)
        assert all("id" in e and "category" in e and "query" in e for e in entries)

    def test_benchmark_missing_exits_2(self):
        """Verify the script exits 2 when the benchmark file is missing."""
        scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
        sys.path.insert(0, str(scripts_dir))
        from run_eval import main as eval_main

        with pytest.raises(SystemExit) as exc_info:
            eval_main(["--benchmark", "/nonexistent/path/benchmark.jsonl"])
        assert exc_info.value.code == 2


def test_eval_runner():
    """Aggregate meta-test: pure functions are importable and correct.

    The full FAISS-based run (python3 scripts/run_eval.py) is a manual
    verification step — this test only covers the pure helpers that can
    be exercised without loading the sentence-transformer model.
    """
    scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)

    from run_eval import compute_recall_at_k, check_citation_accuracy

    # compute_recall_at_k
    assert compute_recall_at_k([1, 2], [1, 2, 3], k=5) == 1.0
    assert compute_recall_at_k([1, 2, 3], [4, 5, 6], k=5) == 0.0
    assert compute_recall_at_k([], [1, 2], k=5) == 1.0

    # check_citation_accuracy — empty (no import needed, short-circuits)
    ok, detail = check_citation_accuracy([])
    assert ok, f"empty results should pass: {detail}"

    # check_citation_accuracy — single valid result.
    # Inject a mock chat_service so the lazy import inside
    # check_citation_accuracy succeeds even without requests/yaml.
    mock_chat = mock.MagicMock()
    mock_chat.format_retrieval_context.return_value = (
        "context",
        [{"venue_id": 42, "name": "Test Venue", "snippet": "a snippet"}],
    )
    with mock.patch.dict(sys.modules, {"chat_service": mock_chat}):
        ok, detail = check_citation_accuracy(
            [{"id": 42, "name": "Test Venue", "address": "1 Test St",
              "latitude": 40.7, "longitude": -74.0, "type": "Bar",
              "price": "cheap", "rating": 4.0, "zone": "TestZone",
              "zoneId": 1, "similarity": 0.9}]
        )
        assert ok, f"valid single result should pass: {detail}"


# ---------------------------------------------------------------------------
# T03 additions: abstention detection, filtered search, threshold
# enforcement, report generation, and integration smoke test
# ---------------------------------------------------------------------------

# ── helpers for constructing mock search results ────────────────────────────

def _make_mock_result(vid, name, similarity=0.85, zone="East Village"):
    """Build a search result dict matching create_location_dto output."""
    return {
        "id": vid,
        "name": name,
        "address": f"{vid} Test St",
        "latitude": 40.72 + vid * 0.001,
        "longitude": -73.98,
        "type": "Bar",
        "price": "moderate",
        "rating": 4.0,
        "zone": zone,
        "zoneId": 1,
        "similarity": similarity,
    }


def _make_chat_mock(citations=None):
    """Build a mock chat_service module with format_retrieval_context configured.

    Default citations match a single result from _make_mock_result.
    """
    if citations is None:
        citations = [{"venue_id": 1, "name": "Test Venue", "snippet": "a bar"}]
    m = mock.MagicMock()
    m.format_retrieval_context.return_value = ("context string", citations)
    return m


class _MockSearchService:
    """Controllable stub for SearchService.search()."""

    def __init__(self, results=None):
        self.results = results or []
        self._last_query = None
        self._last_limit = None
        self._last_location_filter = None
        self._last_price_range = None

    def search(self, query_text, limit=10, location_filter=None, price_range=None):
        self._last_query = query_text
        self._last_limit = limit
        self._last_location_filter = location_filter
        self._last_price_range = price_range
        return list(self.results)


# ── Abstention detection tests ─────────────────────────────────────────────

class TestAbstentionDetection:
    """Unit tests for _run_question abstention pass/fail logic."""

    def _import_run_question(self):
        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from run_eval import _run_question

        return _run_question

    def test_abstention_empty_results_passes(self):
        """Abstention with no search results must pass."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[])

        entry = {
            "id": "Q034", "category": "abstention",
            "query": "best pizza in Chicago", "expected_venue_ids": [],
            "filters": None,
        }
        result = fn(entry, svc, threshold_recall=0.60)
        assert result["passed"] is True
        assert result["num_results"] == 0

    def test_abstention_high_score_results_fails(self):
        """Abstention with high-similarity results must fail."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[
            _make_mock_result(1, "Joe's Pizza", similarity=0.85),
        ])

        entry = {
            "id": "Q034", "category": "abstention",
            "query": "best pizza in Chicago", "expected_venue_ids": [],
            "filters": None,
        }
        with mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            result = fn(entry, svc, threshold_recall=0.60)
        assert result["passed"] is False, (
            f"abstention with high-score results must fail; got passed={result['passed']}"
        )

    def test_abstention_low_score_results_passes(self):
        """Abstention with results all below 0.3 similarity must pass."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[
            _make_mock_result(1, "Joe's Pizza", similarity=0.15),
            _make_mock_result(2, "Mario's", similarity=0.10),
        ])

        entry = {
            "id": "Q034", "category": "abstention",
            "query": "best pizza in Chicago", "expected_venue_ids": [],
            "filters": None,
        }
        with mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            result = fn(entry, svc, threshold_recall=0.60)
        assert result["passed"] is True, (
            f"abstention with all scores < 0.3 must pass; got passed={result['passed']}"
        )

    def test_abstention_mixed_scores_fails(self):
        """Abstention with one result ≥ 0.3 among low scores must fail."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[
            _make_mock_result(1, "Joe's Pizza", similarity=0.15),
            _make_mock_result(2, "Mario's", similarity=0.45),
        ])

        entry = {
            "id": "Q034", "category": "abstention",
            "query": "best pizza in Chicago", "expected_venue_ids": [],
            "filters": None,
        }
        with mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            result = fn(entry, svc, threshold_recall=0.60)
        assert result["passed"] is False, (
            f"abstention with one score ≥ 0.3 must fail; got passed={result['passed']}"
        )


# ── Filtered search pass-through tests ─────────────────────────────────────

class TestFilteredSearchPassthrough:
    """Verify location_filter and price_range are forwarded to the search service."""

    def _import_run_question(self):
        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from run_eval import _run_question

        return _run_question

    def test_location_filter_passed_through(self):
        """location_filter in entry filters must reach search_service.search()."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[
            _make_mock_result(162, "Attaboy", similarity=0.90, zone="Lower East Side"),
        ])

        entry = {
            "id": "Q011", "category": "filtered",
            "query": "cocktail bars in Lower East Side",
            "expected_venue_ids": [162],
            "filters": {"location": "Lower East Side"},
        }
        with mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            fn(entry, svc, threshold_recall=0.60)

        assert svc._last_location_filter == "Lower East Side", (
            f"expected location_filter='Lower East Side', got {svc._last_location_filter!r}"
        )

    def test_price_range_passed_through(self):
        """price_range in entry filters must reach search_service.search()."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[
            _make_mock_result(1, "Matcha 108", similarity=0.88, zone="Chinatown"),
        ])

        entry = {
            "id": "Q012", "category": "filtered",
            "query": "cheap eats in Chinatown",
            "expected_venue_ids": [1],
            "filters": {"location": "Chinatown", "price_range": "budget"},
        }
        with mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            fn(entry, svc, threshold_recall=0.60)

        assert svc._last_price_range == "budget", (
            f"expected price_range='budget', got {svc._last_price_range!r}"
        )

    def test_no_filters_passed_as_none(self):
        """When filters is null, location_filter and price_range must be None."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[
            _make_mock_result(51, "The Jazz Gallery", similarity=0.92),
        ])

        entry = {
            "id": "Q001", "category": "retrieval",
            "query": "jazz clubs in NYC",
            "expected_venue_ids": [51],
            "filters": None,
        }
        with mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            fn(entry, svc, threshold_recall=0.60)

        assert svc._last_location_filter is None
        assert svc._last_price_range is None

    def test_filters_empty_dict_passed_as_none(self):
        """When filters is an empty dict, location_filter and price_range must be None."""
        fn = self._import_run_question()
        svc = _MockSearchService(results=[
            _make_mock_result(51, "The Jazz Gallery", similarity=0.92),
        ])

        entry = {
            "id": "Q001", "category": "retrieval",
            "query": "jazz clubs in NYC",
            "expected_venue_ids": [51],
            "filters": {},
        }
        with mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            fn(entry, svc, threshold_recall=0.60)

        assert svc._last_location_filter is None
        assert svc._last_price_range is None


# ── Threshold enforcement tests ────────────────────────────────────────────

class TestThresholdEnforcement:
    """Verify the eval runner exits with correct code based on thresholds."""

    def _import_main(self):
        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from run_eval import main

        return main

    def _retrieval_entry(self, qid, expected, retrieved):
        return {
            "id": qid, "category": "retrieval",
            "query": "test query", "expected_venue_ids": expected,
            "filters": None, "description": "test",
        }

    def test_all_pass_exits_zero(self):
        """When all categories meet thresholds, exit 0."""
        main = self._import_main()

        # Build a stub search service that returns perfect results for each question.
        mock_svc = _MockSearchService(results=[
            _make_mock_result(1, "Venue A", similarity=0.95),
            _make_mock_result(2, "Venue B", similarity=0.90),
        ])

        # Three retrieval questions — each has expected IDs in the returned results.
        entries = [
            {"id": "Q001", "category": "retrieval", "query": "q1",
             "expected_venue_ids": [1], "filters": None, "description": "test"},
            {"id": "Q002", "category": "retrieval", "query": "q2",
             "expected_venue_ids": [2], "filters": None, "description": "test"},
            {"id": "Q003", "category": "retrieval", "query": "q3",
             "expected_venue_ids": [1, 2], "filters": None, "description": "test"},
        ]

        with mock.patch(
            "run_eval._init_search_service", return_value=mock_svc
        ), mock.patch(
            "run_eval._load_benchmark", return_value=entries
        ), mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            with pytest.raises(SystemExit) as exc_info:
                main(["--threshold-recall", "0.50"])
            assert exc_info.value.code == 0, (
                f"expected exit 0 (all pass), got {exc_info.value.code}"
            )

    def test_below_threshold_exits_one(self):
        """When recall is below threshold, exit 1."""
        main = self._import_main()

        # Return results that don't match expected IDs → recall=0.
        mock_svc = _MockSearchService(results=[
            _make_mock_result(99, "Wrong Venue", similarity=0.50),
        ])

        entries = [
            {"id": "Q001", "category": "retrieval", "query": "q1",
             "expected_venue_ids": [1], "filters": None, "description": "test"},
        ]

        with mock.patch(
            "run_eval._init_search_service", return_value=mock_svc
        ), mock.patch(
            "run_eval._load_benchmark", return_value=entries
        ), mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            with pytest.raises(SystemExit) as exc_info:
                main(["--threshold-recall", "0.60"])
            assert exc_info.value.code == 1, (
                f"expected exit 1 (below threshold), got {exc_info.value.code}"
            )

    def test_adversarial_citation_failure_exits_one(self):
        """When adversarial category fails citation, individual questions fail
        but the category verdict uses avg_recall — a single question with perfect
        recall still passes the category threshold.  To trigger exit 1 we
        need below-threshold recall, not just a citation failure."""
        main = self._import_main()

        mock_svc = _MockSearchService(results=[
            _make_mock_result(51, "The Jazz Gallery", similarity=0.92),
        ])

        mock_chat = mock.MagicMock()
        # Citations have a venue_id not matching the result → citation failure
        mock_chat.format_retrieval_context.return_value = (
            "context",
            [{"venue_id": 0, "name": "", "snippet": "snippet"}],
        )

        entries = [
            {"id": "Q026", "category": "adversarial", "query": "what time does Jazz Gallery open?",
             "expected_venue_ids": [51], "filters": None, "description": "test"},
        ]

        with mock.patch(
            "run_eval._init_search_service", return_value=mock_svc
        ), mock.patch(
            "run_eval._load_benchmark", return_value=entries
        ), mock.patch.dict(sys.modules, {"chat_service": mock_chat}):
            with pytest.raises(SystemExit) as exc_info:
                main(["--threshold-recall", "0.60"])

        # Category verdict uses avg_recall (1.0 ≥ 0.60 → PASS), so exit 0
        # even though the individual question failed its citation check.
        assert exc_info.value.code == 0, (
            f"adversarial category verdict uses avg_recall; expected exit 0, got {exc_info.value.code}"
        )

    def test_adversarial_category_fails_on_low_recall(self):
        """When adversarial recall is below threshold, exit 1."""
        main = self._import_main()

        # Return wrong venue → recall=0.
        mock_svc = _MockSearchService(results=[
            _make_mock_result(99, "Wrong Venue", similarity=0.30),
        ])

        entries = [
            {"id": "Q026", "category": "adversarial", "query": "what time does Jazz Gallery open?",
             "expected_venue_ids": [51], "filters": None, "description": "test"},
        ]

        with mock.patch(
            "run_eval._init_search_service", return_value=mock_svc
        ), mock.patch(
            "run_eval._load_benchmark", return_value=entries
        ), mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            with pytest.raises(SystemExit) as exc_info:
                main(["--threshold-recall", "0.60"])
            assert exc_info.value.code == 1, (
                f"expected exit 1 (adversarial recall below threshold), got {exc_info.value.code}"
            )

    def test_abstention_below_pass_rate_exits_one(self):
        """When abstention pass rate is below threshold, exit 1."""
        main = self._import_main()

        # Abstention with high-score result → fails (pass rate = 0% < 70%).
        mock_svc = _MockSearchService(results=[
            _make_mock_result(1, "Joe's Pizza", similarity=0.85),
        ])

        entries = [
            {"id": "Q034", "category": "abstention", "query": "pizza in Chicago",
             "expected_venue_ids": [], "filters": None, "description": "test"},
        ]

        with mock.patch(
            "run_eval._init_search_service", return_value=mock_svc
        ), mock.patch(
            "run_eval._load_benchmark", return_value=entries
        ), mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            with pytest.raises(SystemExit) as exc_info:
                main(["--threshold-abstention", "0.70"])
            assert exc_info.value.code == 1, (
                f"expected exit 1 (abstention below threshold), got {exc_info.value.code}"
            )


# ── Report generation tests ────────────────────────────────────────────────

class TestReportGeneration:
    """Verify the eval runner produces a well-structured JSON report."""

    def _import_main(self):
        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from run_eval import main

        return main

    def test_json_report_contains_expected_keys(self, tmp_path):
        """The --report JSON output must have all required top-level keys."""
        main = self._import_main()

        mock_svc = _MockSearchService(results=[
            _make_mock_result(1, "Venue A", similarity=0.95),
        ])

        entries = [
            {"id": "Q001", "category": "retrieval", "query": "q1",
             "expected_venue_ids": [1], "filters": None, "description": "test"},
            {"id": "Q002", "category": "retrieval", "query": "q2",
             "expected_venue_ids": [2], "filters": None, "description": "test"},
        ]

        report_path = tmp_path / "eval_report.json"

        with mock.patch(
            "run_eval._init_search_service", return_value=mock_svc
        ), mock.patch(
            "run_eval._load_benchmark", return_value=entries
        ), mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            with pytest.raises(SystemExit):
                main([
                    "--threshold-recall", "0.50",
                    "--report", str(report_path),
                ])

        assert report_path.exists(), f"Report not written to {report_path}"
        with open(report_path, "r") as fh:
            report = json.load(fh)

        required_keys = {
            "benchmark_path", "total_questions", "threshold_recall",
            "threshold_abstention", "aggregate_recall", "categories",
            "failures", "verdict",
        }
        missing = required_keys - set(report.keys())
        assert not missing, f"JSON report missing keys: {missing}"

        assert report["total_questions"] == 2
        assert isinstance(report["categories"], dict)
        assert "retrieval" in report["categories"]
        assert isinstance(report["failures"], list)
        assert report["verdict"] in ("PASS", "FAIL")

    def test_json_report_category_structure(self, tmp_path):
        """Each category in the JSON report must have recall, pass_rate, and counts."""
        main = self._import_main()

        mock_svc = _MockSearchService(results=[
            _make_mock_result(1, "Venue A", similarity=0.95),
        ])

        entries = [
            {"id": "Q001", "category": "retrieval", "query": "q1",
             "expected_venue_ids": [1], "filters": None, "description": "test"},
        ]

        report_path = tmp_path / "eval_report2.json"

        with mock.patch(
            "run_eval._init_search_service", return_value=mock_svc
        ), mock.patch(
            "run_eval._load_benchmark", return_value=entries
        ), mock.patch.dict(sys.modules, {"chat_service": _make_chat_mock()}):
            with pytest.raises(SystemExit):
                main([
                    "--threshold-recall", "0.50",
                    "--report", str(report_path),
                ])

        with open(report_path, "r") as fh:
            report = json.load(fh)

        cat = report["categories"]["retrieval"]
        for key in ("recall_at_5", "pass_rate", "pass_count", "fail_count", "total"):
            assert key in cat, f"Category missing key: {key}"
        assert cat["total"] == 1
        assert cat["pass_count"] + cat["fail_count"] == cat["total"]


# ── Integration smoke test ─────────────────────────────────────────────────

class TestEvalRunnerIntegration:
    """Smoke test that exercises the full eval pipeline against a small
    subset of the benchmark using the real FAISS index and model.

    Skipped when sentence-transformers / FAISS index are unavailable.
    """

    @pytest.mark.integration
    def test_mini_benchmark_subset(self, tmp_path):
        """Run the eval runner against a 3-question mini-benchmark subset.

        Only requires the real corpus and index — uses a temporary JSONL.
        """
        # Check that heavy dependencies are importable.
        try:
            import sentence_transformers  # noqa: F401
        except ImportError:
            pytest.skip("sentence-transformers not installed")

        scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)

        # Build a mini-benchmark with 3 known-good queries from the real set.
        mini_benchmark = [
            {"id": "Q001", "category": "retrieval",
             "query": "jazz clubs with live music in NYC",
             "expected_venue_ids": [51, 570, 606, 879],
             "filters": None,
             "description": "jazz clubs retrieval"},
            {"id": "Q010", "category": "filtered",
             "query": "bars and nightlife in East Village",
             "expected_venue_ids": [273, 275, 277, 278, 346],
             "filters": {"location": "East Village"},
             "description": "filtered bars in East Village"},
            {"id": "Q034", "category": "abstention",
             "query": "best pizza in Chicago deep dish",
             "expected_venue_ids": [],
             "filters": None,
             "description": "out-of-domain abstention"},
        ]

        mini_path = tmp_path / "mini_benchmark.jsonl"
        with open(mini_path, "w") as fh:
            fh.write("# mini benchmark for integration smoke test\n")
            for entry in mini_benchmark:
                fh.write(json.dumps(entry) + "\n")

        from run_eval import main

        with pytest.raises(SystemExit) as exc_info:
            main([
                "--benchmark", str(mini_path),
                "--threshold-recall", "0.0",  # lenient for CI
                "--threshold-abstention", "0.0",
            ])

        # With lenient thresholds, should pass.
        assert exc_info.value.code == 0, (
            f"integration smoke test exited {exc_info.value.code}, expected 0"
        )
