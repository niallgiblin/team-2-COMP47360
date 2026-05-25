# Runtime Artifact Policy

This document is the durable artifact policy for Phase 1 and downstream remediation work. It classifies repository artifacts by ownership, delivery mechanism, runtime consumer, and path expectations without changing service behavior.

For the tiered baseline verification matrix and requirement traceability record, see [baseline-verification.md](baseline-verification.md) (created in Phase 1 plan 01-03).

## Policy

Urban Gala uses a **hybrid artifact policy**:

| Category | Delivery | Phase 1 behavior |
|----------|----------|------------------|
| Source-owned metadata and small data | Ordinary Git | Committed in the repository |
| Required local runtime model artifacts | **Git LFS** | Current delivery mechanism for model weights, embedding arrays, and related binaries |
| Generated build outputs and reports | Git ignore / generated-output policy | Documented ownership; not runtime inputs |
| Future release/object storage | Not implemented | Documented migration path only |

**Git LFS** is the current delivery mechanism for required local runtime model artifacts. After clone, run `git lfs install` and `git lfs pull` if large files are missing (see [README.md](README.md)).

**Release/object storage** (GitHub Releases, S3, or similar) is a documented future migration path. Phase 1 does **not** implement automatic downloads, provisioning scripts, or startup fetches from external storage.

Services treat runtime binaries as **trusted artifacts**. Manual SHA-256 verification is available before deployment; startup checksum enforcement is deferred to later phases.

## Runtime Artifact Manifest

Each artifact is classified by type, repository path, runtime consumer, delivery mechanism, and whether a mandatory checksum applies.

### Runtime binaries (checksum required)

Large binary files consumed at runtime. Mandatory SHA-256 checksums are documented in [Runtime Binary Checksums](#runtime-binary-checksums) and verified with `scripts/verify-artifacts.sh`.

| Repository path pattern | Format | Runtime consumer | Delivery |
|-------------------------|--------|------------------|----------|
| `BackEnd/llm-service/data/*.npy` | NumPy array | LLM service (`app.py`) | Git LFS |
| `BackEnd/llm-service/models/**/*.safetensors` | SafeTensors weights | LLM service (`app.py`) | Git LFS |
| `BackEnd/busyness-service/models/**/*.keras` | Keras model | Busyness service (`busyness.py`) | Git LFS |

### Model metadata and tokenizer files (source-owned, no mandatory checksum)

Small configuration and tokenizer files under the sentence-transformers model directory. Versioned in Git (via Git LFS for consistency with the model bundle) but not treated as standalone runtime binaries for checksum enforcement.

| Repository path | Purpose | Runtime consumer |
|-----------------|---------|------------------|
| `BackEnd/llm-service/models/sentence-transformers/config.json` | Model config | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/config_sentence_transformers.json` | ST config | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/modules.json` | Module layout | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/sentence_bert_config.json` | SBERT config | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/special_tokens_map.json` | Tokenizer specials | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/tokenizer.json` | Tokenizer | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/tokenizer_config.json` | Tokenizer config | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/vocab.txt` | Vocabulary | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/1_Pooling/config.json` | Pooling config | LLM service |
| `BackEnd/llm-service/models/sentence-transformers/README.md` | Model documentation | Human reference |

### CSV and data inputs (documented, no mandatory checksum)

| Repository path | Purpose | Runtime consumer | Delivery |
|-----------------|---------|------------------|----------|
| `BackEnd/llm-service/data/locations.csv` | Location catalog for semantic search | LLM service (`DATA_PATH`) | Git |
| `BackEnd/src/main/resources/data/locations.csv` | Backend seed/reference data | Spring Boot backend | Git |

### Generated build outputs (not runtime inputs)

| Path | Owner | Notes |
|------|-------|-------|
| `BackEnd/target/` | Maven build | Ignored by `BackEnd/.gitignore`; produced by `./BackEnd/mvnw package` |
| `frontend/dist/` | Vite production build | Ignored by root `.gitignore` |
| `.vite/` | Vite dev cache | Ignored by root `.gitignore` |

### Generated reports (not runtime inputs)

| Path | Producer | Notes |
|------|----------|-------|
| `test-reports/` | `run-tests.sh` | Timestamped HTML, JSON, metrics, and manual test artifacts |
| `docs/controller-coverage.txt` | `scripts/run-tests.sh` | Generated metric snapshot; target for ignore/redirect in later phases |
| `docs/service-coverage.txt` | `scripts/run-tests.sh` | Generated metric snapshot |
| `docs/frontend-tests.txt` | `scripts/run-tests.sh` | Generated metric snapshot |

## Runtime Path Expectations

Services load artifacts from container paths. Repository paths above are bind-mounted or copied into images at build time.

### LLM service (`BackEnd/llm-service/app.py`)

| Variable | Default runtime path | Repository source | Consumer |
|----------|---------------------|-------------------|----------|
| `MODEL_PATH` | `/app/models/sentence-transformers` | `BackEnd/llm-service/models/sentence-transformers/` | `load_model()`, `verify_file_paths()` |
| `DATA_PATH` | `/app/data/locations.csv` | `BackEnd/llm-service/data/locations.csv` | `load_data()`, `verify_file_paths()` |
| `EMBEDDINGS_PATH` | `/app/data/location_embeddings.npy` | `BackEnd/llm-service/data/location_embeddings.npy` | `load_data()`, `verify_file_paths()` |

Docker Compose (`llm-service` service) sets these environment variables and mounts `./backend/llm-service/data` to `/app/data`. Model files are baked into the image from the build context.

### Busyness service (`BackEnd/busyness-service/predictor/busyness.py`)

| Runtime path | Repository source | Consumer | Configurable |
|--------------|-------------------|----------|--------------|
| `/app/models/DNNs` | `BackEnd/busyness-service/models/DNNs/` | `initialize_busyness_models()` — loads all `.keras`/`.h5` files | **Hard-coded** (no env var in Phase 1) |
| `/app/models/LSTMs/Fin.keras` | `BackEnd/busyness-service/models/LSTMs/Fin.keras` | `initialize_busyness_models()` — final LSTM model | **Hard-coded** (no env var in Phase 1) |

Path configuration refactor for the busyness service is out of scope for Phase 1; this document records current assumptions only.

## Generated Output Ownership

Generated outputs must not be confused with authored documentation or runtime ML inputs:

- **Build outputs** (`BackEnd/target/`, `frontend/dist/`, `.vite/`) are produced by build tools and excluded from normal source review.
- **Test reports** under `test-reports/` are produced by `run-tests.sh` and may remain tracked until an explicit cleanup plan removes them from Git.
- **Metric snapshots** under `docs/*.txt` from `scripts/run-tests.sh` are generated counts, not curated documentation.

Do not commit fresh build or report output unless deliberately curating a snapshot for documentation.

## Missing Artifact Behavior

Required runtime artifacts must be present before ML services initialize successfully.

1. **Clone setup:** Install Git LFS (`git lfs install`), clone the repository, and run `git lfs pull` if model files are pointer stubs or missing.
2. **LLM service:** `verify_file_paths()` checks `MODEL_PATH`, `DATA_PATH`, and `EMBEDDINGS_PATH` and fails initialization with logged errors when files are absent. The service does not auto-download artifacts.
3. **Busyness service:** `initialize_busyness_models()` logs errors and returns `False` when DNN or LSTM model paths are missing or unloadable.
4. **No automatic downloads:** Phase 1 does not add startup fetches from Hugging Face, GitHub Releases, or object storage for production model artifacts (note: the LLM service retains an existing Hugging Face fallback for the sentence-transformer model only when local load fails — that is legacy runtime behavior, not Phase 1 provisioning).

If artifacts are missing, fix the working tree with Git LFS and refer to [README.md](README.md) setup steps. Do not expect services to self-heal by downloading weights.

## Future Storage Migration

When the team moves off Git LFS for runtime binaries, preferred options include:

| Target | Use case | Phase 1 status |
|--------|----------|----------------|
| GitHub Releases | Versioned model bundles with downloadable assets and optional digests | Documented only |
| Object storage (S3, GCS, etc.) | Scalable artifact hosting for CI/CD and production | Documented only |
| Git LFS | Current local/dev delivery | **Active** |

A future migration should:

1. Publish immutable release bundles with SHA-256 digests matching the checksum table format below.
2. Introduce explicit provisioning (download script or init container) — not silent startup downloads.
3. Update `MODEL_PATH`, `DATA_PATH`, `EMBEDDINGS_PATH`, and busyness model paths together with deployment docs.

Phase 1 intentionally preserves Git LFS availability so remediation phases do not break local runtime setup.
