# Stage 1: Builder - Install dependencies in a temporary environment to keep the final image small
FROM python:3.9.18-slim-bookworm AS builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Set path for the virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Set working directory
WORKDIR /app

# Install build tools needed for some Python packages
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create and activate a virtual environment
RUN python -m venv /opt/venv

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install dependencies, handling torch separately as in the original Dockerfile.
# This ensures the correct CPU-only version is installed from the right index.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.1.2 && \
    grep -v -i '^torch==' requirements.txt > /tmp/other_requirements.txt && \
    pip install --no-cache-dir -r /tmp/other_requirements.txt

# ---

# Stage 2: Final - Create the lean production image
FROM python:3.9.18-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Install curl for the healthcheck, and clean up apt cache
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy the virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv
# Copy application code
COPY . .

# Create a non-root user for security
RUN useradd --create-home --shell /bin/bash app && \
    chown -R app:app /app

# Ensure data and models directories exist and have correct ownership
RUN mkdir -p /app/data /app/models && \
    chown -R app:app /app/data /app/models

USER app

# Expose port
EXPOSE 5000

# The HEALTHCHECK ensures the container is ready before other services depend on it.
# The healthcheck in docker-compose.yml will use this, so curl is required.
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:5000/health || exit 1

# Use gunicorn as the production server
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "300", "--preload", "--access-logfile", "-", "--error-logfile", "-", "app:app"]