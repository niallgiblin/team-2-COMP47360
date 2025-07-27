#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set additional environment variables for local development
export APP_JWT_SECRET="b2NlYW4tYnJlZXplLXdpdGgtc2VjcmV0LWtleS1mb3ItdXJiYW4tZ2FsYQo="
export SPRING_DATASOURCE_URL="jdbc:mysql://localhost:3307/urban_gala?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
export SPRING_DATASOURCE_USERNAME="urbanuser"
export SPRING_DATASOURCE_PASSWORD="password123"

# Run the Spring Boot application
cd backend
mvn spring-boot:run 