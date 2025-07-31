# Production Troubleshooting Guide

## Common Issues and Solutions

### 1. LLM Service Issues

#### Problem: Service fails to start or crashes
**Symptoms:**
- Container exits immediately
- Health check fails
- Model loading errors

**Solutions:**
1. **Check model files exist:**
   ```bash
   docker exec urban-gala-llm ls -la /app/models/sentence-transformers/
   docker exec urban-gala-llm ls -la /app/data/
   ```

2. **Increase memory limits:**
   ```yaml
   # In docker-compose.yml
   deploy:
     resources:
       limits:
         memory: 4G  # Increase from 3G
   ```

3. **Check model loading logs:**
   ```bash
   docker-compose logs -f llm-service
   ```

4. **Verify HuggingFace token:**
   - Ensure `HF_TOKEN` is set in `.env`
   - Token should have access to the required models

#### Problem: Slow response times
**Solutions:**
1. **Increase CPU allocation:**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2.0'  # Increase from 1.5
   ```

2. **Enable model caching:**
   - The service already implements caching
   - Check cache hit rates in logs

### 2. Busyness Service Issues

#### Problem: Service crashes on startup
**Symptoms:**
- Container exits with TensorFlow errors
- Model loading failures

**Solutions:**
1. **Check model files:**
   ```bash
   docker exec urban-gala-busyness ls -la /app/models/
   ```

2. **Increase memory for TensorFlow:**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 4G  # Increase from 3G
   ```

3. **Use waitress instead of gunicorn:**
   - Already configured in Dockerfile
   - More stable with TensorFlow

#### Problem: Predictions return null values
**Solutions:**
1. **Check model initialization:**
   ```bash
   curl http://localhost:5002/health
   ```

2. **Verify input data format:**
   - Ensure lat/lon parameters are valid
   - Check coordinate ranges

### 3. Database Issues

#### Problem: Connection refused
**Solutions:**
1. **Check MySQL configuration:**
   ```bash
   docker exec urban-gala-db mysql -u root -p -e "SHOW VARIABLES LIKE 'max_connections';"
   ```

2. **Increase connection pool:**
   ```properties
   # In application.properties
   spring.datasource.hikari.maximum-pool-size=15
   ```

3. **Check MySQL logs:**
   ```bash
   docker-compose logs db
   ```

### 4. General Production Issues

#### Problem: Services not responding
**Solutions:**
1. **Check service health:**
   ```bash
   ./performance-monitor.sh
   ```

2. **Restart specific service:**
   ```bash
   docker-compose restart llm-service
   docker-compose restart busyness-service
   ```

3. **Check resource usage:**
   ```bash
   docker stats
   ```

#### Problem: Memory issues
**Solutions:**
1. **Monitor memory usage:**
   ```bash
   docker stats --no-stream
   ```

2. **Increase swap space on EC2:**
   ```bash
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

#### Problem: SSL/HTTPS issues
**Solutions:**
1. **Configure nginx for SSL:**
   ```nginx
   server {
       listen 443 ssl;
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       # ... rest of config
   }
   ```

2. **Use Let's Encrypt for free certificates**

### 5. Performance Optimization

#### For High Traffic:
1. **Scale services:**
   ```bash
   docker-compose up --scale llm-service=2 --scale busyness-service=2
   ```

2. **Add load balancer:**
   - Use nginx as load balancer
   - Configure upstream servers

3. **Enable caching:**
   - Redis for session storage
   - CDN for static assets

#### For Memory Optimization:
1. **Optimize model loading:**
   - Use model quantization
   - Implement lazy loading

2. **Database optimization:**
   - Add indexes
   - Optimize queries
   - Use connection pooling

### 6. Monitoring and Logging

#### Set up monitoring:
```bash
# Monitor resource usage
watch -n 5 './performance-monitor.sh'

# Monitor logs
docker-compose logs -f --tail=100

# Monitor specific service
docker-compose logs -f llm-service
```

#### Log analysis:
```bash
# Search for errors
docker-compose logs | grep -i error

# Search for specific patterns
docker-compose logs | grep "model loading"
```

### 7. Emergency Procedures

#### Service down:
1. **Quick restart:**
   ```bash
   docker-compose restart
   ```

2. **Full rebuild:**
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

3. **Rollback to previous version:**
   ```bash
   git checkout production-backup
   docker-compose up -d --build
   ```

#### Data corruption:
1. **Backup database:**
   ```bash
   docker exec urban-gala-db mysqldump -u root -p urban_gala > backup.sql
   ```

2. **Restore from backup:**
   ```bash
   docker exec -i urban-gala-db mysql -u root -p urban_gala < backup.sql
   ```

## Contact Information

For additional support:
- Check service logs for specific error messages
- Review this troubleshooting guide
- Consult the application documentation 