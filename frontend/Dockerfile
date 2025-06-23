# Use the official Node image to build the app
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (using package*.json)
COPY package*.json ./
RUN npm install

# Copy the rest of your source code
COPY . .

EXPOSE 5173 24678

CMD ["npm", "run", "dev"]

# ----------------------------------------

# Use a smaller image to run the app
# FROM node:20-alpine AS runner

# Set working directory
# WORKDIR /app

# Install only vite globally to run the preview server
# RUN npm install -g vite

# Copy built files from the builder stage
# COPY --from=builder /app/dist ./dist

# Default Vite preview port
# EXPOSE 4173

# Serve the built app using Vite’s preview server
# CMD ["vite", "preview", "--host"]
