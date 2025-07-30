#!/bin/bash

# Production Deployment Script for Urban Gala on EC2
# This script sets up and deploys the application to EC2

set -e  # Exit on any error

echo "🚀 Urban Gala Production Deployment"
echo "==================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy env.production.example to .env and configure your values."
    exit 1
fi

# Load environment variables
source .env

# Validate required environment variables
required_vars=("MYSQL_ROOT_PASSWORD" "MYSQL_PASSWORD" "APP_JWT_SECRET" "VITE_GOOGLE_API_KEY" "HF_TOKEN")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: Required environment variable $var is not set!"
        exit 1
    fi
done

echo "✅ Environment variables validated"

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose down --remove-orphans

# Clean up any dangling images
echo "🧹 Cleaning up Docker images..."
docker system prune -f

# Build and start services
echo "🔨 Building and starting services..."
docker-compose up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
timeout=300  # 5 minutes timeout
elapsed=0
interval=10

while [ $elapsed -lt $timeout ]; do
    if docker-compose ps | grep -q "healthy"; then
        echo "✅ All services are healthy!"
        break
    fi
    
    echo "⏳ Waiting for services to be healthy... ($elapsed/$timeout seconds)"
    sleep $interval
    elapsed=$((elapsed + interval))
done

if [ $elapsed -ge $timeout ]; then
    echo "❌ Timeout waiting for services to be healthy"
    echo "📋 Service status:"
    docker-compose ps
    echo "📋 Service logs:"
    docker-compose logs --tail=50
    exit 1
fi

# Run health checks
echo "🔍 Running health checks..."
./performance-monitor.sh

echo "✅ Deployment completed successfully!"
echo ""
echo "🌐 Your application should be available at:"
echo "   Frontend: http://$NGINX_SERVER_NAME"
echo "   API: http://$NGINX_SERVER_NAME/api"
echo ""
echo "📊 Monitor performance with: ./performance-monitor.sh"
echo "📋 View logs with: docker-compose logs -f [service-name]" 