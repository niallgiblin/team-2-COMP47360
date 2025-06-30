# Use Python 3.9-slim for better compatibility with ML libraries
FROM python:3.9.18-slim-bookworm

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Install system dependencies for ML libraries
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment for dependency isolation
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies in a single layer for efficiency.
# PyTorch is installed from its specific index for compatibility.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        $(grep -i '^torch==' requirements.txt) && \
    grep -v -i '^torch==' requirements.txt > /tmp/other_requirements.txt && \
    pip install --no-cache-dir -r /tmp/other_requirements.txt

# Copy application code
COPY . .

# Create a non-root user for security
RUN useradd --create-home --shell /bin/bash app && \
    chown -R app:app /app

# Ensure data and models directories exist
RUN mkdir -p /app/data /app/models && \
    chown -R app:app /app/data /app/models

USER app

# Expose port
EXPOSE 5000

# Health check endpoint with longer timeout for model loading
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:5000/health || exit 1

# Use gunicorn as the production server
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "300", "--preload", "--access-logfile", "-", "--error-logfile", "-", "app:app"]