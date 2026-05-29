"""Startup validation and artifact loading for the LLM service."""

import importlib
import os
from pathlib import Path

import numpy as np

import config as _config_module

MODEL_PATH = "MODEL_PATH"
DATA_PATH = "DATA_PATH"
EMBEDDINGS_PATH = "EMBEDDINGS_PATH"
INDEX_PATH = "INDEX_PATH"
MANIFEST_PATH = "MANIFEST_PATH"


class StartupLoadError(Exception):
    """Controlled startup failure for loader validation."""


def _reload_config():
    """Return a reload-safe snapshot of configured artifact paths."""
    importlib.reload(_config_module)
    return _config_module


def verify_file_paths():
    """Verify required artifacts exist; return missing env var names and optional warnings.

    Returns:
        (all_required_ok: bool, missing_required: list[str], optional_warnings: list[str])
    """
    cfg = _reload_config()
    required_checks = [
        (MODEL_PATH, cfg.MODEL_PATH),
        (DATA_PATH, cfg.DATA_PATH),
        (EMBEDDINGS_PATH, cfg.EMBEDDINGS_PATH),
        (MANIFEST_PATH, cfg.MANIFEST_PATH),
    ]

    missing = [env_name for env_name, path in required_checks if not os.path.exists(path)]

    # INDEX_PATH is optional — missing index triggers .npy fallback at SearchService startup.
    optional_warnings = []
    index_path = cfg.INDEX_PATH
    if not os.path.exists(index_path):
        optional_warnings.append(
            f"{INDEX_PATH} ({index_path}) not found; service will fall back to .npy-built index"
        )
    elif not os.path.isdir(index_path):
        optional_warnings.append(
            f"{INDEX_PATH} ({index_path}) is not a directory; service will fall back to .npy-built index"
        )
    else:
        # Directory exists — check for expected files, warn if incomplete.
        faiss_file = os.path.join(index_path, "faiss.index")
        metadata_file = os.path.join(index_path, "metadata.json")
        if not os.path.isfile(faiss_file):
            optional_warnings.append(
                f"{INDEX_PATH} directory exists but faiss.index missing; service will fall back to .npy-built index"
            )
        if not os.path.isfile(metadata_file):
            optional_warnings.append(
                f"{INDEX_PATH} directory exists but metadata.json missing; service will fall back to .npy-built index"
            )

    return len(missing) == 0, missing, optional_warnings


def _corpus_error_env_names(errors: list[str]) -> list[str]:
    """Map corpus validation messages to env var names only."""
    env_names: list[str] = []
    for error in errors:
        lowered = error.lower()
        if "manifest" in lowered:
            if MANIFEST_PATH not in env_names:
                env_names.append(MANIFEST_PATH)
        elif "corpus_version" in lowered or "corpus root" in lowered:
            if "CORPUS_VERSION" not in env_names:
                env_names.append("CORPUS_VERSION")
        else:
            if DATA_PATH not in env_names:
                env_names.append(DATA_PATH)
    return env_names or [DATA_PATH]


def validate_corpus_at_startup() -> tuple[bool, list[str]]:
    """Validate corpus layout and schema; checksum mismatch is a warning only."""
    from venue_corpus.validate import resolve_corpus_root, validate_corpus_dir

    cfg = _reload_config()
    service_dir = Path(__file__).parent.resolve()

    try:
        corpus_root = resolve_corpus_root(service_dir, cfg.CORPUS_VERSION)
    except ValueError:
        return False, ["CORPUS_VERSION"]

    expected_csv = corpus_root / "venues.csv"
    expected_manifest = corpus_root / "manifest.json"
    if Path(cfg.DATA_PATH).resolve() != expected_csv.resolve():
        return False, [DATA_PATH]
    if Path(cfg.MANIFEST_PATH).resolve() != expected_manifest.resolve():
        return False, [MANIFEST_PATH]

    all_errors = validate_corpus_dir(corpus_root)
    checksum_errors = [error for error in all_errors if error.startswith("Checksum mismatch")]
    hard_errors = [error for error in all_errors if error not in checksum_errors]

    if hard_errors:
        return False, _corpus_error_env_names(hard_errors)

    warnings = list(checksum_errors)
    return True, warnings


def validate_embeddings_matrix(embeddings):
    """Ensure embeddings are a non-empty 2D float-compatible matrix."""
    matrix = np.asarray(embeddings, dtype="float32")
    if matrix.size == 0 or matrix.ndim != 2:
        raise StartupLoadError("Embeddings must be a non-empty 2D matrix")
    if matrix.shape[0] == 0 or matrix.shape[1] == 0:
        raise StartupLoadError("Embeddings must be a non-empty 2D matrix")
    return matrix


def validate_startup_data(df, embeddings):
    """Validate embedding matrix shape matches loaded location rows."""
    matrix = validate_embeddings_matrix(embeddings)
    row_count = len(df)
    if matrix.shape[0] != row_count:
        raise StartupLoadError(
            f"Embedding row count ({matrix.shape[0]}) does not match location row count ({row_count})"
        )
    return matrix


def validate_index_metadata():
    """Check if a persisted index exists and has valid metadata.json fields.

    Does NOT load the FAISS index into memory — only checks file presence and
    metadata shape to inform the startup decision.

    Returns:
        (exists: bool, metadata_ok: bool, detail: str)
        - exists: whether the index directory and faiss.index both exist
        - metadata_ok: whether metadata.json is present and passes field validation
        - detail: human-readable reason when metadata validation fails, or empty string
    """
    import json

    cfg = _reload_config()
    index_dir = Path(cfg.INDEX_PATH)

    if not index_dir.is_dir():
        return False, False, ""

    faiss_file = index_dir / "faiss.index"
    metadata_file = index_dir / "metadata.json"

    if not faiss_file.is_file():
        return False, False, ""

    exists = True
    if not metadata_file.is_file():
        return True, False, "metadata.json missing"

    try:
        with open(metadata_file, encoding="utf-8") as fh:
            metadata = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        return True, False, f"metadata.json unreadable: {exc}"

    if not isinstance(metadata, dict):
        return True, False, "metadata.json is not a JSON object"

    required = {"build_timestamp", "corpus_checksum", "row_count", "dimensions", "index_type"}
    missing = required - set(metadata.keys())
    if missing:
        return True, False, f"metadata.json missing fields: {sorted(missing)}"

    # Quick sanity checks on field types (not exhaustive — index_loader does full validation).
    try:
        dims = int(metadata.get("dimensions", 0))
    except (TypeError, ValueError):
        return True, False, "metadata.json dimensions is not an integer"

    try:
        rows = int(metadata.get("row_count", -1))
    except (TypeError, ValueError):
        return True, False, "metadata.json row_count is not an integer"

    if dims <= 0:
        return True, False, f"metadata.json dimensions must be positive, got {dims}"
    if rows < 0:
        return True, False, f"metadata.json row_count must be non-negative, got {rows}"

    return True, True, ""
