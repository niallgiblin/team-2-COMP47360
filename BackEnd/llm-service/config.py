"""Env-backed runtime settings for the LLM Flask service."""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_LLM_SERVICE_DIR = Path(__file__).parent.resolve()

_RAW_CORPUS_VERSION = os.getenv("CORPUS_VERSION", "v1")
if ".." in Path(_RAW_CORPUS_VERSION).parts or Path(_RAW_CORPUS_VERSION).is_absolute():
    logger.error("Invalid CORPUS_VERSION=%r; using v1", _RAW_CORPUS_VERSION)
    _CORPUS_VERSION = "v1"
else:
    _CORPUS_VERSION = _RAW_CORPUS_VERSION

_CORPUS_ROOT = _LLM_SERVICE_DIR / "corpus" / _CORPUS_VERSION
CORPUS_VERSION = _CORPUS_VERSION


def _env_int(name, default):
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid %s=%r; using default %s", name, raw, default)
        return default


MODEL_PATH = os.getenv("MODEL_PATH", str(_LLM_SERVICE_DIR / "models" / "sentence-transformers"))
DATA_PATH = os.getenv("DATA_PATH", str(_CORPUS_ROOT / "venues.csv"))
MANIFEST_PATH = os.getenv("MANIFEST_PATH", str(_CORPUS_ROOT / "manifest.json"))
EMBEDDINGS_PATH = os.getenv(
    "EMBEDDINGS_PATH",
    str(_LLM_SERVICE_DIR / "data" / "location_embeddings.npy"),
)
INDEX_PATH = os.getenv("INDEX_PATH", str(_CORPUS_ROOT / "index"))


def parse_allowed_origins():
    configured = os.getenv(
        "FLASK_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    )
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


DEFAULT_HF_CHAT_MODEL = "meta-llama/Llama-3.1-8B-Instruct"
HF_CHAT_MODEL = os.getenv("HF_CHAT_MODEL", DEFAULT_HF_CHAT_MODEL)
CHAT_API_URL = "https://router.huggingface.co/v1/chat/completions"

SEARCH_CACHE_TTL_SECONDS = _env_int("SEARCH_CACHE_TTL_SECONDS", 300)
SEARCH_CACHE_MAX_ENTRIES = _env_int("SEARCH_CACHE_MAX_ENTRIES", 512)
SEARCH_OVERFETCH_MULTIPLIER = _env_int("SEARCH_OVERFETCH_MULTIPLIER", 3)
