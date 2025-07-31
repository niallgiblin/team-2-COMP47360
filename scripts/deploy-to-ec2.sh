#!/bin/bash

# Comprehensive EC2 Deployment Script
# This script ensures all files, including large model files, are properly deployed

set -e  # Exit on any error

# Configuration
EC2_USER="ubuntu"  # Change if using different user
EC2_IP="46.137.74.122"  # Your EC2 IP
EC2_KEY_PATH="/Users/ng/Desktop/Summer25/ug-ec2.pem"  # Path to your EC2 key file
REMOTE_DIR="/home/ubuntu/urban-gala"

echo "Urban Gala EC2 Deployment Script"
echo "===================================="

# Check if SSH key exists
if [ ! -f "$EC2_KEY_PATH" ]; then
    echo "Error: SSH key not found at $EC2_KEY_PATH"
    echo "Please update the EC2_KEY_PATH variable in this script"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please copy env.production.example to .env and configure your values."
    exit 1
fi

echo "Environment check passed"

# Step 1: Create a complete archive of the project (excluding git and node_modules)
echo "Creating complete project archive..."
tar --exclude='.git' \
    --exclude='node_modules' \
    --exclude='frontend/node_modules' \
    --exclude='BackEnd/target' \
    --exclude='.vscode' \
    --exclude='*.log' \
    -czf urban-gala-complete.tar.gz .

echo "Archive created: urban-gala-complete.tar.gz"

# Step 2: Connect to EC2 and clean up existing deployment
echo "Connecting to EC2 instance..."
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'EOF'
    echo "Cleaning up existing deployment..."
    
    # Stop any running containers
    if [ -d "$REMOTE_DIR" ]; then
        cd "$REMOTE_DIR"
        docker-compose down --remove-orphans 2>/dev/null || true
    fi
    
    # Remove old directory
    rm -rf "$REMOTE_DIR"
    
    # Clean up Docker images to free space
    docker system prune -f
    
    echo "Cleanup completed"
EOF

# Step 3: Transfer the complete archive
echo "Transferring project files to EC2..."
scp -i "$EC2_KEY_PATH" urban-gala-complete.tar.gz "$EC2_USER@$EC2_IP:/tmp/"

# Step 4: Extract and set up on EC2
echo "🔧 Setting up project on EC2..."
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'EOF'
    echo "Extracting project files..."
    mkdir -p "$REMOTE_DIR"
    cd "$REMOTE_DIR"
    tar -xzf /tmp/urban-gala-complete.tar.gz
    rm /tmp/urban-gala-complete.tar.gz
    
    echo "🔧 Setting up environment..."
    
    # Copy environment file
    if [ -f env.production.example ]; then
        cp env.production.example .env
        echo "Please edit .env file with your actual values"
    fi
    
    # Generate nginx configuration
    if [ -f generate-nginx-config.sh ]; then
        chmod +x generate-nginx-config.sh
        ./generate-nginx-config.sh
    fi
    
    # Make deployment script executable
    if [ -f deploy-production.sh ]; then
        chmod +x deploy-production.sh
    fi
    
    echo "Project setup completed"
EOF

# Step 5: Verify file transfer
echo "Verifying file transfer..."
ssh -i "$EC2_KEY_PATH" "$EC2_USER@$EC2_IP" << 'EOF'
    cd "$REMOTE_DIR"
    
    echo "File verification:"
    echo "Total files: $(find . -type f | wc -l)"
    echo "Model files: $(find . -name "*.keras" | wc -l)"
    echo "LLM model files: $(find . -path "*/llm-service/models/*" | wc -l)"
    echo "Busyness model files: $(find . -path "*/busyness-service/models/*" | wc -l)"
    
    # Check for large files
    echo "Large files (>10MB):"
    find . -type f -size +10M | head -10
    
    echo "File verification completed"
EOF

echo ""
echo "Deployment completed successfully!"
echo ""
echo "Next steps:"
echo "1. SSH into your EC2 instance:"
echo "   ssh -i $EC2_KEY_PATH $EC2_USER@$EC2_IP"
echo ""
echo "2. Navigate to the project directory:"
echo "   cd $REMOTE_DIR"
echo ""
echo "3. Edit the environment file:"
echo "   nano .env"
echo ""
echo "4. Deploy the application:"
echo "   ./deploy-production.sh"
echo ""
echo "5. Monitor the deployment:"
echo "   ./performance-monitor.sh"
echo ""
echo "Check file sizes:"
echo "   du -sh BackEnd/llm-service/models/"
echo "   du -sh BackEnd/busyness-service/models/" 