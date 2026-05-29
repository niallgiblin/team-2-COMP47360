"""Tests for prompt_loader.py — versioned YAML template loading and validation."""

import tempfile
from pathlib import Path

import pytest

from prompt_loader import (
    DEFAULT_TEMPLATE_PATH,
    PromptLoadError,
    PromptTemplate,
    PromptTemplateMetadata,
    load_prompt_template,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_yaml(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# 1. Valid load from the shipped rag-v1.yaml
# ---------------------------------------------------------------------------


def test_load_shipped_template_succeeds():
    """The bundled rag-v1.yaml must load without error and return all required fields."""
    template = load_prompt_template()

    assert isinstance(template, dict)
    assert template["version"] == "1.0"
    assert isinstance(template["metadata"], dict)
    assert template["metadata"]["corpus_version"] == "v1"
    assert template["metadata"]["model"] == "meta-llama/Llama-3.1-8B-Instruct"
    assert "{retrieval_context}" in template["system_template"]
    assert "{user_query}" in template["user_template"]
    assert "no matching venues found" in template["system_template"]


# ---------------------------------------------------------------------------
# 2. Valid load from a custom (tmp) template
# ---------------------------------------------------------------------------


def test_load_custom_template_succeeds():
    """A minimal but valid YAML template should load cleanly."""
    yaml_content = """\
version: "2.0"
metadata:
  corpus_version: "v2"
  model: "test-model"
system_template: "System: {retrieval_context}"
user_template: "User: {user_query}"
"""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_yaml(Path(tmp) / "custom.yaml", yaml_content)
        template = load_prompt_template(path)

    assert template["version"] == "2.0"
    assert template["metadata"]["corpus_version"] == "v2"
    assert template["metadata"]["model"] == "test-model"
    assert template["system_template"] == "System: {retrieval_context}"
    assert template["user_template"] == "User: {user_query}"


# ---------------------------------------------------------------------------
# 3. Missing file
# ---------------------------------------------------------------------------


def test_missing_file_raises_prompt_load_error():
    """A path that does not exist should raise PromptLoadError."""
    with pytest.raises(PromptLoadError, match="not found"):
        load_prompt_template(Path("/nonexistent/prompts/ghost.yaml"))


# ---------------------------------------------------------------------------
# 4. Invalid YAML
# ---------------------------------------------------------------------------


def test_invalid_yaml_raises_prompt_load_error():
    """Garbage YAML should raise PromptLoadError (not raw yaml.YAMLError)."""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_yaml(Path(tmp) / "bad.yaml", ":: not :: valid :: yaml ::")
        with pytest.raises(PromptLoadError, match="Invalid YAML"):
            load_prompt_template(path)


# ---------------------------------------------------------------------------
# 5. Missing top-level required key (system_template)
# ---------------------------------------------------------------------------


def test_missing_system_template_raises():
    """A YAML file missing 'system_template' must fail validation."""
    yaml_content = """\
version: "1.0"
metadata:
  corpus_version: "v1"
  model: "x"
user_template: "ok"
"""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_yaml(Path(tmp) / "partial.yaml", yaml_content)
        with pytest.raises(PromptLoadError, match="system_template"):
            load_prompt_template(path)


# ---------------------------------------------------------------------------
# 6. Missing metadata required key (corpus_version)
# ---------------------------------------------------------------------------


def test_missing_metadata_corpus_version_raises():
    """Metadata without 'corpus_version' must fail validation."""
    yaml_content = """\
version: "1.0"
metadata:
  model: "x"
system_template: "s"
user_template: "u"
"""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_yaml(Path(tmp) / "nometa.yaml", yaml_content)
        with pytest.raises(PromptLoadError, match="corpus_version"):
            load_prompt_template(path)


# ---------------------------------------------------------------------------
# 7. Empty system_template string
# ---------------------------------------------------------------------------


def test_empty_system_template_raises():
    """system_template must be a non-empty string."""
    yaml_content = """\
version: "1.0"
metadata:
  corpus_version: "v1"
  model: "x"
system_template: ""
user_template: "ok"
"""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_yaml(Path(tmp) / "empty.yaml", yaml_content)
        with pytest.raises(PromptLoadError, match="system_template"):
            load_prompt_template(path)


# ---------------------------------------------------------------------------
# 8. Metadata is not a dict
# ---------------------------------------------------------------------------


def test_metadata_not_a_dict_raises():
    """If 'metadata' is a scalar instead of a mapping, fail."""
    yaml_content = """\
version: "1.0"
metadata: "just a string"
system_template: "s"
user_template: "u"
"""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_yaml(Path(tmp) / "badmeta.yaml", yaml_content)
        with pytest.raises(PromptLoadError, match="metadata"):
            load_prompt_template(path)


# ---------------------------------------------------------------------------
# 9. Template is not a YAML mapping at top level
# ---------------------------------------------------------------------------


def test_top_level_not_a_dict_raises():
    """A YAML list instead of a mapping must be rejected."""
    yaml_content = """\
- item: 1
- item: 2
"""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_yaml(Path(tmp) / "list.yaml", yaml_content)
        with pytest.raises(PromptLoadError, match="mapping"):
            load_prompt_template(path)


# ---------------------------------------------------------------------------
# 10. Verify PromptLoadError is a proper exception type
# ---------------------------------------------------------------------------


def test_prompt_load_error_is_exception():
    """PromptLoadError should be a subclass of Exception."""
    assert issubclass(PromptLoadError, Exception)
    with pytest.raises(PromptLoadError):
        raise PromptLoadError("test")
