# Urban Gala

Urban Gala is a full-stack web application that helps users discover, compare, and plan visits to Manhattan venues using trustworthy busyness and location intelligence. It combines real-time crowd predictions, semantic vector search (FAISS), walking/transit directions, itinerary planning, and an LLM-powered chatbot into a single React + Spring Boot + Flask platform.

## Key Features

-   **Interactive Map:** Browse 2,200+ Manhattan venues on a live map with real-time busyness heatmaps and 12-hour forecasts.
-   **Find My Vibe:** Use natural language to search venues by atmosphere (e.g., "a quiet coffee shop in Greenwich Village"). Powered by FAISS vector similarity search over sentence-transformer embeddings.
-   **AI Chatbot:** Conversational venue discovery with cited responses — chat with the LLM to get personalized recommendations informed by real venue data.
-   **Walking & Transit Directions:** Multi-stop route planning via Google Routes API with turn-by-turn directions, distance, and duration.
-   **Itinerary Planning:** Create, edit, share, and save custom outing plans. Share plans with friends via a shareable link.
-   **Favorites & Friends:** Save favorite venues, manage a friends list, view friends' favorites, and see shared plans.
-   **User Authentication & Profiles:** Sign up, log in, upload an avatar, manage your profile. JWT-based stateless auth with rate limiting on expensive endpoints.

## Architecture Overview

The application is built on a microservice architecture, orchestrated with Docker Compose.

-   **`frontend`**: A React application built with Vite, using Material-UI. Production builds served via Nginx.
-   **`backend`**: A Java Spring Boot application that serves as the main API gateway, handling authentication, plans, favorites, friends, locations, and core business logic. Includes in-memory Caffeine caching with per-cache TTL/size limits.
-   **`llm-service`**: A Python 3.11 Flask microservice (Gunicorn, 2 workers, preload) that handles:
    -   FAISS vector similarity search for "Find My Vibe" (index built at startup from committed embeddings).
    -   AI Chatbot orchestration via Hugging Face API with conversation history.
    -   In-process bounded TTL cache for search results.
-   **`busyness-service`**: A Python Flask microservice that predicts and serves location busyness levels using Keras DNN and LSTM models. Includes startup checksum verification, process-local TTL caches, and weather-fallback forecast generation.
-   **`db`**: A MySQL database with Flyway schema migrations and CSV-based venue data import.

## RAG Pipeline Architecture

The "Find My Vibe" semantic search and AI Chatbot features are powered by a Retrieval-Augmented Generation (RAG) pipeline, upgraded across two milestones (M001 foundation → M002 production-grade). The diagram below shows the full post-M002 pipeline including hybrid search, cross-encoder re-ranking, query expansion, inline citations, multi-turn retrieval, and extended eval metrics.

```mermaid
flowchart TD
    A["corpus/v1/venues.csv<br/>2,262 Manhattan venues"] --> B["venue_corpus/compose_document_text()"]
    B --> C["sentence-transformers<br/>all-MiniLM-L6-v2 encoder"]
    C --> D["FAISS IndexFlatIP<br/>dense vector index"]
    C --> D2["BM25 Index<br/>sparse lexical index"]
    D --> E["SearchService.search()<br/>Hybrid RRF fusion (k=60)<br/>mode: auto/hybrid/dense"]
    D2 --> E
    E --> F["Cross-Encoder Re-Ranker<br/>ms-marco-MiniLM-L6-v2<br/>score-based re-ordering"]
    F --> G["chat_service<br/>Query expansion (9 domains)<br/>+ format_retrieval_context()"]
    G --> H["LLM Response + Inline Citations [1],[2]<br/>v1.5 prompt template<br/>+ footnote source list"]
    H --> I["Multi-Turn Conversational<br/>reformulate_query()<br/>context-aware follow-ups"]
    H --> J["scripts/run_eval.py<br/>NDCG@5, MRR, Precision@5, Hit Rate, Recall@5<br/>--baseline comparison mode"]
    J --> K["data/benchmark.jsonl<br/>41 questions, 5 categories"]
    K --> L["Baseline vs. Improved<br/>per-metric delta table"]
```

**Pipeline stages:**

1. **Corpus ingestion** — `corpus/v1/venues.csv` is the versioned venue catalog. Each row contains name, description, zone, price, type, tags, and other attributes.
2. **Document composition** — `venue_corpus.compose_document_text()` converts each CSV row into a labeled-line text document (e.g. `Name: ...\nDescription: ...\nZone: ...`), skipping empty/NA fields.
3. **Embedding** — A `sentence-transformers` model (`all-MiniLM-L6-v2`, 384 dimensions) encodes every document into a dense float32 vector. The model is stored under `BackEnd/llm-service/models/` (Git LFS).
4. **Vector indexing** — `search_service.build_vector_index()` L2-normalizes all embeddings and builds an in-memory `faiss.IndexFlatIP` for exact inner-product similarity search. A persisted index (`faiss.index` + `metadata.json`) is preferred when available; otherwise the index is built fresh from `.npy` embeddings at startup.
5. **Semantic search** — `SearchService.search()` encodes the user query with the same model, normalizes it, and queries the FAISS index with an over-fetch multiplier to compensate for post-filtering (location zone, price range, exclusions).
6. **Retrieval context assembly** — `chat_service.format_retrieval_context()` converts the ranked result DTOs into (a) a natural-language context string listing venue names, zones, and types, and (b) a structured citations list with `venue_id`, `name`, `snippet`, and `score`.
7. **LLM response** — `chat_service.build_chat_messages()` assembles the system prompt (including retrieval context) and user message (including truncated chat history), then calls the Hugging Face chat completions API. The response is returned alongside the structured citations for frontend display.
8. **Offline evaluation** — `scripts/run_eval.py` loads `data/benchmark.jsonl` (categorized test queries with expected venue IDs), runs each query through the live `SearchService`, computes recall@5 and citation accuracy, and outputs a structured report with per-category verdicts (pass/fail) against configurable thresholds.

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [Artifact Policy](artifacts.md) | Runtime model artifacts, Git LFS ownership, SHA-256 checksum table, path expectations |
| [Baseline Verification](baseline-verification.md) | Tiered verification matrix, smoke checks, per-phase verification gates |
| [Cache Inventory](cache-inventory.md) | All JVM, Python, and browser caches with TTL, size limits, and invalidation paths |
| [LLM Runtime](llm-runtime.md) | Gunicorn configuration, memory measurements, FAISS index policy, operator commands |
| [Security](SECURITY.md) | Secrets management, rotation runbooks, JWT auth, CORS, rate limiting, Google API key restrictions |
| [Testing](TESTING.md) | Test suite overview: backend (25 Java files), frontend (11 Vitest files), Python ML (14 files), Cypress E2E, compose-smoke |
| [Evaluation Strategy](EVALUATION_STRATEGY.md) | Test-driven architecture decisions, coverage metrics, ML model evaluation |

---

## Getting Started

Follow these instructions to set up and run the project locally.

### Prerequisites

-   **Docker Desktop:** Download and install. This includes Docker Compose.
-   **Git LFS:** Required for handling large model files. Install from [git-lfs.com](https://git-lfs.com).

Before starting services, read [Runtime Artifact Policy](artifacts.md) for **runtime model artifacts** — expected repository paths, ownership (Git LFS vs source-owned metadata), manual checksum verification with `scripts/verify-artifacts.sh`, busyness startup checksum enforcement, and process-local busyness cache behavior.

### 1. Clone the Repository

First, install Git LFS on your machine to ensure the machine learning models are downloaded correctly.

```bash
# Install Git LFS (once per machine)
git lfs install

# Clone the repository
git clone https://github.com/niallgiblin/team-2-COMP47360
cd team-2-COMP47360
```
*Note: If you cloned the repository before installing Git LFS, you may need to run `git lfs pull` inside the project directory to download the model files.*

After pulling LFS objects, verify runtime binaries with `./scripts/verify-artifacts.sh` (see [artifacts.md](artifacts.md) for the full manifest and checksum table).

### 2. Configure Environment Variables

The application requires API keys to function correctly. You'll need to create a `.env` file in the project root.

1.  **Create the `.env` file** by copying the example file:
    ```bash
    cp env.example .env
    ```
    See [`env.example`](../env.example) in the repository root for all supported variables, including optional local-development path overrides.

2.  **Edit the `.env` file** and add your keys:
    ```
    VITE_GOOGLE_API_KEY=AIzaSy...
    HF_TOKEN=hf_...
    APP_JWT_SECRET=your-super-secret-jwt-key-here
    ```
    -   `VITE_GOOGLE_API_KEY`: Required for Google Maps. Get a key from the Google Cloud Console. You will need to enable the "Maps JavaScript API" and the "Routes API".
    -   `HF_TOKEN`: Required for the AI Chatbot. Get a free "read" access token from your Hugging Face account settings.
    -   `APP_JWT_SECRET`: A secret key for signing authentication tokens. For production, this should be a long, random, base64-encoded string. You can generate a secure one with the following command:
        ```bash
        openssl rand -base64 32
        ```

### 3. Build and Run the Application

With Docker Desktop running, start all services using Docker Compose.

```bash
docker-compose up --build
```

**First time running?** This will take a few minutes as Docker downloads and builds all the necessary components.

### 3. Wait for Startup
You'll see lots of log messages. Wait until you see these key messages:
- `urban-gala-db: ready for connections`
- `urban-gala-backend: Started BusynessPredictorApplication`
- `urban-gala-frontend: Local: http://localhost:5173/`

### 4. Access the Application
Once everything is running:
- **Frontend (Web App):** http://localhost:5173
- **Backend API:** http://localhost:8080
- **LLM Service:** `docker compose exec llm-service curl http://localhost:5000/health` (internal only)
- **Busyness Service:** `docker compose exec busyness-service curl http://localhost:5000/health` (internal only)

### Reset database schema (development)

When Flyway baseline or migrations change, reset the MySQL volume and restart:

```bash
docker compose down -v
docker compose up -d db backend
```

Flyway applies migrations on backend startup; Hibernate uses `ddl-auto=validate`.

### Production Smoke Check

Verify the full production-like stack with one command:

```bash
bash scripts/compose-smoke.sh --teardown
```

Brings up the prod profile (Nginx static frontend), waits for all services to become healthy, then verifies Spring Actuator, LLM health, busyness health, static Nginx serving, and proxied API routing. See [baseline-verification.md](baseline-verification.md) for the full smoke gate specification.

## Common Docker Commands

### Starting the Application
```zsh
# Start in foreground (see all logs)
docker-compose up

# Start in background (detached mode)
docker-compose up -d

# Force rebuild containers
docker-compose up --build
```

### Stopping the Application
```zsh
# Stop all containers
docker-compose down

# Stop and remove all data (fresh start).
# Use this if you have issues with database initialization or want a clean slate.
docker-compose down -v
```

### Viewing Logs
```zsh
# View logs from all services
docker-compose logs

# View logs from specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs db

# Follow logs in real-time
docker-compose logs -f
```

### Checking Container Status
```zsh
# See running containers
docker ps

# See all containers (running and stopped)
docker ps -a
```

## RAG Pipeline — M002 Upgrade

M002 upgraded the M001 foundation from a single-stage dense-retrieval pipeline into a production-grade RAG system with six integrated enhancements:

| Slice | Feature | What It Does |
|-------|---------|-------------|
| S01 | **Hybrid Search (BM25 + Dense)** | BM25 lexical retrieval fused with FAISS dense via Reciprocal Rank Fusion (RRF, k=60). Mode-aware dispatch: auto/hybrid/dense. |
| S02 | **Cross-Encoder Re-Ranking** | `ms-marco-MiniLM-L6-v2` cross-encoder re-ranks candidates post-retrieval for precise relevance ordering. Graceful degradation when model unavailable. |
| S03 | **Query Expansion** | Heuristic keyword/synonym expansion covering 9 vocabulary domains (e.g. "good for a date" → "romantic restaurant intimate"). Confined to chat path. |
| S04 | **Extended Evaluation Metrics** | NDCG@5, MRR, Precision@5, Hit Rate alongside existing recall@5. Baseline comparison mode (dense-only vs. improved pipeline) via `--baseline` flag. |
| S05 | **Inline Citations** | Numbered citation markers [1], [2] in LLM responses with footnote-style source list. Versioned v1.5 prompt template with CRITICAL RULE 8. |
| S06 | **Multi-Turn Conversational Retrieval** | Follow-up questions reformulated using conversation history. `/api/chat` accepts `previous_responses` with 3-tier fallback strategy. |

(See the updated architecture diagram above in "RAG Pipeline Architecture.")

## Evaluation Results (Post-M002)

The RAG pipeline is evaluated against a curated benchmark of **41 questions** across **5 categories**. The eval harness now computes 5 metrics (NDCG@5, MRR, Precision@5, Hit Rate, Recall@5) and supports baseline comparison mode.

### Before/After Comparison (Dense-only Baseline vs. Full M002 Pipeline)

| Category | Metric | Baseline (Dense-only) | Improved (M002) | Delta |
|----------|--------|----------------------|-----------------|-------|
| retrieval | Recall@5 | 0.2093 | 0.2093 | — |
| retrieval | NDCG@5 | 0.2283 | 0.2496 | **+0.0214** |
| retrieval | MRR | 0.4074 | 0.5037 | **+0.0963** |
| retrieval | Precision@5 | 0.1778 | 0.1778 | — |
| retrieval | Hit Rate | 0.6667 | 0.6667 | — |
| filtered | Recall@5 | 0.2625 | 0.2938 | **+0.0312** |
| filtered | NDCG@5 | 0.2467 | 0.2656 | **+0.0189** |
| filtered | MRR | 0.3125 | 0.3125 | — |
| filtered | Precision@5 | 0.1500 | 0.1750 | **+0.0250** |
| conversational | Recall@5 | 0.2812 | 0.2812 | — |
| conversational | NDCG@5 | 0.2744 | 0.2744 | — |
| conversational | MRR | 0.2917 | 0.2917 | — |
| adversarial | Recall@5 | 0.2500 | 0.3750 | **+0.1250** |
| adversarial | NDCG@5 | 0.2500 | 0.3750 | **+0.1250** |
| adversarial | MRR | 0.2500 | 0.3750 | **+0.1250** |
| adversarial | Precision@5 | 0.2500 | 0.2750 | **+0.0250** |
| **Aggregate** | **Recall@5** | **0.2495** | **0.2874** | **+0.0379** |
| **Aggregate** | **NDCG@5** | **0.2492** | **0.2899** | **+0.0407** |
| **Aggregate** | **MRR** | **0.3182** | **0.3747** | **+0.0566** |
| **Aggregate** | **Precision@5** | **0.2121** | **0.2242** | **+0.0121** |
| **Aggregate** | **Hit Rate** | **0.4545** | **0.4848** | **+0.0303** |

**Key findings:**
- Aggregate Recall@5 improved from 0.2495 to 0.2874 (**+15.2%**)
- Aggregate NDCG@5 improved from 0.2492 to 0.2899 (**+16.3%**)
- Aggregate MRR improved from 0.3182 to 0.3747 (**+17.8%**)
- Largest gains in adversarial category: +12.5pp across Recall, NDCG, and MRR — hybrid BM25+dense retrieval dramatically improves exact-match queries that dense-only retrieval missed
- Conversational category shows no delta — retrieval quality for reformulated queries depends on query reformulation (S06), not hybrid search or re-ranking
- Retrieval MRR shows the largest single-metric improvement (+9.6pp) — cross-encoder re-ranking places relevant results higher in ranked order

### Test Suite Coverage (Post-M002)

| Milestone | Tests Passing | New Failures | Notes |
|-----------|--------------|-------------|-------|
| M001 (baseline) | 197+ | — | chat_service, routes, eval |
| M002 S01 (Hybrid) | 268 | 0 | 1 pre-existing skip (PyTorch 3.14) |
| M002 S02 (Re-Rank) | 284 | 0 | 11 re-rank-specific tests |
| M002 S03 (Q-Expand) | 318 | 0 | 34 expander-specific tests |
| M002 S04 (Eval) | 347 | 0 | 59 eval tests, 0 regressions |
| M002 S05 (Citations) | 53 (chat) | 0 | 12 parser-specific + 1 integration |
| M002 S06 (Multi-Turn) | **392** | 0 | 1 pre-existing unrelated failure |

**Eval runner capabilities** (`scripts/run_eval.py`):

- 5-metric computation: NDCG@5, MRR, Precision@5, Hit Rate, Recall@5 — all pure stdlib functions
- Baseline comparison mode (`--baseline`): dense-only pass vs. improved pipeline with per-category delta tables
- Metrics-only mode (`--metrics-only`): compute and display all metrics without threshold enforcement (always exits 0)
- JSON report output (`--report`): per-category metric objects + top-level aggregates + optional `baseline_comparison` node
- Category-level and aggregate summaries for all 5 metrics

The eval harness is covered by **59 unit and integration tests** (`tests/test_eval.py`), all passing.

## Portfolio Summary

Urban Gala's RAG pipeline brings retrieval-augmented generation to Manhattan venue discovery. Over two milestones (M001 + M002), we built:

- **M001 (Foundation):** A versioned 2,200+-venue corpus, FAISS inner-product vector index over sentence-transformer embeddings, unified retrieval service with zone and price filtering, grounded LLM citations with structured citation objects, versioned prompt registry, a 41-question benchmark across 5 categories, automated eval runner, and portfolio documentation — all containerized and verified.

- **M002 (Advanced RAG):** Hybrid search (BM25 lexical + FAISS dense via RRF k=60), cross-encoder re-ranking (ms-marco-MiniLM-L6-v2) with graceful degradation, heuristic query expansion (9 vocabulary domains), extended evaluation metrics (NDCG@5, MRR, Precision@5, Hit Rate) with baseline comparison mode, inline citation markers with footnote source lists (v1.5 prompt), and multi-turn conversational retrieval with query reformulation — **392 tests pass with 0 M002-introduced regressions**.

**Pipeline impact:** Aggregate Recall@5 improved 15.2% (0.2495 → 0.2874), NDCG@5 improved 16.3%, MRR improved 17.8%, with the largest gains in adversarial retrieval (+12.5pp across all metrics).

## Troubleshooting

### Problem: "Port already in use" error
**Solution:** Another application is using the same port.
```zsh
# Stop the application
docker-compose down

# Check what's using the port
# Windows:
netstat -ano | findstr :5173
netstat -ano | findstr :8080

# Mac/Linux:
lsof -i :5173
lsof -i :8080

# Kill the conflicting processes
```

### Problem: Containers won't start
**Solution:** Clean up and rebuild:
```zsh
# Stop everything
docker-compose down -v

# Remove old images
docker system prune -a

# Rebuild and start
docker-compose up --build
```

### Problem: Database connection errors
**Solution:** Wait longer or restart the database:
```zsh
# Restart just the database
docker-compose restart db

# Or restart everything
docker-compose restart
```

### Problem: Changes to code not showing up
**Solution:** Rebuild the containers:
```zsh
docker-compose down
docker-compose up --build
```

## Project Structure

```
team-2-COMP47360/
├── docker-compose.yml           # Defines all services (dev + prod profiles)
├── env.example                  # Template for required .env variables
├── scripts/
│   ├── compose-smoke.sh         # Production-like Docker smoke verification
│   ├── verify-artifacts.sh      # SHA-256 checksum verification for 70 runtime binaries
│   ├── run-tests.sh             # Unified test runner (Maven + Vitest + Cypress)
│   └── check-tests.sh           # Quick test status check
├── docs/                        # Project documentation (see index above)
├── frontend/
│   ├── Dockerfile               # Multi-stage build (Vite → Nginx for prod)
│   ├── nginx.conf               # Nginx reverse proxy config (chat, API, avatars)
│   ├── cypress/                 # Cypress E2E test suites
│   └── src/
│       ├── pages/               # Page components (Home, MapView, FindMyVibe, etc.)
│       ├── components/          # Shared UI components (AIChatWidget, ForecastSlider, etc.)
│       ├── services/            # API client, auth, route, chat services
│       ├── contexts/            # React contexts (Auth, Plan, Busyness)
│       └── cache/               # Browser cache modules + invalidation hooks
├── BackEnd/
│   ├── Dockerfile               # Spring Boot container (Maven build)
│   ├── src/
│   │   ├── main/java/.../controller/  # 8 REST controllers (Auth, Vibe, Plan, etc.)
│   │   ├── main/java/.../service/    # 12 service classes with Caffeine caching
│   │   └── test/                      # 25 JUnit/MockMvc test classes
│   ├── llm-service/              # Python Flask LLM microservice
│   │   ├── app.py                # Gunicorn entry point (FAISS, search, chat)
│   │   ├── corpus/v1/            # Versioned venue catalog (venues.csv, manifest.json)
│   │   ├── data/                 # location_embeddings.npy (Git LFS)
│   │   ├── models/               # sentence-transformers model (Git LFS)
│   │   └── tests/                # 10 Python test files
│   └── busyness-service/         # Python Flask busyness microservice
│       ├── app.py                # Busyness prediction + weather fallback
│       ├── models/               # Keras DNN + LSTM models (Git LFS) + checksums.sha256
│       └── tests/                # 4 Python test files
└── config/                       # Shared configuration files
```

## Understanding the Setup

### What Docker Compose Creates:
1. **Frontend Container:** Runs the web application (Vite + React)
2. **Backend Container:** Runs the API server (Spring Boot)
3. **Database Container:** Runs MySQL database
4. **Network:** Allows containers to communicate with each other

### Default Ports:
- Frontend: `5173` (accessible at localhost:5173)
- Backend: `8080` (accessible at localhost:8080)
- Database: `3306` (internal communication only)

## Development Notes

### Backend Security:
The backend generates a temporary password on startup (shown in logs). This is normal for development.

### Daily Development:
1. Pull latest code: `git pull`
2. Start application: `docker-compose up`
3. Develop normally
4. Stop when done: `docker-compose down`

### When Dependencies or Database schema Change:
1. Stop application: `docker-compose down`
2. Rebuild: `docker-compose up --build`

---
