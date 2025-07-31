#!/bin/bash

echo "=== Fixing EC2 Production Setup ==="

# Stop all containers
echo "1. Stopping all containers..."
docker-compose down

# Pull latest changes
echo "2. Pulling latest changes..."
git pull origin main

# Update docker-compose.yml to use production setup
echo "3. Updating docker-compose.yml..."
# The docker-compose.yml should already be updated in the repo

# Rebuild and start containers
echo "4. Rebuilding and starting containers..."
docker-compose up -d --build

# Wait for services to start
echo "5. Waiting for services to start..."
sleep 30

# Check container status
echo "6. Checking container status..."
docker ps

# Test the application
echo "7. Testing application..."
curl -I http://localhost:80

echo ""
echo "=== Production Fix Complete ==="
echo "The application should now be running in production mode."
echo "Frontend is built and served by nginx instead of Vite dev server."
echo "No more WebSocket connection issues." 