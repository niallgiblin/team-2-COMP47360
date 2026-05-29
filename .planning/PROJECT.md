# Manhattan Busyness Predictor

## What This Is

Manhattan Busyness Predictor is a full-stack travel planning application for exploring Manhattan venues, estimating live and forecasted busyness, finding places by vibe, and saving or sharing plans. The system combines a React/Vite frontend, a Spring Boot API, MySQL persistence, and Python ML services for semantic search, chat, and busyness prediction.

After v0.1, the codebase has production-like Docker deployment, hardened security boundaries, aligned API contracts, bounded caches, Flyway-managed schema, and comprehensive test coverage across frontend, backend, and Python services.

## Core Value

Users can reliably discover, compare, route to, and plan venue visits using trustworthy busyness and location intelligence.

## Current State (v0.1 shipped 2026-05-29)

**Shipped:** Milestone v0.1 — Address Codebase Concerns (10 phases, 51 plans, 54 requirements)

**Stack:** React 19/Vite frontend, Spring Boot 3.5 Java 17 backend, MySQL + Flyway, Flask LLM + busyness services, Docker Compose

**Key capabilities delivered:**
- Static Nginx frontend production image with consolidated API client
- Env-driven secrets, ML paths, and fail-fast startup validation
- Rate limits, CORS allowlists, avatar byte validation, safe error envelopes
- Typed Spring↔Flask contracts, FAISS search, checksum-gated model loading
- Map/forecast/route bug fixes, bbox map-data filtering, bounded caches
- Flyway migrations, OpenCSV import, JWT-only plan auth
- compose-smoke.sh prod stack verification script

**Archive:** `.planning/milestones/v0.1-ROADMAP.md`, `.planning/milestones/v0.1-REQUIREMENTS.md`

## Current Milestone: v0.2 Evaluated RAG for Location Discovery

**Goal:** Upgrade the existing LLM search and chat stack into an explicit, evaluated Retrieval-Augmented Generation system with versioned corpus, reproducible indexing, unified retrieval, grounded citations, and an automated benchmark harness.

**Target features:**
- Versioned venue corpus with documented schema and checksum (RAG-01)
- Reproducible embedding and FAISS index build pipeline (RAG-02, RAG-03)
- Unified retrieval layer shared by vibe search and chat (RAG-04)
- Grounded LLM answers with structured venue citations (RAG-05)
- Versioned prompt template registry (RAG-06)
- 30–50 question benchmark with automated eval for recall, citation faithfulness, and abstention (RAG-07–RAG-09)
- Portfolio-ready architecture docs and eval summary (RAG-10)

**Context:** `.planning/milestones/v0.2-evaluated-rag-for-location-discovery/v0.2-CONTEXT.md`

## Requirements

### Validated (v0.1)

All 54 v0.1 requirements validated — see `.planning/milestones/v0.1-REQUIREMENTS.md` for full traceability.

### Active (v0.2)

RAG-01 through RAG-10 — see `.planning/REQUIREMENTS.md`

### Out of Scope

- PostgreSQL/pgvector migration, Chroma/Qdrant, or external vector DB deployment
- LLM provider swap (OpenAI, Anthropic, local Ollama)
- Model retraining or embedding fine-tuning (MODEL-01)
- Real-time corpus ingest or venue admin UI
- MLflow, LangSmith, or full experiment tracking platform
- Production observability dashboards (OBS-01)
- UI redesign beyond minimal citation display
- Multimodal RAG (images, maps)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `.planning/codebase/CONCERNS.md` as milestone source of truth | User requested roadmap addressing all concerns | ✓ Good — 54/54 requirements mapped |
| Skip research for v0.1 | Remediation of existing code, not new features | ✓ Good |
| Start GSD at v0.1 | Existing code predates GSD | ✓ Good |
| Continue with existing stack | Rewrites add risk | ✓ Good — all phases shipped in-stack |
| Git LFS for ML artifacts | Pragmatic runtime delivery | ✓ Good — checksum verification added |
| FAISS for LLM search | Reduce full-corpus scan | ✓ Good — 16-example parity verified |
| Viewport bbox for map-data (Phase 10) | Staged scaling path | ✓ Good — full tiling deferred |
| FAISS-first in-process vector store for v0.2 | Small corpus, no new infra | Pending — v0.2 planning |
| One document per venue for RAG corpus | Human-readable citations | Pending — v0.2 planning |
| Unified retrieval for search + chat | Consistent results, single eval surface | Pending — v0.2 planning |
| Hugging Face generation unchanged for v0.2 | Focus on retrieval, grounding, eval | Pending — v0.2 planning |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

## Constraints

- **Stack compatibility:** React/Vite, Spring Boot, Flask, MySQL, Docker Compose
- **Source-control hygiene:** No blind artifact deletion; documented paths and checksums
- **Security:** Secrets via env vars; RAG endpoints inherit v0.1 JWT, rate limits, CORS
- **Deployment:** Docker Compose primary orchestration path; no new services for v0.2
- **Compatibility:** Citation fields are additive; existing vibe search and chat clients must not break

---
*Last updated: 2026-05-29 — Milestone v0.2 started*
