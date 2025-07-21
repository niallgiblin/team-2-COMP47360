# ---- 1. Build Stage ----
# Create a temporary image to build our static assets
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
# This is done in a separate layer to leverage Docker's caching
COPY package*.json ./
RUN npm install

# Copy the environment file for the build process
# IMPORTANT: This file must exist on your EC2 instance in the frontend/ directory
COPY .env.production ./

# Copy the rest of the application source code
COPY . .

# Build the production-ready static files
# Vite will automatically use .env.production
RUN npm run build

# ---- 2. Final Stage ----
# Use a lightweight Nginx image to serve the built files
FROM nginx:1.25-alpine

# Copy the built static assets from the 'builder' stage
# The output of 'npm run build' is in the /app/dist directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our custom Nginx config to handle SPA routing
# We will create this file next.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 for the Nginx server
EXPOSE 80

# The command to start the Nginx server
CMD ["nginx", "-g", "daemon off;"]
