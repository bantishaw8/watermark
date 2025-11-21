"""
Health Check System for AI Service
Monitors system health, model status, and resource usage
"""

import time
import logging
import psutil
import torch
from typing import Dict

logger = logging.getLogger(__name__)


class HealthCheck:
    """System health monitoring"""

    def __init__(self, model_manager, detector, inpainter):
        self.model_manager = model_manager
        self.detector = detector
        self.inpainter = inpainter
        self.start_time = time.time()

    async def check(self) -> Dict:
        """Perform comprehensive health check"""
        try:
            # Check models
            models_status = self._check_models()

            # Check resources
            resources = self._check_resources()

            # Calculate uptime
            uptime = time.time() - self.start_time

            # Determine overall status
            status = 'healthy'
            if not models_status['all_loaded']:
                status = 'degraded'
            if resources['memory_percent'] > 90 or resources['cpu_percent'] > 95:
                status = 'overloaded'

            return {
                'status': status,
                'models_loaded': models_status['all_loaded'],
                'loaded_models': models_status['loaded_models'],
                'gpu_available': torch.cuda.is_available(),
                'memory_usage': self.model_manager.get_memory_usage(),
                'system_resources': resources,
                'uptime': uptime
            }

        except Exception as e:
            logger.error(f"Health check failed: {e}", exc_info=True)
            return {
                'status': 'error',
                'error': str(e),
                'models_loaded': False,
                'gpu_available': False,
                'memory_usage': {},
                'uptime': time.time() - self.start_time
            }

    def _check_models(self) -> Dict:
        """Check model loading status"""
        loaded_models = self.model_manager.get_loaded_models()

        return {
            'all_loaded': len(loaded_models) > 0,
            'loaded_models': loaded_models,
            'count': len(loaded_models)
        }

    def _check_resources(self) -> Dict:
        """Check system resource usage"""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=0.1)

            # Memory usage
            memory = psutil.virtual_memory()

            # Disk usage
            disk = psutil.disk_usage('/')

            return {
                'cpu_percent': cpu_percent,
                'memory_percent': memory.percent,
                'memory_available_gb': memory.available / 1e9,
                'memory_total_gb': memory.total / 1e9,
                'disk_percent': disk.percent,
                'disk_free_gb': disk.free / 1e9
            }

        except Exception as e:
            logger.warning(f"Resource check failed: {e}")
            return {}
