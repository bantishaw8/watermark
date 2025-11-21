"""
Model Manager for AI Service
Handles model loading, caching, and lifecycle management
"""

import torch
import logging
from typing import Dict, Optional
from pathlib import Path
import asyncio
from ultralytics import YOLO
import os

logger = logging.getLogger(__name__)


class ModelManager:
    """Enterprise model management with caching and optimization"""

    def __init__(self, cache_dir: str = "./models"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.models: Dict[str, any] = {}
        self.model_configs = {
            'yolov8': {
                'path': 'yolov8n.pt',  # Nano model for speed
                'type': 'detection'
            },
            'yolov8m': {
                'path': 'yolov8m.pt',  # Medium model for accuracy
                'type': 'detection'
            },
            'sam': {
                'path': 'sam_vit_b_01ec64.pth',
                'type': 'segmentation'
            }
        }

        logger.info(f"Model Manager initialized on device: {self.device}")
        logger.info(f"Model cache directory: {self.cache_dir}")

    async def initialize(self):
        """Initialize and preload models"""
        try:
            logger.info("Loading AI models...")

            # Load YOLOv8 for detection
            await self._load_yolo()

            # Optionally load SAM if available
            try:
                await self._load_sam()
            except Exception as e:
                logger.warning(f"SAM not loaded (optional): {e}")

            logger.info("All models loaded successfully")

        except Exception as e:
            logger.error(f"Model initialization failed: {e}", exc_info=True)
            raise

    async def _load_yolo(self):
        """Load YOLO model"""
        try:
            model_name = 'yolov8'
            model_path = self.model_configs[model_name]['path']

            logger.info(f"Loading YOLO model: {model_path}")

            # YOLO will download automatically if not present
            model = YOLO(model_path)
            model.to(self.device)

            self.models[model_name] = model

            logger.info(f"YOLO model loaded: {model_name}")

        except Exception as e:
            logger.error(f"Failed to load YOLO: {e}")
            raise

    async def _load_sam(self):
        """Load Segment Anything Model (optional)"""
        try:
            # SAM requires segment_anything package
            from segment_anything import sam_model_registry, SamPredictor

            model_name = 'sam'
            checkpoint = self.cache_dir / self.model_configs[model_name]['path']

            if not checkpoint.exists():
                logger.warning("SAM checkpoint not found, skipping")
                return

            sam = sam_model_registry["vit_b"](checkpoint=str(checkpoint))
            sam.to(self.device)

            predictor = SamPredictor(sam)
            self.models[model_name] = predictor

            logger.info("SAM model loaded successfully")

        except ImportError:
            logger.warning("segment_anything package not installed")
        except Exception as e:
            logger.warning(f"Failed to load SAM: {e}")

    async def get_model(self, model_name: str):
        """Get a loaded model"""
        if model_name not in self.models:
            raise ValueError(f"Model not loaded: {model_name}")

        return self.models[model_name]

    def is_model_loaded(self, model_name: str) -> bool:
        """Check if model is loaded"""
        return model_name in self.models

    def get_device_info(self) -> Dict:
        """Get device information"""
        info = {
            'device': str(self.device),
            'cuda_available': torch.cuda.is_available()
        }

        if torch.cuda.is_available():
            info['cuda_version'] = torch.version.cuda
            info['gpu_name'] = torch.cuda.get_device_name(0)
            info['gpu_memory_total'] = torch.cuda.get_device_properties(0).total_memory / 1e9
            info['gpu_memory_allocated'] = torch.cuda.memory_allocated(0) / 1e9
            info['gpu_memory_cached'] = torch.cuda.memory_reserved(0) / 1e9

        return info

    def get_memory_usage(self) -> Dict:
        """Get memory usage statistics"""
        memory_info = {}

        if torch.cuda.is_available():
            memory_info['gpu_allocated_gb'] = torch.cuda.memory_allocated(0) / 1e9
            memory_info['gpu_reserved_gb'] = torch.cuda.memory_reserved(0) / 1e9
            memory_info['gpu_free_gb'] = (
                torch.cuda.get_device_properties(0).total_memory -
                torch.cuda.memory_allocated(0)
            ) / 1e9
        else:
            memory_info['gpu_allocated_gb'] = 0
            memory_info['gpu_reserved_gb'] = 0
            memory_info['gpu_free_gb'] = 0

        return memory_info

    async def cleanup(self):
        """Cleanup models and free memory"""
        logger.info("Cleaning up models...")

        for model_name in list(self.models.keys()):
            try:
                del self.models[model_name]
            except Exception as e:
                logger.warning(f"Failed to cleanup {model_name}: {e}")

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info("Model cleanup completed")

    def get_loaded_models(self) -> list:
        """Get list of loaded model names"""
        return list(self.models.keys())
