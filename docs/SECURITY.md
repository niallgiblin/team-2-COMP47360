# Security Documentation

## Overview

This document outlines the security measures implemented in the Urban Gala project, including authentication, authorization, data protection, and secrets management.

## Secrets Management

### Environment Variables

All sensitive configuration is managed through environment variables to prevent secrets from being committed to version control.

#### Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Database Configuration
MYSQL_ROOT_PASSWORD=your_secure_root_password_here
MYSQL_DATABASE=urban_gala
MYSQL_USER=urbanuser
MYSQL_PASSWORD=your_secure_db_password_here

# JWT Configuration
APP_JWT_SECRET=your_very_long_and_secure_jwt_secret_here_minimum_256_bits

# External API Keys
VITE_GOOGLE_API_KEY=your_google_maps_api_key_here
HF_TOKEN=your_huggingface_token_here

# Optional: MySQL Configuration File
MYSQL_CONFIG_FILE=my.cnf
```

### Security Best Practices for Secrets

1. **JWT Secret**: Use a cryptographically secure random string of at least 256 bits (32 characters)
2. **Database Passwords**: Use strong, unique passwords for each environment
3. **API Keys**: Store external API keys securely and rotate them regularly
4. **Never commit secrets**: The `.env` file is excluded from version control

### Manual Setup Instructions

**Step 1: Create your .env file**
```bash
cp env.example .env
```

**Step 2: Configure your secrets**
Edit the `.env` file and replace the placeholder values:

- **Database Passwords**: Choose strong passwords (12+ characters, mix of letters, numbers, symbols)
- **JWT Secret**: Generate a secure random string (you can use an online generator or command line)
- **API Keys**: Add your actual Google Maps API key and Hugging Face token

**Step 3: Generate a secure JWT secret**
You can generate a secure JWT secret using one of these methods:

```bash
# Method 1: Using openssl (if available)
openssl rand -base64 32

# Method 2: Using /dev/urandom
head -c 32 /dev/urandom | base64

# Method 3: Using node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Method 4: Online generator (for development only)
# Visit: https://generate-secret.vercel.app/32
```

**Step 4: Test your configuration**
```bash
docker-compose up
```

## Secret Rotation

### Historical exposure (mandatory before production)

Credentials that have ever appeared in git history — including a database password exposed in commit `79f93214` — must be treated as **compromised**. Rotation is **required** before any production or staging deployment; it is not optional cleanup.

### Secrets in scope

Rotate all of the following before deploying to shared or production environments:

| Secret | Environment variable(s) | Affected services |
|--------|-------------------------|-------------------|
| MySQL root password | `MYSQL_ROOT_PASSWORD` | `db`, `backend` |
| Application DB password | `MYSQL_PASSWORD`, `SPRING_DATASOURCE_PASSWORD` | `db`, `backend` |
| JWT signing key | `APP_JWT_SECRET` | `backend` |
| Hugging Face token | `HF_TOKEN` | `llm-service` |
| Google Maps API key | `VITE_GOOGLE_API_KEY` | `frontend`, `frontend-prod` |

### Pre-rotation checklist

1. Back up your current `.env` file to a secure location outside the repository.
2. Note which services are running (`docker compose ps`).
3. Schedule a maintenance window — some rotations invalidate active sessions or require database restarts.
4. Ensure you can access provider consoles (Google Cloud, Hugging Face) for key revocation after rotation.

### General rotation procedure

For every secret below, follow this pattern:

1. **Generate** a new value (or create a new key at the provider).
2. **Update** the root `.env` file with the new value.
3. **Restart** affected Docker Compose services (see per-secret steps).
4. **Verify** health endpoints respond successfully.
5. **Revoke or disable** the old credential at the provider where applicable.

### MySQL root password (`MYSQL_ROOT_PASSWORD`)

1. Generate a strong password (12+ characters; use a password manager).
2. Connect to the running database container:
   ```bash
   docker compose exec db mysql -u root -p
   ```
   Enter the current root password when prompted.
3. Change the root password:
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_new_password_here';
   ALTER USER 'root'@'%' IDENTIFIED BY 'your_new_password_here';
   FLUSH PRIVILEGES;
   ```
4. Update `MYSQL_ROOT_PASSWORD=your_new_password_here` in `.env`.
5. Restart database and backend:
   ```bash
   docker compose restart db backend
   ```
6. Verify: `docker compose exec db mysqladmin ping -h localhost -u root -p`

### Application DB user (`MYSQL_PASSWORD`)

1. Generate a strong password distinct from the root password.
2. Connect as root:
   ```bash
   docker compose exec db mysql -u root -p
   ```
3. Rotate the application user (replace `urbanuser` with your `MYSQL_USER` value if different):
   ```sql
   ALTER USER 'urbanuser'@'%' IDENTIFIED BY 'your_new_password_here';
   FLUSH PRIVILEGES;
   ```
4. Update `MYSQL_PASSWORD=your_new_password_here` in `.env` (this also feeds `SPRING_DATASOURCE_PASSWORD`).
5. Restart backend:
   ```bash
   docker compose restart backend
   ```
6. Verify: `curl -f http://localhost:8080/actuator/health`

### JWT signing key (`APP_JWT_SECRET`)

1. Generate a new secret:
   ```bash
   openssl rand -base64 32
   ```
2. Update `APP_JWT_SECRET=your_new_jwt_secret_here` in `.env`.
3. Restart backend:
   ```bash
   docker compose restart backend
   ```
4. Verify: `curl -f http://localhost:8080/actuator/health`
5. **Session impact:** All active JWT sessions are invalidated immediately. Every user must log in again after this rotation.

### Hugging Face token (`HF_TOKEN`)

1. Create a new read token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. Update `HF_TOKEN=your_new_hf_token_here` in `.env`.
3. Restart the LLM service:
   ```bash
   docker compose restart llm-service
   ```
4. Verify: `curl -f http://localhost:5001/health`
5. Revoke the old token in the Hugging Face console.

### Google Maps API key (`VITE_GOOGLE_API_KEY`)

1. Create a new API key in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (restrict by HTTP referrer or IP as appropriate).
2. Update `VITE_GOOGLE_API_KEY=your_new_google_api_key_here` in `.env`.
3. Restart the dev frontend:
   ```bash
   docker compose restart frontend
   ```
4. For production static images, rebuild so build-time args pick up the new key:
   ```bash
   docker compose --profile prod build frontend-prod
   docker compose --profile prod up -d frontend-prod
   ```
5. Verify the map loads in the browser.
6. Disable or delete the old API key in Google Cloud Console.

> **Never include real secret values in documentation or commit messages.** Use placeholders such as `your_new_password_here` and `your_new_jwt_secret_here` only.

## Authentication & Authorization

### JWT-Based Authentication

The application uses JSON Web Tokens (JWT) for stateless authentication:

- **Token Generation**: Secure JWT tokens are generated upon successful login
- **Token Validation**: All protected endpoints validate JWT tokens
- **Token Expiration**: Tokens have configurable expiration times
- **Secret Rotation**: JWT secrets can be rotated without affecting existing sessions

### Security Configuration

The Spring Security configuration includes:

- **CORS Protection**: Configured to allow only trusted origins
- **CSRF Protection**: Enabled for state-changing operations
- **Session Management**: Stateless sessions using JWT
- **Password Encoding**: BCrypt password hashing with salt

## Database Security

### MySQL Security Measures

1. **Encrypted Connections**: SSL/TLS encryption for database connections
2. **User Privileges**: Limited database user with minimal required permissions
3. **Connection Pooling**: Secure connection management
4. **Parameterized Queries**: Prevention of SQL injection attacks

### Database Configuration

```properties
# Database connection with security settings
spring.datasource.url=jdbc:mysql://db:3306/urban_gala?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
spring.datasource.username=${MYSQL_USER}
spring.datasource.password=${MYSQL_PASSWORD}
```

## Network Security

### Docker Network Isolation

- **Bridge Network**: Services communicate through isolated Docker networks
- **Port Exposure**: Only necessary ports are exposed to the host
- **Internal Communication**: Services communicate using internal hostnames

### Container Security

1. **Non-root Users**: Containers run with limited privileges
2. **Resource Limits**: Memory and CPU limits prevent resource exhaustion
3. **Health Checks**: Regular health monitoring for all services
4. **Restart Policies**: Automatic restart on failure with backoff

## API Security

### Input Validation

- **Request Validation**: All incoming requests are validated
- **Data Sanitization**: User input is sanitized to prevent injection attacks
- **Type Safety**: Strong typing prevents type-related vulnerabilities

### Rate Limiting

Phase 04 uses bounded in-process Bucket4j-style buckets for expensive Spring routes. These limits are single-instance controls: quota state is per JVM, counters reset on restart, and multiple backend replicas do not share quota state.

Configuration:

```bash
APP_RATE_LIMIT_EXPENSIVE_CAPACITY=30
APP_RATE_LIMIT_EXPENSIVE_REFILL_SECONDS=60
APP_RATE_LIMIT_EXPENSIVE_MAX_BUCKETS=10000
```

For multi-instance staging or production abuse prevention, use Redis-backed Bucket4j or an API gateway/Nginx rate-limit layer with user-aware keys. Do not treat the Phase 04 in-process limiter as distributed DDoS protection.

### Flask Service Exposure

The Flask work endpoints `/search`, `/api/chat`, `/busyness`, and prediction work reached through `/busyness` are private service surfaces. Docker Compose keeps `llm-service` and `busyness-service` on the internal Docker network with `expose: ["5000"]`; direct host port publishing is dev-only and must not be used for staging or production.

`/api/chat` is the only browser-reachable Flask work route through Nginx. It requires the same `APP_JWT_SECRET` signing secret used by Spring, and requests without a valid Bearer JWT fail before LLM prompt construction, similarity search, model work, or Hugging Face calls.

### Flask CORS

Both Flask services read `FLASK_CORS_ALLOWED_ORIGINS`. The local default is:

```bash
FLASK_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

Credentials are disabled by default. Production and staging must set explicit frontend origins and must not use wildcard `*` for Flask CORS.

## Frontend Security

### React Security Measures

1. **XSS Protection**: React's built-in XSS protection
2. **Content Security Policy**: CSP headers for additional protection
3. **Secure Storage**: Sensitive data stored securely in browser
4. **HTTPS Only**: All API calls use secure connections

### Environment Variables

Frontend environment variables are prefixed with `VITE_` for Vite.js:

```javascript
// Accessible in frontend code
const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
```



### Logging & Monitoring

1. **Security Events**: All authentication and authorization events are logged
2. **Error Tracking**: Comprehensive error logging without exposing sensitive data
3. **Performance Monitoring**: Resource usage monitoring to detect anomalies
4. **Health Checks**: Regular service health monitoring

### Production Deployment

1. **HTTPS Only**: All production traffic uses HTTPS
2. **Security Headers**: Comprehensive security headers
3. **Regular Updates**: Automated security updates
4. **Backup Security**: Encrypted backups with secure storage

### Development Security

1. **Code Review**: All code changes require security review
2. **Dependency Scanning**: Regular vulnerability scanning
3. **Secret Scanning**: Automated detection of exposed secrets
4. **Security Testing**: Regular security testing and penetration testing
