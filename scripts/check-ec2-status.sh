#!/bin/bash

echo "=== EC2 Instance Status Check ==="
echo "IP: 46.137.74.122"
echo ""

echo "1. Checking Docker containers..."
docker ps -a

echo ""
echo "2. Checking Docker logs for frontend..."
docker logs urban-gala-frontend --tail 20

echo ""
echo "3. Checking Docker logs for backend..."
docker logs urban-gala-backend --tail 20

echo ""
echo "4. Checking if port 80 is accessible..."
curl -I http://localhost:80

echo ""
echo "5. Checking environment variables..."
echo "APP_JWT_SECRET: ${APP_JWT_SECRET:0:10}..."
echo "MYSQL_PASSWORD: ${MYSQL_PASSWORD:0:10}..."

echo ""
echo "6. Checking disk space..."
df -h

echo ""
echo "7. Checking memory usage..."
free -h

echo ""
echo "=== Current Configuration Issues ==="
echo "- Frontend should be built for production, not running in dev mode"
echo "- WebSocket connections are failing because of dev server configuration"
echo "- Need to update docker-compose.yml and rebuild containers" 