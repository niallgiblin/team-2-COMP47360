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

    def test_does_not_perform_jwt_validation(self):
        from pathlib import Path

        source = Path(__file__).resolve().parent.parent.joinpath("chat_service.py").read_text(
            encoding="utf-8"
        )
        assert "validate_chat_jwt" not in source
        assert "jwt.decode" not in source
