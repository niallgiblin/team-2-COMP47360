#!/usr/bin/env python3
"""Build a persisted FAISS index from the versioned venue corpus.

Reads corpus/v1/venues.csv, composes document text per venue, encodes via the
sentence-transformer model, builds a FAISS IndexFlatIP over normalized vectors,
and writes the index + build metadata to corpus/v1/index/.

Usage:
    cd BackEnd/llm-service
    python3 scripts/build_index.py [--corpus-version v1] [--force]

Environment:
    MODEL_PATH     — path to sentence-transformers model (default: models/sentence-transformers)
    CORPUS_VERSION — corpus version directory under corpus/ (default: v1)
"""

import argparse
import json
import logging
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import faiss
import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("build_index")

# Ensure the llm-service directory is on the import path for venue_corpus.
_SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_SERVICE_DIR))

from venue_corpus.document import compose_document_text  # noqa: E402
from venue_corpus.manifest import load_manifest, sha256_file  # noqa: E402
from venue_corpus.validate import resolve_corpus_root  # noqa: E402


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Build FAISS index from versioned venue corpus"
    )
    parser.add_argument(
        "--corpus-version",
        default=os.getenv("CORPUS_VERSION", "v1"),
        help="Corpus version directory under corpus/ (default: v1 or $CORPUS_VERSION)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing index without confirmation",
    )
    return parser.parse_args(argv)


def load_model(model_path):
    """Load the sentence-transformer model."""
    from sentence_transformers import SentenceTransformer

    config_file = Path(model_path) / "config.json"
    if not config_file.is_file():
        raise FileNotFoundError(f"Model config.json not found at {config_file}")

    logger.info("Loading sentence-transformer model from %s", model_path)
    model = SentenceTransformer(str(model_path), device="cpu")
    logger.info("Model loaded successfully")
    return model


def encode_corpus(model, df):
    """Encode all venue documents and return normalized float32 matrix."""
    texts = []
    for _, row in df.iterrows():
        text = compose_document_text(row)
        if not text:
            logger.warning(
                "Empty document text for venue id=%s; using placeholder",
                row.get("id", "?"),
            )
            text = f"Name: {row.get('name', 'Unknown')}"
        texts.append(text)

    logger.info("Encoding %d venue documents...", len(texts))
    embeddings = model.encode(
        texts,
        convert_to_numpy=True,
        show_progress_bar=True,
        batch_size=32,
    )
    matrix = np.asarray(embeddings, dtype="float32")

    # Normalize for cosine similarity via inner product (matching search_service.py).
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    normalized = matrix / norms

    logger.info("Encoded %d documents → shape %s", len(texts), normalized.shape)
    return normalized


def build_faiss_index(normalized_vectors):
    """Build a FAISS IndexFlatIP from normalized vectors."""
    dimensions = normalized_vectors.shape[1]
    index = faiss.IndexFlatIP(dimensions)
    index.add(normalized_vectors)
    logger.info("Built FAISS IndexFlatIP with %d vectors of %d dimensions", index.ntotal, dimensions)
    return index


def write_metadata(metadata_path, model_path_obj, corpus_checksum, row_count, dimensions):
    """Write build metadata JSON."""
    # Try to determine the model ID from sentence-transformers config.
    model_id = _read_model_id(model_path_obj)

    metadata = {
        "build_timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "corpus_checksum": corpus_checksum,
        "row_count": row_count,
        "embedding_model_id": model_id,
        "dimensions": dimensions,
        "index_type": "faiss.IndexFlatIP",
        "normalization": "L2",
        "similarity": "cosine (via inner product)",
    }
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)
        fh.write("\n")
    logger.info("Wrote build metadata to %s", metadata_path)


def _read_model_id(model_path_obj):
    """Extract a human-readable model identifier from config."""
    config_path = model_path_obj / "config_sentence_transformers.json"
    if config_path.is_file():
        try:
            with open(config_path, encoding="utf-8") as fh:
                st_config = json.load(fh)
            version_info = st_config.get("__version__", {})
            name = version_info.get("sentence_transformers", "")
            if name:
                return f"sentence-transformers/{name}"
        except (OSError, json.JSONDecodeError):
            pass

    # Fallback: try the model card / README name.
    readme = model_path_obj / "README.md"
    if readme.is_file():
        try:
            text = readme.read_text(encoding="utf-8")
            for line in text.splitlines():
                if line.startswith("library_name:"):
                    return line.split(":", 1)[1].strip()
        except OSError:
            pass

    return str(model_path_obj.resolve())


def run(args):
    service_dir = _SERVICE_DIR
    corpus_root = resolve_corpus_root(service_dir, args.corpus_version)

    # Validate corpus exists.
    csv_path = corpus_root / "venues.csv"
    manifest_path = corpus_root / "manifest.json"
    if not csv_path.is_file():
        logger.error("Corpus CSV not found: %s", csv_path)
        return 1
    if not manifest_path.is_file():
        logger.error("Corpus manifest not found: %s", manifest_path)
        return 1

    index_dir = corpus_root / "index"
    index_path = index_dir / "faiss.index"
    metadata_path = index_dir / "metadata.json"

    # Check for existing index.
    if index_path.exists() and not args.force:
        logger.error(
            "Index already exists at %s. Use --force to overwrite.", index_path
        )
        return 1

    index_dir.mkdir(parents=True, exist_ok=True)

    # Load manifest and verify checksum.
    try:
        manifest = load_manifest(manifest_path)
    except (OSError, ValueError) as exc:
        logger.error("Failed to load manifest: %s", exc)
        return 1

    corpus_checksum = manifest.get("venues_csv", {}).get("sha256")
    if not corpus_checksum:
        logger.error("Manifest missing venues_csv.sha256")
        return 1

    actual_checksum = sha256_file(csv_path)
    if actual_checksum != corpus_checksum:
        logger.error(
            "Corpus checksum mismatch!\n  Manifest: %s\n  Actual:   %s",
            corpus_checksum,
            actual_checksum,
        )
        return 1

    logger.info("Corpus checksum verified: %s", corpus_checksum[:16])

    # Load model.
    model_path = os.getenv("MODEL_PATH", str(service_dir / "models" / "sentence-transformers"))
    try:
        model = load_model(model_path)
    except Exception as exc:
        logger.error("Failed to load model: %s", exc)
        return 1

    # Load corpus and encode.
    try:
        df = pd.read_csv(csv_path)
    except OSError as exc:
        logger.error("Failed to read corpus CSV: %s", exc)
        return 1

    logger.info("Loaded corpus: %d rows, %d columns", len(df), len(df.columns))

    try:
        normalized = encode_corpus(model, df)
    except Exception as exc:
        logger.error("Encoding failed: %s", exc)
        return 1

    dimensions = normalized.shape[1]

    # Verify encoder dimension against expected.
    probe = np.asarray(
        model.encode("dimension probe", convert_to_numpy=True),
        dtype="float32",
    ).reshape(-1)
    if probe.shape[0] != dimensions:
        logger.error(
            "Dimension mismatch: encoder output %d vs corpus dimensions %d",
            probe.shape[0],
            dimensions,
        )
        return 1

    # Build FAISS index.
    try:
        index = build_faiss_index(normalized)
    except Exception as exc:
        logger.error("FAISS index build failed: %s", exc)
        return 1

    # Write index atomically.
    try:
        fd, tmp_path = tempfile.mkstemp(dir=str(index_dir), prefix=".faiss-tmp-")
        os.close(fd)
        faiss.write_index(index, tmp_path)
        os.replace(tmp_path, str(index_path))
        logger.info("Wrote FAISS index to %s (%d vectors)", index_path, index.ntotal)
    except Exception as exc:
        logger.error("Failed to write FAISS index: %s", exc)
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return 1

    # Write metadata.
    try:
        write_metadata(
            metadata_path,
            Path(model_path),
            corpus_checksum,
            len(df),
            dimensions,
        )
    except Exception as exc:
        logger.error("Failed to write metadata: %s", exc)
        return 1

    logger.info("Index build complete. Index: %s, Metadata: %s", index_path, metadata_path)
    return 0


if __name__ == "__main__":
    sys.exit(run(parse_args()))
