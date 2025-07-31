#!/bin/bash

# Performance monitoring script for Urban Gala
# Run this to monitor resource usage and response times

echo "🚀 Urban Gala Performance Monitor"
echo "=================================="

# Check Docker resource usage
echo ""
echo "📊 Docker Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"

echo ""
echo "🔍 Service Health Checks:"

# Check LLM Service
echo "🤖 LLM Service (Port 5001):"
if curl -s -f http://localhost:5001/health > /dev/null; then
    echo "✅ Healthy"
    RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null http://localhost:5001/health)
    echo "⏱️  Response time: ${RESPONSE_TIME}s"
else
    echo "❌ Unhealthy"
fi

# Check Busyness Service
echo "📈 Busyness Service (Port 5002):"
if curl -s -f http://localhost:5002/health > /dev/null; then
    echo "✅ Healthy"
    RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null http://localhost:5002/health)
    echo "⏱️  Response time: ${RESPONSE_TIME}s"
else
    echo "❌ Unhealthy"
fi

# Check Backend Service
echo "🔧 Backend Service (Port 8080):"
if curl -s -f http://localhost:8080/actuator/health > /dev/null; then
    echo "✅ Healthy"
    RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null http://localhost:8080/actuator/health)
    echo "⏱️  Response time: ${RESPONSE_TIME}s"
else
    echo "❌ Unhealthy"
fi

# Check Frontend Service
echo "🌐 Frontend Service (Port 5173):"
if curl -s -f http://localhost:5173 > /dev/null; then
    echo "✅ Healthy"
    RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null http://localhost:5173)
    echo "⏱️  Response time: ${RESPONSE_TIME}s"
else
    echo "❌ Unhealthy"
fi

echo ""
echo "💾 Memory Usage Breakdown:"
echo "LLM Service:"
docker stats --no-stream --format "{{.MemUsage}}" urban-gala-llm
echo "Busyness Service:"
docker stats --no-stream --format "{{.MemUsage}}" urban-gala-busyness
echo "Backend Service:"
docker stats --no-stream --format "{{.MemUsage}}" urban-gala-backend
echo "Database:"
docker stats --no-stream --format "{{.MemUsage}}" urban-gala-db

echo ""
echo "🔧 Performance Tips:"
echo "• Monitor with: watch -n 5 ./performance-monitor.sh"
echo "• Check logs: docker-compose logs -f [service-name]"
echo "• Restart services: docker-compose restart [service-name]"
echo "• Scale services: docker-compose up --scale [service-name]=2" 