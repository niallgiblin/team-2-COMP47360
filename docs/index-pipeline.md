# Index Build Pipeline

Operator runbook for rebuilding the FAISS index from the versioned venue corpus.

## Overview

`scripts/build_index.py` reads the versioned corpus (`corpus/v1/venues.csv`), composes document text per venue via `compose_document_text`, encodes all documents with the sentence-transformer model, builds a FAISS IndexFlatIP over L2-normalized vectors, and writes the index + build metadata to `corpus/v1/index/`.

This replaces the previous startup-only FAISS construction workflow. The
pipeline writes a persisted FAISS index and optional BM25 index. It does not
rewrite `data/location_embeddings.npy`.

Generated index files are not committed to Git. Runtime prefers a valid
persisted index and falls back to building FAISS in memory from the committed
embedding matrix when the persisted index is absent or invalid.

## Quick Start

```bash
cd BackEnd/llm-service

# Build index from corpus/v1/venues.csv
python3 scripts/build_index.py

# Overwrite existing index without confirmation
python3 scripts/build_index.py --force

# Build from a different corpus version
python3 scripts/build_index.py --corpus-version v2

# Build dense and BM25 artifacts together
python3 scripts/build_index.py --force --with-bm25
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_PATH` | `models/sentence-transformers` | Path to sentence-transformer model directory |
| `CORPUS_VERSION` | `v1` | Corpus version directory under `corpus/` |

**Note:** The checked-in `docker-compose.yml` overrides `MODEL_PATH` to `/app/models/mpnet-base-v2` (the deployed 768-dim MPNet model). When running the index builder inside Docker Compose, the generated metadata will reference the mpnet-base-v2 path rather than the `sentence-transformers` code default.

The script reads `venues.csv` and `manifest.json` from `corpus/{CORPUS_VERSION}/`. Outputs go to `corpus/{CORPUS_VERSION}/index/`.

## Docker

When running inside Docker, mount the corpus and scripts volumes:

```bash
docker compose run --rm \
  -v "$(pwd)/BackEnd/llm-service/scripts:/app/scripts:ro" \
  -v "$(pwd)/BackEnd/llm-service/venue_corpus:/app/venue_corpus:ro" \
  -v "$(pwd)/BackEnd/llm-service/corpus:/app/corpus" \
  llm-service \
  python3 /app/scripts/build_index.py --force
```

## Output Artifacts

| File | Description |
|------|-------------|
| `corpus/vN/index/faiss.index` | Serialized FAISS IndexFlatIP (not committed) |
| `corpus/vN/index/metadata.json` | Build metadata: model ID, dimensions, corpus checksum, timestamp |

### metadata.json Schema

```json
{
  "build_timestamp": "2026-05-29T15:30:00Z",
  "corpus_checksum": "9ad28a62...",
  "row_count": 2262,
  "embedding_model_id": "/app/models/sentence-transformers",
  "dimensions": 768,
  "index_type": "faiss.IndexFlatIP",
  "normalization": "L2",
  "similarity": "cosine (via inner product)"
}
```

## Error Handling

The pipeline exits non-zero with actionable messages on:

| Condition | Exit Code | Message |
|-----------|-----------|---------|
| Missing corpus CSV or manifest | 1 | `Corpus CSV not found: …` / `Corpus manifest not found: …` |
| Manifest checksum mismatch | 1 | `Corpus checksum mismatch!` with expected vs actual |
| Model `config.json` not found | 1 | `Model config.json not found at …` |
| Dimension mismatch (encoder vs expected) | 1 | `Dimension mismatch: encoder … vs corpus …` |
| FAISS index build failure | 1 | `FAISS index build failed: …` |
| Write failure (disk full, permissions) | 1 | `Failed to write FAISS index: …` |
| Existing index without `--force` | 1 | `Index already exists at … Use --force to overwrite.` |

**Atomic writes:** The index is written to a temp file and atomically renamed — a failed build will not corrupt an existing good index.

## Verification

Verify index artifacts with:

```bash
# Check index file exists and is non-empty
test -s corpus/v1/index/faiss.index && echo "OK"

# Verify metadata is valid JSON with required fields
python3 -c "
import json
m = json.load(open('corpus/v1/index/metadata.json'))
assert m['row_count'] == 2262
assert m['dimensions'] == 768
assert m['index_type'] == 'faiss.IndexFlatIP'
print('Metadata valid')
"

# Verify checksums via the standard artifact script (from repository root)
cd ../../
bash scripts/verify-artifacts.sh
```

## Relationship to Runtime

Persisted index loading is already integrated. At startup,
`app.py`/`search_service.py` validates `faiss.index` and `metadata.json`
against the corpus and expected shape. A valid persisted index is loaded
directly. Otherwise the service normalizes `location_embeddings.npy` and
builds `IndexFlatIP` in memory.

With hybrid retrieval enabled, the service also loads the BM25 artifact from
`corpus/vN/index/bm25/`. Missing or unusable optional artifacts degrade to the
available retrieval mode rather than changing the canonical corpus.

## Version Bump Checklist

When the corpus changes materially:

1. Create `corpus/v2/` with updated `venues.csv`
2. Generate new `manifest.json` (use `build_manifest_from_csv` from `venue_corpus/manifest.py`)
3. Write `SCHEMA.md` for the new version
4. Update `CORPUS_VERSION=v2` in `docker-compose.yml`
5. Sync `BackEnd/src/main/resources/data/locations.csv` (same commit)
6. Rebuild index: `python3 scripts/build_index.py --corpus-version v2 --force`
7. Run `scripts/verify-artifacts.sh` to confirm all checksums
