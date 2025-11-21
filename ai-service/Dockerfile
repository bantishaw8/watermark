# Enterprise-Grade AI Watermark Removal Service
# Multi-stage build for optimized image size

FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04 as base

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Download AI models at build time
RUN python3 -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Copy application code
COPY . .

# Create directories
RUN mkdir -p /app/models /app/temp /app/logs

# Set permissions
RUN chmod +x /app/main.py

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Run service
CMD ["python3", "main.py"]
