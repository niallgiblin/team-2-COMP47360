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

## Next Milestone Goals

Run `/gsd-new-milestone` to define v0.2. Candidate themes from v0.1 deferrals:
- Production observability (OBS-01)
- Map vector tiling at 10k+ locations
- CI Docker smoke on every PR
- Model retraining pipeline (MODEL-01)

## Requirements

### Validated (v0.1)

All 54 v0.1 requirements validated — see `.planning/milestones/v0.1-REQUIREMENTS.md` for full traceability.

### Active

(None — define via `/gsd-new-milestone`)

### Out of Scope

- Net-new product features unrelated to audited concerns (v0.1 scope)
- Wholesale framework rewrites
- Full cloud production migration
- Model accuracy improvement / retraining (separate milestone)
- UI redesign beyond correctness fixes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `.planning/codebase/CONCERNS.md` as milestone source of truth | User requested roadmap addressing all concerns | ✓ Good — 54/54 requirements mapped |
| Skip research for v0.1 | Remediation of existing code, not new features | ✓ Good |
| Start GSD at v0.1 | Existing code predates GSD | ✓ Good |
| Continue with existing stack | Rewrites add risk | ✓ Good — all phases shipped in-stack |
| Git LFS for ML artifacts | Pragmatic runtime delivery | ✓ Good — checksum verification added |
| FAISS for LLM search | Reduce full-corpus scan | ✓ Good — 16-example parity verified |
| Viewport bbox for map-data (Phase 10) | Staged scaling path | ✓ Good — deferred full tiling to v0.2 |

## Constraints

- **Stack compatibility:** React/Vite, Spring Boot, Flask, MySQL, Docker Compose
- **Source-control hygiene:** No blind artifact deletion; documented paths and checksums
- **Security:** Secrets via env vars; rotation runbook in docs/SECURITY.md
- **Deployment:** Docker Compose primary orchestration path

---
*Last updated: 2026-05-29 after v0.1 milestone*
