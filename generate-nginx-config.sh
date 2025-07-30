#!/bin/bash

# Generate nginx configuration with correct server name
# This script creates the nginx.conf file with the server name from environment variables

echo "🔧 Generating nginx configuration..."

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Default to localhost if not set
SERVER_NAME=${NGINX_SERVER_NAME:-localhost}

echo "📝 Using server name: $SERVER_NAME"

# Create nginx configuration
cat > nginx/nginx.conf << EOF
events {}

http {
    include /etc/nginx/mime.types;
    
    server {
        listen 80;
        server_name $SERVER_NAME;

        location / {
            proxy_pass http://frontend:5173;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        location /api/ {
            proxy_pass http://backend:8080/api/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location /api/chat/ {
            proxy_pass http://llm-service:5000/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # Handle avatar images
        location /avatars/ {
            proxy_pass http://backend:8080/avatars/;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
    }
}
EOF

echo "✅ Nginx configuration generated with server name: $SERVER_NAME"
echo "📁 Configuration saved to: nginx/nginx.conf" 