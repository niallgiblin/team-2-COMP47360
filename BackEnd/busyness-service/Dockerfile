FROM python:3.11-slim as builder

# Set the working directory in the container
WORKDIR /app

# Install pip-tools to compile requirements
RUN pip install --no-cache-dir pip-tools

# Copy requirements.in and compile it to requirements.txt
COPY requirements.in .
RUN pip-compile requirements.in -o requirements.txt

# --- Final Stage ---
FROM python:3.11-slim

WORKDIR /app

# Create a non-root user for security
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

# Copy the compiled requirements.txt from the builder stage and install dependencies
COPY --from=builder /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application's code into the container.
COPY --chown=appuser:appgroup . .

# Switch to the non-root user
USER appuser

# Command to run the application using Gunicorn for production
# Use waitress, a production-ready server that is more stable with TensorFlow than Gunicorn.
CMD ["waitress-serve", "--host=0.0.0.0", "--port=5000", "app:app"]
