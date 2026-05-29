# Roadmap: Manhattan Busyness Predictor

## Milestones

- ✅ **v0.1 Address Codebase Concerns** — Phases 1–10 (shipped 2026-05-29) — [archive](milestones/v0.1-ROADMAP.md)
- 🚧 **v0.2 Evaluated RAG for Location Discovery** — Phases 11–16 (in progress)

## Overview

v0.2 upgrades the existing LLM search and chat stack into an explicit, evaluated RAG system on the v0.1 hardened foundation. Work proceeds from corpus design through reproducible indexing, unified FAISS retrieval, grounded generation with citations, automated benchmark eval, and portfolio documentation.

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 11 | 3/3 | Complete   | 2026-05-29 |
| 12 | Embedding and Index Pipeline | Reproducible build replacing static `.npy` workflow | RAG-02 |
| 13 | Unified Retrieval Layer | FAISS-backed search shared by vibe and chat | RAG-03, RAG-04 |
| 14 | Grounded Generation and Citations | RAG prompts, structured citation contract, prompt registry | RAG-05, RAG-06 |
| 15 | Evaluation Harness | 30–50 question benchmark, metrics, local/CI runner | RAG-07, RAG-08, RAG-09 |
| 16 | Documentation and Portfolio Closure | Architecture diagram, eval results, portfolio one-liner | RAG-10 |

## Phases

<details>
<summary>✅ v0.1 Address Codebase Concerns (Phases 1–10) — SHIPPED 2026-05-29</summary>

- [x] Phase 1: Planning Baseline and Artifact Policy (3/3 plans) — completed 2026-05-25
- [x] Phase 2: Frontend Production Runtime and API Client (3/3 plans) — completed 2026-05-25
- [x] Phase 3: Secret and Runtime Configuration Hygiene (5/5 plans) — completed 2026-05-25
- [x] Phase 4: Security Boundary and Abuse Controls (8/8 plans) — completed 2026-05-29
- [x] Phase 5: API Contract Alignment and LLM Smoke Tests (7/7 plans) — completed 2026-05-26
- [x] Phase 6: Busyness Service Reliability and Model Safety (4/4 plans) — completed 2026-05-26
- [x] Phase 7: LLM Search Scaling and Python Service Maintainability (5/5 plans) — completed 2026-05-26
- [x] Phase 8: Map, Forecast, Routing, and External API Correctness (6/6 plans) — completed 2026-05-27
- [x] Phase 9: Persistence, Import, and Auth Flow Safety (5/5 plans) — completed 2026-05-28
- [x] Phase 10: Cache Ownership, Map Scaling, and Docker Smoke Closure (5/5 plans) — completed 2026-05-29

Full phase details: [milestones/v0.1-ROADMAP.md](milestones/v0.1-ROADMAP.md)

</details>

### 🚧 v0.2 Evaluated RAG for Location Discovery (In Progress)

**Milestone Goal:** Deliver an evaluated RAG system with versioned corpus, reproducible FAISS indexing, unified retrieval, grounded citations, prompt tracking, and automated benchmark quality gates.

#### Phase 11: RAG Architecture and Corpus Design

**Goal:** Define the versioned venue corpus layout, per-venue document model, and artifact metadata schema that all downstream RAG work builds on.

**Depends on:** v0.1 complete (Phases 5, 7 artifact policy and LLM module split)

**Requirements:** RAG-01

**Plans:** 3/3 plans complete

Plans:
**Wave 1**
- [x] 11-01-PLAN.md — Wave 0: venue_corpus package skeleton, fixture corpus, red pytest stubs
- [x] 11-02-PLAN.md — Wave 1: migrate corpus/v1, manifest.json, SCHEMA.md, document model

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 11-03-PLAN.md — Wave 2: config/loader/Compose/docs integration, full suite green

**Success Criteria** (what must be TRUE):
1. Maintainer can locate a versioned corpus directory (e.g., `corpus/v1/`) with schema documentation describing venue fields used for retrieval.
2. Each venue maps to one retrievable document composed of name, description, zone, price tier, tags, and optional busyness summary text.
3. Corpus checksum and version metadata integrate with the v0.1 artifact manifest policy.
4. Architecture decision record or phase CONTEXT captures FAISS-first, one-doc-per-venue, and unified-retrieval direction from v0.2 planning.

#### Phase 12: Embedding and Index Pipeline

**Goal:** Replace manual `.npy` regeneration with a documented CLI that encodes the corpus, builds a persisted FAISS index, and writes build metadata.

**Depends on:** Phase 11

**Requirements:** RAG-02

**Plans:** TBD

**Success Criteria** (what must be TRUE):
1. Maintainer can run a single documented pipeline command that reads the versioned corpus and produces index artifacts without hand-editing embedding files.
2. Build metadata records embedding model ID, dimensions, corpus checksum, and build timestamp.
3. Pipeline exits non-zero with actionable errors on missing corpus, dimension mismatch, or write failures without corrupting a good index.
4. v0.1 env-driven path and checksum patterns extend to index artifacts.

#### Phase 13: Unified Retrieval Layer

**Goal:** Extract a shared retrieval module backed by FAISS that serves both vibe search and chat with consistent ranking and metadata filters.

**Depends on:** Phase 12

**Requirements:** RAG-03, RAG-04

**Plans:** TBD

**Success Criteria** (what must be TRUE):
1. Vibe search query path uses FAISS index lookup instead of full-corpus brute-force similarity over all rows.
2. Search and chat invoke the same retrieval service for a given query and filter set.
3. Zone and price filters exclude out-of-constraint venues from retrieved candidates before generation.
4. Health endpoint reports index readiness separately from model readiness; missing index returns stable client-safe errors.
5. Existing v0.1 search smoke tests and Spring contract tests remain compatible (response shape may extend additively).

#### Phase 14: Grounded Generation and Citations

**Goal:** Upgrade chat (and optionally search) to RAG prompts with numbered sources and structured citation payloads; add versioned prompt registry.

**Depends on:** Phase 13

**Requirements:** RAG-05, RAG-06

**Plans:** TBD

**Success Criteria** (what must be TRUE):
1. Chat API response includes a `citations` array with venue ID, display name, snippet, and similarity score for grounded answers.
2. Answers reference venues that were actually retrieved; empty retrieval yields explicit "no matching venues" rather than invented venues.
3. Versioned prompt template file exists (e.g., `prompts/rag-v1.yaml`) pinned to corpus/index/model metadata.
4. Unanswerable questions (wrong borough, fake venue) yield safe decline or uncertainty, not fabricated venue names.
5. v0.1 JWT, rate limits, and CORS policies remain enforced on RAG endpoints.

#### Phase 15: Evaluation Harness

**Goal:** Ship a 30–50 question benchmark dataset and automated eval runner reporting retrieval recall@5, citation faithfulness, and adversarial/abstention pass rates.

**Depends on:** Phase 14

**Requirements:** RAG-07, RAG-08, RAG-09

**Plans:** TBD

**Success Criteria** (what must be TRUE):
1. Benchmark JSONL contains 30–50 gold questions across retrieval, filtered search, conversational, adversarial, and abstention categories with expected venue IDs.
2. Documented eval command runs retrieval metrics deterministically without live Hugging Face calls.
3. Eval reports recall@5, citation accuracy, and adversarial/abstention pass rates with per-question failure detail on breach.
4. Benchmark question such as "quiet coffee shop in Greenwich Village" returns at least one expected venue ID in top-5 retrieved results.
5. Optional live generation eval path is documented separately from deterministic CI retrieval checks.

#### Phase 16: Documentation and Portfolio Closure

**Goal:** Close the milestone with architecture diagram, eval results table, portfolio one-liner, and verified end-to-end acceptance in production-like Compose stack.

**Depends on:** Phase 15

**Requirements:** RAG-10

**Plans:** TBD

**Success Criteria** (what must be TRUE):
1. README or docs section includes architecture diagram showing corpus → pipeline → FAISS → retrieval → generation → citations → eval flow.
2. Eval results table from Phase 15 benchmark is published in milestone documentation.
3. Portfolio one-liner summarizes evaluated RAG with retrieval, citations, and hallucination testing.
4. Documented live-stack walkthrough passes: search → chat with citations → eval report in Docker Compose environment.
5. All v0.1 regression smoke tests still pass with RAG extensions enabled.

## Progress

**Execution Order:** Phases 11 → 12 → 13 → 14 → 15 → 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–10 | v0.1 | 51/51 | Complete | 2026-05-29 |
| 11 | v0.2 | 0/3 | Not started | — |
| 12 | v0.2 | 0/TBD | Not started | — |
| 13 | v0.2 | 0/TBD | Not started | — |
| 14 | v0.2 | 0/TBD | Not started | — |
| 15 | v0.2 | 0/TBD | Not started | — |
| 16 | v0.2 | 0/TBD | Not started | — |

## Next

**Phase 11: RAG Architecture and Corpus Design** — Define versioned corpus schema, document model, and artifact layout.

`/gsd-discuss-phase 11` — gather context and clarify approach

Also: `/gsd-plan-phase 11` — skip discussion, plan directly

---
*Last updated: 2026-05-29 — Milestone v0.2 roadmap created*
