"""Tests for chat_service.py — covers prompt assembly, HF API calls,
retrieval-context formatting, and structured citations (R005)."""

import types

import pytest

from chat_service import (
    HF_CHAT_MODEL,
    NO_VENUES_MESSAGE,
    build_chat_messages,
    build_retrieval_context,
    format_retrieval_context,
    get_ai_response,
    huggingface_chat_api_call,
)
from dto import create_citation_dto, create_location_dto


# ---------------------------------------------------------------------------
# format_retrieval_context
# ---------------------------------------------------------------------------

class TestFormatRetrievalContext:
    def test_empty_results_returns_no_venues_message_and_empty_citations(self):
        ctx, citations = format_retrieval_context([])
        assert ctx == NO_VENUES_MESSAGE
        assert citations == []

    def test_single_result_returns_formatted_context_and_one_citation(self):
        dto = create_location_dto(
            {"id": 42, "name": "Blue Note", "zone": "Greenwich Village",
             "type": "Jazz Club", "address": "131 W 3rd St",
             "latitude": 40.73, "longitude": -74.0,
             "price": "moderate", "rating": 4.5, "zoneId": 1},
            similarity_score=0.92,
        )
        ctx, citations = format_retrieval_context([dto])

        assert "Blue Note" in ctx
        assert "Greenwich Village" in ctx
        assert "Jazz Club" in ctx
        assert len(citations) == 1
        cit = citations[0]
        assert cit["venue_id"] == 42
        assert cit["name"] == "Blue Note"
        assert "Jazz Club" in cit["snippet"]
        assert "Greenwich Village" in cit["snippet"]
        assert cit["score"] == 0.92

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
        def fake_search(query, limit=5):
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

    def test_search_helper_returns_empty_list_no_venues(self):
        def fake_search(query, limit=5):
            return []

        ctx, citations = build_retrieval_context("q", search_helper=fake_search)
        assert ctx == NO_VENUES_MESSAGE
        assert citations == []

    def test_search_helper_raises_returns_error_and_empty_citations(self):
        def fake_search(query, limit=5):
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
        )

        user_content = messages[-1]["content"]
        assert user_content.count("- User:") == 3
        assert "question-3" in user_content
        assert "question-0" not in user_content
        assert "User question: find jazz bars" in user_content
        assert citations == []

    def test_wires_search_helper_into_template_and_returns_citations(self, monkeypatch):
        captured = {}

        def fake_search(_query, limit=5):
            captured["limit"] = limit
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
        )

        assert captured["limit"] == 5
        assert "Smalls Jazz Club" in messages[0]["content"]
        assert len(citations) == 1
        assert citations[0]["venue_id"] == 99
        assert citations[0]["name"] == "Smalls Jazz Club"

    def test_system_template_uses_loaded_prompt_template(self):
        """Verify the system message contains the template's key phrases
        (not just the hardcoded fallback) when no explicit retrieval_context
        is provided."""
        # Pass a retrieval_context string directly to avoid needing a real search_helper,
        # but still exercise the template loading path.
        messages, citations = build_chat_messages(
            query="where to go",
            previous_questions=[],
            retrieval_context="- Test Venue (Zone): Type",
        )
        system = messages[0]["content"]
        # Template signature phrases
        assert "CRITICAL RULES" in system
        assert "RETRIEVAL CONTEXT:" in system
        assert "Test Venue" in system
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
        )
        system = messages[0]["content"]
        assert "Here's what you know about similar locations" in system
        assert "CRITICAL RULES" not in system
        assert citations == []


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

        def fake_search(query, limit=5):
            search_calls.append((query, limit))
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
        )

        assert reply == "stubbed reply"
        assert search_calls == [("where should I go?", 5)]
        assert hf_calls
        assert HF_CHAT_MODEL
        assert len(citations) == 1
        assert citations[0]["venue_id"] == 55
        assert citations[0]["score"] == 0.76

    def test_empty_retrieval_returns_no_venues_and_empty_citations(self, monkeypatch):
        monkeypatch.setenv("HF_TOKEN", "test-token")

        def fake_search(query, limit=5):
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
        )

        assert reply == "no matching venues found"
        assert citations == []

    def test_error_path_returns_fallback_and_empty_citations(self, monkeypatch):
        """When the HF call raises, get_ai_response returns the error message
        and empty citations."""
        monkeypatch.setenv("HF_TOKEN", "test-token")

        def fake_search(query, limit=5):
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
