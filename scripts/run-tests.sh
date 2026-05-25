#!/bin/bash

REPORT_DIR="test-reports"
mkdir -p "$REPORT_DIR"

echo "🧪 Running Test Suite..."
echo "========================"

failed=0

# Run Backend Tests
echo "Running Backend Tests..."
cd BackEnd
if mvn test -q; then
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
if npm test -- --silent; then
    echo "✅ Frontend tests completed"
else
    echo "❌ Frontend tests failed"
    failed=1
fi
cd ..

# Count test files
BACKEND_TESTS=$(find BackEnd/src/test -name "*Test.java" 2>/dev/null | wc -l)
FRONTEND_TESTS=$(find frontend/src -name "*.test.*" 2>/dev/null | wc -l)
CONTROLLER_TESTS=$(find BackEnd/src/test -name "*ControllerTest.java" 2>/dev/null | wc -l)
SERVICE_TESTS=$(find BackEnd/src/test -name "*ServiceTest.java" 2>/dev/null | wc -l)

# Calculate percentages
CONTROLLER_COVERAGE=$((CONTROLLER_TESTS * 100 / 7))
SERVICE_COVERAGE=$((SERVICE_TESTS * 100 / 10))

echo ""
echo "📊 Test Summary:"
echo "================"
echo "Backend:       ${BACKEND_TESTS} test files"
echo "Frontend:        ${FRONTEND_TESTS} test files"
echo "Controllers tested:        ${CONTROLLER_TESTS}/7"
echo "Services tested:        ${SERVICE_TESTS}/10"

echo ""
echo "📈 Coverage Analysis:"
echo "===================="
echo "Backend Controller Coverage: ${CONTROLLER_COVERAGE}%"
echo "Backend Service Coverage: ${SERVICE_COVERAGE}%"
echo "Frontend Component Tests:        ${FRONTEND_TESTS}"

# Save metrics
echo "${CONTROLLER_COVERAGE}" > "${REPORT_DIR}/controller-coverage.txt"
echo "${SERVICE_COVERAGE}" > "${REPORT_DIR}/service-coverage.txt"
echo "${FRONTEND_TESTS}" > "${REPORT_DIR}/frontend-tests.txt"

echo ""
echo "✅ Test metrics saved to ${REPORT_DIR}/"
echo ""
echo "🎯 Summary:"
echo "==========="
echo "• Backend Controller Coverage: ${CONTROLLER_COVERAGE}%"
echo "• Backend Service Coverage: ${SERVICE_COVERAGE}%"
echo "• Frontend Component Tests: ${FRONTEND_TESTS}"

exit "$failed"