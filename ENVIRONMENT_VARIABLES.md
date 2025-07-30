# Environment Variables Guide

## Production Environment Variables

When deploying to EC2, you need to set up the following environment variables in your `.env` file:

### Required Variables

```bash
# Database Configuration
MYSQL_ROOT_PASSWORD=your_secure_root_password_here
MYSQL_DATABASE=urban_gala
MYSQL_USER=urbanuser
MYSQL_PASSWORD=your_secure_db_password_here

# JWT Configuration (Use a very long, secure secret)
APP_JWT_SECRET=your_very_long_and_secure_jwt_secret_here_minimum_256_bits

# External API Keys
VITE_GOOGLE_API_KEY=your_google_maps_api_key_here
HF_TOKEN=your_huggingface_token_here

# Frontend Configuration
VITE_API_BASE_URL=/api
VITE_LLM_API_URL=/api/chat

# Nginx Configuration
NGINX_SERVER_NAME=46.137.74.122

# Optional: MySQL Configuration File
MYSQL_CONFIG_FILE=my.cnf

# Production-specific settings
FLASK_ENV=production
PYTHONUNBUFFERED=1
```

## Environment Variable Explanations

### Database Variables
- `MYSQL_ROOT_PASSWORD`: Root password for MySQL database
- `MYSQL_DATABASE`: Database name (default: urban_gala)
- `MYSQL_USER`: Database user (default: urbanuser)
- `MYSQL_PASSWORD`: Password for the database user

### Security Variables
- `APP_JWT_SECRET`: Secret key for JWT token generation (must be at least 256 bits)
- `HF_TOKEN`: HuggingFace token for accessing ML models

### Frontend Variables
- `VITE_API_BASE_URL`: Base URL for API calls (use `/api` in production)
- `VITE_LLM_API_URL`: URL for LLM chat API (use `/api/chat` in production)
- `VITE_GOOGLE_API_KEY`: Google Maps API key for map functionality

### Infrastructure Variables
- `NGINX_SERVER_NAME`: Your EC2 public IP or domain name
- `MYSQL_CONFIG_FILE`: MySQL configuration file (optional)

## Development vs Production Differences

### Development Environment
```bash
# Frontend connects directly to backend
VITE_API_BASE_URL=http://localhost:8080/api
VITE_LLM_API_URL=http://localhost:5001
VITE_BACKEND_URL=http://localhost:8080
```

### Production Environment
```bash
# Frontend connects through nginx proxy
VITE_API_BASE_URL=/api
VITE_LLM_API_URL=/api/chat
# VITE_BACKEND_URL is not needed in production
```

## Setting Up Your Production Environment

1. **Copy the example file:**
   ```bash
   cp env.production.example .env
   ```

2. **Edit the .env file with your actual values:**
   ```bash
   nano .env
   ```

3. **Generate nginx configuration:**
   ```bash
   ./generate-nginx-config.sh
   ```

4. **Deploy:**
   ```bash
   ./deploy-production.sh
   ```

## Security Best Practices

1. **Use strong passwords:**
   - Generate secure passwords for database
   - Use a long, random JWT secret

2. **Keep secrets secure:**
   - Never commit .env files to git
   - Use environment variables instead of hardcoded values

3. **API Keys:**
   - Restrict Google Maps API key to your domain
   - Use HuggingFace token with minimal required permissions

## Troubleshooting Environment Issues

### Common Issues:

1. **Frontend can't connect to backend:**
   - Check `VITE_API_BASE_URL` is set to `/api`
   - Verify nginx is running and configured correctly

2. **Avatar images not loading:**
   - Ensure nginx is configured to proxy `/avatars/` requests
   - Check backend avatar upload endpoint is working

3. **ML services not responding:**
   - Verify `HF_TOKEN` is set correctly
   - Check service logs for authentication errors

4. **Database connection issues:**
   - Ensure all database environment variables are set
   - Check MySQL container is running and healthy

### Debugging Commands:

```bash
# Check environment variables in containers
docker exec urban-gala-frontend env | grep VITE_

# Check nginx configuration
docker exec urban-gala-nginx nginx -t

# Check service logs
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f llm-service
docker-compose logs -f busyness-service
```

## Example .env File

```bash
# Database Configuration
MYSQL_ROOT_PASSWORD=MySecureRootPassword123!
MYSQL_DATABASE=urban_gala
MYSQL_USER=urbanuser
MYSQL_PASSWORD=MySecureUserPassword456!

# JWT Configuration
APP_JWT_SECRET=my_very_long_and_secure_jwt_secret_here_minimum_256_bits_long_enough_for_production_use

# External API Keys
VITE_GOOGLE_API_KEY=AIzaSyYourGoogleMapsAPIKeyHere
HF_TOKEN=hf_your_huggingface_token_here

# Frontend Configuration
VITE_API_BASE_URL=/api
VITE_LLM_API_URL=/api/chat

# Nginx Configuration
NGINX_SERVER_NAME=46.137.74.122

# Optional: MySQL Configuration File
MYSQL_CONFIG_FILE=my.cnf

# Production-specific settings
FLASK_ENV=production
PYTHONUNBUFFERED=1
``` 