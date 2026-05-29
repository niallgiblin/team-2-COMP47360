"""Unified FAISS-backed retrieval package.

Exports load_persisted_index for loading persisted FAISS indexes built by
scripts/build_index.py, and the IndexLoadError exception for controlled
startup failure handling.
"""

from retrieval.index_loader import IndexLoadError, load_persisted_index

__all__ = ["IndexLoadError", "load_persisted_index"]
