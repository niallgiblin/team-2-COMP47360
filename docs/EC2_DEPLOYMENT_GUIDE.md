# EC2 Production Deployment Guide

## Current Issues
Your EC2 instance is running in development mode, causing:
- WebSocket connection failures
- Login/signup not working
- Vite dev server trying to connect to localhost

## Quick Fix Steps

### 1. SSH into your EC2 instance
```bash
ssh -i your-key.pem ubuntu@46.137.74.122
```

### 2. Navigate to your project directory
```bash
cd /path/to/your/project
```

### 3. Run the diagnostic script
```bash
./scripts/check-ec2-status.sh
```

### 4. Apply the production fix
```bash
./scripts/fix-ec2-production.sh
```

## What the Fix Does

### Before (Development Mode):
- Frontend runs `npm run dev` (Vite dev server)
- WebSocket connections for HMR
- Separate nginx container
- Port conflicts and connection issues

### After (Production Mode):
- Frontend builds static files with `npm run build`
- Served by nginx inside the frontend container
- No WebSocket connections needed
- Proper API proxying

## Key Changes Made

1. **Frontend Dockerfile**: Now builds for production instead of running dev server
2. **docker-compose.yml**: Removed separate nginx service, frontend includes nginx
3. **nginx.conf**: Updated to properly serve built React app and proxy API calls
4. **Port mapping**: Frontend now serves on port 80 directly

## Verification

After running the fix script, verify:
- `docker ps` shows all containers running
- `curl http://localhost:80` returns 200 OK
- No more WebSocket connection errors in browser console
- Login/signup functionality works

## Troubleshooting

If issues persist:
1. Check container logs: `docker logs urban-gala-frontend`
2. Check environment variables are set
3. Ensure all services are healthy: `docker-compose ps`
4. Rebuild if needed: `docker-compose up -d --build` 