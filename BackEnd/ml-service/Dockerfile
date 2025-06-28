# Use a specific, stable base image
FROM python:3.9.18-slim-bookworm

# Set environment variables to prevent Python from writing .pyc files and to buffer output
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory
WORKDIR /app

# Create a virtual environment for dependency isolation
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy and install requirements
# This is done in a separate step to leverage Docker's layer caching.
# It ensures dependencies are only re-installed when requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# The CMD instruction specifies the default command to run.
# This will be correctly overridden by the 'command' in docker-compose.yml.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "app:app"]