#!/usr/bin/env bash
set -u

REPORT_DIR="test-reports"
mkdir -p "$REPORT_DIR"

echo "🧪 Running Test Suite..."
echo "========================"

failed=0

# Run Backend Tests
echo "Running Backend Tests..."
cd BackEnd
if ./mvnw test -q; then
    echo "✅ Backend tests completed"
else
    echo "❌ Backend tests failed"
    failed=1
fi
cd ..

# Run Frontend Tests
echo ""
echo "Running Frontend Tests..."
cd frontend
if npm test -- --run; then
    echo "✅ Frontend tests completed"
else
    echo "❌ Frontend tests failed"
    failed=1
fi
cd ..

# Run Python service tests
echo ""
echo "Running LLM service tests..."
cd BackEnd/llm-service
if PYTHONPATH=. python3 -m pytest tests/ -q; then
    echo "✅ LLM service tests completed"
else
    echo "❌ LLM service tests failed"
    failed=1
fi
cd ../..

echo ""
echo "Running busyness service tests..."
cd BackEnd/busyness-service
if PYTHONPATH=. python3 -m pytest tests/ -q; then
    echo "✅ Busyness service tests completed"
else
    echo "❌ Busyness service tests failed"
    failed=1
fi
cd ../..

# Count test files. These are inventory counts, not coverage percentages.
BACKEND_TESTS=$(find BackEnd/src/test -name "*Test*.java" 2>/dev/null | wc -l)
FRONTEND_TESTS=$(
    {
        find frontend/src frontend/services -type f \( -name "*.test.js" -o -name "*.test.jsx" \) 2>/dev/null
        find frontend -maxdepth 1 -type f \( -name "*.test.js" -o -name "*.test.jsx" \) 2>/dev/null
    } | wc -l
)
CONTROLLER_TESTS=$(find BackEnd/src/test -name "*ControllerTest.java" 2>/dev/null | wc -l)
SERVICE_TESTS=$(find BackEnd/src/test -name "*ServiceTest.java" 2>/dev/null | wc -l)
LLM_TESTS=$(find BackEnd/llm-service/tests -name "test_*.py" 2>/dev/null | wc -l)
BUSYNESS_TESTS=$(find BackEnd/busyness-service/tests -name "test_*.py" 2>/dev/null | wc -l)

echo ""
echo "📊 Test Summary:"
echo "================"
echo "Backend:       ${BACKEND_TESTS} test files"
echo "Frontend:        ${FRONTEND_TESTS} test files"
echo "Controller test files: ${CONTROLLER_TESTS}"
echo "Service test files: ${SERVICE_TESTS}"
echo "LLM pytest files: ${LLM_TESTS}"
echo "Busyness pytest files: ${BUSYNESS_TESTS}"

# Save metrics
echo "${CONTROLLER_TESTS}" > "${REPORT_DIR}/controller-test-files.txt"
echo "${SERVICE_TESTS}" > "${REPORT_DIR}/service-test-files.txt"
echo "${FRONTEND_TESTS}" > "${REPORT_DIR}/frontend-tests.txt"

echo ""
echo "✅ Test metrics saved to ${REPORT_DIR}/"
echo ""
echo "🎯 Summary:"
echo "==========="
echo "• Spring Java test files: ${BACKEND_TESTS}"
echo "• Frontend Vitest files: ${FRONTEND_TESTS}"
echo "• LLM pytest files: ${LLM_TESTS}"
echo "• Busyness pytest files: ${BUSYNESS_TESTS}"
echo "• File counts are not line/branch coverage."

exit "$failed"
