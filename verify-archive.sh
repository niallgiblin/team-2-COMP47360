#!/bin/bash

# Archive Verification Script
# This script verifies that all necessary files are included in the deployment archive

echo "🔍 Verifying deployment archive..."
echo "=================================="

# Check if archive exists
if [ ! -f "urban-gala-complete.tar.gz" ]; then
    echo "❌ Archive not found. Creating it now..."
    tar --exclude='.git' \
        --exclude='node_modules' \
        --exclude='frontend/node_modules' \
        --exclude='BackEnd/target' \
        --exclude='.vscode' \
        --exclude='*.log' \
        -czf urban-gala-complete.tar.gz .
fi

echo "📊 Archive contents verification:"
echo ""

# Check total files
TOTAL_FILES=$(tar -tzf urban-gala-complete.tar.gz | wc -l)
echo "📁 Total files in archive: $TOTAL_FILES"

# Check model files
KERAS_FILES=$(tar -tzf urban-gala-complete.tar.gz | grep "\.keras$" | wc -l)
echo "🤖 Keras model files: $KERAS_FILES"

# Check LLM service files
LLM_MODEL_FILES=$(tar -tzf urban-gala-complete.tar.gz | grep "llm-service/models/" | wc -l)
echo "🧠 LLM model files: $LLM_MODEL_FILES"

# Check busyness service files
BUSYNESS_MODEL_FILES=$(tar -tzf urban-gala-complete.tar.gz | grep "busyness-service/models/" | wc -l)
echo "📈 Busyness model files: $BUSYNESS_MODEL_FILES"

# Check for large files
echo ""
echo "📏 Large files (>10MB):"
tar -tzf urban-gala-complete.tar.gz | while read file; do
    if [ -f "$file" ]; then
        size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
        if [ "$size" -gt 10485760 ]; then  # 10MB in bytes
            echo "  $file ($(numfmt --to=iec $size))"
        fi
    fi
done

# Check for critical files
echo ""
echo "✅ Critical files check:"
CRITICAL_FILES=(
    "docker-compose.yml"
    "BackEnd/llm-service/app.py"
    "BackEnd/busyness-service/app.py"
    "BackEnd/src/main/resources/application.properties"
    "frontend/package.json"
    "nginx/nginx.conf"
    "env.production.example"
    "deploy-production.sh"
)

for file in "${CRITICAL_FILES[@]}"; do
    if tar -tzf urban-gala-complete.tar.gz | grep -q "^$file$"; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (MISSING)"
    fi
done

# Check archive size
ARCHIVE_SIZE=$(stat -f%z urban-gala-complete.tar.gz 2>/dev/null || stat -c%s urban-gala-complete.tar.gz 2>/dev/null)
echo ""
echo "📦 Archive size: $(numfmt --to=iec $ARCHIVE_SIZE)"

# Expected size check
if [ "$ARCHIVE_SIZE" -gt 1073741824 ]; then  # 1GB
    echo "✅ Archive size looks good (should be 3-6GB for complete deployment)"
else
    echo "⚠️  Archive size seems small. Model files might be missing."
    echo "   Expected: 3-6GB, Actual: $(numfmt --to=iec $ARCHIVE_SIZE)"
fi

echo ""
echo "🎯 Verification Summary:"
echo "  - Keras files: $KERAS_FILES (expected: ~68)"
echo "  - LLM model files: $LLM_MODEL_FILES (expected: >0)"
echo "  - Busyness model files: $BUSYNESS_MODEL_FILES (expected: >0)"
echo "  - Archive size: $(numfmt --to=iec $ARCHIVE_SIZE) (expected: 3-6GB)"

if [ "$KERAS_FILES" -ge 60 ] && [ "$ARCHIVE_SIZE" -gt 1073741824 ]; then
    echo ""
    echo "✅ Archive looks good for deployment!"
    echo "🚀 Ready to deploy to EC2"
else
    echo ""
    echo "❌ Archive may be missing files. Please check:"
    echo "   - Git LFS is properly configured"
    echo "   - All model files are committed"
    echo "   - Archive creation included all files"
fi 