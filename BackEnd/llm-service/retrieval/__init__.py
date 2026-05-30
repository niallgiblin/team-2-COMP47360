"""Unified retrieval package (FAISS dense + BM25 sparse).

Exports load_persisted_index for loading persisted FAISS indexes and
load_bm25_index for loading persisted BM25 indexes, both built by
scripts/build_index.py.  Also exports the corresponding exception types
for controlled startup failure handling.
"""

from retrieval.bm25_loader import Bm25LoadError, load_bm25_index
from retrieval.index_loader import IndexLoadError, load_persisted_index

__all__ = [
    "Bm25LoadError",
    "IndexLoadError",
    "load_bm25_index",
    "load_persisted_index",
]
