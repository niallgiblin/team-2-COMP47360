# Manhattan Busyness Predictor

## What This Is

Manhattan Busyness Predictor is a full-stack travel planning application for exploring Manhattan venues, estimating live and forecasted busyness, finding places by vibe, and saving or sharing plans. The system combines a React/Vite frontend, a Spring Boot API, MySQL persistence, and Python ML services for semantic search, chat, and busyness prediction.

## Core Value

Users can reliably discover, compare, route to, and plan venue visits using trustworthy busyness and location intelligence.

## Current Milestone: v0.1 Address Codebase Concerns

**Goal:** Convert every finding in `.planning/codebase/CONCERNS.md` into a prioritized, testable remediation roadmap that improves deployment readiness, security, API consistency, ML reliability, performance, maintainability, and verification coverage.

**Target features:**
- Establish repository, artifact, configuration, and deployment hygiene for production-like builds.
- Close high-risk security and abuse-control gaps around secrets, CORS, public ML endpoints, uploads, errors, and browser API keys.
- Align frontend, Spring, and Flask API contracts for chat, similar-location search, busyness, routing, and map data flows.
- Add Python service smoke tests, frontend contract tests, backend security tests, and roadmap traceability for every concern.
- Reduce performance and scaling risks in ML inference, semantic search, route planning, map payloads, and cache ownership.
- Decompose fragile high-risk modules only where it directly supports tested concern remediation.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Repository artifacts, generated outputs, and ML binaries have an explicit source-control and runtime loading policy. Validated in Phase 1: Planning Baseline and Artifact Policy.
- [x] Frontend production container serves static Nginx assets with relative `/api` routing and consolidated API client boundary. Validated in Phase 2: Frontend Production Runtime and API Client.
- [x] Frontend chat, Spring DTO/client boundaries, Flask `/similar`, and LLM smoke/cold-start paths share tested contracts. Validated in Phase 5: API Contract Alignment and LLM Smoke Tests.
- [x] Busyness service has checksum-gated model loading, bounded live/forecast caches, and artifact-free pytest coverage. Validated in Phase 6: Busyness Service Reliability and Model Safety.

### Active

<!-- Current scope. Building toward these. -->
- [ ] Frontend, backend, and Python services can run in production-like containers without dev servers or hard-coded local assumptions (partial — frontend prod path complete; Python path hygiene in Phase 3).
- [ ] Public and authenticated API boundaries are secure, rate-limited where expensive, and tested.
- [ ] LLM service has bounded search cache and modular internals (busyness cache/model safety complete in Phase 6).
- [ ] Map, route, forecast, and vibe workflows have correctness tests for the known bugs listed in the concern audit.
- [ ] Performance bottlenecks have concrete remediation paths for prediction, vector search, routing, enrichment, and map payload size.
- [ ] Database evolution, CSV import, and fragile controller/entity paths have safer tested patterns.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Net-new product features unrelated to `.planning/codebase/CONCERNS.md` - this milestone is remediation and hardening.
- Wholesale framework rewrites - risk reduction should use existing React, Spring Boot, Flask, MySQL, Docker, and test tooling.
- Model accuracy improvement or retraining as a product objective - model handling and safety are in scope, but prediction quality work belongs in a separate milestone.
- Full cloud production migration - this milestone prepares the codebase for safer deployment but does not pick or provision a hosting platform.

## Context

- The concern audit was created on 2026-05-25 and identifies tech debt, known bugs, security considerations, performance bottlenecks, fragile areas, scaling limits, dependency risks, missing critical features, and test gaps.
- The main architecture is a React 19/Vite frontend, Spring Boot 3.5 Java 17 backend, MySQL database, Flask LLM service, and Flask/TensorFlow busyness prediction service.
- Large model/data artifacts and generated build output currently live beside source code, making reviews, clones, Docker contexts, and provenance harder to manage.
- Frontend production packaging serves static assets through Nginx with prod Compose profile; API URLs centralized via `apiUrls.js` / `apiService.js` with contract tests (Phase 2 complete).
- Several API contracts are inconsistent across frontend, Spring, and Flask services, especially chat payload shape, similar-location search, and map/busyness flows.
- The highest deployment risks are secret handling, public expensive endpoints, permissive CORS, unsafe Keras loading, upload validation, exception leakage, and browser-exposed Google API key controls.
- Python ML services have no detected local tests, while frontend and backend tests do not yet cover several complex contract and security boundaries.

## Constraints

- **Stack compatibility:** Keep React/Vite, Spring Boot, Flask, MySQL, Docker Compose, Vitest, Cypress, JUnit, and pytest-style Python tests unless a phase proves a narrower replacement is required.
- **Source-control hygiene:** Do not remove user data or model artifacts without a migration path and clear artifact storage/loading documentation.
- **Security:** Treat committed secret values as exposed and plan rotation/documentation work alongside code changes.
- **ML runtime:** Model loading changes must preserve existing service startup behavior until checksum and artifact-path tests are in place.
- **Deployment:** Docker Compose remains the primary local orchestration path while production-like container behavior is hardened.
- **Scope:** Every roadmap phase must trace back to one or more items in `.planning/codebase/CONCERNS.md`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `.planning/codebase/CONCERNS.md` as the milestone source of truth | The user requested a roadmap addressing all concerns, and the audit already groups the risk surface | Pending |
| Skip research for this milestone | The scope is existing-code remediation rather than new feature/domain discovery | Pending |
| Start GSD planning at `v0.1` | Existing code predates GSD milestone tracking, so this is the first planning milestone rather than an initial product release | Pending |
| Continue with existing stack | Most risks are configuration, contracts, tests, and architecture boundaries; a rewrite would add risk | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? Move to Out of Scope with reason
2. Requirements validated? Move to Validated with phase reference
3. New requirements emerged? Add to Active
4. Decisions to log? Add to Key Decisions
5. "What This Is" still accurate? Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-26 after Phase 6 completion*
