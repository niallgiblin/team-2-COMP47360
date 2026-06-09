# Security

Verified implementation notes for committed `urban-gala-v2` on 2026-06-09.
This document separates repository controls from deployment responsibilities
and explicitly lists controls the project does not provide.

## Implemented controls

### Authentication and authorization

- Spring uses stateless JWT authentication.
- Passwords are hashed with BCrypt.
- Protected Spring and chat routes validate Bearer tokens.
- Plans, favorites, friends, profiles, and shared resources apply user-scoped
  authorization in their service/controller paths.
- Rotating `APP_JWT_SECRET` invalidates existing sessions.

Spring disables CSRF because the API is stateless and authenticated with JWT
headers:

```java
.csrf(AbstractHttpConfigurer::disable)
```

Do not describe CSRF protection as enabled.

### Secrets and startup validation

Create `.env` from `env.example`. Required shared/staging secrets include:

```text
MYSQL_ROOT_PASSWORD
MYSQL_PASSWORD
APP_JWT_SECRET
HF_TOKEN
VITE_GOOGLE_API_KEY
```

Spring startup validation rejects missing or placeholder-sensitive
configuration. `.env` is ignored by Git, but ignore rules do not protect a
secret that has already been committed. Any credential that has appeared in
Git history, logs, screenshots, or chat must be revoked and replaced.

Generate a JWT secret with:

```bash
openssl rand -base64 32
```

### Service exposure

- Compose keeps the LLM and busyness work endpoints on the internal Docker
  network in the production-style topology.
- The browser-reachable chat route requires the same JWT signing secret as
  Spring.
- Both Flask services use `FLASK_CORS_ALLOWED_ORIGINS`.
- Production/staging deployments must set explicit origins and must not use
  `*`.

The local default is:

```text
http://localhost:5173,http://localhost:3000
```

### Input and error boundaries

- Spring request DTOs use validation where defined.
- Avatar uploads validate file content as well as extension/type.
- JPA parameter binding protects normal repository queries from SQL injection.
- `GlobalExceptionHandler` translates covered failures into stable,
  client-safe responses.
- Cross-service JSON is mapped through typed DTOs and fixture-backed contract
  tests.

These controls do not justify the blanket claim that every input is sanitized
or every endpoint has equivalent validation. Review each boundary when adding
new routes.

### Rate limiting

Selected expensive Spring routes use bounded in-process buckets:

```text
APP_RATE_LIMIT_EXPENSIVE_CAPACITY=30
APP_RATE_LIMIT_EXPENSIVE_REFILL_SECONDS=60
APP_RATE_LIMIT_EXPENSIVE_MAX_BUCKETS=10000
```

Quota state is per JVM, resets on restart, and is not shared across replicas.
This is request-cost protection for a single instance, not distributed abuse
or DDoS protection.

### Artifact integrity

- Required model binaries are delivered through Git LFS.
- `scripts/verify-artifacts.sh` validates documented checksums.
- The busyness service verifies its Keras artifact manifest before loading.
- Unsafe Keras deserialization is disabled by default.

Run artifact verification from a clean checkout before deployment.

## Browser-visible Google Maps key

`VITE_GOOGLE_API_KEY` is embedded in the built JavaScript bundle. It is public
by design and must be protected with Google Cloud restrictions:

1. Use a separate key for each environment.
2. Apply **HTTP referrer** restrictions for only the deployed origins.
3. Apply **API restrictions** for Routes API and any other Google Maps API
   actually used.
4. Verify an allowed origin works.
5. Verify a disallowed origin is rejected.

Example local referrers:

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
```

Changing this key requires rebuilding the production Vite bundle.

## Rotation

### JWT

1. Generate a new `APP_JWT_SECRET`.
2. Update the deployment secret.
3. Restart Spring and the LLM service.
4. Confirm both health endpoints.
5. Require users to log in again.

### Database credentials

1. Change the MySQL user password in MySQL.
2. Update `MYSQL_PASSWORD` and, if separately configured,
   `SPRING_DATASOURCE_PASSWORD`.
3. Restart Spring.
4. Verify Actuator health and an authenticated database-backed request.

The MySQL root password must be rotated separately when it is used outside
initial container provisioning.

### Hugging Face

1. Create a new least-privilege token.
2. Update `HF_TOKEN`.
3. Restart the LLM service.
4. Verify health and an authenticated chat request.
5. Revoke the old token.

### Google

1. Create and restrict the replacement key before use.
2. Update `VITE_GOOGLE_API_KEY`.
3. Rebuild and redeploy the frontend.
4. Test allowed and disallowed origins.
5. Delete the old key.

## Deployment responsibilities

The repository does not implement the following controls:

| Control | Current truth |
|---------|---------------|
| Public HTTPS/TLS termination | Not configured in repository Nginx/Compose |
| MySQL TLS | Compose JDBC URL uses `useSSL=false` |
| Content Security Policy | No CSP header in checked-in Nginx configuration |
| Comprehensive security headers | Not configured |
| Non-root containers | Dockerfiles do not set `USER` |
| Distributed rate limiting | Not implemented |
| Distributed session revocation | Not implemented; JWTs expire or secret rotates |
| Automated dependency scanning | No verified pipeline in repository |
| Automated secret scanning | No verified pipeline in repository |
| Penetration testing | No evidence of a recurring automated program |
| Encrypted backup automation | Not implemented |
| Prometheus/Grafana security monitoring | Full stack is not committed v2 |

An external reverse proxy or cloud load balancer should terminate TLS and add
security headers. A multi-replica deployment should use a shared rate-limit
store or API gateway.

## Logging and privacy

Committed v2 adds request IDs, structured LLM request events, bounded
Prometheus labels, query hashes, and JSONL event writing. Operators must:

- Keep raw tokens and secrets out of logs.
- Avoid using raw user queries as metric labels.
- Apply retention and access controls to JSONL event files.
- Treat user identifiers and chat text as potentially sensitive.

The existence of logs and `/metrics` does not by itself constitute a complete
monitoring or incident-response system.

## Verification

```bash
bash scripts/verify-sec08-docs.sh
bash scripts/verify-artifacts.sh
cd BackEnd && ./mvnw test
bash scripts/compose-smoke.sh --teardown
```

`verify-sec08-docs.sh` validates the documentation pattern for Google key
restrictions; it cannot inspect the actual Google Cloud Console settings.
