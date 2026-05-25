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
| `test-reports/` | `scripts/run-tests.sh` | Timestamped HTML, JSON, metrics, and manual test artifacts |
| `test-reports/controller-coverage.txt` | `scripts/run-tests.sh` | Generated controller coverage metric snapshot |
| `test-reports/service-coverage.txt` | `scripts/run-tests.sh` | Generated service coverage metric snapshot |
| `test-reports/frontend-tests.txt` | `scripts/run-tests.sh` | Generated frontend test count snapshot |
| `docs/controller-coverage.txt` | — | Legacy path; ignored by `.gitignore` (superseded by `test-reports/`) |
| `docs/service-coverage.txt` | — | Legacy path; ignored by `.gitignore` (superseded by `test-reports/`) |
| `docs/frontend-tests.txt` | — | Legacy path; ignored by `.gitignore` (superseded by `test-reports/`) |

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
- **Metric snapshots** under `test-reports/*.txt` from `scripts/run-tests.sh` are generated counts, not curated documentation. Legacy `docs/*.txt` paths remain in `.gitignore` only.

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

## Runtime Binary Checksums

SHA-256 digests for every tracked runtime binary under `BackEnd/llm-service/data/*.npy`, `BackEnd/llm-service/models/**/*.safetensors`, and `BackEnd/busyness-service/models/**/*.keras`.

**Generate or verify locally (macOS):**

```bash
shasum -a 256 <path-to-file>
./scripts/verify-artifacts.sh
```

**Linux:** use `sha256sum <path-to-file>` manually if `shasum` is unavailable.

| Repository path | sha256 |
|-----------------|--------|
| `BackEnd/busyness-service/models/DNNs/100 NET.keras` | `5e7cd5bfb2a90667d84eaf1fb66b5380d3e86b52f41f5cb7c21cfc858f0a2a52` |
| `BackEnd/busyness-service/models/DNNs/105 NET.keras` | `e632ce9dae7b494b0be3a12fbabe1eec265e5ca65f36e1c48c6ad4d1558e01d4` |
| `BackEnd/busyness-service/models/DNNs/107 NET.keras` | `5e0aab6c83880d9ac068cd4c07c6764646c161b11c8fd843073bc4b99569677b` |
| `BackEnd/busyness-service/models/DNNs/113 NET.keras` | `073d1f3260327795a0c3c03b276f01645839aa60cf67bb0da605f14bc84b2c70` |
| `BackEnd/busyness-service/models/DNNs/114 NET.keras` | `7c91365a7372c1ce1446139ede8afc7c85e7a305fcdfb640e8d8e8396cfcb04b` |
| `BackEnd/busyness-service/models/DNNs/116 NET.keras` | `2b3b784234073652a0ec7248b4b9ab3f69a5e15f85a972d1913c59fba1eddfd7` |
| `BackEnd/busyness-service/models/DNNs/12 NET.keras` | `5613ccaf4cfbac1e233b072b8c7118a4780556b8b2144f560d9a746f988da796` |
| `BackEnd/busyness-service/models/DNNs/120 NET.keras` | `e8aa9208dc40197d1464b67cf02f82a184183f4388bf1608b93be88efc841dd7` |
| `BackEnd/busyness-service/models/DNNs/125 NET.keras` | `5a11c55099308f02c21a9186edbfaa3c6e31d86c21fc6a4f252a8e7e4f4d74a5` |
| `BackEnd/busyness-service/models/DNNs/127 NET.keras` | `b7958e307bb5e3d6e3c78885eb0daf3d867ef5cfc849eeb59b0759b95c48ad87` |
| `BackEnd/busyness-service/models/DNNs/128 NET.keras` | `4621e0119180b2c34705e334397f5228e29d37921bb918a07cec7f292be0f92b` |
| `BackEnd/busyness-service/models/DNNs/13 NET.keras` | `19ff3757b425773d530a4ebde9573c80ea79c91666e5be625d8807fbd49b99c3` |
| `BackEnd/busyness-service/models/DNNs/137 NET.keras` | `117cbf7cba2322915e34db65c66815a05156823b972019f9599cb4fb917e4d5e` |
| `BackEnd/busyness-service/models/DNNs/140 NET.keras` | `3dad2598119b9feade79f79510f4715d71d2edd9dec214086f7df2727a0b3e64` |
| `BackEnd/busyness-service/models/DNNs/141 NET.keras` | `bdc8a978be576c6147692858c00f4908be871115c8b040117782656c45ae5bb9` |
| `BackEnd/busyness-service/models/DNNs/142 NET.keras` | `9334d84e6f1ca0fba8bd0822f8161a234e8134a5a362282287bd773635261576` |
| `BackEnd/busyness-service/models/DNNs/143 NET.keras` | `f9aa52efd7b3b40225aab54f637c9d3e367ab773debc648251e9c6ececcc633a` |
| `BackEnd/busyness-service/models/DNNs/144 NET.keras` | `680284a8bff7c9a164ccb4de5cd9c583d9dbea59f86b9c5387bbc4a2e510cbde` |
| `BackEnd/busyness-service/models/DNNs/148 NET.keras` | `139fed1e88e5ca5c8aa21fab91d1443d40c4c1a7b610ecc08ac2bc9bd267e2ee` |
| `BackEnd/busyness-service/models/DNNs/151 NET.keras` | `6ec98ad3a838ddd2269f14f9b5ceabb1edc2b11efdb08a42b96d7a4079f37be8` |
| `BackEnd/busyness-service/models/DNNs/152 NET.keras` | `488b90a120ad9b5d35a67d31034ea36e9f332cb2716609341f887d776bae3eb1` |
| `BackEnd/busyness-service/models/DNNs/153 NET.keras` | `566952febc4fa82056cfa90e89210d9aa855a744d59c8ff47b847a0b74310668` |
| `BackEnd/busyness-service/models/DNNs/158 NET.keras` | `2a2a896dc90970275e0ee2ff68d389056dfcd1b2a04fddb4574230f1b60c320f` |
| `BackEnd/busyness-service/models/DNNs/161 NET.keras` | `93b2e7f62c33c917fc23335ade2722afe31b4c4f9fb2be981d6692921abef2d7` |
| `BackEnd/busyness-service/models/DNNs/162 NET.keras` | `9f98124d981d643b89eb9da94fff2f3c8f460d84e687a1fcb9af7889a2503ced` |
| `BackEnd/busyness-service/models/DNNs/163 NET.keras` | `66698f3852e961e7597263d13729b67c20c7d5eeeac65bffce13b37f738e463c` |
| `BackEnd/busyness-service/models/DNNs/164 NET.keras` | `0fbafe7d29417d9aa572e7c58e74abc5e28fa461284421980a8935b374ef87ad` |
| `BackEnd/busyness-service/models/DNNs/166 NET.keras` | `798490ea0effc82799a3c2e58e1ac1802ca0e35fdbc2b9cb10524a8173df7d3b` |
| `BackEnd/busyness-service/models/DNNs/170 NET.keras` | `5dbb698d271e2ea939e5e300d5ef15f6344ab16e259cfaed2b26be2eee7be435` |
| `BackEnd/busyness-service/models/DNNs/186 NET.keras` | `f423fb57f3175f608a9133702e55226ea3d2fea62507d0aaa4ea5c91dfb18d8b` |
| `BackEnd/busyness-service/models/DNNs/194 NET.keras` | `357455cee40b64458a514ae16ddf23b27351541deedf80fac7d34a068e35d5a5` |
| `BackEnd/busyness-service/models/DNNs/202 NET.keras` | `839b909ccce098bd04ecad452375b8b41091b27b13ff42a36ee0558826ca5234` |
| `BackEnd/busyness-service/models/DNNs/209 NET.keras` | `845882ef6e487359a2263bfce32351e37d6835ceb25ba62a27d0dc66d8f19aaa` |
| `BackEnd/busyness-service/models/DNNs/211 NET.keras` | `0c2c9ed0ecf91574e709c61ff66f66c00dc3656fa6028928d2eeea0691bebafb` |
| `BackEnd/busyness-service/models/DNNs/224 NET.keras` | `db914f0e95bcf4fff7fcc98bbf383495cf84766b66aab0f42e81e1a7cbf8c0bd` |
| `BackEnd/busyness-service/models/DNNs/229 NET.keras` | `f581466c9b5eb8a61b2fe277342710bc15402c346533c01e47222b0718ec29e3` |
| `BackEnd/busyness-service/models/DNNs/230 NET.keras` | `f4e91705e68250f6c061019f2f029982fbcd01c33b68ed8e5dbc61d3f920d4b5` |
| `BackEnd/busyness-service/models/DNNs/231 NET.keras` | `b7f1914db369a9a36aae2e5e3c6d0ec72a743b3e83b3b2d9c56a86d31e0cdd3e` |
| `BackEnd/busyness-service/models/DNNs/232 NET.keras` | `7c053156e5ee3a4c9631d88f082144ba49d5cf773ee168654a77b12ec8a55314` |
| `BackEnd/busyness-service/models/DNNs/233 NET.keras` | `685dde0739fd6584329781fd5616679b59f7e2f9e802a9feaad4dc6665c2f1b1` |
| `BackEnd/busyness-service/models/DNNs/234 NET.keras` | `ae17bdcc8ad9057056a71d18009bea236c7c9a77df4aca319cd80688f009069b` |
| `BackEnd/busyness-service/models/DNNs/236 NET.keras` | `a4c4b57f4fc65f5dc9185df7250f806b82e94afb9731d0c609348a47f06ebaa5` |
| `BackEnd/busyness-service/models/DNNs/237 NET.keras` | `9ae874fd262cce48c16d3f7df749eb2e915603aeb27933cbae473fdd53ad3050` |
| `BackEnd/busyness-service/models/DNNs/238 NET.keras` | `33f0f7d78ea83a0715b5f980568eabb40b8aabf6520283e753edb2ab178cd7c4` |
| `BackEnd/busyness-service/models/DNNs/239 NET.keras` | `1bf15ab97954b6ca5acc08eba320cb478e614cfe6dc83ed12bebe9b5a08cd49c` |
| `BackEnd/busyness-service/models/DNNs/24 NET.keras` | `967ae2303dbbb0eafa4d391b35b102609a40fbeb70963d6aa8b764a696499afb` |
| `BackEnd/busyness-service/models/DNNs/243 NET.keras` | `1103f525a09d6d1f82282c1d6bd03c7fc895ba6411aca8940d25990353f78d2c` |
| `BackEnd/busyness-service/models/DNNs/244 NET.keras` | `5cb42363b16bb9f3b1cd3706fb4f1d0755808633f23dea75927acf65b9f1c838` |
| `BackEnd/busyness-service/models/DNNs/246 NET.keras` | `a16366de78dff2e5e90f5351d955179b027601033da4dd74725e92b30b39fd03` |
| `BackEnd/busyness-service/models/DNNs/249 NET.keras` | `f92533215fbeddd1de02258ed1bb965561b7933de95bf33676093c3aa84e9a01` |
| `BackEnd/busyness-service/models/DNNs/261 NET.keras` | `fd0af30c58f6484fcae1fd20a3a94dcc10cfc633893c498af6455d66fc681e4f` |
| `BackEnd/busyness-service/models/DNNs/262 NET.keras` | `de911bce9425c96ad73bb1367f33833e0a9ca296710d2e9d9d29ab16d69c81f9` |
| `BackEnd/busyness-service/models/DNNs/263 NET.keras` | `442e19f91b1c401393b9d931712fe4a6df5bbf13f4878a6ec8314b7ebb631ca2` |
| `BackEnd/busyness-service/models/DNNs/4 NET.keras` | `969dd1814589251181e1db9a2a891cbc1a84dc3b6d85aaf230ec3db52319a54e` |
| `BackEnd/busyness-service/models/DNNs/41 NET.keras` | `484015c8d4b7e00791e8ee1acb05b7510c031de1dc0e64117895e196a1b5184b` |
| `BackEnd/busyness-service/models/DNNs/42 NET.keras` | `0632d604f2468f79ed1da0c063b608aeb6cb4841cc78cf6b1d2efedf29b0d45f` |
| `BackEnd/busyness-service/models/DNNs/43 NET.keras` | `3618cf7690ef5462c649571cfbd90d2648b4fb9bd078ffc0508f1ea820a3b106` |
| `BackEnd/busyness-service/models/DNNs/45 NET.keras` | `39e3410a94164fdfc87a92e955bfdb6c42fa6e0de02a9f33eacd2b1c535ba27d` |
| `BackEnd/busyness-service/models/DNNs/48 NET.keras` | `f6324ebad736af1245c7ca1c9012e432c95df34392260655bc166d6748fef4e0` |
| `BackEnd/busyness-service/models/DNNs/50 NET.keras` | `6d5bf6033b8835986f6a3d19273a48ea0a522a55a62f4dc34b684a05b86c379c` |
| `BackEnd/busyness-service/models/DNNs/68 NET.keras` | `51971a85f38362baacf96306d67805e8b48bf3744ac2bee09fa7c5197e16131b` |
| `BackEnd/busyness-service/models/DNNs/74 NET.keras` | `615dd9070c7605b979d834f4a358a3ca014cc715fd8e454405ac084ec11b4e89` |
| `BackEnd/busyness-service/models/DNNs/75 NET.keras` | `4236432087bd51a7d485dee819690d73ef1396321bd73c4d477d68a9fde9b2c8` |
| `BackEnd/busyness-service/models/DNNs/79 NET.keras` | `63bdfca7c9dee5a1c1cf1b137abbe550dbfa6a1896b7cf4769a2e48dae9b9655` |
| `BackEnd/busyness-service/models/DNNs/87 NET.keras` | `3057c08bcce1788f923e8fa45c27f4298263f6c11e578d7641b9553097390c6d` |
| `BackEnd/busyness-service/models/DNNs/88 NET.keras` | `5f99c24cb1d2964ef2ec1b13d44be04e122528d0b064a5b6f48a0ca9d40d3aa7` |
| `BackEnd/busyness-service/models/DNNs/90 NET.keras` | `8671bca905c7edf11c211c6a8e590a258042e104d078118db029e45bd4bf147f` |
| `BackEnd/busyness-service/models/LSTMs/Fin.keras` | `d3edc9b7b0300ad6a52f269c94433415afaf90ea892831ede18ad2755171e9cb` |
| `BackEnd/llm-service/data/location_embeddings.npy` | `e668b3c74ad55cac2a0991bf81b10d3023261b464080f4c42f4b5a9558ba06af` |
| `BackEnd/llm-service/models/sentence-transformers/model.safetensors` | `0b3c8c717335c801abb15983036a6f1df4b6943fd6b93717969efd96d22eeec6` |

CSV, JSON, TXT, and tokenizer metadata files are documented in the manifest but do not require mandatory checksum rows in Phase 1.
