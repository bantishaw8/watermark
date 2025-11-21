"""
Structured Logging for AI Service
"""

import logging
import sys
from pythonjsonlogger import jsonlogger


def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    """Setup structured JSON logger"""

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))

    # Remove existing handlers
    logger.handlers = []

    # Create console handler
    handler = logging.StreamHandler(sys.stdout)

    # JSON formatter for structured logs
    formatter = jsonlogger.JsonFormatter(
        '%(asctime)s %(name)s %(levelname)s %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger
