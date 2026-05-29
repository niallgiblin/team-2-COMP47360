"""Tests for retrieval/index_loader.py — persisted FAISS index loading."""

import json
import os
import tempfile
from pathlib import Path

import faiss
import numpy as np
import pytest

from retrieval.index_loader import IndexLoadError, load_persisted_index
from search_service import VectorIndex


def _build_fixture_index(index_dir: Path, n_vectors=10, dimensions=384, checksum="abc123", index_type="faiss.IndexFlatIP"):
    """Build a minimal valid FAISS index + metadata pair in index_dir."""
    index_dir.mkdir(parents=True, exist_ok=True)

    # Build a real FAISS index.
    vectors = np.random.RandomState(42).randn(n_vectors, dimensions).astype("float32")
    index = faiss.IndexFlatIP(dimensions)
    index.add(vectors)
    faiss.write_index(index, str(index_dir / "faiss.index"))

    # Write metadata.
    metadata = {
        "build_timestamp": "2025-01-15T10:00:00Z",
        "corpus_checksum": checksum,
        "row_count": n_vectors,
        "embedding_model_id": "sentence-transformers/test-model",
        "dimensions": dimensions,
        "index_type": index_type,
        "normalization": "L2",
        "similarity": "cosine (via inner product)",
    }
    with open(index_dir / "metadata.json", "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)
        fh.write("\n")

    return vectors


def _build_fixture_manifest(manifest_path: Path, checksum="abc123"):
    """Build a minimal valid manifest.json."""
    manifest = {
        "corpus_version": "v1",
        "schema_version": "1.0.0",
        "created_at": "2025-01-15T10:00:00Z",
        "venues_csv": {
            "path": "venues.csv",
            "sha256": checksum,
            "row_count": 10,
            "columns": ["id", "name", "description"],
        },
        "document_model": {
            "format": "labeled_lines",
            "one_document_per_venue": True,
            "embed_fields": ["name", "description"],
            "metadata_fields": ["id"],
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")


class TestLoadPersistedIndex:
    """Happy-path and validation tests for load_persisted_index()."""

    def test_loads_valid_index(self):
        """load_persisted_index returns a VectorIndex for valid inputs."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=10, dimensions=384)

            result = load_persisted_index(index_dir, manifest_path=None, encoder_dimensions=None)

            assert isinstance(result, VectorIndex)
            assert result.index.ntotal == 10
            assert result.dimensions == 384
            assert len(result.row_ids) == 10
            assert result.row_ids.dtype == np.int64
            # Positional mapping: row_ids should be 0..9
            np.testing.assert_array_equal(result.row_ids, np.arange(10, dtype="int64"))

    def test_loads_index_and_searches(self):
        """Loaded index can perform FAISS search correctly."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            vectors = _build_fixture_index(index_dir, n_vectors=3, dimensions=4)

            result = load_persisted_index(index_dir)

            # Search for the first vector — it should get itself as top match.
            query = vectors[0:1].copy()
            faiss.normalize_L2(query)
            scores, positions = result.index.search(query, 3)

            assert positions[0][0] == 0  # self-match
            assert scores[0][0] > 0.99

    def test_validates_dimensions(self):
        """Validates dimensions against encoder_dimensions when provided."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=5, dimensions=384)

            # Matching dimensions — no error.
            load_persisted_index(index_dir, encoder_dimensions=384)

            # Mismatched dimensions — should raise.
            with pytest.raises(IndexLoadError, match="Dimension mismatch"):
                load_persisted_index(index_dir, encoder_dimensions=768)

    def test_validates_checksum_against_manifest(self):
        """Validates corpus_checksum against manifest when manifest_path provided."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            manifest_path = Path(tmp) / "manifest.json"

            _build_fixture_index(index_dir, n_vectors=3, dimensions=4, checksum="match123")
            _build_fixture_manifest(manifest_path, checksum="match123")

            # Matching checksums — no error.
            load_persisted_index(index_dir, manifest_path=manifest_path)

            # Mismatched checksums — should raise.
            _build_fixture_index(index_dir, n_vectors=3, dimensions=4, checksum="different456")
            with pytest.raises(IndexLoadError, match="checksum mismatch"):
                load_persisted_index(index_dir, manifest_path=manifest_path)

    def test_rejects_invalid_index_type(self):
        """Rejects indexes with unsupported index_type."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=3, dimensions=4, index_type="faiss.IndexFlatL2")

            with pytest.raises(IndexLoadError, match="Unsupported index_type"):
                load_persisted_index(index_dir)

    def test_rejects_corrupt_faiss_file(self):
        """Raises IndexLoadError for a non-FAISS binary at faiss.index."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            index_dir.mkdir(parents=True, exist_ok=True)

            # Write garbage instead of a FAISS index.
            (index_dir / "faiss.index").write_text("not a faiss index")

            # Write valid metadata.
            metadata = {
                "build_timestamp": "2025-01-15T10:00:00Z",
                "corpus_checksum": "abc",
                "row_count": 3,
                "embedding_model_id": "test",
                "dimensions": 4,
                "index_type": "faiss.IndexFlatIP",
                "normalization": "L2",
                "similarity": "cosine",
            }
            with open(index_dir / "metadata.json", "w", encoding="utf-8") as fh:
                json.dump(metadata, fh)

            with pytest.raises(IndexLoadError, match="Failed to read FAISS index"):
                load_persisted_index(index_dir)

    def test_validates_row_count_matches_index(self):
        """Raises when metadata row_count conflicts with actual index.ntotal."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=5, dimensions=4)

            # Overwrite metadata with wrong row_count.
            metadata_path = index_dir / "metadata.json"
            with open(metadata_path, encoding="utf-8") as fh:
                metadata = json.load(fh)
            metadata["row_count"] = 999
            with open(metadata_path, "w", encoding="utf-8") as fh:
                json.dump(metadata, fh)

            with pytest.raises(IndexLoadError, match="does not match"):
                load_persisted_index(index_dir)


    def test_load_empty_index(self):
        """Loads an empty FAISS index (ntotal=0) without error."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=0, dimensions=384)

            result = load_persisted_index(index_dir)

            assert result.index.ntotal == 0
            assert result.dimensions == 384
            assert len(result.row_ids) == 0

    def test_index_load_error_is_exception_subclass(self):
        """IndexLoadError inherits from Exception."""
        assert issubclass(IndexLoadError, Exception)


class TestIndexLoadErrorPaths:
    """Negative tests for error paths."""

    def test_missing_index_directory(self):
        """Raises when index_dir does not exist."""
        with pytest.raises(IndexLoadError, match="Index directory not found"):
            load_persisted_index("/nonexistent/path/12345")

    def test_missing_faiss_index_file(self):
        """Raises when faiss.index is missing."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            index_dir.mkdir(parents=True, exist_ok=True)
            # metadata exists but faiss.index doesn't.
            with open(index_dir / "metadata.json", "w", encoding="utf-8") as fh:
                json.dump({"build_timestamp": "x", "corpus_checksum": "a", "row_count": 1, "dimensions": 4, "index_type": "faiss.IndexFlatIP"}, fh)

            with pytest.raises(IndexLoadError, match="FAISS index file not found"):
                load_persisted_index(index_dir)

    def test_missing_metadata_file(self):
        """Raises when metadata.json is missing."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            index_dir.mkdir(parents=True, exist_ok=True)
            (index_dir / "faiss.index").write_text("")

            with pytest.raises(IndexLoadError, match="Metadata file not found"):
                load_persisted_index(index_dir)

    def test_missing_required_metadata_fields(self):
        """Raises when metadata.json is missing required fields."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=2, dimensions=4)

            # Remove required field.
            metadata_path = index_dir / "metadata.json"
            with open(metadata_path, encoding="utf-8") as fh:
                metadata = json.load(fh)
            del metadata["corpus_checksum"]
            with open(metadata_path, "w", encoding="utf-8") as fh:
                json.dump(metadata, fh)

            with pytest.raises(IndexLoadError, match="missing required fields"):
                load_persisted_index(index_dir)

    def test_invalid_dimensions_in_metadata(self):
        """Raises when dimensions is non-positive."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=2, dimensions=4)

            metadata_path = index_dir / "metadata.json"
            with open(metadata_path, encoding="utf-8") as fh:
                metadata = json.load(fh)
            metadata["dimensions"] = -5
            with open(metadata_path, "w", encoding="utf-8") as fh:
                json.dump(metadata, fh)

            with pytest.raises(IndexLoadError, match="'dimensions' must be a positive integer"):
                load_persisted_index(index_dir)

    def test_empty_build_timestamp(self):
        """Raises when a required string field is empty."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=2, dimensions=4)

            metadata_path = index_dir / "metadata.json"
            with open(metadata_path, encoding="utf-8") as fh:
                metadata = json.load(fh)
            metadata["build_timestamp"] = ""
            with open(metadata_path, "w", encoding="utf-8") as fh:
                json.dump(metadata, fh)

            with pytest.raises(IndexLoadError, match="must not be empty"):
                load_persisted_index(index_dir)

    def test_manifest_missing_checksum(self):
        """Raises when manifest lacks venues_csv.sha256."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            manifest_path = Path(tmp) / "manifest.json"

            _build_fixture_index(index_dir, n_vectors=2, dimensions=4, checksum="abc")
            # Write manifest without sha256.
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            with open(manifest_path, "w", encoding="utf-8") as fh:
                json.dump({"corpus_version": "v1", "schema_version": "1.0.0", "venues_csv": {"path": "x"}, "document_model": {}}, fh)

            with pytest.raises(IndexLoadError, match="missing required keys"):
                load_persisted_index(index_dir, manifest_path=manifest_path)

    def test_dimensions_mismatch_with_actual_index(self):
        """Raises when metadata dimensions conflict with actual index.d."""
        with tempfile.TemporaryDirectory() as tmp:
            index_dir = Path(tmp) / "index"
            _build_fixture_index(index_dir, n_vectors=3, dimensions=4)

            # Overwrite metadata with wrong dimensions.
            metadata_path = index_dir / "metadata.json"
            with open(metadata_path, encoding="utf-8") as fh:
                metadata = json.load(fh)
            # The index has 4 dims but we claim 128 in metadata.
            metadata["dimensions"] = 128
            # Fix row_count to match (3) so we hit the dimension check first.
            with open(metadata_path, "w", encoding="utf-8") as fh:
                json.dump(metadata, fh)

            with pytest.raises(IndexLoadError, match="do not match"):
                load_persisted_index(index_dir)
