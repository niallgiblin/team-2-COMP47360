# Manual EC2 Deployment Guide

## Problem: Git LFS and Large Model Files

The main issue you encountered was likely due to Git LFS (Large File Storage). When you clone a repository with Git LFS, you only get pointer files unless Git LFS is properly configured on the server.

## Solution: Complete File Transfer

### Method 1: Using the Automated Script (Recommended)

1. **Update the deployment script:**
   ```bash
   # Edit deploy-to-ec2.sh and update these variables:
   EC2_USER="ubuntu"  # Your EC2 username
   EC2_IP="46.137.74.122"  # Your EC2 IP
   EC2_KEY_PATH="~/.ssh/your-key.pem"  # Path to your SSH key
   ```

2. **Run the deployment:**
   ```bash
   chmod +x deploy-to-ec2.sh
   ./deploy-to-ec2.sh
   ```

### Method 2: Manual Step-by-Step Deployment

#### Step 1: Prepare Your Local Environment

1. **Create a complete archive:**
   ```bash
   # Create archive excluding unnecessary files
   tar --exclude='.git' \
       --exclude='node_modules' \
       --exclude='frontend/node_modules' \
       --exclude='BackEnd/target' \
       --exclude='.vscode' \
       --exclude='*.log' \
       -czf urban-gala-complete.tar.gz .
   ```

2. **Verify the archive contains model files:**
   ```bash
   # Check archive contents
   tar -tzf urban-gala-complete.tar.gz | grep -E "\.(keras|h5|pkl|safetensors)$" | head -10
   ```

#### Step 2: Clean Up EC2 Instance

1. **SSH into your EC2 instance:**
   ```bash
   ssh -i ~/.ssh/your-key.pem ubuntu@46.137.74.122
   ```

2. **Stop existing containers:**
   ```bash
   cd /home/ubuntu/urban-gala  # or wherever your project is
   docker-compose down --remove-orphans
   ```

3. **Remove old files:**
   ```bash
   cd /home/ubuntu
   rm -rf urban-gala
   ```

4. **Clean up Docker:**
   ```bash
   docker system prune -f
   ```

#### Step 3: Transfer Files to EC2

1. **Transfer the archive:**
   ```bash
   # From your local machine
   scp -i ~/.ssh/your-key.pem urban-gala-complete.tar.gz ubuntu@46.137.74.122:/tmp/
   ```

2. **Extract on EC2:**
   ```bash
   # On EC2
   mkdir -p /home/ubuntu/urban-gala
   cd /home/ubuntu/urban-gala
   tar -xzf /tmp/urban-gala-complete.tar.gz
   rm /tmp/urban-gala-complete.tar.gz
   ```

#### Step 4: Verify File Transfer

1. **Check file counts:**
   ```bash
   # On EC2
   cd /home/ubuntu/urban-gala
   
   echo "Total files: $(find . -type f | wc -l)"
   echo "Model files: $(find . -name "*.keras" | wc -l)"
   echo "LLM model files: $(find . -path "*/llm-service/models/*" | wc -l)"
   echo "Busyness model files: $(find . -path "*/busyness-service/models/*" | wc -l)"
   ```

2. **Check file sizes:**
   ```bash
   du -sh BackEnd/llm-service/models/
   du -sh BackEnd/busyness-service/models/
   ```

3. **Verify large files exist:**
   ```bash
   find . -type f -size +10M | head -10
   ```

#### Step 5: Set Up Environment

1. **Copy environment template:**
   ```bash
   cp env.production.example .env
   ```

2. **Edit environment file:**
   ```bash
   nano .env
   ```

3. **Generate nginx configuration:**
   ```bash
   chmod +x generate-nginx-config.sh
   ./generate-nginx-config.sh
   ```

4. **Make deployment script executable:**
   ```bash
   chmod +x deploy-production.sh
   ```

#### Step 6: Deploy Application

1. **Run deployment:**
   ```bash
   ./deploy-production.sh
   ```

2. **Monitor deployment:**
   ```bash
   ./performance-monitor.sh
   ```

## Verification Checklist

### Before Deployment:
- [ ] Archive contains all model files
- [ ] Environment variables are configured
- [ ] SSH key has proper permissions

### After Deployment:
- [ ] All 68 Keras files are present
- [ ] LLM service models are loaded
- [ ] Busyness service models are loaded
- [ ] Services are healthy
- [ ] Frontend can communicate with backend

## Troubleshooting

### If model files are missing:
```bash
# Check what's in the archive
tar -tzf urban-gala-complete.tar.gz | grep "\.keras"

# Check file sizes
ls -lah BackEnd/busyness-service/models/DNNs/ | head -10
```

### If services fail to start:
```bash
# Check service logs
docker-compose logs -f llm-service
docker-compose logs -f busyness-service

# Check container file system
docker exec urban-gala-llm ls -la /app/models/
docker exec urban-gala-busyness ls -la /app/models/
```

### If you need to re-deploy:
```bash
# Clean everything and start fresh
docker-compose down --volumes --remove-orphans
docker system prune -af
rm -rf /home/ubuntu/urban-gala
# Then follow the deployment steps again
```

## File Size Expectations

Your deployment should include:
- **LLM Service Models:** ~500MB-1GB
- **Busyness Service Models:** ~2-5GB (68 Keras files)
- **Total Project Size:** ~3-6GB

If your archive is significantly smaller, the model files weren't included properly. 