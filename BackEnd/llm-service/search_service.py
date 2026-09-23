"""FAISS-backed vector search and similar-location retrieval."""

import os

import faiss
import numpy as np

from dto import REQUIRED_DTO_FIELDS, create_location_dto
from loader import StartupLoadError, validate_startup_data
from venue_corpus.document import compose_document_text

ALLOW_TORCH_FULL_SCAN_FALLBACK = os.getenv(
    "ALLOW_TORCH_FULL_SCAN_FALLBACK", ""
).lower() in {"1", "true", "yes"}

_PRICE_FILTERS = {
    "budget": {"very cheap", "cheap"},
    "mid": {"moderate", "mid"},
    "luxury": {"expensive", "luxury"},
}

_LOCATION_FILTER_GROUPS = {
    "upper east side": {
        "upper east side",
        "lenox hill",
        "yorkville",
        "carnegie hill",
    },
    "ues": {
        "upper east side",
        "lenox hill",
        "yorkville",
        "carnegie hill",
    },
    "upper west side": {
        "upper west side",
        "lincoln square",
        "manhattan valley",
    },
    "uws": {
        "upper west side",
        "lincoln square",
        "manhattan valley",
    },
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


def location_filter_group_terms(location_filter):
    """Return the sub-zone terms covered by *location_filter*.

    Accepts both canonical group keys (``"upper east side"``) and the corpus's
    finer-grained zone names (``"upper east side south"``, ``"lenox hill
    west"``). The latter narrowed retrieval once Jev began choosing from the
    corpus zone list: ``"upper east side south"`` was treated as a literal
    filter and excluded the rest of the Upper East Side (Lenox Hill, Yorkville,
    Carnegie Hill). Matching a canonical group by substring restores the
    intended broad-area semantics.
    """
    if not location_filter or not str(location_filter).strip():
        return set()
    normalized = str(location_filter).lower().strip()
    terms = set(_LOCATION_FILTER_GROUPS.get(normalized, set()))
    for key, group in _LOCATION_FILTER_GROUPS.items():
        if key in normalized:
            terms |= group
    return terms


def canonical_area_labels(zone):
    """Map a corpus micro-zone to its canonical broad-area label(s).

    ``"lenox hill west"`` -> ``["Upper East Side"]``. The reranker needs this
    because the corpus stores ``Lenox Hill West`` while users ask for the
    ``Upper East Side``; without it the cross-encoder treats the venue as
    out-of-area and down-ranks it regardless of cuisine (e.g. Maya/Tacombi for
    "mexican restaurant upper east side").
    """
    zone_lower = str(zone or "").lower()
    labels: list[str] = []
    for key, terms in _LOCATION_FILTER_GROUPS.items():
        if key in {"ues", "uws"}:
            continue
        if any(term in zone_lower for term in terms):
            labels.append(key.title())
    return labels


def compose_rerank_text(row):
    """Document text for re-ranking, with canonical area labels appended.

    The precomputed embeddings/BM25 index keep the raw zone wording; only the
    on-the-fly re-ranking text is enriched, so no re-index is needed.
    """
    text = compose_document_text(row)
    getter = row.get if hasattr(row, "get") else lambda k, d="": row[k] if k in row else d
    labels = canonical_area_labels(getter("zone", ""))
    if labels:
        text = f"{text}\nArea: {', '.join(labels)}"
    return text


def _matches_location_filter(row, location_filter):
    if not location_filter:
        return True
    zone = str(row.get("zone", ""))
    normalized_zone = zone.lower()
    normalized_filter = str(location_filter).lower().strip()
    if normalized_filter in normalized_zone:
        return True
    grouped_terms = location_filter_group_terms(normalized_filter)
    return any(term in normalized_zone for term in grouped_terms)


def _matches_price_range(row, price_range):
    if not price_range:
        return True
    allowed = _PRICE_FILTERS.get(str(price_range).lower())
    if allowed is None:
        return False
    price = str(row.get("price", "")).lower()
    # Check if any allowed price keyword is a substring of the venue's price field.
    # e.g. allowed={'cheap','very cheap'}, price='price level cheap' → 'cheap' in 'price level cheap' → True
    return any(p in price for p in allowed)


def _normalize_query_vector(vector):
    query = np.asarray(vector, dtype="float32").reshape(1, -1)
    norm = np.linalg.norm(query)
    if norm == 0:
        return query
    return query / norm


def _normalize_scores(results):
    """Min-max normalize similarity scores in a list of (doc_idx, score) tuples.

    Maps scores to [0, 1] range.  Returns unchanged if all scores are identical
    or there's only one result.
    """
    if len(results) <= 1:
        return [(idx, 1.0) for idx, _ in results]

    scores = [s for _, s in results]
    mn = min(scores)
    mx = max(scores)
    if mx == mn:
        return [(idx, 1.0) for idx, _ in results]

    return [(idx, (s - mn) / (mx - mn)) for idx, s in results]


def _rrf_fuse(bm25_results, dense_results, k=60):
    """Fuse BM25 and dense rankings via Score-Weighted Reciprocal Rank Fusion.

    SW-RRF_score(d) = Σ_{r in rankers} score_r(d) / (k + rank_r(d))

    Unlike standard RRF (which discards scores), this weights each ranker's
    contribution by the normalized score, giving more influence to rankers
    that are more confident about a document's relevance.

    Ranks start at 1 (not 0). Documents appearing in only one ranker
    get contribution only from that ranker.

    Args:
        bm25_results: [(doc_idx, normalized_bm25_score), ...] sorted desc.
        dense_results: [(doc_idx, normalized_dense_score), ...] sorted desc.
        k: RRF constant (default 60).

    Returns:
        [(doc_idx, sw_rrf_score), ...] sorted by SW-RRF score descending.
    """
    sw_rrf_scores: dict[int, float] = {}

    for rank, (doc_idx, score) in enumerate(bm25_results, start=1):
        sw_rrf_scores[doc_idx] = sw_rrf_scores.get(doc_idx, 0.0) + score / (k + rank)

    for rank, (doc_idx, score) in enumerate(dense_results, start=1):
        sw_rrf_scores[doc_idx] = sw_rrf_scores.get(doc_idx, 0.0) + score / (k + rank)

    merged = sorted(sw_rrf_scores.items(), key=lambda item: item[1], reverse=True)
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
        cross_encoder=None,
        cross_encoder_overfetch=3,
        jev_rerank=False,
        jev_rerank_overfetch=5,
        jev_rerank_max_candidates=50,
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
        self._cross_encoder = cross_encoder
        self._cross_encoder_overfetch = max(1, int(cross_encoder_overfetch))
        self._jev_rerank = bool(jev_rerank)
        self._jev_rerank_overfetch = max(1, int(jev_rerank_overfetch))
        self._jev_rerank_max = max(1, int(jev_rerank_max_candidates))

    def _overfetch(self):
        """Candidate over-fetch count for the active re-ranking strategy."""
        if self._jev_rerank:
            return self._jev_rerank_overfetch
        if self._cross_encoder is not None:
            return self._cross_encoder_overfetch
        return self._over_fetch_multiplier

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
        cross_encoder_enabled=None,
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
                logger.warning(
                    "BM25 index load failed from %s (%s); falling back to dense-only",
                    bm25_index_path,
                    exc,
                )
            except Exception as exc:
                logger.warning(
                    "BM25 index load failed from %s (%s); falling back to dense-only",
                    bm25_index_path,
                    exc,
                )
        else:
            logger.info("HYBRID_SEARCH_ENABLED=false — BM25 index not loaded")

        # Log hybrid status for observability.
        logger.info(
            "SearchService hybrid_search_available=%s rrf_k=%d",
            _hybrid_available,
            rrf_k,
        )

        # --- Cross-encoder loading ---
        if cross_encoder_enabled is None:
            from config import CROSS_ENCODER_ENABLED as _cfg_ce_enabled

            cross_encoder_enabled = _cfg_ce_enabled

        from config import (
            CROSS_ENCODER_MODEL_NAME as _cfg_ce_model,
            CROSS_ENCODER_OVERFETCH_MULTIPLIER as _cfg_ce_overfetch,
        )

        _cross_encoder = None
        _ce_overfetch = _cfg_ce_overfetch

        if cross_encoder_enabled:
            logger.info(
                "CROSS_ENCODER_ENABLED=true — attempting cross-encoder load: %s",
                _cfg_ce_model,
            )
            try:
                from sentence_transformers import CrossEncoder

                _cross_encoder = CrossEncoder(_cfg_ce_model)
                logger.info(
                    "Cross-encoder loaded: model=%s device=%s",
                    _cfg_ce_model,
                    getattr(_cross_encoder, "_target_device", "cpu"),
                )
            except Exception as exc:
                logger.warning(
                    "Cross-encoder load failed from %s (%s); continuing without re-ranking",
                    _cfg_ce_model,
                    exc,
                )
                _cross_encoder = None
        else:
            logger.info("CROSS_ENCODER_ENABLED=false — cross-encoder not loaded")

        resolved_torch_fallback = (
            allow_torch_fallback
            if allow_torch_fallback is not None
            else ALLOW_TORCH_FULL_SCAN_FALLBACK
        )

        from config import (
            JEV_RERANK_ENABLED as _cfg_jev_rerank,
            JEV_RERANK_MAX_CANDIDATES as _cfg_jev_rerank_max,
            JEV_RERANK_OVERFETCH_MULTIPLIER as _cfg_jev_rerank_overfetch,
        )
        if _cfg_jev_rerank:
            logger.info(
                "JEV_RERANK_ENABLED=true — Jev re-ranking active "
                "(overfetch=%d, max=%d)",
                _cfg_jev_rerank_overfetch,
                _cfg_jev_rerank_max,
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
            cross_encoder=_cross_encoder,
            cross_encoder_overfetch=_ce_overfetch,
            jev_rerank=_cfg_jev_rerank,
            jev_rerank_overfetch=_cfg_jev_rerank_overfetch,
            jev_rerank_max_candidates=_cfg_jev_rerank_max,
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
                query_text,
                query_vector,
                limit,
                location_filter=location_filter,
                price_range=price_range,
                exclude_names=exclude_names,
            )

    def _dense_collect(
        self,
        query_text,
        query_vector,
        limit,
        location_filter=None,
        price_range=None,
        exclude_names=None,
    ):
        """Dense-only retrieval using FAISS index (original behaviour)."""
        exclude_lower = {str(name).lower().strip() for name in (exclude_names or []) if name}

        # Candidate pool size depends on the active re-ranking strategy.
        overfetch = self._overfetch()
        batch = min(
            len(self._df),
            max(limit * overfetch, limit + len(exclude_lower)),
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

            if not candidates:
                if batch >= len(self._df):
                    break
                batch = min(len(self._df), batch * 2)
                continue

            # Filter BEFORE re-ranking so the cross-encoder only scores
            # candidates that can actually be returned. The old order re-ranked
            # the global top-K then filtered most of it away, so a few surviving
            # in-zone venues filled the result set before deeper in-zone matches
            # were ever scored.
            eligible = []
            for row_idx, score in candidates:
                row = self._df.iloc[row_idx]
                if str(row.get("name", "")).lower() in exclude_lower:
                    continue
                if not _matches_location_filter(row, location_filter):
                    continue
                if not _matches_price_range(row, price_range):
                    continue
                eligible.append((row_idx, score))

            eligible = self._re_rank(query_text=query_text, candidates=eligible)

            # Stable tie-breaking uses the (now possibly cross-encoder) score.
            eligible.sort(key=lambda item: (-item[1], item[0]))

            for row_idx, score in eligible:
                if len(results) >= limit:
                    break
                results.append(create_location_dto(self._df.iloc[row_idx], score))

            # Search deeper while the filters still haven't produced `limit`.
            if len(results) < limit:
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
        """Hybrid retrieval: BM25 + FAISS fused via SW-RRF, filtered, then ranked.

        Candidates are filtered *before* re-ranking, and the fetch window grows
        until enough in-filter candidates exist. That avoids the previous failure
        mode where a small global top-K was re-ranked, the location filter
        dropped most of it, and a few surviving in-zone venues filled the result
        set before deeper matches (e.g. Maya/Tacombi for a UES Mexican query)
        were ever scored. Both fusion passes normalize each ranker's scores, so
        BM25's raw scale can no longer dominate the expanded pass.
        """
        exclude_lower = {str(name).lower().strip() for name in (exclude_names or []) if name}

        # Candidate pool size depends on the active re-ranking strategy.
        overfetch = self._overfetch()
        fetch_k = min(len(self._df), max(limit * overfetch, limit))

        eligible: list[tuple[int, float]] = []
        while True:
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

            # 3. Normalize each ranker before SW-RRF fusion.
            fused = _rrf_fuse(
                _normalize_scores(bm25_results),
                _normalize_scores(dense_results),
                k=self._rrf_k,
            )

            # 4. Apply location / price / exclude filters before re-ranking.
            eligible = []
            for doc_idx, score in fused:
                row = self._df.iloc[doc_idx]
                if str(row.get("name", "")).lower() in exclude_lower:
                    continue
                if not _matches_location_filter(row, location_filter):
                    continue
                if not _matches_price_range(row, price_range):
                    continue
                eligible.append((doc_idx, score))

            if len(eligible) >= limit or fetch_k >= len(self._df):
                break
            fetch_k = min(len(self._df), fetch_k * 2)

        # 5. Re-rank the eligible candidates and build DTOs.
        ranked = self._re_rank(query_text, eligible)
        return [
            create_location_dto(self._df.iloc[row_idx], score)
            for row_idx, score in ranked[:limit]
        ]

    def _jev_re_rank(self, query_text, candidates):
        """Re-rank candidates with Jev's calibrated relevance scores.

        Returns a re-ordered ``[(row_idx, score), ...]`` list, or ``None``
        when Jev re-ranking is disabled/unavailable so the caller can fall
        through to the cross-encoder.
        """
        if not self._jev_rerank or not candidates:
            return None

        try:
            from jev_service import rerank
        except Exception:
            return None

        head = candidates[: self._jev_rerank_max]
        tail = list(candidates[self._jev_rerank_max:])  # already ordered upstream
        try:
            docs = [compose_rerank_text(self._df.iloc[row_idx]) for row_idx, _ in head]
            scores = rerank(query_text, docs, enabled=True)
        except Exception as exc:
            logging.getLogger(__name__).warning("Jev re-rank failed: %s", exc)
            return None
        if scores is None:
            return None

        ranked = [
            (head[i][0], float(scores[i])) for i in range(len(head))
        ]
        ranked.sort(key=lambda item: item[1], reverse=True)
        ranked.extend(tail)
        return ranked

    def _re_rank(self, query_text, candidates):
        """Re-rank candidate documents.

        Jev calibrated relevance is preferred when enabled; otherwise the
        cross-encoder is used; otherwise the upstream order is preserved.
        """
        import logging
        import time

        logger = logging.getLogger(__name__)

        if not candidates:
            return candidates

        jev_ranked = self._jev_re_rank(query_text, candidates)
        if jev_ranked is not None:
            return jev_ranked

        if self._cross_encoder is None:
            return candidates

        t0 = time.perf_counter()

        pairs = []
        for row_idx, _score in candidates:
            row = self._df.iloc[row_idx]
            doc_text = compose_rerank_text(row)
            pairs.append((query_text, doc_text))

        ce_scores = self._cross_encoder.predict(pairs)
        ranked = [
            (candidates[i][0], float(ce_scores[i]))
            for i in range(len(candidates))
        ]
        ranked.sort(key=lambda item: item[1], reverse=True)

        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.debug(
            "Cross-encoder re-ranked %d candidates in %.1f ms",
            len(candidates),
            elapsed_ms,
        )

        return ranked

    def search(self, query_text, limit=10, location_filter=None, price_range=None, mode="auto"):
        if not str(query_text).strip():
            return []

        # When both location AND price filters are active, FAISS top-K often
        # misses matching venues (they rank lower corpus-wide).  Fall back to
        # a full cosine scan with inline filtering — at 2,262 venues this is
        # ~10ms and guarantees filter-aware ranking.
        if location_filter is not None and price_range is not None:
            query_vector = self._encode_query(query_text).reshape(-1)
            import numpy as np
            scores = _cosine_scores(query_vector, self._embeddings)
            ranked = []
            for row_idx, score in enumerate(scores):
                row = self._df.iloc[row_idx]
                if not _matches_location_filter(row, location_filter):
                    continue
                if not _matches_price_range(row, price_range):
                    continue
                ranked.append((row_idx, float(score)))
            ranked.sort(key=lambda item: item[1], reverse=True)
            return [create_location_dto(self._df.iloc[row_idx], score)
                    for row_idx, score in ranked[:limit]]

        return self._collect_results(
            query_text,
            limit=limit,
            location_filter=location_filter,
            price_range=price_range,
            mode=mode,
        )

    def search_with_metadata(self, query_text, limit=10, location_filter=None, price_range=None, mode="auto"):
        """Return SearchExecutionResult with effective mode and degradation facts."""
        # Import here to avoid circular dependency at module load
        from observability import SearchExecutionResult

        if not str(query_text).strip():
            return SearchExecutionResult([], effective_mode="dense", degradation=None)

        # Determine effective mode before execution
        effective_mode = mode
        degradation = None
        if mode == "auto":
            effective_mode = "hybrid" if self._bm25_index is not None else "dense"
            if self._bm25_index is None:
                degradation = "dense_only_fallback"
        elif mode == "hybrid" and self._bm25_index is None:
            effective_mode = "dense"
            degradation = "dense_only_fallback"

        results = self._collect_results(
            query_text,
            limit=limit,
            location_filter=location_filter,
            price_range=price_range,
            mode=mode,
        )

        return SearchExecutionResult(
            results=results,
            effective_mode=effective_mode,
            degradation=degradation,
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
