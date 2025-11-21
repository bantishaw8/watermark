#!/usr/bin/env python3
"""
Enterprise-Grade AI Watermark Removal Service
Provides REST API for watermark detection and inpainting using state-of-the-art AI models
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Dict, Optional
import time
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from prometheus_client import CONTENT_TYPE_LATEST
from starlette.responses import Response

from services.detector import WatermarkDetectorAI
from services.inpainter import VideoInpainterAI
from services.model_manager import ModelManager
from utils.logger import setup_logger
from utils.health import HealthCheck

# Setup logging
logger = setup_logger(__name__)

# Prometheus metrics
REQUEST_COUNT = Counter('watermark_requests_total', 'Total requests', ['endpoint', 'status'])
REQUEST_DURATION = Histogram('watermark_request_duration_seconds', 'Request duration', ['endpoint'])
ACTIVE_JOBS = Gauge('watermark_active_jobs', 'Currently active jobs')
MODEL_LOAD_TIME = Histogram('model_load_duration_seconds', 'Model loading time', ['model_name'])
DETECTION_TIME = Histogram('watermark_detection_duration_seconds', 'Watermark detection time')
INPAINTING_TIME = Histogram('watermark_inpainting_duration_seconds', 'Inpainting duration')

# Global model manager
model_manager: Optional[ModelManager] = None
detector: Optional[WatermarkDetectorAI] = None
inpainter: Optional[VideoInpainterAI] = None
health_check: Optional[HealthCheck] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle management"""
    global model_manager, detector, inpainter, health_check

    logger.info("Starting AI Watermark Removal Service...")

    try:
        # Initialize model manager
        model_manager = ModelManager()
        await model_manager.initialize()

        # Initialize detector and inpainter
        detector = WatermarkDetectorAI(model_manager)
        inpainter = VideoInpainterAI(model_manager)

        # Initialize health check
        health_check = HealthCheck(model_manager, detector, inpainter)

        logger.info("AI Service initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize AI service: {e}", exc_info=True)
        raise

    yield

    # Cleanup
    logger.info("Shutting down AI service...")
    if model_manager:
        await model_manager.cleanup()


# Create FastAPI app
app = FastAPI(
    title="AI Watermark Removal Service",
    description="Enterprise-grade AI service for video watermark detection and removal",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class DetectionRequest(BaseModel):
    video_path: str
    sensitivity: float = Field(default=0.7, ge=0.0, le=1.0)
    min_confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class WatermarkRegion(BaseModel):
    x: int
    y: int
    width: int
    height: int
    confidence: float
    type: str  # 'text', 'logo', 'graphic'


class DetectionResponse(BaseModel):
    regions: List[WatermarkRegion]
    processing_time: float
    model_version: str


class InpaintingRequest(BaseModel):
    video_path: str
    regions: List[Dict]
    output_path: Optional[str] = None
    quality: str = Field(default='high', pattern='^(low|medium|high|ultra)$')


class InpaintingResponse(BaseModel):
    output_path: str
    processing_time: float
    frames_processed: int


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    gpu_available: bool
    memory_usage: Dict[str, float]
    uptime: float


# API Endpoints

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "AI Watermark Removal Service",
        "version": "2.0.0",
        "status": "operational",
        "endpoints": {
            "health": "/health",
            "detect": "/api/v1/detect",
            "inpaint": "/api/v1/inpaint",
            "process": "/api/v1/process",
            "metrics": "/metrics"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    try:
        if not health_check:
            raise HTTPException(status_code=503, detail="Service not initialized")

        health_status = await health_check.check()
        REQUEST_COUNT.labels(endpoint='health', status='success').inc()

        return JSONResponse(content=health_status)

    except Exception as e:
        REQUEST_COUNT.labels(endpoint='health', status='error').inc()
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/api/v1/detect", response_model=DetectionResponse)
async def detect_watermarks(request: DetectionRequest):
    """
    Detect watermarks in a video using AI

    - **video_path**: Path to the video file
    - **sensitivity**: Detection sensitivity (0.0 - 1.0)
    - **min_confidence**: Minimum confidence threshold
    """
    start_time = time.time()

    try:
        if not detector:
            raise HTTPException(status_code=503, detail="Detector not initialized")

        # Validate video path
        if not Path(request.video_path).exists():
            raise HTTPException(status_code=404, detail="Video file not found")

        ACTIVE_JOBS.inc()

        # Detect watermarks
        with DETECTION_TIME.time():
            regions = await detector.detect(
                request.video_path,
                sensitivity=request.sensitivity,
                min_confidence=request.min_confidence
            )

        processing_time = time.time() - start_time

        REQUEST_COUNT.labels(endpoint='detect', status='success').inc()
        REQUEST_DURATION.labels(endpoint='detect').observe(processing_time)

        return DetectionResponse(
            regions=regions,
            processing_time=processing_time,
            model_version=detector.get_model_version()
        )

    except Exception as e:
        REQUEST_COUNT.labels(endpoint='detect', status='error').inc()
        logger.error(f"Detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        ACTIVE_JOBS.dec()


@app.post("/api/v1/inpaint", response_model=InpaintingResponse)
async def inpaint_video(request: InpaintingRequest, background_tasks: BackgroundTasks):
    """
    Remove watermarks from video using AI inpainting

    - **video_path**: Path to input video
    - **regions**: List of watermark regions to remove
    - **output_path**: Optional output path
    - **quality**: Processing quality (low, medium, high, ultra)
    """
    start_time = time.time()

    try:
        if not inpainter:
            raise HTTPException(status_code=503, detail="Inpainter not initialized")

        # Validate input
        if not Path(request.video_path).exists():
            raise HTTPException(status_code=404, detail="Video file not found")

        ACTIVE_JOBS.inc()

        # Generate output path if not provided
        output_path = request.output_path or str(
            Path(request.video_path).with_stem(f"{Path(request.video_path).stem}_watermark_removed")
        )

        # Perform inpainting
        with INPAINTING_TIME.time():
            result = await inpainter.inpaint(
                video_path=request.video_path,
                regions=request.regions,
                output_path=output_path,
                quality=request.quality
            )

        processing_time = time.time() - start_time

        REQUEST_COUNT.labels(endpoint='inpaint', status='success').inc()
        REQUEST_DURATION.labels(endpoint='inpaint').observe(processing_time)

        return InpaintingResponse(
            output_path=result['output_path'],
            processing_time=processing_time,
            frames_processed=result['frames_processed']
        )

    except Exception as e:
        REQUEST_COUNT.labels(endpoint='inpaint', status='error').inc()
        logger.error(f"Inpainting failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        ACTIVE_JOBS.dec()


@app.post("/api/v1/process")
async def process_video(request: DetectionRequest):
    """
    Complete pipeline: detect and remove watermarks

    Combines detection and inpainting in a single call
    """
    start_time = time.time()

    try:
        ACTIVE_JOBS.inc()

        # Step 1: Detect watermarks
        logger.info(f"Processing video: {request.video_path}")
        detection_result = await detect_watermarks(request)

        if not detection_result.regions:
            logger.info("No watermarks detected")
            return {
                "status": "no_watermarks_detected",
                "original_path": request.video_path,
                "processing_time": time.time() - start_time
            }

        # Step 2: Remove watermarks
        logger.info(f"Found {len(detection_result.regions)} watermark(s), removing...")
        inpaint_request = InpaintingRequest(
            video_path=request.video_path,
            regions=[region.dict() for region in detection_result.regions],
            quality='high'
        )

        inpaint_result = await inpaint_video(inpaint_request, BackgroundTasks())

        total_time = time.time() - start_time

        return {
            "status": "success",
            "watermarks_found": len(detection_result.regions),
            "output_path": inpaint_result.output_path,
            "processing_time": total_time,
            "detection_time": detection_result.processing_time,
            "inpainting_time": inpaint_result.processing_time
        }

    except Exception as e:
        logger.error(f"Processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        ACTIVE_JOBS.dec()


if __name__ == "__main__":
    # Configuration from environment
    host = os.getenv("AI_SERVICE_HOST", "0.0.0.0")
    port = int(os.getenv("AI_SERVICE_PORT", "8000"))
    workers = int(os.getenv("AI_SERVICE_WORKERS", "1"))

    logger.info(f"Starting AI service on {host}:{port} with {workers} worker(s)")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        workers=workers,
        log_level="info",
        reload=False
    )
