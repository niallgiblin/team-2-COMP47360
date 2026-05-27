"""Startup validation and artifact loading for the LLM service."""

import os
from pathlib import Path

import numpy as np

_LLM_SERVICE_DIR = Path(__file__).parent.resolve()

MODEL_PATH = "MODEL_PATH"
DATA_PATH = "DATA_PATH"
EMBEDDINGS_PATH = "EMBEDDINGS_PATH"

_PATH_ENV_NAMES = {
    MODEL_PATH: "MODEL_PATH",
    DATA_PATH: "DATA_PATH",
    EMBEDDINGS_PATH: "EMBEDDINGS_PATH",
}


class StartupLoadError(Exception):
    """Controlled startup failure for loader validation."""


def _resolve_path(env_name, default_relative):
    return os.getenv(env_name, str(_LLM_SERVICE_DIR / default_relative))


def verify_file_paths():
    """Verify required artifacts exist; return missing env var names only."""
    checks = [
        (MODEL_PATH, _resolve_path("MODEL_PATH", "models/sentence-transformers")),
        (DATA_PATH, _resolve_path("DATA_PATH", "data/locations.csv")),
        (EMBEDDINGS_PATH, _resolve_path("EMBEDDINGS_PATH", "data/location_embeddings.npy")),
    ]

    missing = [env_name for env_name, path in checks if not os.path.exists(path)]
    return len(missing) == 0, missing


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
