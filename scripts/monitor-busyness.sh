#!/bin/bash

# Monitor busyness service health and performance
# Usage: ./scripts/monitor-busyness.sh

EC2_HOST="46.137.74.122"
SSH_KEY="/Users/ng/Desktop/Summer25/ug-ec2.pem"

echo "=== Busyness Service Monitor ==="
echo "Time: $(date)"
echo

# Check container status
echo "1. Container Status:"
ssh -i $SSH_KEY ubuntu@$EC2_HOST "docker ps | grep busyness" 2>/dev/null || echo "Container not running"

echo
echo "2. Service Health:"
ssh -i $SSH_KEY ubuntu@$EC2_HOST "curl -s http://localhost:5002/health | jq '.'" 2>/dev/null || echo "Health check failed"

echo
echo "3. Cache Status:"
ssh -i $SSH_KEY ubuntu@$EC2_HOST "curl -s http://localhost:5002/cache/status | jq '.'" 2>/dev/null || echo "Cache status failed"

echo
echo "4. Recent Logs:"
ssh -i $SSH_KEY ubuntu@$EC2_HOST "docker logs urban-gala-busyness --tail 5" 2>/dev/null || echo "Logs unavailable"

echo
echo "5. API Test:"
echo "Map data endpoint:"
curl -s "http://$EC2_HOST/api/vibe/map-data" | jq '.success' 2>/dev/null || echo "API test failed"

echo
echo "6. Performance Test:"
echo "Testing busyness endpoint response time..."
time ssh -i $SSH_KEY ubuntu@$EC2_HOST "curl -s http://localhost:5002/busyness > /dev/null" 2>/dev/null

echo
echo "=== Monitor Complete ===" 