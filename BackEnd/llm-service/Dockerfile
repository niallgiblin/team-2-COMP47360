# --- Build Stage ---
FROM python:3.9-slim as builder

# Set the working directory in the container
WORKDIR /app

# Install system dependencies needed for building
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pip-tools for dependency management
RUN pip install --no-cache-dir pip-tools

# Copy requirements, then install them with a longer timeout
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=100 -r requirements.txt

# --- Final Stage ---
FROM python:3.9-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from the builder stage
COPY --from=builder /usr/local/lib/python3.9/site-packages/ /usr/local/lib/python3.9/site-packages/
COPY --from=builder /usr/local/bin/ /usr/local/bin/

# Copy only the necessary application code into the container
COPY app.py .

# Copy the sentence transformer model into the image
COPY models/ ./models/

# Command to run the application using Gunicorn
# Use --preload to load the app once before forking workers, which is essential for ML models.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--preload", "app:app"]