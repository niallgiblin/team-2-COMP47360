"""Unit tests for query_expander.py — match/no-match/dedup/edge-case coverage."""

import logging

import pytest

from query_expander import expand_query


# ---------------------------------------------------------------------------
# Exact / Substring match
# ---------------------------------------------------------------------------
class TestExactAndSubstringMatch:
    def test_exact_keyword_match(self):
        """Exact match: 'good for a date' contains 'date' → romantic keywords appended."""
        result = expand_query("good for a date")
        assert result.startswith("good for a date ")
        assert "romantic" in result
        assert "date" in result
        assert "intimate" in result

    def test_partial_substring_match(self):
        """'looking for a date spot' still matches 'date' (substring match)."""
        result = expand_query("looking for a date spot")
        assert result.startswith("looking for a date spot ")
        assert "romantic" in result

    def test_keyword_inside_word(self):
        """'cheaper' contains 'cheap' — both keys match via substring, deduped."""
        result = expand_query("cheaper food")
        assert result.startswith("cheaper food ")
        assert "affordable" in result
        assert "budget" in result

    def test_no_match_passthrough(self):
        """Query with no matching keys returns unchanged."""
        result = expand_query("best pizza in Manhattan")
        assert result == "best pizza in Manhattan"


# ---------------------------------------------------------------------------
# Case insensitivity
# ---------------------------------------------------------------------------
class TestCaseInsensitivity:
    def test_uppercase_match(self):
        """'ROMANTIC DINNER' matches 'romantic' key."""
        result = expand_query("ROMANTIC DINNER")
        assert result.startswith("ROMANTIC DINNER ")
        assert "romantic" in result

    def test_mixed_case_match(self):
        """'RoMaNtIc EvEnInG' matches 'romantic'."""
        result = expand_query("RoMaNtIc EvEnInG")
        assert "romantic" in result

    def test_title_case_match(self):
        """'Live Music Venue' matches 'live music' (compound key)."""
        result = expand_query("Live Music Venue")
        assert "live music" in result
        assert "band" in result
        assert "concert" in result


# ---------------------------------------------------------------------------
# Multi-pattern matching + deduplication
# ---------------------------------------------------------------------------
class TestMultiPatternDedup:
    def test_three_categories(self):
        """'cheap romantic date' matches date, romantic, AND cheap — deduplicated."""
        result = expand_query("cheap romantic date")
        assert result.startswith("cheap romantic date ")
        # All three categories contribute keywords
        assert "romantic" in result
        assert "date" in result
        assert "cheap" in result
        assert "affordable" in result
        assert "intimate" in result
        # The expansion portion should not repeat words
        expansion = result[len("cheap romantic date "):]
        words = expansion.split()
        assert len(words) == len(set(words)), f"duplicate words found: {words}"

    def test_overlapping_keywords_dedup(self):
        """'wine bar date' — 'wine' and 'date' overlap on 'romantic','intimate' — dedup."""
        result = expand_query("wine bar date")
        assert result.startswith("wine bar date ")
        expansion = result[len("wine bar date "):]
        words = expansion.split()
        assert len(words) == len(set(words)), f"duplicate words found: {words}"

    def test_compound_key_before_single_word(self):
        """'open late restaurant' matches 'open late' before 'late' — deduped appropriately."""
        result = expand_query("open late restaurant")
        assert result.startswith("open late restaurant ")
        # 'open late' expansion has: open late late night after-hours
        # 'late' expansion has: late night open late after-hours
        # Deduped should include all unique tokens
        assert "after-hours" in result
        expansion = result[len("open late restaurant "):]
        words = expansion.split()
        assert len(words) == len(set(words)), f"duplicate words found: {words}"


# ---------------------------------------------------------------------------
# Edge cases — empty / None / whitespace
# ---------------------------------------------------------------------------
class TestEdgeCases:
    def test_empty_string(self):
        assert expand_query("") == ""

    def test_none_input(self):
        assert expand_query(None) == ""

    def test_whitespace_only(self):
        """Whitespace-only query passes through unchanged."""
        result = expand_query("   ")
        assert result == "   "

    def test_punctuation_adjacent_to_keyword(self):
        """'looking for romance? something intimate.' — 'romantic' is not in query
        but 'intimate' is... actually 'intimate' is not a key.
        Let's test 'date!' — '!' adjacent to 'date' still matches."""
        result = expand_query("find me a date!")
        assert result.startswith("find me a date! ")
        assert "romantic" in result


# ---------------------------------------------------------------------------
# Single-word matches
# ---------------------------------------------------------------------------
class TestSingleWordMatch:
    def test_dancing(self):
        result = expand_query("dancing")
        assert result.startswith("dancing ")
        assert "dance" in result
        assert "club" in result
        assert "nightlife" in result
        assert "electronic" in result
        assert "dj" in result

    def test_romantic(self):
        result = expand_query("romantic")
        assert "intimate" in result
        assert "dinner" in result
        assert "wine" in result


# ---------------------------------------------------------------------------
# Per-category vocabulary tests
# ---------------------------------------------------------------------------
class TestPerCategory:
    # --- wine ---
    def test_wine(self):
        result = expand_query("wine tasting")
        assert result.startswith("wine tasting ")
        assert "bar" in result
        assert "upscale" in result

    # --- rooftop ---
    def test_rooftop(self):
        result = expand_query("rooftop bar")
        assert result.startswith("rooftop bar ")
        assert "view" in result
        assert "skyline" in result
        assert "outdoor" in result

    # --- speakeasy ---
    def test_speakeasy(self):
        result = expand_query("speakeasy vibe")
        assert result.startswith("speakeasy vibe ")
        assert "hidden" in result
        assert "secret" in result
        assert "craft cocktails" in result

    # --- comedy ---
    def test_comedy(self):
        result = expand_query("comedy show")
        assert result.startswith("comedy show ")
        assert "funny" in result
        assert "stand-up" in result
        assert "laugh" in result

    # --- live music ---
    def test_live_music(self):
        result = expand_query("live music tonight")
        assert result.startswith("live music tonight ")
        assert "band" in result
        assert "concert" in result
        assert "performance" in result

    # --- late night ---
    def test_late_night(self):
        result = expand_query("late night food")
        assert result.startswith("late night food ")
        assert "open" in result  # from 'late' expansion: 'late night open late after-hours'
        assert "after-hours" in result

    # --- upscale ---
    def test_upscale(self):
        result = expand_query("upscale dinner")
        assert result.startswith("upscale dinner ")
        assert "luxury" in result
        assert "fancy" in result
        assert "fine dining" in result

    # --- affordable ---
    def test_affordable(self):
        result = expand_query("affordable eats")
        assert result.startswith("affordable eats ")
        assert "budget" in result
        assert "cheap" in result
        assert "inexpensive" in result

    # --- electronic ---
    def test_electronic(self):
        result = expand_query("electronic beats")
        assert result.startswith("electronic beats ")
        assert "dance" in result
        assert "club" in result
        assert "dj" in result

    # --- fancy ---
    def test_fancy(self):
        result = expand_query("fancy place")
        assert result.startswith("fancy place ")
        assert "luxury" in result
        assert "premium" in result
        assert "elegant" in result


# ---------------------------------------------------------------------------
# Keyword order stability
# ---------------------------------------------------------------------------
class TestKeywordOrderStability:
    def test_output_starts_with_original(self):
        queries = [
            "good for a date",
            "cheap eats near me",
            "romantic rooftop dinner",
            "live music and comedy show",
            "open late speakeasy",
        ]
        for q in queries:
            result = expand_query(q)
            assert result.startswith(q), f"result does not start with original query: {q!r} → {result!r}"

    def test_original_query_preserved_verbatim(self):
        """The original query text is never modified — only appended to."""
        q = "RoMaNtIc EvEnInG"
        result = expand_query(q)
        # Original case preserved at the start
        assert result.startswith(q)
        assert len(result) > len(q)  # something was appended


# ---------------------------------------------------------------------------
# Logging behavior (slice verification requirement)
# ---------------------------------------------------------------------------
class TestLoggingBehavior:
    def test_info_log_on_expansion(self, caplog):
        """INFO log emitted when expand_query expands a query."""
        with caplog.at_level(logging.INFO, logger="query_expander"):
            expand_query("good for a date")
        assert any(
            "expand_query:" in r.message and "original=" in r.message
            for r in caplog.records
        ), "expected INFO log with expansion details"

    def test_debug_log_on_no_match(self, caplog):
        """DEBUG log emitted on pass-through with no-match message."""
        with caplog.at_level(logging.DEBUG, logger="query_expander"):
            expand_query("best pizza in Manhattan")
        assert any(
            "no expansion match" in r.message
            for r in caplog.records
        ), "expected DEBUG log for no-match pass-through"

    def test_no_info_log_on_no_match(self, caplog):
        """Only DEBUG (not INFO) logged on no-match."""
        with caplog.at_level(logging.INFO, logger="query_expander"):
            expand_query("best pizza in Manhattan")
        info_msgs = [r.message for r in caplog.records if r.levelno >= logging.INFO]
        expansion_infos = [m for m in info_msgs if "expand_query:" in m and "original=" in m]
        assert len(expansion_infos) == 0, "no INFO expansion log expected on no-match"


# ---------------------------------------------------------------------------
# Config key visibility (QUERY_EXPANSION_ENABLED in config module)
# ---------------------------------------------------------------------------
class TestConfigKeyVisibility:
    def test_query_expansion_enabled_defaults_true(self, monkeypatch):
        """When no env var set, QUERY_EXPANSION_ENABLED defaults to True."""
        import importlib

        monkeypatch.delenv("QUERY_EXPANSION_ENABLED", raising=False)
        import config as cfg

        cfg2 = importlib.reload(cfg)
        assert cfg2.QUERY_EXPANSION_ENABLED is True

    def test_query_expansion_disabled_via_env_false(self, monkeypatch):
        """When QUERY_EXPANSION_ENABLED=false, config reports False."""
        import importlib

        monkeypatch.setenv("QUERY_EXPANSION_ENABLED", "false")
        import config as cfg

        cfg2 = importlib.reload(cfg)
        assert cfg2.QUERY_EXPANSION_ENABLED is False

    def test_query_expansion_enabled_via_env_true(self, monkeypatch):
        """When QUERY_EXPANSION_ENABLED=true, config reports True."""
        import importlib

        monkeypatch.setenv("QUERY_EXPANSION_ENABLED", "true")
        import config as cfg

        cfg2 = importlib.reload(cfg)
        assert cfg2.QUERY_EXPANSION_ENABLED is True
