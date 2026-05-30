"""Tests for chat_service.py — covers prompt assembly, HF API calls,
retrieval-context formatting, busyness context, and structured citations (R005)."""

import types

import pytest

from chat_service import (
    HF_CHAT_MODEL,
    NO_BUSYNESS_MESSAGE,
    NO_VENUES_MESSAGE,
    _busyness_label,
    _KNOWN_ZONES,
    _ZONE_ALIASES,
    build_busyness_context,
    build_chat_messages,
    build_retrieval_context,
    extract_location_from_query,
    fetch_busyness_predictions,
    format_busyness_context,
    format_retrieval_context,
    get_ai_response,
    huggingface_chat_api_call,
    parse_inline_citations,
)
from dto import create_citation_dto, create_location_dto

# Reusable busyness-context stub to avoid real HTTP calls in build_chat_messages tests.
_STUB_BUSYNESS = "Current Manhattan busyness levels:\n  Zone 100: 0.30 (quiet)\n  Zone 107: 0.91 (packed)"


# ---------------------------------------------------------------------------
# _busyness_label
# ---------------------------------------------------------------------------

class TestBusynessLabel:
    def test_packed(self):
        assert _busyness_label(0.85) == "packed"
        assert _busyness_label(0.80) == "packed"

    def test_busy(self):
        assert _busyness_label(0.75) == "busy"
        assert _busyness_label(0.60) == "busy"

    def test_moderate(self):
        assert _busyness_label(0.55) == "moderate"
        assert _busyness_label(0.40) == "moderate"

    def test_quiet(self):
        assert _busyness_label(0.35) == "quiet"
        assert _busyness_label(0.20) == "quiet"

    def test_very_quiet(self):
        assert _busyness_label(0.15) == "very quiet"
        assert _busyness_label(0.0) == "very quiet"

    def test_none_unknown(self):
        assert _busyness_label(None) == "unknown"


# ---------------------------------------------------------------------------
# extract_location_from_query
# ---------------------------------------------------------------------------

class TestExtractLocationFromQuery:
    def test_alias_midtown(self, monkeypatch):
        monkeypatch.setattr(
            "chat_service._KNOWN_ZONES",
            {"midtown center", "midtown east", "midtown north", "midtown south", "east village"},
        )
        assert extract_location_from_query("find a bar in Midtown") == "midtown"
        assert extract_location_from_query("what's good in midtown tonight?") == "midtown"

    def test_alias_upper_west_side(self, monkeypatch):
        monkeypatch.setattr(
            "chat_service._KNOWN_ZONES",
            {"upper west side north", "upper west side south"},
        )
        assert extract_location_from_query("Upper West Side restaurants") == "upper west side"

    def test_alias_east_village(self, monkeypatch):
        monkeypatch.setattr(
            "chat_service._KNOWN_ZONES",
            {"east village", "west village"},
        )
        assert extract_location_from_query("bars in the East Village") == "east village"

    def test_alias_hells_kitchen_maps_to_clinton(self, monkeypatch):
        monkeypatch.setattr("chat_service._KNOWN_ZONES", set())
        assert extract_location_from_query("hell's kitchen spots") == "clinton"
        assert extract_location_from_query("hells kitchen clubs") == "clinton"

    def test_direct_zone_name_match(self, monkeypatch):
        monkeypatch.setattr(
            "chat_service._KNOWN_ZONES",
            {"chinatown", "soho", "tribeca/civic center", "lower east side"},
        )
        assert extract_location_from_query("where to eat in Chinatown") == "chinatown"
        assert extract_location_from_query("soho lounge recommendations") == "soho"
        assert extract_location_from_query("things to do in the lower east side") == "lower east side"

    def test_no_location_detected(self, monkeypatch):
        monkeypatch.setattr(
            "chat_service._KNOWN_ZONES",
            {"midtown center", "east village"},
        )
        assert extract_location_from_query("find me a jazz bar") is None
        assert extract_location_from_query("") is None
        assert extract_location_from_query(None) is None

    def test_alias_takes_precedence_over_zone_match(self, monkeypatch):
        # "midtown" alias should match even if full zone names are in the set
        monkeypatch.setattr(
            "chat_service._KNOWN_ZONES",
            {"midtown center", "midtown east", "midtown north", "midtown south"},
        )
        assert extract_location_from_query("Midtown jazz clubs") == "midtown"


# ---------------------------------------------------------------------------
# format_busyness_context
# ---------------------------------------------------------------------------

class TestFormatBusynessContext:
    def test_none_returns_not_available(self):
        assert format_busyness_context(None) == NO_BUSYNESS_MESSAGE

    def test_empty_dict_returns_not_available(self):
        assert format_busyness_context({}) == NO_BUSYNESS_MESSAGE

    def test_small_set_lists_all_zones(self):
        predictions = {"100": 0.25, "107": 0.91, "113": 0.55}
        ctx = format_busyness_context(predictions)
        assert "Zone 100: 0.25 (quiet)" in ctx
        assert "Zone 107: 0.91 (packed)" in ctx
        assert "Zone 113: 0.55 (moderate)" in ctx

    def test_large_set_shows_busiest_and_quietest(self):
        predictions = {str(i): i / 100.0 for i in range(20)}
        ctx = format_busyness_context(predictions)
        assert "Busiest zones:" in ctx
        assert "Quietest zones:" in ctx


# ---------------------------------------------------------------------------
# format_retrieval_context
# ---------------------------------------------------------------------------

class TestFormatRetrievalContext:
    def test_empty_results_returns_no_venues_message_and_empty_citations(self):
        ctx, citations = format_retrieval_context([])
        assert ctx == NO_VENUES_MESSAGE
        assert citations == []

    def test_single_result_returns_rich_context_and_one_citation(self):
        dto = create_location_dto(
            {"id": 42, "name": "Blue Note", "zone": "Greenwich Village",
             "type": "Jazz Club", "address": "131 W 3rd St",
             "latitude": 40.73, "longitude": -74.0,
             "price": "moderate", "rating": 4.5, "zoneId": 1,
             "description": "Legendary jazz club", "summary": "Great jazz vibes",
             "tags": "jazz, music, cocktails", "num_reviews": 500},
            similarity_score=0.92,
        )
        ctx, citations = format_retrieval_context([dto])

        assert "Blue Note" in ctx
        assert "Greenwich Village" in ctx
        assert "Jazz Club" in ctx
        assert "moderate" in ctx or "Price" in ctx
        assert "4.5/5" in ctx or "Rating" in ctx
        assert "Legendary jazz club" in ctx
        assert "Great jazz vibes" in ctx
        assert "jazz, music, cocktails" in ctx
        assert len(citations) == 1
        cit = citations[0]
        assert cit["venue_id"] == 42
        assert cit["name"] == "Blue Note"
        assert "Jazz Club" in cit["snippet"]
        assert "Greenwich Village" in cit["snippet"]
        assert cit["score"] == 0.92

    def test_minimal_dto_omits_empty_fields_gracefully(self):
        dto = create_location_dto(
            {"id": 1, "name": "Minimal", "zone": "Z", "type": "T",
             "address": "", "latitude": 0, "longitude": 0,
             "price": "", "rating": 0, "zoneId": 0},
            similarity_score=0.5,
        )
        ctx, citations = format_retrieval_context([dto])
        assert "Minimal" in ctx
        assert "Zone: Z" in ctx
        assert "Type: T" in ctx
        # Empty fields should not appear as blank labels.
        assert "Price:" not in ctx  # price was empty string
        assert "Rating:" not in ctx  # rating was 0
        assert len(citations) == 1

    def test_multiple_results_produce_one_citation_each(self):
        dtos = [
            create_location_dto(
                {"id": i, "name": f"Venue-{i}", "zone": "Z", "type": "T",
                 "address": "", "latitude": 0, "longitude": 0,
                 "price": "", "rating": 0, "zoneId": 0},
                similarity_score=0.5 + i * 0.1,
            )
            for i in range(3)
        ]
        ctx, citations = format_retrieval_context(dtos)
        assert len(citations) == 3
        assert citations[0]["venue_id"] == 0
        assert citations[2]["venue_id"] == 2

    def test_rich_dto_includes_description_summary_tags(self):
        dto = create_location_dto(
            {"id": 5, "name": "Test Venue", "zone": "Midtown", "type": "Bar",
             "address": "123 Main", "latitude": 0, "longitude": 0,
             "price": "moderate", "rating": 4.2, "zoneId": 2,
             "description": "A cozy spot", "summary": "Busy on weekends",
             "tags": "trendy, cocktails", "num_reviews": 1200},
            similarity_score=0.88,
        )
        ctx, _ = format_retrieval_context([dto])
        assert "A cozy spot" in ctx
        assert "Busy on weekends" in ctx
        assert "trendy, cocktails" in ctx
        assert "1200" in ctx  # num_reviews


# ---------------------------------------------------------------------------
# create_citation_dto
# ---------------------------------------------------------------------------

class TestCreateCitationDto:
    def test_full_dto_maps_all_fields(self):
        dto = create_location_dto(
            {"id": 7, "name": "Smalls", "zone": "West Village",
             "type": "Jazz Club", "address": "183 W 10th St",
             "latitude": 40.734, "longitude": -74.001,
             "price": "moderate", "rating": 4.8, "zoneId": 3},
            similarity_score=0.87,
        )
        cit = create_citation_dto(dto)
        assert cit["venue_id"] == 7
        assert cit["name"] == "Smalls"
        assert cit["score"] == 0.87
        assert "Jazz Club" in cit["snippet"]
        assert "West Village" in cit["snippet"]
        assert "183 W 10th St" in cit["snippet"]

    def test_minimal_dto_handles_missing_fields(self):
        dto = create_location_dto(
            {"id": 1, "name": "X", "zone": "", "type": "", "address": "",
             "latitude": 0, "longitude": 0, "price": "", "rating": 0,
             "zoneId": 0},
            similarity_score=0.5,
        )
        cit = create_citation_dto(dto)
        assert cit["venue_id"] == 1
        assert cit["name"] == "X"
        assert cit["score"] == 0.5
        # snippet may be just "" when type/zone/address are all empty
        assert isinstance(cit["snippet"], str)


# ---------------------------------------------------------------------------
# parse_inline_citations (S05)
# ---------------------------------------------------------------------------

_STUB_CITATIONS = [
    {"venue_id": 1, "name": "Blue Note", "snippet": "Jazz Club in Greenwich Village — 131 W 3rd St", "score": 0.95},
    {"venue_id": 2, "name": "Smalls", "snippet": "Jazz Club in West Village — 183 W 10th St", "score": 0.87},
    {"venue_id": 3, "name": "Village Vanguard", "snippet": "Jazz Club in Greenwich Village — 178 7th Ave S", "score": 0.82},
]


class TestParseInlineCitations:
    def test_empty_citations_returns_unchanged(self):
        result = parse_inline_citations("Hello [1] world", [])
        assert result == "Hello [1] world"

    def test_empty_text_returns_empty_string(self):
        result = parse_inline_citations("", _STUB_CITATIONS)
        assert result == ""

    def test_none_text_detected(self):
        """None text is falsy so the fast path returns it unchanged."""
        result = parse_inline_citations(None, _STUB_CITATIONS)
        assert result is None

    def test_valid_markers_appends_footnote_block(self):
        text = "Blue Note [1] is a legendary jazz club. Also check out Smalls [2]."
        result = parse_inline_citations(text, _STUB_CITATIONS)

        assert text in result  # original text preserved
        assert "\n---\n**Sources:**" in result
        assert "[1] Blue Note — Jazz Club in Greenwich Village — 131 W 3rd St" in result
        assert "[2] Smalls — Jazz Club in West Village — 183 W 10th St" in result

    def test_no_brackets_returns_unchanged(self):
        text = "No citations here at all."
        result = parse_inline_citations(text, _STUB_CITATIONS)
        assert result == text

    def test_out_of_range_markers_produce_no_footnotes(self):
        text = "Venue [99] is great and [0] too but [5] is out."
        result = parse_inline_citations(text, _STUB_CITATIONS)
        # Original text unchanged, no footnote block appended.
        assert result == text
        assert "---" not in result

    def test_mixed_valid_and_invalid_only_valid_survive(self):
        text = "Try [1] and [99] and [2] and [0]!"
        result = parse_inline_citations(text, _STUB_CITATIONS)

        assert "[1] Blue Note" in result
        assert "[2] Smalls" in result
        footnote_section = result.split("---")[-1] if "---" in result else ""
        assert "[99]" not in footnote_section
        assert "[0]" not in footnote_section

    def test_deduplicates_repeated_markers(self):
        text = "Blue Note [1] rocks, Blue Note [1] is the best, trust [1]."
        result = parse_inline_citations(text, _STUB_CITATIONS)

        footnote_section = result.split("---")[-1] if "---" in result else ""
        # [1] should appear exactly once in the footnote block.
        assert footnote_section.count("[1] Blue Note") == 1

    def test_all_valid_markers_present_in_order(self):
        text = "Village Vanguard [3], Blue Note [1], and Smalls [2] are all great."
        result = parse_inline_citations(text, _STUB_CITATIONS)

        # Footnotes must be sorted by citation number.
        pos_1 = result.index("[1] Blue Note")
        pos_2 = result.index("[2] Smalls")
        pos_3 = result.index("[3] Village Vanguard")
        assert pos_1 < pos_2 < pos_3

    def test_partial_marker_text_only_not_broken(self):
        """Bare brackets like '[]' or '[abc]' are not captured by r'\\[(\\d+)\\]'."""
        text = "Empty bracket [] and non-numeric [abc] should pass through."
        result = parse_inline_citations(text, _STUB_CITATIONS)
        assert result == text

    def test_single_citation_single_marker(self):
        single = [_STUB_CITATIONS[0]]
        text = "Only Blue Note [1] tonight."
        result = parse_inline_citations(text, single)
        assert "\n---\n**Sources:**\n[1] Blue Note" in result
        assert "[2]" not in result

    def test_empty_citations_list_none_text(self):
        """Both fast-path conditions triggered: falsy text and empty citations."""
        result = parse_inline_citations("", [])
        assert result == ""


# ---------------------------------------------------------------------------
# build_retrieval_context
# ---------------------------------------------------------------------------

class TestBuildRetrievalContext:
    def test_no_search_helper_returns_unavailable_and_empty_citations(self):
        ctx, citations = build_retrieval_context("q", search_helper=None)
        assert "not available" in ctx.lower()
        assert citations == []

    def test_search_helper_returns_dtos_builds_context_and_citations(self):
        def fake_search(query, limit=5, location_filter=None):
            return [
                create_location_dto(
                    {"id": 10, "name": "Place", "zone": "Midtown", "type": "Bar",
                     "address": "1 Main St", "latitude": 0, "longitude": 0,
                     "price": "", "rating": 4, "zoneId": 2},
                    similarity_score=0.9,
                )
            ]

        ctx, citations = build_retrieval_context("q", search_helper=fake_search)
        assert "Place" in ctx
        assert len(citations) == 1
        assert citations[0]["venue_id"] == 10

    def test_forwards_location_filter_to_search_helper(self):
        captured = {}

        def fake_search(query, limit=5, location_filter=None):
            captured["location_filter"] = location_filter
            return [
                create_location_dto(
                    {"id": 1, "name": "V", "zone": "Midtown East", "type": "Bar",
                     "address": "", "latitude": 0, "longitude": 0,
                     "price": "", "rating": 0, "zoneId": 0},
                    similarity_score=0.8,
                )
            ]

        ctx, citations = build_retrieval_context(
            "q", search_helper=fake_search, location_filter="midtown",
        )
        assert captured["location_filter"] == "midtown"
        assert len(citations) == 1

    def test_search_helper_returns_empty_list_no_venues(self):
        def fake_search(query, limit=5, location_filter=None):
            return []

        ctx, citations = build_retrieval_context("q", search_helper=fake_search)
        assert ctx == NO_VENUES_MESSAGE
        assert citations == []

    def test_search_helper_raises_returns_error_and_empty_citations(self):
        def fake_search(query, limit=5, location_filter=None):
            raise RuntimeError("boom")

        ctx, citations = build_retrieval_context("q", search_helper=fake_search)
        assert "trouble" in ctx.lower()
        assert citations == []


# ---------------------------------------------------------------------------
# build_chat_messages
# ---------------------------------------------------------------------------

class TestBuildChatMessages:
    def test_truncates_previous_questions_to_three_and_produces_empty_citations(self):
        previous = [f"question-{index}" for index in range(6)]
        messages, citations = build_chat_messages(
            query="find jazz bars",
            previous_questions=previous,
            retrieval_context="- Blue Note (Greenwich Village): Bar",
            busyness_context=_STUB_BUSYNESS,
        )

        user_content = messages[-1]["content"]
        assert user_content.count("- User:") == 3
        assert "question-3" in user_content
        assert "question-0" not in user_content
        assert "User question: find jazz bars" in user_content
        assert citations == []

    def test_wires_search_helper_into_template_and_returns_citations(self, monkeypatch):
        captured = {}

        def fake_search(_query, limit=5, location_filter=None):
            captured["limit"] = limit
            captured["location_filter"] = location_filter
            return [
                create_location_dto(
                    {"id": 99, "name": "Smalls Jazz Club", "zone": "Greenwich Village",
                     "type": "Jazz Club", "address": "183 W 10th St",
                     "latitude": 0, "longitude": 0, "price": "", "rating": 0,
                     "zoneId": 3},
                    similarity_score=0.91,
                )
            ]

        messages, citations = build_chat_messages(
            query="late night jazz",
            previous_questions=[],
            search_helper=fake_search,
            busyness_context=_STUB_BUSYNESS,
            location_filter="greenwich village",
        )

        assert captured["limit"] == 5
        assert captured["location_filter"] == "greenwich village"
        assert "Smalls Jazz Club" in messages[0]["content"]
        assert len(citations) == 1
        assert citations[0]["venue_id"] == 99
        assert citations[0]["name"] == "Smalls Jazz Club"

    def test_system_template_uses_loaded_prompt_template(self):
        """Verify the system message contains the template's key phrases
        (not just the hardcoded fallback) when no explicit retrieval_context
        is provided."""
        messages, citations = build_chat_messages(
            query="where to go",
            previous_questions=[],
            retrieval_context="- Test Venue (Zone): Type",
            busyness_context=_STUB_BUSYNESS,
        )
        system = messages[0]["content"]
        # Template signature phrases
        assert "CRITICAL RULES" in system
        assert "RETRIEVAL CONTEXT:" in system
        assert "LIVE BUSYNESS DATA" in system
        assert "Test Venue" in system
        assert _STUB_BUSYNESS in system
        assert citations == []

    def test_fallback_system_prompt_when_template_unavailable(self, monkeypatch):
        """When prompt_loader raises, build_chat_messages falls back to the
        hardcoded system prompt."""
        import chat_service as cs_mod

        def fake_load(path=None):
            from prompt_loader import PromptLoadError
            raise PromptLoadError("simulated load failure")

        monkeypatch.setattr(cs_mod, "load_prompt_template", fake_load)

        messages, citations = build_chat_messages(
            query="q",
            previous_questions=[],
            retrieval_context="- Foo (Bar): Baz",
            busyness_context=_STUB_BUSYNESS,
        )
        system = messages[0]["content"]
        assert "Here's what you know about similar locations" in system
        assert "Current busyness levels" in system
        assert "CRITICAL RULES" not in system
        assert citations == []

    def test_busyness_auto_fetches_when_not_provided(self, monkeypatch):
        """When busyness_context is None, build_busyness_context is called."""
        import chat_service as cs_mod

        fetch_called = []

        def fake_build_busyness():
            fetch_called.append(True)
            return "auto-fetched busyness"

        monkeypatch.setattr(cs_mod, "build_busyness_context", fake_build_busyness)

        messages, _ = build_chat_messages(
            query="q",
            previous_questions=[],
            retrieval_context="- Foo (Bar): Baz",
            busyness_context=None,
        )
        assert fetch_called
        assert "auto-fetched busyness" in messages[0]["content"]


# ---------------------------------------------------------------------------
# huggingface_chat_api_call
# ---------------------------------------------------------------------------

class TestHuggingfaceChatApiCall:
    def test_uses_hf_chat_model_and_timeout(self, monkeypatch):
        captured = {}

        def fake_post(url, headers=None, json=None, timeout=30):
            captured["timeout"] = timeout
            captured["json"] = json

            class Resp:
                def raise_for_status(self):
                    pass

                def json(self):
                    return {"choices": [{"message": {"content": "ok"}}]}

            return Resp()

        monkeypatch.setenv("HF_TOKEN", "test-token")
        monkeypatch.setenv("HF_CHAT_MODEL", "test/model-id")

        huggingface_chat_api_call(
            [{"role": "user", "content": "hi"}],
            requests_module=types.SimpleNamespace(
                post=fake_post,
                exceptions=types.SimpleNamespace(Timeout=Exception, RequestException=Exception),
            ),
        )

        assert captured["timeout"] == 30
        assert captured["json"]["model"] == "test/model-id"

    def test_raises_without_token_and_does_not_log_secret(self, caplog, monkeypatch):
        monkeypatch.setenv("HF_TOKEN", "your-hugging-face-api-token")

        with pytest.raises(ValueError, match="Hugging Face API token"):
            huggingface_chat_api_call([{"role": "user", "content": "hi"}])

        assert "your-hugging-face-api-token" not in caplog.text


# ---------------------------------------------------------------------------
# get_ai_response
# ---------------------------------------------------------------------------

class TestGetAiResponse:
    def test_delegates_to_search_helper_and_returns_citations(self, monkeypatch):
        monkeypatch.setenv("HF_TOKEN", "test-token")

        search_calls = []

        def fake_search(query, limit=5, location_filter=None):
            search_calls.append((query, limit, location_filter))
            return [
                create_location_dto(
                    {"id": 55, "name": "Venue", "zone": "Zone", "type": "Bar",
                     "address": "", "latitude": 0, "longitude": 0,
                     "price": "", "rating": 0, "zoneId": 0},
                    similarity_score=0.76,
                )
            ]

        hf_calls = []

        def fake_hf(messages, model=None, requests_module=None):
            hf_calls.append(messages)
            return {"choices": [{"message": {"content": "stubbed reply"}}]}

        reply, citations = get_ai_response(
            query="where should I go?",
            previous_questions=["earlier question"],
            search_helper=fake_search,
            hf_call=fake_hf,
            busyness_context=_STUB_BUSYNESS,
            location_filter="midtown",
        )

        assert reply == "stubbed reply"
        assert search_calls == [("where should I go?", 5, "midtown")]
        assert hf_calls
        assert HF_CHAT_MODEL
        assert len(citations) == 1
        assert citations[0]["venue_id"] == 55
        assert citations[0]["score"] == 0.76

    def test_empty_retrieval_returns_no_venues_and_empty_citations(self, monkeypatch):
        monkeypatch.setenv("HF_TOKEN", "test-token")

        def fake_search(query, limit=5, location_filter=None):
            return []

        def fake_hf(messages, model=None, requests_module=None):
            system = messages[0]["content"]
            # Verify the system prompt contains the no-venues instruction
            assert NO_VENUES_MESSAGE in system
            return {"choices": [{"message": {"content": "no matching venues found"}}]}

        reply, citations = get_ai_response(
            query="nonexistent",
            previous_questions=[],
            search_helper=fake_search,
            hf_call=fake_hf,
            busyness_context=_STUB_BUSYNESS,
        )

        assert reply == "no matching venues found"
        assert citations == []

    def test_error_path_returns_fallback_and_empty_citations(self, monkeypatch):
        """When the HF call raises, get_ai_response returns the error message
        and empty citations."""
        monkeypatch.setenv("HF_TOKEN", "test-token")

        def fake_search(query, limit=5, location_filter=None):
            return [
                create_location_dto(
                    {"id": 1, "name": "V", "zone": "Z", "type": "T",
                     "address": "", "latitude": 0, "longitude": 0,
                     "price": "", "rating": 0, "zoneId": 0},
                    similarity_score=0.5,
                )
            ]

        def fake_hf(messages, model=None, requests_module=None):
            raise RuntimeError("API down")

        reply, citations = get_ai_response(
            query="q",
            previous_questions=[],
            search_helper=fake_search,
            hf_call=fake_hf,
            busyness_context=_STUB_BUSYNESS,
        )

        assert "trouble" in reply.lower()
        assert citations == []

    def test_inline_citation_parsing_integration(self, monkeypatch):
        """End-to-end: HF returns marker-annotated text → response includes
        footnote block with venue name and snippet."""
        monkeypatch.setenv("HF_TOKEN", "test-token")

        def fake_search(query, limit=5, location_filter=None):
            return [
                create_location_dto(
                    {"id": 1, "name": "Blue Note", "zone": "Greenwich Village",
                     "type": "Jazz Club", "address": "131 W 3rd St",
                     "latitude": 40.73, "longitude": -74.0,
                     "price": "moderate", "rating": 4.5, "zoneId": 1,
                     "description": "Legendary jazz club",
                     "summary": "Great jazz vibes",
                     "tags": "jazz, music", "num_reviews": 500},
                    similarity_score=0.95,
                ),
                create_location_dto(
                    {"id": 2, "name": "Smalls", "zone": "West Village",
                     "type": "Jazz Club", "address": "183 W 10th St",
                     "latitude": 0, "longitude": 0,
                     "price": "moderate", "rating": 4.8, "zoneId": 3},
                    similarity_score=0.87,
                ),
            ]

        def fake_hf(messages, model=None, requests_module=None):
            return {
                "choices": [{
                    "message": {
                        "content": (
                            "Blue Note [1] is a legendary jazz club in "
                            "Greenwich Village. For a more intimate vibe "
                            "try Smalls [2]."
                        )
                    }
                }]
            }

        reply, citations = get_ai_response(
            query="jazz clubs",
            previous_questions=[],
            search_helper=fake_search,
            hf_call=fake_hf,
            busyness_context=_STUB_BUSYNESS,
        )

        # Original text preserved.
        assert "Blue Note [1] is a legendary jazz club" in reply
        assert "try Smalls [2]" in reply

        # Footnote block appended.
        assert "---" in reply
        assert "**Sources:**" in reply
        assert "[1] Blue Note — Jazz Club in Greenwich Village — 131 W 3rd St" in reply
        assert "[2] Smalls — Jazz Club in West Village — 183 W 10th St" in reply

        # Citations list still returned structurally.
        assert len(citations) == 2
        assert citations[0]["venue_id"] == 1
        assert citations[0]["name"] == "Blue Note"

    def test_does_not_perform_jwt_validation(self):
        from pathlib import Path

        source = Path(__file__).resolve().parent.parent.joinpath("chat_service.py").read_text(
            encoding="utf-8"
        )
        assert "validate_chat_jwt" not in source
        assert "jwt.decode" not in source
