"""Versioned venue corpus utilities for RAG document and manifest handling."""

from venue_corpus.document import EMBED_FIELDS, compose_document_text
from venue_corpus.manifest import load_manifest, sha256_file, verify_manifest_checksum
from venue_corpus.validate import (
    REQUIRED_VENUE_COLUMNS,
    resolve_corpus_root,
    validate_corpus_dir,
    validate_venue_schema,
)

__all__ = [
    "EMBED_FIELDS",
    "REQUIRED_VENUE_COLUMNS",
    "compose_document_text",
    "load_manifest",
    "resolve_corpus_root",
    "sha256_file",
    "validate_corpus_dir",
    "validate_venue_schema",
    "verify_manifest_checksum",
]
