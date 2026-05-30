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


def _rrf_fuse(bm25_results, dense_results, k=60):
    """Fuse BM25 and dense rankings via Reciprocal Rank Fusion.

    RRF_score(d) = Σ_{r in rankers} 1/(k + rank_r(d))

    Ranks start at 1 (not 0). Documents appearing in only one ranker
    get contribution only from that ranker.

    Args:
        bm25_results: [(doc_idx, bm25_score), ...] sorted by score desc.
        dense_results: [(doc_idx, dense_score), ...] sorted by score desc.
        k: RRF constant (default 60).

    Returns:
        [(doc_idx, rrf_score), ...] sorted by RRF score descending.
    """
    rrf_scores: dict[int, float] = {}

    for rank, (doc_idx, _score) in enumerate(bm25_results, start=1):
        rrf_scores[doc_idx] = rrf_scores.get(doc_idx, 0.0) + 1.0 / (k + rank)

    for rank, (doc_idx, _score) in enumerate(dense_results, start=1):
        rrf_scores[doc_idx] = rrf_scores.get(doc_idx, 0.0) + 1.0 / (k + rank)

    merged = sorted(rrf_scores.items(), key=lambda item: item[1], reverse=True)
    return merged


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
        index_source="npy-built",
        bm25_index=None,
        rrf_k=60,
    ):
        self._df = df
        self._embeddings = np.asarray(embeddings, dtype="float32")
        self._index = vector_index
        self._encoder = encoder
        self._over_fetch_multiplier = max(1, int(over_fetch_multiplier))
        self._allow_torch_fallback = allow_torch_fallback
        self.uses_faiss_index = True
        self._index_source = index_source
        self._bm25_index = bm25_index
        self._rrf_k = int(rrf_k)

    @classmethod
    def from_startup(
        cls,
        df,
        embeddings,
        encoder,
        over_fetch_multiplier=3,
        allow_torch_fallback=None,
        index_path=None,
        bm25_index_path=None,
        hybrid_search_enabled=None,
        rrf_k=None,
    ):
        import logging
        import os

        logger = logging.getLogger(__name__)

        # Resolve index_path from config if not explicitly provided.
        if index_path is None:
            from config import INDEX_PATH as _cfg_index_path

            index_path = _cfg_index_path

        # Resolve manifest path once (used by both FAISS and BM25 loading).
        from config import MANIFEST_PATH as _cfg_manifest_path

        _manifest_path = _cfg_manifest_path if os.path.isfile(_cfg_manifest_path) else None

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

        # --- Persisted FAISS index path ---
        index_source = "npy-built"
        vector_index = None
        persisted_attempted = False

        index_dir = os.path.join(index_path, "") if index_path else ""
        faiss_file = os.path.join(index_path, "faiss.index") if index_path else ""
        metadata_file = os.path.join(index_path, "metadata.json") if index_path else ""

        if index_path and os.path.isfile(faiss_file) and os.path.isfile(metadata_file):
            persisted_attempted = True
            logger.info(
                "Persisted index detected at %s — attempting load", index_path
            )
            try:
                from retrieval.index_loader import load_persisted_index

                vector_index = load_persisted_index(
                    index_dir=index_path,
                    manifest_path=_manifest_path,
                    encoder_dimensions=encoder.get_sentence_embedding_dimension(),
                )
                index_source = "persisted"
                logger.info(
                    "Loaded persisted index: %d vectors, %d dimensions",
                    vector_index.index.ntotal,
                    vector_index.dimensions,
                )
            except Exception as exc:
                logger.warning(
                    "Persisted index load failed (%s); falling back to .npy-built index",
                    exc,
                )

        # --- Fallback: build from .npy embeddings ---
        if vector_index is None:
            if persisted_attempted:
                logger.info("Falling back to .npy-built index")
            else:
                logger.info(
                    "No persisted index at %s — building from .npy embeddings", index_path
                )

            # Validate encoder dimension against embeddings before building.
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

            index_source = "npy-built"

        # --- Post-construction validation ---
        if len(df) != vector_index.row_ids.shape[0]:
            raise SearchStartupError("Embedding row-count mismatch with location data")

        # --- BM25 sparse index loading ---
        if hybrid_search_enabled is None:
            from config import HYBRID_SEARCH_ENABLED as _cfg_hybrid

            hybrid_search_enabled = _cfg_hybrid
        if bm25_index_path is None:
            from config import BM25_INDEX_PATH as _cfg_bm25_path

            bm25_index_path = _cfg_bm25_path
        if rrf_k is None:
            from config import RRF_K as _cfg_rrf_k

            rrf_k = _cfg_rrf_k

        bm25_index = None
        _hybrid_available = False

        if hybrid_search_enabled:
            logger.info(
                "HYBRID_SEARCH_ENABLED=true — attempting BM25 index load from %s",
                bm25_index_path,
            )
            try:
                from retrieval import Bm25LoadError, load_bm25_index

                bm25_index = load_bm25_index(
                    index_dir=bm25_index_path,
                    manifest_path=_manifest_path,
                )
                _hybrid_available = True
                logger.info(
                    "BM25 index loaded: %d documents, k1=%.2f, b=%.2f",
                    bm25_index.doc_count,
                    bm25_index.k1,
                    bm25_index.b,
                )
            except Bm25LoadError as exc:
                raise SearchStartupError(
                    f"Failed to load BM25 index from {bm25_index_path}: {exc}"
                ) from exc
            except Exception as exc:
                raise SearchStartupError(
                    f"Failed to load BM25 index from {bm25_index_path}: {exc}"
                ) from exc
        else:
            logger.info("HYBRID_SEARCH_ENABLED=false — BM25 index not loaded")

        # Log hybrid status for observability.
        logger.info(
            "SearchService hybrid_search_available=%s rrf_k=%d",
            _hybrid_available,
            rrf_k,
        )

        resolved_torch_fallback = (
            allow_torch_fallback
            if allow_torch_fallback is not None
            else ALLOW_TORCH_FULL_SCAN_FALLBACK
        )
        logger.info("SearchService index_source=%s", index_source)
        return cls(
            df=df,
            embeddings=matrix,
            vector_index=vector_index,
            encoder=encoder,
            over_fetch_multiplier=over_fetch_multiplier,
            allow_torch_fallback=resolved_torch_fallback,
            index_source=index_source,
            bm25_index=bm25_index,
            rrf_k=rrf_k,
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
        mode="auto",
    ):
        if limit <= 0:
            return []

        query_vector = self._encode_query(query_text)
        if np.linalg.norm(query_vector) == 0:
            return []

        # Determine effective mode.
        effective_mode = mode
        if mode == "auto":
            effective_mode = "hybrid" if self._bm25_index is not None else "dense"

        import logging

        logger = logging.getLogger(__name__)
        logger.debug(
            "Search mode: %s (requested: %s, bm25_available=%s)",
            effective_mode,
            mode,
            self._bm25_index is not None,
        )

        if effective_mode == "hybrid" and self._bm25_index is not None:
            return self._hybrid_collect(
                query_text,
                query_vector,
                limit,
                location_filter=location_filter,
                price_range=price_range,
                exclude_names=exclude_names,
            )
        else:
            return self._dense_collect(
                query_vector,
                limit,
                location_filter=location_filter,
                price_range=price_range,
                exclude_names=exclude_names,
            )

    def _dense_collect(
        self,
        query_vector,
        limit,
        location_filter=None,
        price_range=None,
        exclude_names=None,
    ):
        """Dense-only retrieval using FAISS index (original behaviour)."""
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

    def _hybrid_collect(
        self,
        query_text,
        query_vector,
        limit,
        location_filter=None,
        price_range=None,
        exclude_names=None,
    ):
        """Hybrid retrieval: BM25 + FAISS fused via RRF, then filtered."""
        exclude_lower = {str(name).lower().strip() for name in (exclude_names or []) if name}
        fetch_k = min(len(self._df), limit * self._over_fetch_multiplier)

        # 1. BM25 lexical search.
        bm25_results = self._bm25_index.search(query_text, top_k=fetch_k)

        # 2. FAISS dense search.
        scores, positions = self._index.index.search(query_vector, fetch_k)
        dense_results = []
        seen_dense = set()
        for position, score in zip(positions[0], scores[0]):
            if position < 0:
                continue
            row_idx = int(self._index.row_ids[position])
            if row_idx in seen_dense:
                continue
            seen_dense.add(row_idx)
            dense_results.append((row_idx, float(score)))

        # 3. RRF fuse.
        fused = _rrf_fuse(bm25_results, dense_results, k=self._rrf_k)

        # 4. Filter and build DTOs.
        results = []
        for doc_idx, rrf_score in fused:
            if len(results) >= limit:
                break
            row = self._df.iloc[doc_idx]
            name = str(row.get("name", ""))
            if name.lower() in exclude_lower:
                continue
            if not _matches_location_filter(row, location_filter):
                continue
            if not _matches_price_range(row, price_range):
                continue
            results.append(create_location_dto(row, rrf_score))

        return results

    def search(self, query_text, limit=10, location_filter=None, price_range=None, mode="auto"):
        if not str(query_text).strip():
            return []
        return self._collect_results(
            query_text,
            limit=limit,
            location_filter=location_filter,
            price_range=price_range,
            mode=mode,
        )

    def find_similar(self, query_text, exclude_names=None, limit=5, mode="auto"):
        return self._collect_results(
            query_text,
            limit=limit,
            exclude_names=exclude_names or [],
            mode=mode,
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
