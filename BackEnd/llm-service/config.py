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
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-mpnet-base-v2")
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

BUSYNESS_SERVICE_URL = os.getenv("BUSYNESS_SERVICE_URL", "http://busyness-service:5000")
BUSYNESS_FETCH_TIMEOUT_SECONDS = _env_int("BUSYNESS_FETCH_TIMEOUT_SECONDS", 5)

# --- Hybrid search (BM25 + Dense) ---
HYBRID_SEARCH_ENABLED = os.getenv(
    "HYBRID_SEARCH_ENABLED", "true"
).lower() in {"1", "true", "yes"}
RRF_K = _env_int("RRF_K", 60)
BM25_INDEX_PATH = os.getenv("BM25_INDEX_PATH", str(_CORPUS_ROOT / "index" / "bm25"))

# --- Cross-encoder re-ranking ---
CROSS_ENCODER_ENABLED = os.getenv(
    "CROSS_ENCODER_ENABLED", "true"
).lower() in {"1", "true", "yes"}
CROSS_ENCODER_MODEL_NAME = os.getenv(
    "CROSS_ENCODER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L6-v2"
)
CROSS_ENCODER_OVERFETCH_MULTIPLIER = _env_int("CROSS_ENCODER_OVERFETCH_MULTIPLIER", 3)

# --- Query expansion ---
QUERY_EXPANSION_ENABLED = os.getenv(
    "QUERY_EXPANSION_ENABLED", "true"
).lower() in {"1", "true", "yes"}

# --- TypeSafe System One / Jev ---
# Jev makes fast, typed, calibrated decisions. Used to replace brittle regex
# routing/verification in the chat path. Disabled by default; the existing
# regex/LLM behaviour is the fallback whenever Jev is off or unavailable.
JEV_ENABLED = os.getenv("JEV_ENABLED", "false").lower() in {"1", "true", "yes"}
TYPESAFE_API_KEY = os.getenv("TYPESAFE_API_KEY", "")
TYPESAFE_API_URL = os.getenv(
    "TYPESAFE_API_URL", "https://api.typesafe.ai/v1/systemone"
)
JEV_MODEL = os.getenv("JEV_MODEL", "jev-latest")
JEV_TIMEOUT_SECONDS = _env_int("JEV_TIMEOUT_SECONDS", 8)
JEV_MAX_RETRIES = _env_int("JEV_MAX_RETRIES", 2)
# Runtime faithfulness guardrail: verify generated venue claims against the
# retrieved context before returning, replacing ungrounded answers with the
# citation-backed fallback. Only active when JEV_ENABLED is also true.
JEV_GUARDRAIL_ENABLED = os.getenv(
    "JEV_GUARDRAIL_ENABLED", "true"
).lower() in {"1", "true", "yes"}
# Calibrated abstention: decide whether the retrieved candidates can plausibly
# answer the query before generating, instead of relying on a raw similarity
# cutoff or the prompt rule. Only active when JEV_ENABLED is also true.
JEV_ABSTENTION_ENABLED = os.getenv(
    "JEV_ABSTENTION_ENABLED", "true"
).lower() in {"1", "true", "yes"}
# Abstain when P(answerable) < threshold or P(out_of_scope) >= threshold.
JEV_ABSTENTION_THRESHOLD = float(os.getenv("JEV_ABSTENTION_THRESHOLD", "0.5"))

# Guardrail tiers. A fabricated venue (or a severe unsupported detail) replaces
# the answer with the grounded venue list; milder issues keep the answer and
# append a caveat. See docs/JEV_INTEGRATION.md "A/B result".
JEV_GUARDRAIL_REPLACE_THRESHOLD = float(
    os.getenv("JEV_GUARDRAIL_REPLACE_THRESHOLD", "0.8")
)
JEV_GUARDRAIL_CAVEAT_THRESHOLD = float(
    os.getenv("JEV_GUARDRAIL_CAVEAT_THRESHOLD", "0.5")
)

# Search-query composition. When the route supplies a Jev QueryAnalysis, the
# HF rewrite_query call is skipped (it measured worse than plain expansion and
# cost ~1 s). Set this to true to instead append the analysis's typed
# location/price/category terms — measured roughly neutral, so off by default.
JEV_SEARCH_COMPOSE_ENABLED = os.getenv(
    "JEV_SEARCH_COMPOSE_ENABLED", "false"
).lower() in {"1", "true", "yes"}

# --- Jev re-ranking (cross-encoder replacement) ---
# Scores (query, candidate) relevance with calibrated probabilities in a single
# parallel call, avoiding the per-pair CPU forward passes that made the
# cross-encoder too slow for interactive use. Disabled by default.
JEV_RERANK_ENABLED = os.getenv(
    "JEV_RERANK_ENABLED", "false"
).lower() in {"1", "true", "yes"}
JEV_RERANK_OVERFETCH_MULTIPLIER = _env_int("JEV_RERANK_OVERFETCH_MULTIPLIER", 5)
JEV_RERANK_MAX_CANDIDATES = _env_int("JEV_RERANK_MAX_CANDIDATES", 50)
# Below this confidence, a Jev classification is treated as "no signal" and
# the caller falls back to the regex path. See docs.typesafe.ai/confidence.
JEV_CONFIDENCE_THRESHOLD = float(os.getenv("JEV_CONFIDENCE_THRESHOLD", "0.5"))
