"""Persisted BM25 index loader with metadata validation.

Consumes BM25 index artifacts produced by scripts/build_index.py (--with-bm25):
  - bm25.pkl         (pickled Bm25Index internal state)
  - metadata.json    (build metadata: checksum, row_count, bm25_version, …)

Provides load_bm25_index() which reads both files, validates integrity,
and returns a Bm25Index compatible with search_service.SearchService.
"""

import json
import logging
import os
import pickle
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from bm25_index import Bm25Index
from venue_corpus.manifest import load_manifest

logger = logging.getLogger("bm25_loader")

_REQUIRED_BM25_METADATA_FIELDS = frozenset(
    {
        "build_timestamp",
        "corpus_checksum",
        "row_count",
        "bm25_version",
        "index_type",
    }
)

_VALID_BM25_INDEX_TYPES = frozenset({"bm25"})


class Bm25LoadError(Exception):
    """Controlled failure when loading a persisted BM25 index.

    Raised by load_bm25_index() for missing index files, corrupt or
    incompatible metadata, checksum mismatches, row_count mismatches,
    and unreadable pickle data.  File-path granularity mirrors the
    IndexLoadError pattern used by the FAISS index_loader.
    """


def _read_json(path: Path) -> dict:
    """Read and parse a JSON file, raising Bm25LoadError on failure."""
    if not path.is_file():
        raise Bm25LoadError(f"Metadata file not found: {path}")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise Bm25LoadError(
            f"Failed to read metadata at {path}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise Bm25LoadError(
            f"Metadata at {path} must be a JSON object, got {type(data).__name__}"
        )
    return data


def _validate_bm25_metadata_fields(metadata: dict, metadata_path: Path) -> None:
    """Ensure all required BM25 metadata fields are present and valid."""
    missing = _REQUIRED_BM25_METADATA_FIELDS - set(metadata.keys())
    if missing:
        raise Bm25LoadError(
            f"Metadata at {metadata_path} missing required fields: {sorted(missing)}"
        )

    for field in sorted(_REQUIRED_BM25_METADATA_FIELDS):
        value = metadata[field]
        if field == "row_count":
            if not isinstance(value, int) or value < 0:
                raise Bm25LoadError(
                    f"Metadata field 'row_count' must be a non-negative integer, "
                    f"got {value!r} in {metadata_path}"
                )
        elif not value:
            raise Bm25LoadError(
                f"Metadata field '{field}' must not be empty in {metadata_path}"
            )

    index_type = metadata.get("index_type")
    if index_type not in _VALID_BM25_INDEX_TYPES:
        raise Bm25LoadError(
            f"Unsupported index_type {index_type!r}. "
            f"Expected one of: {sorted(_VALID_BM25_INDEX_TYPES)}"
        )


def _validate_bm25_checksum(
    metadata: dict, index_dir: Path, manifest_path: Path
) -> None:
    """Verify that the metadata corpus_checksum matches the manifest."""
    try:
        manifest = load_manifest(manifest_path)
    except (OSError, ValueError) as exc:
        raise Bm25LoadError(
            f"Failed to load manifest at {manifest_path}: {exc}"
        ) from exc

    corpus_checksum = metadata.get("corpus_checksum", "")
    manifest_checksum = (
        manifest.get("venues_csv", {}).get("sha256", "")
        if isinstance(manifest, dict)
        else ""
    )

    if not manifest_checksum:
        raise Bm25LoadError(
            f"Manifest at {manifest_path} missing venues_csv.sha256"
        )

    if corpus_checksum != manifest_checksum:
        raise Bm25LoadError(
            f"Corpus checksum mismatch: "
            f"metadata={corpus_checksum[:16]}... vs "
            f"manifest={manifest_checksum[:16]}..."
        )


def _build_bm25_from_state(state: dict) -> Bm25Index:
    """Reconstruct a Bm25Index from its serialized internal state.

    Creates an empty Bm25Index and restores the internal fields from the
    pickled state dict produced by save_bm25_index().
    """
    idx = Bm25Index([], k1=state["k1"], b=state["b"])
    idx._doc_term_freqs = state["doc_term_freqs"]
    idx._doc_lengths = np.array(state["doc_lengths"], dtype="float64")
    idx._idf = state["idf"]
    idx._avgdl = float(state["avgdl"])
    idx._doc_count = len(state["doc_term_freqs"])
    return idx


def save_bm25_index(index: Bm25Index, index_dir: Path) -> None:
    """Serialize a Bm25Index to disk as bm25.pkl.

    The internal state (term frequencies, IDF values, document lengths,
    parameters) is pickled to bm25.pkl in the given directory.

    Args:
        index: The Bm25Index to serialize.
        index_dir: Directory to write bm25.pkl into (must exist).
    """
    state = {
        "k1": index.k1,
        "b": index.b,
        "doc_term_freqs": index._doc_term_freqs,
        "doc_lengths": index._doc_lengths.tolist(),
        "idf": index._idf,
        "avgdl": index._avgdl,
        "doc_count": index._doc_count,
    }
    pkl_path = index_dir / "bm25.pkl"
    with open(pkl_path, "wb") as fh:
        pickle.dump(state, fh, protocol=pickle.HIGHEST_PROTOCOL)
    logger.info("Saved BM25 index to %s (%d documents)", pkl_path, index._doc_count)


def write_bm25_metadata(
    metadata_path: Path,
    corpus_checksum: str,
    row_count: int,
) -> None:
    """Write BM25 build metadata JSON.

    Args:
        metadata_path: Path to write metadata.json.
        corpus_checksum: SHA-256 digest of the source CSV.
        row_count: Number of indexed documents.
    """
    metadata = {
        "build_timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "corpus_checksum": corpus_checksum,
        "row_count": row_count,
        "bm25_version": "1.0.0",
        "index_type": "bm25",
        "parameters": {
            "k1": 1.5,
            "b": 0.75,
        },
    }
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)
        fh.write("\n")
    logger.info("Wrote BM25 build metadata to %s", metadata_path)


def load_bm25_index(
    index_dir,
    manifest_path=None,
):
    """Load a persisted BM25 index with integrity validation.

    Reads bm25.pkl and metadata.json from index_dir, validates required
    metadata fields, optionally cross-checks the corpus checksum against
    a manifest, and returns a fully-functional Bm25Index.

    Args:
        index_dir: Path or str — directory containing bm25.pkl and metadata.json.
        manifest_path: Optional path to corpus manifest.json for checksum validation.

    Returns:
        Bm25Index ready for search.

    Raises:
        Bm25LoadError: For missing files, invalid metadata, checksum mismatches,
                       or unreadable pickle data.
    """
    index_dir = Path(index_dir)

    if not index_dir.is_dir():
        raise Bm25LoadError(f"BM25 index directory not found: {index_dir}")

    pkl_path = index_dir / "bm25.pkl"
    metadata_path = index_dir / "metadata.json"

    if not pkl_path.is_file():
        raise Bm25LoadError(f"BM25 index file not found: {pkl_path}")

    if not metadata_path.is_file():
        raise Bm25LoadError(f"Metadata file not found: {metadata_path}")

    logger.info(
        "Loading persisted BM25 index from %s (index=%s, metadata=%s)",
        index_dir,
        pkl_path,
        metadata_path,
    )

    # 1. Read and validate metadata.
    metadata = _read_json(metadata_path)
    logger.debug("BM25 metadata fields: %s", sorted(metadata.keys()))
    _validate_bm25_metadata_fields(metadata, metadata_path)

    logger.info(
        "BM25 metadata valid: row_count=%d, bm25_version=%s, index_type=%s",
        metadata["row_count"],
        metadata["bm25_version"],
        metadata["index_type"],
    )

    # 2. Validate checksum against manifest if provided.
    if manifest_path:
        manifest_path = Path(manifest_path)
        logger.info("Validating corpus checksum against manifest: %s", manifest_path)
        _validate_bm25_checksum(metadata, index_dir, manifest_path)
        logger.info("Corpus checksum validated against manifest")

    # 3. Load pickle.
    try:
        with open(pkl_path, "rb") as fh:
            state = pickle.load(fh)
    except (OSError, pickle.UnpicklingError) as exc:
        raise Bm25LoadError(
            f"Failed to read BM25 index at {pkl_path}: {exc}"
        ) from exc

    if not isinstance(state, dict):
        raise Bm25LoadError(
            f"BM25 pickle must contain a dict, got {type(state).__name__}"
        )

    # 4. Validate state integrity.
    required_state_keys = {"k1", "b", "doc_term_freqs", "doc_lengths", "idf", "avgdl", "doc_count"}
    missing_state = required_state_keys - set(state.keys())
    if missing_state:
        raise Bm25LoadError(
            f"BM25 pickle at {pkl_path} missing required keys: {sorted(missing_state)}"
        )

    actual_count = len(state["doc_term_freqs"])
    if actual_count != metadata["row_count"]:
        raise Bm25LoadError(
            f"BM25 pickle doc count ({actual_count}) does not match "
            f"metadata row_count ({metadata['row_count']})"
        )

    # 5. Reconstruct Bm25Index.
    index = _build_bm25_from_state(state)

    logger.info(
        "Persisted BM25 index loaded: %d documents, avgdl=%.1f, k1=%.2f, b=%.2f",
        index._doc_count,
        index._avgdl,
        index.k1,
        index.b,
    )

    return index
