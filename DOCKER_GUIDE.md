# Docker Deployment Guide

Quick guide to get the system running with Docker.

## Option 1: Simple Setup (Recommended for First Time)

Use this if you don't have GPU or want the simplest setup:

```bash
# Start all services (single worker)
docker-compose -f docker-compose.simple.yml up -d

# Check status
docker-compose -f docker-compose.simple.yml ps

# View logs
docker-compose -f docker-compose.simple.yml logs -f

# Stop
docker-compose -f docker-compose.simple.yml down
```

## Option 2: Full Setup with GPU

If you have NVIDIA GPU and want GPU acceleration:

### Prerequisites
```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

### Deploy
```bash
# Start with GPU support
docker-compose up -d

# Scale workers (multiple worker instances)
docker-compose up -d --scale worker=3

# Check GPU usage
watch -n 1 nvidia-smi
```

## Option 3: CPU-Only (No GPU)

If you have no GPU, modify the ai-service in docker-compose.yml:

```bash
# Remove the deploy.resources section from ai-service
# Or use docker-compose.simple.yml
docker-compose -f docker-compose.simple.yml up -d
```

## Common Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f ai-service
docker-compose logs -f worker

# Restart a service
docker-compose restart worker

# Scale workers
docker-compose up -d --scale worker=5

# Rebuild after code changes
docker-compose build
docker-compose up -d

# Remove everything (including volumes)
docker-compose down -v
```

## Access Services

Once running, access at:
- **AI Service**: http://localhost:8000/health
- **API Server**: http://localhost:3000/health
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 8000
lsof -i :8000
# Kill it or change port in docker-compose.yml
```

### GPU Not Detected
```bash
# Check NVIDIA drivers
nvidia-smi

# Check Docker can access GPU
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi

# If fails, reinstall nvidia-container-toolkit
```

### Out of Memory
```bash
# Reduce workers
docker-compose up -d --scale worker=1

# Or increase Docker memory limit in Docker Desktop settings
```

### Service Won't Start
```bash
# Check logs
docker-compose logs [service-name]

# Rebuild
docker-compose build [service-name]
docker-compose up -d [service-name]

# Check if dependent services are running
docker-compose ps
```

### Clean Start
```bash
# Remove everything and start fresh
docker-compose down -v
docker system prune -a
docker-compose up -d
```

## Production Deployment

For production, use Docker Swarm or Kubernetes:

### Docker Swarm
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml watermark

# Scale workers
docker service scale watermark_worker=10

# Check services
docker service ls
docker service logs watermark_worker
```

### Resource Limits

Add to docker-compose.yml:
```yaml
services:
  worker:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

## Monitoring

### Check Container Stats
```bash
docker stats
```

### Prometheus Metrics
```bash
curl http://localhost:9090/api/v1/targets
```

### Grafana Dashboards
1. Open http://localhost:3001
2. Login: admin/admin
3. Add Prometheus data source: http://prometheus:9090
4. Import dashboards from monitoring/grafana/

## Environment Variables

Create `.env` file in project root:
```bash
# Copy example
cp .env.example .env

# Edit as needed
AI_SERVICE_PORT=8000
API_PORT=3000
REDIS_PORT=6379
USE_AI=true
WORKER_CONCURRENCY=2
```

## Volumes

Data is persisted in Docker volumes:
- `redis-data`: Job queue data
- `prometheus-data`: Metrics history
- `grafana-data`: Dashboards and settings

To backup:
```bash
docker run --rm -v watermark_redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz /data
```

## Network

All services communicate via `watermark-network` bridge network.

To inspect:
```bash
docker network inspect watermark_watermark-network
```

## Quick Test

After starting services:
```bash
# 1. Check all services healthy
curl http://localhost:8000/health
curl http://localhost:3000/health

# 2. Download test video
wget https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4 -O test.mp4

# 3. Copy to container
docker cp test.mp4 watermark-api:/videos/test.mp4

# 4. Process via API
curl -X POST http://localhost:3000/api/v1/process \
  -H "Content-Type: application/json" \
  -d '{"video_path": "/videos/test.mp4"}'

# 5. Check job status (replace JOB_ID)
curl http://localhost:3000/api/v1/jobs/JOB_ID

# 6. Get output
docker cp watermark-api:/output/test_processed.mp4 ./
```

---

**Need help?** Check logs with `docker-compose logs -f`
