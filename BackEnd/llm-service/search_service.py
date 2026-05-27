"""FAISS-backed vector search and similar-location retrieval."""

import os

import faiss
import numpy as np

from dto import REQUIRED_DTO_FIELDS, create_location_dto
from loader import StartupLoadError, validate_startup_data

ALLOW_TORCH_FULL_SCAN_FALLBACK = os.getenv(
    "ALLOW_TORCH_FULL_SCAN_FALLBACK", ""
).lower() in {"1", "true", "yes"}

_PRICE_FILTERS = {
    "budget": {"very cheap", "cheap"},
    "mid": {"moderate", "mid"},
    "luxury": {"expensive", "luxury"},
}

VALID_PRICE_RANGES = frozenset(_PRICE_FILTERS.keys())


class SearchStartupError(Exception):
    """Controlled startup failure for search index construction."""


class VectorIndex:
    def __init__(self, index, row_ids, dimensions):
        self.index = index
        self.row_ids = np.asarray(row_ids, dtype="int64")
        self.dimensions = dimensions


def _normalize_vectors(vectors):
    matrix = np.asarray(vectors, dtype="float32")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return matrix / norms


def build_vector_index(raw_embeddings, row_ids=None):
    """Build an in-memory FAISS inner-product index over normalized vectors."""
    matrix = np.asarray(raw_embeddings, dtype="float32")
    if matrix.size == 0 or matrix.ndim != 2 or matrix.shape[0] == 0 or matrix.shape[1] == 0:
        raise SearchStartupError("Embeddings must be non-empty for index construction")

    normalized = _normalize_vectors(matrix)
    dimensions = normalized.shape[1]
    index = faiss.IndexFlatIP(dimensions)
    index.add(normalized)

    if row_ids is None:
        ids = np.arange(len(normalized), dtype="int64")
    else:
        ids = np.asarray(row_ids, dtype="int64")

    return VectorIndex(index=index, row_ids=ids, dimensions=dimensions)


def _matches_location_filter(row, location_filter):
    if not location_filter:
        return True
    zone = str(row.get("zone", ""))
    return location_filter.lower() in zone.lower()


def _matches_price_range(row, price_range):
    if not price_range:
        return True
    allowed = _PRICE_FILTERS.get(str(price_range).lower())
    if allowed is None:
        return False
    price = str(row.get("price", "")).lower()
    return price in allowed


def _normalize_query_vector(vector):
    query = np.asarray(vector, dtype="float32").reshape(1, -1)
    norm = np.linalg.norm(query)
    if norm == 0:
        return query
    return query / norm


def _cosine_scores(query_vector, embeddings):
    query = np.asarray(query_vector, dtype="float32")
    matrix = np.asarray(embeddings, dtype="float32")
    query_norm = np.linalg.norm(query)
    if query_norm == 0:
        return np.zeros(len(matrix), dtype="float32")
    row_norms = np.linalg.norm(matrix, axis=1)
    row_norms = np.where(row_norms == 0, 1.0, row_norms)
    return (matrix @ query) / (row_norms * query_norm)


def current_cosine_top_k(
    query_vector,
    embeddings,
    df,
    limit,
    location_filter=None,
    price_range=None,
    exclude_names=None,
):
    """Baseline cosine ranking used for retrieval parity checks."""
    if limit <= 0:
        return []

    query = np.asarray(query_vector, dtype="float32")
    if query.size == 0 or np.linalg.norm(query) == 0:
        return []

    scores = _cosine_scores(query, embeddings)
    exclude_lower = {str(name).lower().strip() for name in (exclude_names or []) if name}

    ranked = []
    for row_idx, score in enumerate(scores):
        row = df.iloc[row_idx]
        name = str(row.get("name", ""))
        if name.lower() in exclude_lower:
            continue
        if not _matches_location_filter(row, location_filter):
            continue
        if not _matches_price_range(row, price_range):
            continue
        ranked.append((row_idx, float(score), row))

    ranked.sort(key=lambda item: item[1], reverse=True)
    return [int(row.get("id", row_idx)) for row_idx, _, row in ranked[:limit]]


class SearchService:
    """Vector-index search service decoupled from Flask route wiring."""

    def __init__(
        self,
        df,
        embeddings,
        vector_index,
        encoder,
        over_fetch_multiplier=3,
        allow_torch_fallback=False,
    ):
        self._df = df
        self._embeddings = np.asarray(embeddings, dtype="float32")
        self._index = vector_index
        self._encoder = encoder
        self._over_fetch_multiplier = max(1, int(over_fetch_multiplier))
        self._allow_torch_fallback = allow_torch_fallback
        self.uses_faiss_index = True

    @classmethod
    def from_startup(
        cls,
        df,
        embeddings,
        encoder,
        over_fetch_multiplier=3,
        allow_torch_fallback=None,
    ):
        try:
            matrix = validate_startup_data(df, embeddings)
        except StartupLoadError as exc:
            message = str(exc).lower()
            if "row count" in message:
                raise SearchStartupError(
                    "Embedding row-count mismatch with location data"
                ) from exc
            raise SearchStartupError(str(exc)) from exc

        if matrix.shape[1] == 0:
            raise SearchStartupError("Embedding dimension must be greater than zero")

        probe = np.asarray(
            encoder.encode("", convert_to_numpy=True),
            dtype="float32",
        ).reshape(-1)
        if probe.size and probe.shape[0] != matrix.shape[1]:
            raise SearchStartupError(
                f"Embedding dimension ({matrix.shape[1]}) does not match encoder dimension ({probe.shape[0]})"
            )

        try:
            vector_index = build_vector_index(matrix)
        except SearchStartupError:
            raise
        except Exception as exc:
            raise SearchStartupError(f"index construction failed: {exc}") from exc

        if len(df) != matrix.shape[0]:
            raise SearchStartupError("Embedding row-count mismatch with location data")

        resolved_torch_fallback = (
            allow_torch_fallback
            if allow_torch_fallback is not None
            else ALLOW_TORCH_FULL_SCAN_FALLBACK
        )
        return cls(
            df=df,
            embeddings=matrix,
            vector_index=vector_index,
            encoder=encoder,
            over_fetch_multiplier=over_fetch_multiplier,
            allow_torch_fallback=resolved_torch_fallback,
        )

    def _encode_query(self, query_text):
        vector = np.asarray(
            self._encoder.encode(query_text, convert_to_numpy=True),
            dtype="float32",
        ).reshape(-1)
        if vector.shape[0] != self._index.dimensions:
            raise SearchStartupError(
                f"Query embedding dimension ({vector.shape[0]}) does not match index dimension ({self._index.dimensions})"
            )
        return _normalize_query_vector(vector)

    def _collect_results(
        self,
        query_text,
        limit,
        location_filter=None,
        price_range=None,
        exclude_names=None,
    ):
        if limit <= 0:
            return []

        query_vector = self._encode_query(query_text)
        if np.linalg.norm(query_vector) == 0:
            return []

        exclude_lower = {str(name).lower().strip() for name in (exclude_names or []) if name}
        batch = min(
            len(self._df),
            max(limit * self._over_fetch_multiplier, limit + len(exclude_lower)),
        )
        seen = set()
        results = []

        while len(results) < limit and batch > 0:
            scores, positions = self._index.index.search(query_vector, batch)

            candidates = []
            for position, score in zip(positions[0], scores[0]):
                if position < 0:
                    continue
                row_idx = int(self._index.row_ids[position])
                if row_idx in seen:
                    continue
                seen.add(row_idx)
                candidates.append((row_idx, float(score)))

            # Stable tie-breaking matches current_cosine_top_k enumeration order.
            candidates.sort(key=lambda item: (-item[1], item[0]))

            for row_idx, score in candidates:
                if len(results) >= limit:
                    break
                row = self._df.iloc[row_idx]
                name = str(row.get("name", ""))
                if name.lower() in exclude_lower:
                    continue
                if not _matches_location_filter(row, location_filter):
                    continue
                if not _matches_price_range(row, price_range):
                    continue
                results.append(create_location_dto(row, score))

            if batch >= len(self._df):
                break
            batch = min(len(self._df), batch * 2)

        return results

    def search(self, query_text, limit=10, location_filter=None, price_range=None):
        if not str(query_text).strip():
            return []
        return self._collect_results(
            query_text,
            limit=limit,
            location_filter=location_filter,
            price_range=price_range,
        )

    def find_similar(self, query_text, exclude_names=None, limit=5):
        return self._collect_results(
            query_text,
            limit=limit,
            exclude_names=exclude_names or [],
        )

    def _torch_full_corpus_search(self, query_text):
        if not self._allow_torch_fallback:
            raise SearchStartupError(
                "Torch full-corpus fallback is disabled; set ALLOW_TORCH_FULL_SCAN_FALLBACK=true to enable"
            )

        query_vector = self._encode_query(query_text).reshape(-1)
        scores = _cosine_scores(query_vector, self._embeddings)
        ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)

        results = []
        for row_idx, score in ranked:
            row = self._df.iloc[row_idx]
            results.append(create_location_dto(row, float(score)))
            if len(results) >= 5:
                break

        confidence = float(results[0]["similarity"]) if results else 0.0
        return results, confidence
