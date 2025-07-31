#!/bin/bash

# Health monitoring script for Urban Gala services
# This script checks the health of all services and provides status information

echo "=== Urban Gala Service Health Monitor ==="
echo "Timestamp: $(date)"
echo ""

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local port=$3
    
    echo "Checking $service_name..."
    
    # Check if container is running
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$service_name"; then
        echo "  ✅ Container is running"
        
        # Check health endpoint
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo "  ✅ Health endpoint responding"
        else
            echo "  ❌ Health endpoint not responding"
        fi
        
        # Show container status
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep "$service_name"
    else
        echo "  ❌ Container not running"
    fi
    
    echo ""
}

# Check each service
check_service "urban-gala-backend" "http://localhost:8080/actuator/health" "8080"
check_service "urban-gala-busyness" "http://localhost:5002/health" "5002"
check_service "urban-gala-llm" "http://localhost:5001/health" "5001"
check_service "urban-gala-db" "" "3307"
check_service "urban-gala-frontend" "" "80"

echo "=== Resource Usage ==="
echo "Memory usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

echo ""
echo "=== Recent Logs (last 10 lines each) ==="
echo "Backend logs:"
docker logs --tail 10 urban-gala-backend 2>/dev/null || echo "No logs available"

echo ""
echo "Busyness service logs:"
docker logs --tail 10 urban-gala-busyness 2>/dev/null || echo "No logs available"

echo ""
echo "LLM service logs:"
docker logs --tail 10 urban-gala-llm 2>/dev/null || echo "No logs available" 