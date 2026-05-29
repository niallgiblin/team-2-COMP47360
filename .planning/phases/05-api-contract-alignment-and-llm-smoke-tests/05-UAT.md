---
status: complete
phase: 05-api-contract-alignment-and-llm-smoke-tests
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
  - 05-05-SUMMARY.md
  - 05-06-SUMMARY.md
started: 2026-05-26T18:15:37Z
updated: 2026-05-26T20:34:30Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running frontend, Spring backend, and LLM service processes. Start the application from scratch using the normal project commands. The services boot without startup errors, test fixtures or migrations do not fail, and a primary health check or homepage/API load returns live data.
result: pass
reported: "urban-gala-llm fails to boot under docker compose with ModuleNotFoundError: No module named 'jwt' at /app/app.py import jwt; gunicorn worker exits with code 3 and dependent services fail unhealthy."
severity: blocker
resolved: "Added PyJWT==2.10.1 to requirements.in, regenerated requirements.txt, rebuilt llm-service, started urban-gala-llm, confirmed Docker healthy status and successful in-container /health response."

### 2. LLM Health and Search Smoke
expected: With the LLM service running in the local test harness, the health endpoint responds successfully and search requests return the documented envelope with success, results, and confidence fields without loading live Hugging Face artifacts.
result: pass

### 3. Similar Locations Contract
expected: Sending a similar-location request with venue fields such as name, zone, loc_type, and limit returns similar results, excludes the original venue by name, and uses the same success/results/confidence envelope as search.
result: pass

### 4. Spring Similar API Source Indicator
expected: Calling the Spring similar-locations API returns similarLocations and totalResults, plus a top-level source field showing ml when ML results are used or category when the fallback is used.
result: pass

### 5. Typed ML Response Mapping
expected: Spring maps ML search, similar, and busyness fixture responses into typed DTO/domain objects without runtime cast errors, preserving location fields, ratings, coordinates, predictions, and forecast data.
result: pass

### 6. Chat History Contract
expected: Sending chat messages from the frontend adapter posts message and previous_questions to Flask, includes only prior user messages, omits the old history key, and receives the normal response envelope.
result: pass

### 7. Contract Fixture Coverage
expected: The shared contract fixtures and README describe the search, similar, busyness, forecast, and chat shapes, and both Java and Python tests consume those fixtures or documented shapes successfully.
result: pass

### 8. ML Client Boundary
expected: Spring ML HTTP calls are isolated in MlServiceClient, while VibeService delegates to it and continues to handle caching, enrichment, and orchestration without direct RestTemplate ML calls.
result: pass

### 9. FindMyVibe MAINT-02 Scope Check
expected: Either FindMyVibe API/enrichment/cache behavior has been extracted into focused modules with tests, or the phase verification explicitly documents and accepts the intentional MAINT-02 descope.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Kill any running frontend, Spring backend, and LLM service processes. Start the application from scratch using the normal project commands. The services boot without startup errors, test fixtures or migrations do not fail, and a primary health check or homepage/API load returns live data."
  status: resolved
  reason: "User reported: urban-gala-llm fails to boot under docker compose with ModuleNotFoundError: No module named 'jwt' at /app/app.py import jwt; gunicorn worker exits with code 3 and dependent services fail unhealthy."
  severity: blocker
  test: 1
  root_cause: "BackEnd/llm-service/app.py imports the PyJWT module as jwt, but BackEnd/llm-service/requirements.in omits PyJWT. The LLM Dockerfile recompiles requirements.txt from requirements.in during image build, so the container image does not install PyJWT even though the checked-in requirements.txt currently contains PyJWT==2.10.1."
  artifacts:
    - path: "BackEnd/llm-service/app.py"
      issue: "Imports jwt and InvalidTokenError at module import time, so gunicorn worker boot fails when PyJWT is absent."
    - path: "BackEnd/llm-service/requirements.in"
      issue: "Missing PyJWT dependency used by app.py and tests/conftest.py."
    - path: "BackEnd/llm-service/Dockerfile"
      issue: "Runs pip-compile requirements.in -o requirements.txt, making requirements.in the Docker source of truth."
  missing:
    - "Resolved: PyJWT==2.10.1 added to BackEnd/llm-service/requirements.in."
    - "Resolved: BackEnd/llm-service/requirements.txt regenerated from requirements.in."
    - "Resolved: llm-service rebuilt and verified healthy under docker compose."
  debug_session: ".planning/phases/05-api-contract-alignment-and-llm-smoke-tests/05-07-PLAN.md"
