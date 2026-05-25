# Baseline Verification Matrix

Tiered verification record for Phase 1 and downstream remediation. Required-pass checks are limited to metadata and artifact policy gates expected to pass after plans 01-01 and 01-02. Application tests, Docker runtime smoke, and Python service smoke are documented as known gaps, manual tiers, or missing placeholders — not Phase 1 required gates.

Related policy: [artifacts.md](artifacts.md) · Planning traceability: [.planning/REQUIREMENTS.md](../.planning/REQUIREMENTS.md)

## Required Metadata Gate

Checks expected to pass for the Phase 1 gate. These validate repository metadata, Git LFS attributes, generated-output ignore policy, and runtime binary checksums without running application test suites.

| Command | Expected outcome | Owner file | Requirement IDs | Phase 1 gate |
|---------|------------------|------------|-----------------|--------------|
| `rtk git status --short` | Clean working tree for Phase 1 deliverables; only pre-existing local editor config (e.g. `.vscode/settings.json`) may appear modified | `.gitignore`, `.gitattributes` | ART-01, TEST-01 | **Required** |
| `rtk git diff --check` | No whitespace or conflict-marker errors in staged/unstaged diffs | Repository-wide | ART-01, TEST-01 | **Required** |
| `rtk git lfs ls-files --long` | Lists runtime `.keras`, `.npy`, `.safetensors`, and model metadata under `BackEnd/...` with LFS pointer metadata | `.gitattributes` | ART-01, ART-02, ART-04 | **Required** |
| `rtk git check-attr filter diff merge -- BackEnd/llm-service/data/location_embeddings.npy` | `filter: lfs`, `diff: lfs`, `merge: lfs` (or equivalent LFS attributes) | `.gitattributes` | ART-01, ART-02 | **Required** |
| `rtk git check-attr filter diff merge -- BackEnd/llm-service/models/sentence-transformers/model.safetensors` | `filter: lfs`, `diff: lfs`, `merge: lfs` | `.gitattributes` | ART-01, ART-02 | **Required** |
| `rtk git check-attr filter diff merge -- "BackEnd/busyness-service/models/DNNs/100 NET.keras"` | `filter: lfs`, `diff: lfs`, `merge: lfs` | `.gitattributes` | ART-01, ART-02 | **Required** |
| `rtk git check-ignore -v --no-index BackEnd/target` | Path ignored by `BackEnd/.gitignore` (Maven build output not tracked as source) | `BackEnd/.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index test-reports/example.txt` | Path ignored by root `.gitignore` generated-output group | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index docs/controller-coverage.txt` | Path ignored (generated metric, not authored documentation) | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index docs/service-coverage.txt` | Path ignored (generated metric, not authored documentation) | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index docs/frontend-tests.txt` | Path ignored (generated metric, not authored documentation) | `.gitignore` | ART-01 | **Required** |
| `rtk bash scripts/verify-artifacts.sh` | All 70 runtime binary SHA-256 checksums match `docs/artifacts.md` | `scripts/verify-artifacts.sh`, `docs/artifacts.md` | ART-04, TEST-01 | **Required** |

**Not required-pass in Phase 1:** Maven (`./mvnw test`), Vitest, ESLint, Cypress, Docker Compose runtime smoke, and Python ML smoke commands belong in the tiers below.

## Known Application Gaps

<!-- Populated in plan 01-03 task 2 -->

## Manual and Slow Checks

<!-- Populated in plan 01-03 task 2 -->

## Missing Test Placeholders

<!-- Populated in plan 01-03 task 2 -->

## Requirement Traceability

<!-- Populated in plan 01-03 task 3 -->
