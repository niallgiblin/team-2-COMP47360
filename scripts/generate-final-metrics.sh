#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

backend_tests=$(find BackEnd/src/test -name '*Test*.java' 2>/dev/null | wc -l | tr -d ' ')
frontend_files=$(
    find frontend/src frontend/services -type f \( -name '*.test.js' -o -name '*.test.jsx' \) 2>/dev/null
    find frontend -maxdepth 1 -type f \( -name '*.test.js' -o -name '*.test.jsx' \) 2>/dev/null
)
frontend_tests=$(printf '%s\n' "$frontend_files" | sed '/^$/d' | wc -l | tr -d ' ')
cypress_specs=$(find frontend/cypress/e2e -name '*.cy.js' 2>/dev/null | wc -l | tr -d ' ')
llm_tests=$(find BackEnd/llm-service/tests -name 'test_*.py' 2>/dev/null | wc -l | tr -d ' ')
busyness_tests=$(find BackEnd/busyness-service/tests -name 'test_*.py' 2>/dev/null | wc -l | tr -d ' ')

cat > docs/final-evaluation-metrics.txt <<EOF
TEST INVENTORY SNAPSHOT
=======================

Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')

File counts:
- Spring Java test classes: ${backend_tests}
- Frontend Vitest files: ${frontend_tests}
- Cypress specifications: ${cypress_specs}
- LLM pytest modules: ${llm_tests}
- Busyness pytest modules: ${busyness_tests}

These are inventory counts, not line/branch coverage and not proof that the
suites pass. Current dated executable outcomes belong in docs/TESTING.md.
Retrieval quality metrics belong in docs/EVALUATION_STRATEGY.md.
EOF

echo "Wrote an inventory-only snapshot to docs/final-evaluation-metrics.txt"
