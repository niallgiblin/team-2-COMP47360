"""Persisted FAISS index loader with metadata validation.

Consumes index artifacts produced by scripts/build_index.py:
  - faiss.index       (serialized FAISS index via faiss.write_index)
  - metadata.json     (build metadata: checksum, dimensions, row_count, …)

Provides load_persisted_index() which reads both files, validates integrity,
and returns a VectorIndex compatible with search_service.SearchService.
"""

import json
import logging
import os
from pathlib import Path

import faiss
import numpy as np

from search_service import VectorIndex
from venue_corpus.manifest import load_manifest

logger = logging.getLogger("index_loader")

_REQUIRED_METADATA_FIELDS = frozenset(
    {
        "build_timestamp",
        "corpus_checksum",
        "row_count",
        "dimensions",
        "index_type",
    }
)

_VALID_INDEX_TYPES = frozenset({"faiss.IndexFlatIP"})


class IndexLoadError(Exception):
    """Controlled failure when loading a persisted FAISS index.

    Raised by load_persisted_index() for missing index files, corrupt or
    incompatible metadata, checksum mismatches, dimension mismatches, and
    unreadable FAISS index data.
    """


def _read_json(path: Path) -> dict:
    """Read and parse a JSON file, raising IndexLoadError on failure."""
    if not path.is_file():
        raise IndexLoadError(
            f"Metadata file not found: {path}"
        )
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise IndexLoadError(
            f"Failed to read metadata at {path}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise IndexLoadError(
            f"Metadata at {path} must be a JSON object, got {type(data).__name__}"
        )
    return data


def _validate_metadata_fields(metadata: dict, metadata_path: Path) -> None:
    """Ensure all required metadata fields are present and non-empty."""
    missing = _REQUIRED_METADATA_FIELDS - set(metadata.keys())
    if missing:
        raise IndexLoadError(
            f"Metadata at {metadata_path} missing required fields: {sorted(missing)}"
        )

    for field in sorted(_REQUIRED_METADATA_FIELDS):
        value = metadata[field]
        if field == "dimensions":
            if not isinstance(value, (int, float)) or int(value) <= 0:
                raise IndexLoadError(
                    f"Metadata field 'dimensions' must be a positive integer, "
                    f"got {value!r} in {metadata_path}"
                )
        elif field == "row_count":
            if not isinstance(value, int) or value < 0:
                raise IndexLoadError(
                    f"Metadata field 'row_count' must be a non-negative integer, "
                    f"got {value!r} in {metadata_path}"
                )
        elif not value:
            raise IndexLoadError(
                f"Metadata field '{field}' must not be empty in {metadata_path}"
            )

    index_type = metadata.get("index_type")
    if index_type not in _VALID_INDEX_TYPES:
        raise IndexLoadError(
            f"Unsupported index_type {index_type!r}. "
            f"Expected one of: {sorted(_VALID_INDEX_TYPES)}"
        )


def _validate_checksum_against_manifest(
    metadata: dict, index_dir: Path, manifest_path: Path
) -> None:
    """Verify that the metadata corpus_checksum matches the manifest."""
    try:
        manifest = load_manifest(manifest_path)
    except (OSError, ValueError) as exc:
        raise IndexLoadError(
            f"Failed to load manifest at {manifest_path}: {exc}"
        ) from exc

    corpus_checksum = metadata.get("corpus_checksum", "")
    manifest_checksum = (
        manifest.get("venues_csv", {}).get("sha256", "")
        if isinstance(manifest, dict)
        else ""
    )

    if not manifest_checksum:
        raise IndexLoadError(
            f"Manifest at {manifest_path} missing venues_csv.sha256"
        )

    if corpus_checksum != manifest_checksum:
        raise IndexLoadError(
            f"Corpus checksum mismatch: "
            f"metadata={corpus_checksum[:16]}... vs "
            f"manifest={manifest_checksum[:16]}..."
        )


def _validate_dimensions(metadata: dict, encoder_dimensions: int) -> None:
    """Verify that the index dimensions match the encoder dimensions."""
    index_dimensions = metadata.get("dimensions")
    if not isinstance(index_dimensions, (int, float)):
        raise IndexLoadError(
            f"Metadata 'dimensions' is not a number: {index_dimensions!r}"
        )
    index_dimensions = int(index_dimensions)
    encoder_dimensions = int(encoder_dimensions)

    if index_dimensions != encoder_dimensions:
        raise IndexLoadError(
            f"Dimension mismatch: index has {index_dimensions}, "
            f"encoder produces {encoder_dimensions}"
        )


def load_persisted_index(
    index_dir,
    manifest_path=None,
    encoder_dimensions=None,
):
    """Load a persisted FAISS index with integrity validation.

    Reads faiss.index and metadata.json from index_dir, validates required
    metadata fields, optionally cross-checks the corpus checksum against a
    manifest, optionally validates dimensions against an encoder probe, and
    returns a VectorIndex with positional row IDs matching build_index.py.

    Args:
        index_dir: Path or str — directory containing faiss.index and metadata.json.
        manifest_path: Optional path to corpus manifest.json for checksum validation.
        encoder_dimensions: Optional expected embedding dimension for validation.

    Returns:
        VectorIndex(index, row_ids, dimensions) compatible with SearchService.

    Raises:
        IndexLoadError: For missing files, invalid metadata, checksum mismatches,
                        dimension mismatches, or unreadable FAISS index data.
    """
    index_dir = Path(index_dir)

    if not index_dir.is_dir():
        raise IndexLoadError(f"Index directory not found: {index_dir}")

    index_path = index_dir / "faiss.index"
    metadata_path = index_dir / "metadata.json"

    if not index_path.is_file():
        raise IndexLoadError(f"FAISS index file not found: {index_path}")

    if not metadata_path.is_file():
        raise IndexLoadError(f"Metadata file not found: {metadata_path}")

    logger.info(
        "Loading persisted index from %s (index=%s, metadata=%s)",
        index_dir,
        index_path,
        metadata_path,
    )

    # 1. Read and validate metadata.
    metadata = _read_json(metadata_path)

    logger.debug("Metadata fields: %s", sorted(metadata.keys()))
    _validate_metadata_fields(metadata, metadata_path)

    logger.info(
        "Metadata valid: row_count=%d, dimensions=%d, index_type=%s",
        metadata["row_count"],
        metadata["dimensions"],
        metadata["index_type"],
    )

    # 2. Validate checksum against manifest if provided.
    if manifest_path:
        manifest_path = Path(manifest_path)
        logger.info("Validating corpus checksum against manifest: %s", manifest_path)
        _validate_checksum_against_manifest(metadata, index_dir, manifest_path)
        logger.info("Corpus checksum validated against manifest")

    # 3. Validate dimensions against encoder if provided.
    if encoder_dimensions is not None:
        logger.info(
            "Validating dimensions against encoder: %d", encoder_dimensions
        )
        _validate_dimensions(metadata, encoder_dimensions)
        logger.info("Dimension validation passed")

    # 4. Read FAISS index.
    try:
        index = faiss.read_index(str(index_path))
    except Exception as exc:
        raise IndexLoadError(
            f"Failed to read FAISS index at {index_path}: {exc}"
        ) from exc

    ntotal = index.ntotal
    dimensions = int(metadata["dimensions"])

    if ntotal != metadata["row_count"]:
        raise IndexLoadError(
            f"Index vector count ({ntotal}) does not match "
            f"metadata row_count ({metadata['row_count']})"
        )

    if dimensions != index.d:
        raise IndexLoadError(
            f"Metadata dimensions ({dimensions}) do not match "
            f"actual index dimensions ({index.d})"
        )

    # 5. Construct VectorIndex with positional row_ids matching build_index.py.
    row_ids = np.arange(ntotal, dtype="int64")

    logger.info(
        "Persisted index loaded: %d vectors, %d dimensions, index_type=%s",
        ntotal,
        dimensions,
        metadata["index_type"],
    )

    return VectorIndex(index=index, row_ids=row_ids, dimensions=dimensions)
