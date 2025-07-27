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

- **API Rate Limits**: Implemented to prevent abuse
- **Request Throttling**: Automatic throttling of excessive requests
- **DDoS Protection**: Basic protection against distributed attacks

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
