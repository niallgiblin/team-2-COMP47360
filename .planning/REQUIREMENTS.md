# Requirements: Manhattan Busyness Predictor

**Defined:** 2026-05-25
**Milestone:** v0.1 Address Codebase Concerns
**Core Value:** Users can reliably discover, compare, route to, and plan venue visits using trustworthy busyness and location intelligence.

## v0.1 Requirements

### Repository and Artifact Governance

- [x] **ART-01**: Developer can clone and review the repository without generated build outputs such as `BackEnd/target/` being tracked as source.
- [x] **ART-02**: Developer can identify which ML model and embedding artifacts are source-owned metadata versus externally managed runtime artifacts.
- [x] **ART-03**: Runtime services can load model weights, embedding files, and data files through documented `MODEL_PATH`, `DATA_PATH`, and `EMBEDDINGS_PATH` style configuration.
- [x] **ART-04**: Maintainer can verify model artifact provenance with documented checksums or release references before deployment.

### Deployment and Configuration

- [x] **DEP-01**: Operator can run the frontend production container as a static Nginx build artifact rather than a Vite dev server.
- [x] **DEP-02**: Developer can use one frontend API client boundary for API base URL resolution and auth header attachment.
- [x] **DEP-03**: Frontend API calls behave consistently across local Vite proxy, Docker Compose, and Nginx deployment paths.
- [x] **DEP-04**: Developer can run Python ML services locally without manually mirroring Docker-only `/app/...` paths.
- [x] **DEP-05**: Operator can configure Java, Flask, and frontend services through non-secret examples while real secrets stay out of committed config.

### Security and Abuse Controls

- [x] **SEC-01**: Operator can deploy without committed database credentials or JWT signing material in Spring configuration.
- [x] **SEC-02**: Operator has a documented rotation checklist for any secrets that were previously committed.
- [ ] **SEC-03**: Public expensive endpoints for search, chat, map data, busyness, prediction, and exports are authenticated or rate-limited according to product flow.
- [ ] **SEC-04**: Flask CORS policies are restricted to configured frontend origins instead of broad defaults.
- [x] **SEC-05**: Busyness service model loading avoids unsafe Keras deserialization unless verified trusted artifacts require it.
- [ ] **SEC-06**: Authenticated avatar uploads validate image content by bytes and allowed extension, not only client content type.
- [ ] **SEC-07**: API error responses expose stable client-safe messages while internal exception details remain server-side.
- [ ] **SEC-08**: Browser-exposed Google API key usage is documented with referrer/API restrictions or routed through a backend proxy with user-level limits.

### API and Service Contracts

- [x] **API-01**: Similar-location search either implements the Flask `/similar` endpoint or updates the Spring caller to use a tested supported endpoint.
- [x] **API-02**: Chat widget requests use the same history field and route that the Flask `/api/chat` endpoint accepts.
- [x] **API-03**: Java service clients deserialize ML service responses through typed DTOs instead of raw map casting.
- [x] **API-04**: Frontend contract tests cover relative `/api/vibe/*`, plan sharing, favourites, chat configuration, and auth-expiry error handling.
- [x] **API-05**: Spring-to-Flask contract tests verify search, similar-location, busyness, forecast, and chat payload shapes.

### ML Service Reliability

- [x] **ML-01**: LLM service startup, `/health`, `/search`, and `/api/chat` paths are covered by Python smoke tests.
- [x] **ML-02**: Busyness service startup, `/health`, `/busyness`, live prediction, forecast, weather fallback, and normalization are covered by Python smoke tests.
- [x] **ML-03**: ML service caches have explicit maximum size, TTL, and invalidation or refresh behavior.
- [x] **ML-04**: LLM service worker and memory behavior is measured or documented for the current Gunicorn preload configuration.
- [x] **ML-05**: Python runtime versions are aligned or explicitly justified with compatibility notes and smoke-test coverage.
- [x] **ML-06**: Keras model compatibility is verified by startup tests for every required model artifact.

### Frontend Map, Routing, and Forecast Correctness

- [x] **MAP-01**: Forecast timestamp generation returns 12 hourly labels for 12-hour forecast data.
- [x] **MAP-02**: Directions step rendering displays distance and duration from the correct route response fields.
- [x] **MAP-03**: Multi-stop directions reuse route legs and polylines instead of making duplicate per-segment external route calls.
- [x] **MAP-04**: Frontend map and vibe flows use backend-provided canonical `zoneId` when available and only fall back to polygon lookup when required.
- [x] **MAP-05**: Map and directions tests cover multi-stop route generation, fallback polylines, forecast alignment, Google Routes failures, and polygon edge cases.

### Performance and Scaling

- [x] **PERF-01**: Busyness service separates or caches live and forecast prediction work so one cache miss does not unnecessarily run all model paths twice.
- [x] **PERF-02**: Busyness forecasts can be precomputed, batched, or cached by input and forecast hour.
- [x] **PERF-03**: LLM semantic search avoids full DataFrame copies and full-corpus sort work where candidate limiting or vector indexing is available.
- [x] **PERF-04**: Route planning caches route segments by origin, destination, and mode.
- [ ] **PERF-05**: Map data can be paginated, tiled, or viewport-filtered instead of returning all locations for every map load.
- [x] **PERF-06**: Java vibe search cache is bounded with maximum size in addition to TTL.

### Data and Persistence

- [ ] **DATA-01**: Database schema changes are managed through an explicit migration workflow rather than implicit JPA drift.
- [ ] **DATA-02**: CSV import uses a parser library that handles quoted fields and supports deterministic upsert/version behavior.
- [ ] **DATA-03**: `Location` construction preserves `information`, `summary`, and `tags` when those values are provided.
- [ ] **DATA-04**: Plan controller authentication uses stateless JWT principal injection consistently without HTTP session fallback.

### Maintainability and Decomposition

- [x] **MAINT-01**: `MapView.jsx` route fetching, route processing, polygon enrichment, and directions calls are extracted into focused modules with tests.
- [x] **MAINT-02**: `FindMyVibe.jsx` API calls, enrichment, and caching behavior are extracted into focused modules with tests.
- [x] **MAINT-03**: `VibeService.java` separates ML service client calls, response mapping, cache ownership, and business response assembly.
- [x] **MAINT-04**: `BackEnd/llm-service/app.py` separates endpoint handlers from model loading, search, cache, and chat integration logic.
- [ ] **MAINT-05**: Browser and process-global caches are replaced or wrapped by explicit cache owners with clear refresh paths.

### Testing and Verification

- [x] **TEST-01**: Concern remediation starts with a baseline test matrix covering backend, frontend, Python services, and Docker smoke checks.
- [ ] **TEST-02**: Security tests cover public versus authenticated routes, expensive endpoint controls, CORS, uploads, JWT failures, and exception payloads.
- [x] **TEST-03**: Frontend service tests cover the single API client, relative production routes, chat URL configuration, and auth header behavior.
- [x] **TEST-04**: Python service tests run locally without requiring production model paths or live external services.
- [ ] **TEST-05**: Docker Compose smoke checks verify frontend static serving, backend health, LLM health, busyness health, and proxy routing.
- [x] **TEST-06**: Every roadmap phase has observable success criteria and maps all completed code changes back to requirement IDs.

## v0.2 Requirements

Deferred to a future milestone unless discovered as necessary during v0.1 execution.

- **OBS-01**: Operator can monitor production latency, error rates, model load time, and external API quota use through structured metrics and alerts.
- **ADMIN-01**: Admin can inspect and manage expensive endpoint usage by user or IP.
- **MODEL-01**: Maintainer can run a formal model retraining and accuracy evaluation pipeline.
- **MOBILE-01**: Mobile-specific route planning and offline behavior are designed and tested.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New recommendation product features | The milestone is focused on remediating audited concerns, not expanding user-facing scope. |
| Replacing Spring Boot, React, Flask, or MySQL | Current risks can be addressed within the existing architecture. |
| Full cloud infrastructure provisioning | Deployment readiness is in scope; selecting and building a hosting platform is not. |
| Model retraining for better predictions | Artifact safety and runtime reliability are in scope; model quality is a separate effort. |
| UI redesign | UI changes should be limited to what is needed for correctness, routing, and error handling. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ART-01 | Phase 1 | Complete |
| ART-02 | Phase 1 | Complete |
| ART-03 | Phase 1 | Complete |
| ART-04 | Phase 1 | Complete |
| DEP-01 | Phase 2 | Complete |
| DEP-02 | Phase 2 | Complete |
| DEP-03 | Phase 2 | Complete |
| DEP-04 | Phase 3 | Complete |
| DEP-05 | Phase 3 | Complete |
| SEC-01 | Phase 3 | Complete |
| SEC-02 | Phase 3 | Complete |
| SEC-03 | Phase 4 | Pending |
| SEC-04 | Phase 4 | Pending |
| SEC-05 | Phase 6 | Complete |
| SEC-06 | Phase 4 | Pending |
| SEC-07 | Phase 4 | Pending |
| SEC-08 | Phase 8 | Pending |
| API-01 | Phase 5 | Complete |
| API-02 | Phase 5 | Complete |
| API-03 | Phase 5 | Complete |
| API-04 | Phase 2 | Complete |
| API-05 | Phase 5 | Complete |
| ML-01 | Phase 5 | Complete |
| ML-02 | Phase 6 | Complete |
| ML-03 | Phase 6 | Complete |
| ML-04 | Phase 7 | Complete |
| ML-05 | Phase 7 | Complete |
| ML-06 | Phase 6 | Complete |
| MAP-01 | Phase 8 | Complete |
| MAP-02 | Phase 8 | Complete |
| MAP-03 | Phase 8 | Complete |
| MAP-04 | Phase 8 | Complete |
| MAP-05 | Phase 8 | Complete |
| PERF-01 | Phase 6 | Complete |
| PERF-02 | Phase 6 | Complete |
| PERF-03 | Phase 7 | Complete |
| PERF-04 | Phase 8 | Complete |
| PERF-05 | Phase 10 | Pending |
| PERF-06 | Phase 7 | Complete |
| DATA-01 | Phase 9 | Pending |
| DATA-02 | Phase 9 | Pending |
| DATA-03 | Phase 9 | Pending |
| DATA-04 | Phase 9 | Pending |
| MAINT-01 | Phase 8 | Complete |
| MAINT-02 | Phase 5 | Complete |
| MAINT-03 | Phase 5 | Complete |
| MAINT-04 | Phase 7 | Complete |
| MAINT-05 | Phase 10 | Pending |
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 2 | Complete |
| TEST-04 | Phase 5 | Complete |
| TEST-05 | Phase 10 | Pending |
| TEST-06 | Phase 1 | Complete |

**Coverage:**
- v0.1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0

---
*Requirements defined: 2026-05-25*
*Last updated: 2026-05-25 after milestone v0.1 roadmap creation*
