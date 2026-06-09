# Urban Gala v2 Upgrade Analysis

Verified against `main` (`ec7dd3b6`) and `urban-gala-v2`
(`4abc29f5`) on 2026-06-09.

## Scope and truth rules

This document is the canonical interview-oriented comparison for v2.

- **Committed v2** means code reachable from `urban-gala-v2` at `4abc29f5`.
- **Enabled in Compose** means the checked-in `docker-compose.yml` turns the
  feature on in the normal container stack.
- **Externally configured** means the code exists but requires credentials,
  provider settings, or infrastructure outside this repository.
- **Work in progress** means an uncommitted local change. Do not present it as
  shipped v2 functionality.
- Historical files under `Organisation/`, `ModelExplain.ipynb`, and phase
  snapshots in `docs/baseline-verification.md` explain how the project evolved;
  they are not current capability specifications.

The branch contains 216 commits beyond `main` and changes 252 files
(41,610 insertions and 10,068 deletions).

## Executive comparison

| Area | `main` | Committed v2 |
|------|--------|--------------|
| LLM retrieval | Monolithic Flask module, dense similarity over a static embedding matrix | Modular retrieval service, normalized FAISS `IndexFlatIP`, optional persisted index, BM25+dense RRF, filters, bounded cache |
| RAG grounding | Basic retrieved context sent to a hosted chat model | Versioned prompts, structured citation objects, inline citation parsing, venue hydration, query expansion, multi-turn reformulation |
| Evaluation | Ad hoc behavior checks | 41-query benchmark, Recall@5, NDCG@5, MRR, Precision@5, Hit Rate, dense baseline comparison, JSON reports |
| Data reproducibility | Unversioned location files and embeddings | Versioned `corpus/v1`, manifest checksum, schema, deterministic document composition, Spring CSV synchronization |
| Service contracts | Map-heavy and loosely typed cross-service handling | Typed DTOs, fixture JSON, `MlServiceClient`, `MlResponseMapper`, stable error translation |
| Busyness serving | Model inference with weaker startup and fallback controls | Artifact checksum verification, safer Keras loading, bounded live/forecast caches, weather fallback, 12-hour forecast |
| Backend persistence | Hibernate-managed schema assumptions | Flyway migrations, Hibernate `validate`, startup configuration validation, CSV import tests |
| Map and routing | Development-oriented map flow | Viewport bounding boxes, Google Routes integration, fallback polylines, route normalization, zone enrichment, bounded route/map caches |
| Frontend AI UX | Basic chat/search UI | Accessible AI Concierge shell, user-scoped history, citation-linked venue cards, add-to-plan integration, dark responsive design |
| Operations | Development Flask servers and limited health evidence | Python 3.11 images, Gunicorn preload/workers, health checks, resource limits, artifact verification, Compose smoke script |
| Observability | Conventional logs | Structured request events, request IDs, bounded Prometheus metrics, `/metrics`, JSONL event writing and Gunicorn hooks |
| Security controls | JWT and basic Spring security | Startup secret validation, BCrypt/JWT, private ML network surfaces, restricted Flask CORS, avatar byte validation, stable errors, in-process rate limits |

## ML and RAG upgrade

### Retrieval architecture

The main branch kept model loading, caching, search, chat, and response mapping
inside one large Flask module. v2 separates these responsibilities into
`loader.py`, `search_service.py`, `chat_service.py`, `cache_policy.py`,
`dto.py`, `query_expander.py`, the BM25 implementation, prompt loading, and
corpus/index utilities.

The committed dense encoder bundle is MPNet-family and produces
768-dimensional vectors. Do not confuse it with
`cross-encoder/ms-marco-MiniLM-L6-v2`, which is a separate candidate
re-ranking model.

Dense retrieval uses:

1. A versioned 2,262-row Manhattan venue corpus.
2. Deterministic text composition from venue attributes.
3. L2-normalized document and query vectors.
4. Exact inner-product search through FAISS `IndexFlatIP`, equivalent to
   cosine similarity after normalization.
5. Zone, price, and exclusion filtering after over-fetching candidates.

Hybrid mode adds BM25 lexical retrieval and fuses dense and sparse rankings
with Reciprocal Rank Fusion using `k=60`.

### Cross-encoder qualification

Cross-encoder code, model loading, tests, and graceful degradation are
implemented. The application default in Python is enabled, but the checked-in
Docker Compose configuration explicitly sets `CROSS_ENCODER_ENABLED=false`.
Therefore:

- It is accurate to say v2 **supports** cross-encoder re-ranking.
- It is not accurate to say the standard Compose deployment **uses** it.
- Benchmark results involving the full improved pipeline must be described as
  offline evaluation configuration, not proof of the default deployed path.
- Interactive testing found that CPU re-ranking added too much retrieval and
  first-token latency while MPNet + BM25/RRF remained useful without it.
- The benchmark is not a cross-encoder-only ablation, so its quality gains
  cannot be attributed to re-ranking alone.

The implementation over-fetches candidates and runs every query-document pair
through `CrossEncoder.predict()` before filtering and generation. A request for
10 results can score roughly 30 pairs with the default multiplier. This work is
CPU-bound and blocks the first streamed chat token.

See [CROSS_ENCODER_TRADEOFF.md](CROSS_ENCODER_TRADEOFF.md) for the full decision
record and criteria for reconsidering the feature.

### Chat grounding

The chat path retrieves venue context, optionally expands the query, sends
bounded conversation history to the Hugging Face chat-completions router, and
returns both assistant text and structured citation records. The frontend
hydrates citations into venue cards and can add venues to a plan.

Recent v2 fixes deliberately removed the prompt requirement for a generated
footnote source block. The UI uses inline markers and structured citation
objects; documentation must not promise a footnote list.

The generative model is hosted externally through Hugging Face. v2 does not
serve an LLM locally. The local ML artifacts are the embedding model,
cross-encoder bundle, embeddings, and busyness models.

### Evaluation

The committed harness evaluates 41 curated questions across five categories.
Its aggregate recorded comparison is:

| Metric | Dense baseline | Improved configuration | Delta |
|--------|---------------:|-----------------------:|------:|
| Recall@5 | 0.2495 | 0.2874 | +0.0379 |
| NDCG@5 | 0.2492 | 0.2899 | +0.0407 |
| MRR | 0.3182 | 0.3747 | +0.0566 |
| Precision@5 | 0.2121 | 0.2242 | +0.0121 |
| Hit Rate | 0.4545 | 0.4848 | +0.0303 |

These are useful relative improvements, but the absolute scores remain modest
and the benchmark is small and curated. In an interview, frame this as a
reproducible evaluation foundation and evidence of directional improvement,
not as production-level relevance proof.

## Busyness ML upgrade

The busyness service serves predictions from pre-trained Keras DNN and LSTM
artifacts. It verifies model checksums before loading, avoids unsafe
deserialization by default, normalizes response shapes, caches live and
forecast work separately, and produces a 12-hour forecast with weather
fallback behavior.

“Live” or “real-time” in this project means an inference generated for the
current time and current available weather inputs. It does not mean the app
ingests live occupancy sensors, mobile-device counts, or a continuous
ground-truth crowd feed.

The repository contains the serving and inference path, not a complete
reproducible training pipeline for every committed model artifact. The
historical `ModelExplain.ipynb` explains the LSTM architecture but is not the
runtime implementation contract.

## Platform engineering upgrades

### Spring backend

- Typed Flask response contracts replace ad hoc map parsing.
- Contract fixtures are mirrored into Java test resources.
- Flyway owns schema migrations; Hibernate validates the resulting schema.
- Startup validation rejects missing or placeholder production secrets.
- Caffeine caches have explicit TTL and size bounds.
- Map data supports viewport bounding boxes instead of always returning the
  full corpus.
- Expensive routes use bounded in-process rate limiting.
- Errors are translated into stable client-safe payloads.

The rate limiter is per JVM. It resets on restart and does not coordinate
across replicas, so it is not distributed abuse or DDoS protection.

### Frontend

- Production assets are built with Vite and served by Nginx.
- API paths are relative and work through dev proxy, Compose, and Nginx.
- Route requests are normalized, cached, and can degrade to fallback
  polylines.
- Authentication lifecycle invalidates user-sensitive browser caches.
- Chat history is scoped by user.
- Citation cards are actionable and guarded against duplicate hydration.
- Accessibility work includes focus management and keyboard behavior in the
  AI Concierge.

Plans are shared to selected users/friends through authenticated APIs. There is
no public shareable-link feature.

### Operations and observability

Committed v2 includes request IDs, structured search/chat events, bounded
Prometheus metrics, a `/metrics` endpoint, JSONL event persistence, and
Gunicorn lifecycle hooks.

The latest v2 commit includes Prometheus and Grafana Compose configuration,
provisioned dashboards, RAGAS-style evaluation, and SSE chat streaming.

## Security truth

Implemented:

- Stateless JWT authentication and BCrypt password hashing.
- User-scoped authorization in plans, favorites, friends, and profiles.
- Environment-backed secrets with startup checks.
- Private container networking for ML work endpoints.
- Configurable Flask CORS allowlists.
- Avatar content validation.
- Stable error responses.
- In-process rate limiting for selected expensive Spring routes.
- Documented Google browser-key restrictions that must be applied manually.

Not implemented or not demonstrated by this repository:

- Spring CSRF protection; CSRF is disabled for the stateless JWT API.
- TLS between Spring and MySQL; Compose uses `useSSL=false`.
- TLS termination for public traffic.
- A Content Security Policy or comprehensive Nginx security-header set.
- Non-root container users.
- Distributed rate limiting.
- Automated dependency, secret, or penetration-testing pipelines.
- Encrypted backup automation.

## Verification snapshot

Commands were run on 2026-06-09 against committed v2 at `4abc29f5`.

| Gate | Result |
|------|--------|
| Frontend Vitest | 14 files, 133 tests passed |
| Frontend production build | Passed; emitted a chunk-size warning around 945 KiB |
| Busyness pytest | 20 passed, 1 artifact test skipped |
| LLM pytest | 470 collected; Python 3.14 host run reached 45% with failures, then segfaulted in native dependencies |
| Spring Maven tests | 285 run, 1 failure, 18 errors |
| Artifact verification | 71 checks passed after synchronizing the committed MPNet embedding checksum |
| Docker Compose smoke | Not run; Docker daemon was unavailable |

The LLM suite requires a complete Python 3.11 run; the available Python 3.14
environment is unsupported and terminated inside native dependencies. The
Spring failures include missing test beans in security/controller contexts, an
application-context startup error, and one cache expectation mismatch.

Do not say “all tests pass” for this v2 commit.

## Latest committed additions

Commit `4abc29f5` adds the MPNet embedding refresh, RAGAS-style evaluation,
SSE chat streaming with frontend fallback behavior, and provisioned
Prometheus/Grafana configuration. These are committed v2 capabilities.

## Interview narrative

### 60-second version

> The original application had the core product working, but the ML path was
> monolithic and difficult to reproduce or evaluate. In v2 we versioned the
> 2,262-venue corpus, split retrieval and chat into testable services, moved
> dense search to normalized FAISS, added BM25 hybrid retrieval with RRF,
> optional cross-encoder re-ranking, structured citations, multi-turn query
> reformulation, and a 41-query evaluation harness. We also hardened the
> surrounding system with typed Spring-Flask contracts, Flyway migrations,
> bounded caches, production frontend builds, artifact checksums, and
> structured observability. The measured retrieval metrics improved, but I
> would be transparent that the benchmark is small, the absolute scores still
> need work, cross-encoder re-ranking is disabled in the default Compose
> profile, and the current branch still has failing test groups to close.

### Questions to expect

**Why hybrid retrieval?**  
Dense retrieval handles semantic similarity; BM25 recovers exact names,
neighborhoods, and rare terms. RRF combines ranks without requiring calibrated
score scales.

**Why `IndexFlatIP`?**  
At 2,262 venues, exact search is simple and fast enough. With normalized
vectors, inner product represents cosine similarity. Approximate indexes would
add operational complexity before scale requires them.

**Why a cross-encoder?**  
Bi-encoders retrieve efficiently but score query and document independently.
A cross-encoder jointly reads each candidate with the query and can improve
ordering, at higher latency and memory cost. That cost is why it is optional
and disabled in the default Compose stack. Hybrid retrieval was already useful,
while CPU re-ranking delayed the first visible chat output. The implementation
was retained for controlled experiments rather than applied to every request.

**How did you prevent hallucinations?**  
The system grounds prompts in retrieved venues, returns structured citations,
links citations to canonical venue IDs, and tests abstention/citation behavior.
This reduces risk but does not prove hallucinations are eliminated.

**What would you improve next?**  
Fix the red test suites, establish CI gates, expand and independently label the
benchmark, measure latency and quality with the cross-encoder on/off, evaluate
new embeddings without contaminating the baseline, add distributed rate
limits, and deploy actual metrics collection before claiming production
observability.

## Documentation classification

| Location | Classification |
|----------|----------------|
| `docs/README.md`, `TESTING.md`, `SECURITY.md`, this document | Maintained current documentation |
| `docs/artifacts.md`, `cache-inventory.md`, `index-pipeline.md`, `llm-runtime.md` | Maintained operator documentation |
| `docs/baseline-verification.md` | Historical phase evidence |
| `Organisation/**/*.docx`, `Organisation/*.xlsx` | Historical planning and project-management artifacts |
| `ModelExplain.ipynb` | Historical model explanation |
| `models/**/README.md` | Upstream model cards, not application capability claims |
| `.planning/phases/**` | Phase execution records; useful evidence but not current full-suite status |
| `test-reports/**` | Dated historical reports; see `test-reports/README.md` |

## Documentation audit notes

- All tracked Markdown and text capability/operator documents were checked
  against code, configuration, tests, and branch history.
- The tracked meeting agendas, brainstorming document, Trello note, and sprint
  document were extracted. They are 2025 planning records, unchanged between
  `main` and v2, and contain proposed features that must not be read as shipped
  behavior.
- `ModelExplain.ipynb` was inspected. It explains a proposed/implemented LSTM
  architecture and resource constraints, but it is not a reproducible training
  or current serving specification.
- Upstream model READMEs describe the downloaded models, not Urban Gala's
  runtime enablement or benchmark results.
- `Organisation/User stories_Urban Gala.xlsx` and
  `test-reports/Usability Testing Data.xlsx` are unchanged historical
  spreadsheets. Their workbook contents could not be programmatically audited
  in this session because the required spreadsheet inspection runtime was not
  available. They are therefore not certified as current source-of-truth
  documents and are explicitly classified as historical.
