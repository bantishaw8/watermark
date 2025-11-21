# Enterprise AI Watermark Remover - Setup Guide

This guide will help you set up the AI-powered watermark removal system from scratch.

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Deployment Options](#deployment-options)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)

## System Requirements

### Minimum Requirements
- **CPU**: 4 cores
- **RAM**: 8GB
- **Storage**: 50GB free
- **OS**: Linux (Ubuntu 20.04+), macOS, Windows 10+
- **Node.js**: 18.0.0+
- **Python**: 3.10+

### Recommended for Production
- **CPU**: 8+ cores
- **RAM**: 16GB+
- **GPU**: NVIDIA GPU with 6GB+ VRAM (for AI acceleration)
- **Storage**: 100GB+ SSD
- **Network**: 100Mbps+

## Installation

### Step 1: Install System Dependencies

#### Ubuntu/Debian
```bash
# Update package lists
sudo apt update

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3.10
sudo apt install -y python3.10 python3-pip

# Install FFmpeg
sudo apt install -y ffmpeg

# Install Redis
sudo apt install -y redis-server

# For GPU support (optional)
# Install NVIDIA drivers and CUDA toolkit
# See: https://developer.nvidia.com/cuda-downloads
```

#### macOS
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node@20
brew install python@3.10
brew install ffmpeg
brew install redis

# Start Redis
brew services start redis
```

#### Windows
```powershell
# Install using Chocolatey
choco install nodejs-lts
choco install python310
choco install ffmpeg
choco install redis-64

# Or download manually from official websites
```

### Step 2: Clone Repository

```bash
git clone <repository-url>
cd watermark
```

### Step 3: Install Node.js Dependencies

```bash
npm install
```

### Step 4: Install Python Dependencies

```bash
cd ai-service
pip3 install -r requirements.txt
cd ..
```

### Step 5: Download AI Models

Models will be downloaded automatically on first run, or pre-download:

```bash
cd ai-service
python3 -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
cd ..
```

## Configuration

### Step 1: Create Environment File

```bash
cp .env.example .env
```

### Step 2: Edit Configuration

Edit `.env` file:

```bash
# AI Service Configuration
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_PORT=8000
AI_SERVICE_WORKERS=2

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# API Configuration
API_PORT=3000
WORKER_CONCURRENCY=2

# Features
USE_AI=true
DEFAULT_QUALITY=high

# GPU Support
USE_GPU=true  # Set to false if no GPU
```

### Step 3: Verify Redis

```bash
# Check Redis is running
redis-cli ping
# Should return: PONG
```

## Deployment Options

### Option A: Docker Deployment (Recommended)

#### Prerequisites
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# For GPU support
# Install NVIDIA Docker runtime
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update
sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

#### Build and Run
```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Services Overview
- **ai-service**: http://localhost:8000 - AI inference service
- **api**: http://localhost:3000 - REST API
- **worker**: Background job processor
- **redis**: Job queue
- **prometheus**: http://localhost:9090 - Metrics
- **grafana**: http://localhost:3001 - Monitoring (admin/admin)

### Option B: Manual Deployment

#### Terminal 1: Start Redis
```bash
redis-server
```

#### Terminal 2: Start AI Service
```bash
cd ai-service
python3 main.py
```

#### Terminal 3: Start API Server
```bash
npm run api
```

#### Terminal 4: Start Worker
```bash
npm run worker
```

#### Terminal 5: Use CLI
```bash
npm start process video.mp4
```

### Option C: Production Deployment (Kubernetes)

See `k8s/` directory for Kubernetes manifests (coming soon).

## Testing

### Test 1: Health Checks

```bash
# Test AI Service
curl http://localhost:8000/health

# Test API
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "models_loaded": true,
  "gpu_available": true,
  "uptime": 123.45
}
```

### Test 2: Process Sample Video

```bash
# Download sample video
wget https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4 -O test.mp4

# Process with AI
npm start process test.mp4

# Check output
ls -lh output/
```

### Test 3: API Test

```bash
# Submit job
curl -X POST http://localhost:3000/api/v1/process \
  -H "Content-Type: application/json" \
  -d '{"video_path": "./test.mp4"}'

# Get job status (replace JOB_ID)
curl http://localhost:3000/api/v1/jobs/JOB_ID
```

### Test 4: Queue Test

```bash
# Check queue stats
curl http://localhost:3000/api/v1/stats
```

## Production Deployment

### Security Hardening

1. **Change Default Passwords**
```bash
# Redis password
# Edit docker-compose.yml and add:
# command: redis-server --requirepass YOUR_PASSWORD

# Grafana
# Change admin password on first login
```

2. **Enable HTTPS**
```bash
# Use nginx/traefik as reverse proxy
# Example nginx config:

server {
    listen 443 ssl;
    server_name watermark.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. **Configure Firewall**
```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

4. **Set Resource Limits**
Edit `docker-compose.yml`:
```yaml
services:
  ai-service:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

### Monitoring Setup

1. **Configure Prometheus**
   - Edit `monitoring/prometheus.yml`
   - Add alerting rules
   - Configure remote storage (optional)

2. **Set Up Grafana Dashboards**
   - Access http://localhost:3001
   - Login with admin/admin
   - Import dashboards from `monitoring/grafana/dashboards/`

3. **Set Up Alerts**
   - Configure email/Slack notifications
   - Set threshold alerts for:
     - API latency > 5s
     - Job failure rate > 10%
     - Queue size > 100
     - Memory usage > 90%

### Backup Strategy

1. **Database Backup** (Redis)
```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR=/backup/redis
DATE=$(date +%Y%m%d_%H%M%S)
redis-cli SAVE
cp /var/lib/redis/dump.rdb $BACKUP_DIR/dump_$DATE.rdb
find $BACKUP_DIR -mtime +7 -delete  # Keep 7 days
```

2. **Output Files Backup**
```bash
# Sync to S3/object storage
aws s3 sync ./output s3://your-bucket/watermark-outputs/
```

### Scaling

#### Horizontal Scaling (Multiple Workers)
```bash
# Scale workers
docker-compose up -d --scale worker=5
```

#### Load Balancing (Multiple API Instances)
```yaml
# docker-compose.yml
services:
  api:
    deploy:
      replicas: 3
```

Add nginx load balancer:
```nginx
upstream api_backend {
    least_conn;
    server api-1:3000;
    server api-2:3000;
    server api-3:3000;
}

server {
    location / {
        proxy_pass http://api_backend;
    }
}
```

## Troubleshooting

### Issue: AI Service Fails to Start

**Solution 1**: Check Python dependencies
```bash
cd ai-service
pip3 install -r requirements.txt --upgrade
```

**Solution 2**: Check GPU availability
```bash
python3 -c "import torch; print('CUDA:', torch.cuda.is_available())"
# If False but GPU present, reinstall PyTorch with CUDA
pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

### Issue: Out of Memory

**Solution**: Reduce concurrency
```bash
# In .env
WORKER_CONCURRENCY=1
AI_SERVICE_WORKERS=1
```

Or increase Docker memory:
```yaml
services:
  ai-service:
    mem_limit: 8g
```

### Issue: Slow Processing

**Solution 1**: Enable GPU
```bash
# Check GPU usage
nvidia-smi

# Enable in .env
USE_GPU=true
```

**Solution 2**: Lower quality
```bash
# In .env
DEFAULT_QUALITY=medium
```

### Issue: Queue Stuck

**Solution**: Restart worker
```bash
docker-compose restart worker

# Or clear queue
redis-cli FLUSHDB
```

## Support

- **Documentation**: See AI_README.md
- **Logs**: `docker-compose logs -f [service]`
- **Debug**: Set `LOG_LEVEL=debug` in .env

---

**Setup complete!** 🎉

You're now ready to process videos with AI-powered watermark removal.
