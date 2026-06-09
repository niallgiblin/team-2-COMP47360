#!/usr/bin/env bash
set -euo pipefail

count_files() {
    find "$1" "${@:2}" 2>/dev/null | wc -l | tr -d ' '
}

backend_tests=$(count_files BackEnd/src/test -name '*Test*.java')
controller_tests=$(count_files BackEnd/src/test -name '*ControllerTest.java')
service_tests=$(count_files BackEnd/src/test -name '*ServiceTest.java')
frontend_tests=$(
    find frontend/src frontend/services -type f \( -name '*.test.js' -o -name '*.test.jsx' \) 2>/dev/null
    find frontend -maxdepth 1 -type f \( -name '*.test.js' -o -name '*.test.jsx' \) 2>/dev/null
)
frontend_tests=$(printf '%s\n' "$frontend_tests" | sed '/^$/d' | wc -l | tr -d ' ')
cypress_specs=$(count_files frontend/cypress/e2e -name '*.cy.js')
llm_tests=$(count_files BackEnd/llm-service/tests -name 'test_*.py')
busyness_tests=$(count_files BackEnd/busyness-service/tests -name 'test_*.py')

cat <<EOF
Test file inventory
===================
Spring Java test classes: ${backend_tests}
  Controller test classes: ${controller_tests}
  Service test classes: ${service_tests}
Frontend Vitest files: ${frontend_tests}
Cypress specifications: ${cypress_specs}
LLM pytest modules: ${llm_tests}
Busyness pytest modules: ${busyness_tests}

These are file counts, not line or branch coverage percentages.
Run the suites and read docs/TESTING.md before making pass/fail claims.
EOF
