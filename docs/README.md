# Urban Gala

Urban Gala is a full-stack web application designed to help users discover trending locations around Manhattan at what kind of crowds to expect. It features an interactive map with live and forecasted busyness levels, personalized internal LLM recommendations based on user-described "vibes", and an AI-powered chatbot for conversational search.

## Key Features

-   **Interactive Map:** Visualize venues across Manhattan with real-time busyness data.
-   **Vibe-Based Search:** Use natural language to find locations that match your desired atmosphere (e.g., "a quiet cafe with good coffee").
-   **AI Chatbot:** Engage in a conversation to get location suggestions and information.
-   **Itinerary Planning:** Create and save custom plans for your outings.
-   **User Authentication & Profiles:** Sign up, log in, and share with your friends.

## Architecture Overview

The application is built on a microservice architecture, orchestrated with Docker Compose.

-   **`frontend`**: A React application built with Vite, using Material-UI for components.
-   **`backend`**: A Java Spring Boot application that serves as the main API gateway, handling user authentication, plans, and core business logic.
-   **`llm-service`**: A Python Flask microservice that handles:
    -   Semantic search for the "Find My Vibe" feature.
    -   Orchestration for the AI Chatbot, communicating with the Hugging Face API.
-   **`busyness-service`**: A Python Flask microservice that predicts and serves location busyness data.
-   **`db`**: A MySQL database for persistent storage.

---

## Getting Started

Follow these instructions to set up and run the project locally.

### Prerequisites

-   **Docker Desktop:** Download and install. This includes Docker Compose.
-   **Git LFS:** Required for handling large model files. Install from here.

Before starting services, read [Runtime Artifact Policy](artifacts.md) for **runtime model artifacts** — expected repository paths, ownership (Git LFS vs source-owned metadata), manual checksum verification with `scripts/verify-artifacts.sh`, busyness startup checksum enforcement, and process-local busyness cache behavior.

### 1. Clone the Repository

First, install Git LFS on your machine to ensure the machine learning models are downloaded correctly.

```bash
# Install Git LFS (once per machine)
git lfs install

# Clone the repository
git clone https://github.com/niallgiblin/team-2-COMP47360
cd team-2-COMP47360
```
*Note: If you cloned the repository before installing Git LFS, you may need to run `git lfs pull` inside the project directory to download the model files.*

After pulling LFS objects, verify runtime binaries with `./scripts/verify-artifacts.sh` (see [artifacts.md](artifacts.md) for the full manifest and checksum table).

### 2. Configure Environment Variables

The application requires API keys to function correctly. You'll need to create a `.env` file in the project root.

1.  **Create the `.env` file** by copying the example file:
    ```bash
    cp env.example .env
    ```
    See [`env.example`](../env.example) in the repository root for all supported variables, including optional local-development path overrides.

2.  **Edit the `.env` file** and add your keys:
    ```
    VITE_GOOGLE_API_KEY=AIzaSy...
    HF_TOKEN=hf_...
    APP_JWT_SECRET=your-super-secret-jwt-key-here
    ```
    -   `VITE_GOOGLE_API_KEY`: Required for Google Maps. Get a key from the Google Cloud Console. You will need to enable the "Maps JavaScript API" and the "Routes API".
    -   `HF_TOKEN`: Required for the AI Chatbot. Get a free "read" access token from your Hugging Face account settings.
    -   `APP_JWT_SECRET`: A secret key for signing authentication tokens. For production, this should be a long, random, base64-encoded string. You can generate a secure one with the following command:
        ```bash
        openssl rand -base64 32
        ```

### 3. Build and Run the Application

With Docker Desktop running, start all services using Docker Compose.

```bash
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

### Reset database schema (development)

When Flyway baseline or migrations change, reset the MySQL volume and restart:

```bash
docker compose down -v
docker compose up -d db backend
```

Flyway applies migrations on backend startup; Hibernate uses `ddl-auto=validate`.

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

# Stop and remove all data (fresh start).
# Use this if you have issues with database initialization or want a clean slate.
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
├── BackEnd/
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
