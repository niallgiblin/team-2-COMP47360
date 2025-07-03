# --- Build Stage ---
FROM python:3.9-slim as builder

# Set the working directory in the container
WORKDIR /app

# Install pip-tools for dependency management
RUN pip install --no-cache-dir pip-tools

# Copy and compile requirements, then install them with a longer timeout
COPY requirements.in .
RUN pip-compile requirements.in -o requirements.txt && \
    pip install --no-cache-dir --timeout=100 -r requirements.txt

# --- Final Stage ---
FROM python:3.9-slim

WORKDIR /app

# Copy installed packages from the builder stage
COPY --from=builder /usr/local/lib/python3.9/site-packages/ /usr/local/lib/python3.9/site-packages/
COPY --from=builder /usr/local/bin/ /usr/local/bin/

# Copy only the necessary application code into the container
COPY app.py .
COPY predictor/ ./predictor/

# Command to run the application using Gunicorn
# Use --preload to load the app once before forking workers, which is essential for ML models.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--preload", "app:app"]
