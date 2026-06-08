# --- Build Stage ---
FROM python:3.11-slim as builder

# Set the working directory in the container
WORKDIR /app

# Install system dependencies needed for building
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install the committed requirements.txt lock file
COPY requirements.in requirements.txt ./
RUN pip install --no-cache-dir --timeout=100 -r requirements.txt

# --- Final Stage ---
FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from the builder stage
COPY --from=builder /usr/local/lib/python3.11/site-packages/ /usr/local/lib/python3.11/site-packages/
COPY --from=builder /usr/local/bin/ /usr/local/bin/

# Copy application modules into the container
COPY app.py config.py cache_policy.py chat_service.py search_service.py loader.py dto.py prompt_loader.py google_places.py query_expander.py bm25_index.py observability.py ./
COPY retrieval/ ./retrieval/
COPY venue_corpus/ ./venue_corpus/
COPY prompts/ ./prompts/

# Copy Phase 19 lifecycle files
COPY gunicorn.conf.py docker-entrypoint.sh ./

# Copy the sentence transformer model into the image
COPY models/ ./models/
# Copy pre-baked cross-encoder model (run scripts/download_cross_encoder.py first)
COPY models/cross-encoder/ ./models/cross-encoder/

# Use the entrypoint for Prometheus multiprocess directory cleanup
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]