#!/bin/bash

echo "🔍 Checking Test Files..."
echo "========================"

# Check if we're in the right directory
echo "Current directory: $(pwd)"
echo ""

# Count test files
echo "📊 Test File Counts:"
echo "Backend Test Files:"
if [ -d "BackEnd/src/test" ]; then
    echo "  - Total: $(find BackEnd/src/test -name "*Test.java" 2>/dev/null | wc -l)"
    echo "  - Controllers: $(find BackEnd/src/test -name "*ControllerTest.java" 2>/dev/null | wc -l)"
    echo "  - Services: $(find BackEnd/src/test -name "*ServiceTest.java" 2>/dev/null | wc -l)"
else
    echo "  - BackEnd test directory not found"
fi

echo ""
echo "Frontend Test Files:"
if [ -d "frontend/src" ]; then
    echo "  - Total: $(find frontend/src -name "*.test.*" 2>/dev/null | wc -l)"
    echo "  - Components: $(find frontend/src -path "*/tests/*" -name "*.test.*" 2>/dev/null | wc -l)"
else
    echo "  - Frontend src directory not found"
fi

echo ""
echo "📁 Directory Structure:"
echo "BackEnd test directory exists: $([ -d "BackEnd/src/test" ] && echo "Yes" || echo "No")"
echo "Frontend src directory exists: $([ -d "frontend/src" ] && echo "Yes" || echo "No")"

# List specific test files
echo ""
echo "🔍 Backend Controller Tests:"
if [ -d "BackEnd/src/test/java/com/manhattan/busyness_predictor/controller" ]; then
    ls -la BackEnd/src/test/java/com/manhattan/busyness_predictor/controller/*Test.java 2>/dev/null || echo "No controller test files found"
else
    echo "Controller test directory not found"
fi

echo ""
echo "🔍 Frontend Component Tests:"
if [ -d "frontend/src/components/tests" ]; then
    ls -la frontend/src/components/tests/*.test.* 2>/dev/null || echo "No component test files found"
else
    echo "Component tests directory not found"
fi 