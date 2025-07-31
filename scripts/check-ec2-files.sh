#!/bin/bash

echo "=== Checking EC2 File Versions ==="
echo ""

echo "1. Current docker-compose.yml:"
cat docker-compose.yml | head -20

echo ""
echo "2. Current frontend/Dockerfile:"
cat frontend/Dockerfile

echo ""
echo "3. Current frontend/nginx.conf:"
cat frontend/nginx.conf

echo ""
echo "4. Current frontend/vite.config.js:"
cat frontend/vite.config.js

echo ""
echo "5. Current nginx configuration (if exists):"
if [ -f "config/nginx/nginx.conf" ]; then
    cat config/nginx/nginx.conf
else
    echo "config/nginx/nginx.conf not found"
fi

echo ""
echo "6. Git status:"
git status --porcelain

echo ""
echo "7. Current branch:"
git branch --show-current

echo ""
echo "8. Last commit:"
git log --oneline -1 