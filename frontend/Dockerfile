# Use the official Node image to build the app
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (using package*.json)
COPY package*.json ./
RUN npm install

# Copy the rest of your source code
COPY . .

# Copy environment variables for build
COPY .env .env

# Build the app for production with environment variables
RUN npm run build

# ----------------------------------------

# Use a smaller image to run the app
FROM nginx:alpine AS runner

# Copy built files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
