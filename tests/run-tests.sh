#!/bin/bash

echo "🧪 Running Urban Gala Tests"
echo "=========================="

# Run backend tests
echo "Running Backend Tests..."
cd BackEnd
if mvn test -q; then
    echo "✅ Backend tests passed"
else
    echo "❌ Backend tests failed"
fi
cd ..

# Run frontend tests
echo "Running Frontend Tests..."
cd frontend
if npm test -- --silent; then
    echo "✅ Frontend tests passed"
else
    echo "❌ Frontend tests failed"
fi
cd ..

echo ""
echo "📊 Test Summary:"
echo "Backend: $(find BackEnd/src/test -name "*Test.java" | wc -l) test files"
echo "Frontend: $(find frontend/src -name "*.test.*" | wc -l) test files"
echo "Controllers tested: $(find BackEnd/src/test -name "*ControllerTest.java" | wc -l)/7"
echo "Services tested: $(find BackEnd/src/test -name "*ServiceTest.java" | wc -l)/10" 