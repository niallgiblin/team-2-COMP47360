# team-2-COMP47360

# Urban Gala Application - Docker Setup Guide

## Prerequisites

Before you begin, make sure you have the following installed on your computer:

### 1. Install Docker Desktop

**Windows:**
1. Download Docker Desktop from [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
2. Run the installer and follow the setup wizard
3. Restart your computer when prompted
4. Open Docker Desktop and complete the initial setup

**Mac:**
1. Download Docker Desktop from [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
2. Drag Docker.app to your Applications folder
3. Launch Docker Desktop from Applications
4. Complete the initial setup

### 2. Verify Installation

Open your terminal/command prompt and run:
```bash
docker --version
docker-compose --version
```

You should see version numbers for both commands.

### 3. Install Git LFS (Large File Storage)

This project uses Git LFS to manage large files, such as machine learning models. You must install it to clone the repository correctly.

1.  **Install Git LFS.** Follow the instructions at [https://git-lfs.github.com](https://git-lfs.github.com).
    -   On macOS with Homebrew: `brew install git-lfs`
    -   On Windows: Download and run the installer from the website.

2.  **Set up Git LFS from the project root directory.** Run this command once per machine:
    ```bash
    git lfs install
    ```

## Getting the Application Running

### Step 1: Clone the Repository
```bash
git clone https://github.com/niallgiblin/team-2-COMP47360
cd team-2-COMP47360
```

### Step 2: Start the Application
In your terminal, navigate to the project root directory and run:

```zsh
docker-compose up --build
```

**First time running?** This will take a few minutes as Docker downloads and builds all the necessary components.

### Step 3: Wait for Startup
You'll see lots of log messages. Wait until you see these key messages:
- `urban-gala-db: ready for connections` 
- `urban-gala-backend: Started BusynessPredictorApplication`
- `urban-gala-frontend: Local: http://localhost:5173/`

### Step 4: Access the Application
Once everything is running:
- **Frontend (Web App):** http://localhost:5173
- **Backend API:** [http://localhost:8080](http://localhost:8080)

## Common Docker Commands

### Starting the Application
```zsh
# Start in foreground (see all logs)
docker-compose up

# Start in background (detached mode)
docker-compose up -d

# Force rebuild containers
docker-compose up --build
```

### Stopping the Application
```zsh
# Stop all containers
docker-compose down

# Stop and remove all data (fresh start)
docker-compose down -v
```

### Viewing Logs
```zsh
# View logs from all services
docker-compose logs

# View logs from specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs db

# Follow logs in real-time
docker-compose logs -f
```

### Checking Container Status
```zsh
# See running containers
docker ps

# See all containers (running and stopped)
docker ps -a
```

## Troubleshooting

### Problem: "Port already in use" error
**Solution:** Another application is using the same port.
```zsh
# Stop the application
docker-compose down

# Check what's using the port
# Windows:
netstat -ano | findstr :5173
netstat -ano | findstr :8080

# Mac/Linux:
lsof -i :5173
lsof -i :8080

# Kill the conflicting processes
```

### Problem: Containers won't start
**Solution:** Clean up and rebuild:
```zsh
# Stop everything
docker-compose down -v

# Remove old images
docker system prune -a

# Rebuild and start
docker-compose up --build
```

### Problem: Database connection errors
**Solution:** Wait longer or restart the database:
```zsh
# Restart just the database
docker-compose restart db

# Or restart everything
docker-compose restart
```

### Problem: Changes to code not showing up
**Solution:** Rebuild the containers:
```zsh
docker-compose down
docker-compose up --build
```

## Project Structure

```
team-2-COMP47360/
├── docker-compose.yml          # Defines all services
├── frontend/
│   ├── Dockerfile             # Frontend container setup
│   └── [frontend files]
├── backend/
│   ├── Dockerfile             # Backend container setup
│   └── [backend files]
└── README.md                  # This file
```

## Understanding the Setup

### What Docker Compose Creates:
1. **Frontend Container:** Runs the web application (Vite + React)
2. **Backend Container:** Runs the API server (Spring Boot)
3. **Database Container:** Runs MySQL database
4. **Network:** Allows containers to communicate with each other

### Default Ports:
- Frontend: `5173` (accessible at localhost:5173)
- Backend: `8080` (accessible at localhost:8080)
- Database: `3306` (internal communication only)

## Development Notes

### Backend Security:
The backend generates a temporary password on startup (shown in logs). This is normal for development.

### Daily Development:
1. Pull latest code: `git pull`
2. Start application: `docker-compose up`
3. Develop normally
4. Stop when done: `docker-compose down`

### When Dependencies or Database schema Change:
1. Stop application: `docker-compose down`
2. Rebuild: `docker-compose up --build`

---
