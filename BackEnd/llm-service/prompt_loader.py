"""Versioned prompt-template loader with validation.

Loads YAML prompt templates from the ``prompts/`` registry, validates required
fields, and returns a typed dict suitable for chat-message construction.

Separating templates from code enables audit, rollback, and eval (R006).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TypedDict

import yaml

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


class PromptTemplateMetadata(TypedDict):
    """Metadata block required in every prompt template YAML."""

    corpus_version: str
    model: str
    created: str
    description: str


class PromptTemplate(TypedDict):
    """Fully-loaded and validated prompt template."""

    version: str
    metadata: PromptTemplateMetadata
    system_template: str
    user_template: str


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------


class PromptLoadError(Exception):
    """Controlled error raised when a prompt template cannot be loaded or
    fails validation."""


# ---------------------------------------------------------------------------
# Default — points at the single template we ship for M001/S04
# ---------------------------------------------------------------------------

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
DEFAULT_TEMPLATE_PATH = _PROMPTS_DIR / "rag-v1.yaml"

# ---------------------------------------------------------------------------
# Required top-level keys and metadata sub-keys
# ---------------------------------------------------------------------------

_REQUIRED_TOP_KEYS = frozenset({"version", "metadata", "system_template", "user_template"})
_REQUIRED_META_KEYS = frozenset({"corpus_version", "model"})


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def load_prompt_template(path: str | Path | None = None) -> PromptTemplate:
    """Load a YAML prompt template, validate required fields, and return a
    typed ``PromptTemplate`` dict.

    Parameters
    ----------
    path : str or Path, optional
        Filesystem path to the YAML template.  Defaults to
        ``prompts/rag-v1.yaml`` relative to this module.

    Returns
    -------
    PromptTemplate
        Validated template with ``version``, ``metadata``, ``system_template``,
        and ``user_template``.

    Raises
    ------
    PromptLoadError
        If the file is missing, the YAML is invalid, or required fields are
        absent / empty.
    """
    resolved = Path(path) if path is not None else DEFAULT_TEMPLATE_PATH

    # ---- 1. Read raw YAML -------------------------------------------------
    if not resolved.exists():
        raise PromptLoadError(f"Prompt template file not found: {resolved}")

    try:
        raw_text = resolved.read_text(encoding="utf-8")
    except OSError as exc:
        raise PromptLoadError(f"Failed to read prompt template {resolved}: {exc}") from exc

    try:
        data = yaml.safe_load(raw_text)
    except yaml.YAMLError as exc:
        raise PromptLoadError(f"Invalid YAML in prompt template {resolved}: {exc}") from exc

    if not isinstance(data, dict):
        raise PromptLoadError(
            f"Prompt template {resolved} must be a YAML mapping, got {type(data).__name__}"
        )

    # ---- 2. Validate top-level keys ---------------------------------------
    missing_top = _REQUIRED_TOP_KEYS - set(data.keys())
    if missing_top:
        raise PromptLoadError(
            f"Prompt template {resolved} missing required top-level keys: "
            f"{', '.join(sorted(missing_top))}"
        )

    for key in ("system_template", "user_template"):
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            raise PromptLoadError(
                f"Prompt template {resolved}: '{key}' must be a non-empty string"
            )

    version = data.get("version")
    if not isinstance(version, str) or not version.strip():
        raise PromptLoadError(
            f"Prompt template {resolved}: 'version' must be a non-empty string"
        )

    # ---- 3. Validate metadata block ---------------------------------------
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        raise PromptLoadError(
            f"Prompt template {resolved}: 'metadata' must be a mapping, "
            f"got {type(metadata).__name__}"
        )

    missing_meta = _REQUIRED_META_KEYS - set(metadata.keys())
    if missing_meta:
        raise PromptLoadError(
            f"Prompt template {resolved}: metadata missing required keys: "
            f"{', '.join(sorted(missing_meta))}"
        )

    for meta_key in _REQUIRED_META_KEYS:
        meta_value = metadata.get(meta_key)
        if not isinstance(meta_value, str) or not meta_value.strip():
            raise PromptLoadError(
                f"Prompt template {resolved}: metadata '{meta_key}' must be a non-empty string"
            )

    # ---- 4. Assemble and return -------------------------------------------
    logger.info(
        "Loaded prompt template %s (version=%s, corpus=%s, model=%s)",
        resolved.name,
        version,
        metadata["corpus_version"],
        metadata["model"],
    )

    return PromptTemplate(
        version=str(version).strip(),
        metadata=PromptTemplateMetadata(
            corpus_version=str(metadata["corpus_version"]).strip(),
            model=str(metadata["model"]).strip(),
            created=str(metadata.get("created", "")).strip(),
            description=str(metadata.get("description", "")).strip(),
        ),
        system_template=str(data["system_template"]),
        user_template=str(data["user_template"]),
    )
