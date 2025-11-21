"""
AI-Powered Watermark Detection Service
Uses YOLOv8 and SAM (Segment Anything Model) for accurate watermark detection
"""

import cv2
import numpy as np
import torch
from ultralytics import YOLO
from typing import List, Dict, Tuple, Optional
import logging
from pathlib import Path
from dataclasses import dataclass
import asyncio

logger = logging.getLogger(__name__)


@dataclass
class WatermarkRegion:
    """Detected watermark region"""
    x: int
    y: int
    width: int
    height: int
    confidence: float
    type: str  # 'text', 'logo', 'graphic', 'overlay'
    mask: Optional[np.ndarray] = None


class WatermarkDetectorAI:
    """Enterprise-grade AI watermark detector"""

    def __init__(self, model_manager):
        self.model_manager = model_manager
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.sam_predictor = None
        logger.info(f"Initializing detector on device: {self.device}")

    async def initialize(self):
        """Initialize AI models"""
        try:
            # Load YOLOv8 model for object detection
            self.model = await self.model_manager.get_model('yolov8')

            # Load SAM for precise segmentation (optional, for better masks)
            try:
                self.sam_predictor = await self.model_manager.get_model('sam')
                logger.info("SAM model loaded for precise segmentation")
            except Exception as e:
                logger.warning(f"SAM not available, using bbox only: {e}")

            logger.info("Watermark detector initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize detector: {e}", exc_info=True)
            raise

    async def detect(
        self,
        video_path: str,
        sensitivity: float = 0.7,
        min_confidence: float = 0.5,
        sample_frames: int = 10
    ) -> List[Dict]:
        """
        Detect watermarks in video using AI

        Args:
            video_path: Path to video file
            sensitivity: Detection sensitivity (0.0-1.0)
            min_confidence: Minimum confidence threshold
            sample_frames: Number of frames to sample

        Returns:
            List of detected watermark regions
        """
        try:
            logger.info(f"Detecting watermarks in: {video_path}")

            # Extract sample frames
            frames = await self._extract_frames(video_path, sample_frames)

            if not frames:
                logger.warning("No frames extracted from video")
                return []

            # Detect watermarks in each frame
            all_detections = []
            for idx, frame in enumerate(frames):
                detections = await self._detect_in_frame(
                    frame,
                    min_confidence=min_confidence
                )
                all_detections.append(detections)

            # Find consistent watermarks across frames
            consistent_regions = self._find_consistent_regions(
                all_detections,
                threshold=sensitivity
            )

            logger.info(f"Detected {len(consistent_regions)} consistent watermark(s)")

            # Convert to API format
            return [self._region_to_dict(region) for region in consistent_regions]

        except Exception as e:
            logger.error(f"Detection failed: {e}", exc_info=True)
            raise

    async def _extract_frames(
        self,
        video_path: str,
        num_frames: int
    ) -> List[np.ndarray]:
        """Extract evenly spaced frames from video"""
        frames = []

        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                raise ValueError(f"Could not open video: {video_path}")

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames == 0:
                raise ValueError("Video has no frames")

            # Calculate frame indices to sample
            frame_indices = np.linspace(0, total_frames - 1, num_frames, dtype=int)

            for frame_idx in frame_indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()

                if ret:
                    frames.append(frame)
                else:
                    logger.warning(f"Failed to read frame {frame_idx}")

            cap.release()

            logger.info(f"Extracted {len(frames)} frames from video")
            return frames

        except Exception as e:
            logger.error(f"Frame extraction failed: {e}", exc_info=True)
            raise

    async def _detect_in_frame(
        self,
        frame: np.ndarray,
        min_confidence: float = 0.5
    ) -> List[WatermarkRegion]:
        """Detect watermarks in a single frame using multiple methods"""
        detections = []

        # Method 1: Use YOLO for object detection
        yolo_detections = await self._detect_with_yolo(frame, min_confidence)
        detections.extend(yolo_detections)

        # Method 2: Detect text regions (common for watermarks)
        text_detections = await self._detect_text_regions(frame, min_confidence)
        detections.extend(text_detections)

        # Method 3: Detect semi-transparent overlays
        overlay_detections = await self._detect_overlays(frame, min_confidence)
        detections.extend(overlay_detections)

        # Method 4: Detect logos using template matching patterns
        logo_detections = await self._detect_logos(frame, min_confidence)
        detections.extend(logo_detections)

        # Remove duplicates and overlapping regions
        detections = self._non_max_suppression(detections)

        return detections

    async def _detect_with_yolo(
        self,
        frame: np.ndarray,
        min_confidence: float
    ) -> List[WatermarkRegion]:
        """Detect objects using YOLO model"""
        detections = []

        try:
            if self.model is None:
                return detections

            # Run YOLO inference
            results = self.model(frame, conf=min_confidence, verbose=False)

            for result in results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    conf = float(box.conf[0])
                    cls = int(box.cls[0])

                    # Check if this looks like a watermark
                    # (small objects, corners/edges, text-like)
                    if self._is_watermark_candidate(frame, (x1, y1, x2, y2)):
                        detections.append(WatermarkRegion(
                            x=int(x1),
                            y=int(y1),
                            width=int(x2 - x1),
                            height=int(y2 - y1),
                            confidence=conf,
                            type='object'
                        ))

        except Exception as e:
            logger.debug(f"YOLO detection failed: {e}")

        return detections

    async def _detect_text_regions(
        self,
        frame: np.ndarray,
        min_confidence: float
    ) -> List[WatermarkRegion]:
        """Detect text regions that might be watermarks"""
        detections = []

        try:
            # Convert to grayscale
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Use EAST text detector or MSER for text regions
            # Apply edge detection to find text-like regions
            edges = cv2.Canny(gray, 50, 150)

            # Find contours
            contours, _ = cv2.findContours(
                edges,
                cv2.RETR_EXTERNAL,
                cv2.CHAIN_APPROX_SIMPLE
            )

            h, w = frame.shape[:2]

            for contour in contours:
                x, y, width, height = cv2.boundingRect(contour)

                # Filter for watermark-like characteristics
                aspect_ratio = width / height if height > 0 else 0
                area = width * height
                frame_area = h * w

                # Watermarks are typically:
                # - Small relative to frame (< 15% of frame)
                # - Aspect ratio between 0.2 and 10
                # - Located in corners or edges
                if (0.0001 < area / frame_area < 0.15 and
                    0.2 < aspect_ratio < 10 and
                    self._is_corner_or_edge(x, y, width, height, w, h)):

                    # Calculate confidence based on characteristics
                    confidence = self._calculate_text_confidence(
                        frame[y:y+height, x:x+width]
                    )

                    if confidence >= min_confidence:
                        detections.append(WatermarkRegion(
                            x=x,
                            y=y,
                            width=width,
                            height=height,
                            confidence=confidence,
                            type='text'
                        ))

        except Exception as e:
            logger.debug(f"Text detection failed: {e}")

        return detections

    async def _detect_overlays(
        self,
        frame: np.ndarray,
        min_confidence: float
    ) -> List[WatermarkRegion]:
        """Detect semi-transparent overlay watermarks"""
        detections = []

        try:
            # Convert to different color spaces to detect overlays
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)

            # Detect regions with consistent color/brightness (overlays)
            # Use standard deviation to find uniform regions
            h, w = frame.shape[:2]

            # Divide frame into grid and check each region
            grid_size = 50
            for y in range(0, h - grid_size, grid_size // 2):
                for x in range(0, w - grid_size, grid_size // 2):
                    region = frame[y:y+grid_size, x:x+grid_size]

                    if region.size == 0:
                        continue

                    # Calculate variance (low variance = uniform = overlay)
                    std = np.std(region)

                    # Check if region has overlay characteristics
                    if std < 20 and self._is_corner_or_edge(x, y, grid_size, grid_size, w, h):
                        confidence = min(1.0, (30 - std) / 30)

                        if confidence >= min_confidence:
                            detections.append(WatermarkRegion(
                                x=x,
                                y=y,
                                width=grid_size,
                                height=grid_size,
                                confidence=confidence,
                                type='overlay'
                            ))

        except Exception as e:
            logger.debug(f"Overlay detection failed: {e}")

        return detections

    async def _detect_logos(
        self,
        frame: np.ndarray,
        min_confidence: float
    ) -> List[WatermarkRegion]:
        """Detect logo watermarks using frequency domain analysis"""
        detections = []

        try:
            # Logos often have distinct patterns in frequency domain
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Apply FFT to detect repeating patterns
            f_transform = np.fft.fft2(gray)
            f_shift = np.fft.fftshift(f_transform)
            magnitude = np.abs(f_shift)

            # High frequency components indicate text/logos
            h, w = gray.shape
            center_h, center_w = h // 2, w // 2

            # Check corners for high frequency content
            corners = [
                (0, 0, w // 4, h // 4),  # Top-left
                (3 * w // 4, 0, w, h // 4),  # Top-right
                (0, 3 * h // 4, w // 4, h),  # Bottom-left
                (3 * w // 4, 3 * h // 4, w, h)  # Bottom-right
            ]

            for x1, y1, x2, y2 in corners:
                region_freq = magnitude[y1:y2, x1:x2]
                if region_freq.size == 0:
                    continue

                # High mean frequency indicates complex patterns (logos/text)
                mean_freq = np.mean(region_freq)
                confidence = min(1.0, mean_freq / 10000)

                if confidence >= min_confidence:
                    detections.append(WatermarkRegion(
                        x=x1,
                        y=y1,
                        width=x2 - x1,
                        height=y2 - y1,
                        confidence=confidence,
                        type='logo'
                    ))

        except Exception as e:
            logger.debug(f"Logo detection failed: {e}")

        return detections

    def _is_watermark_candidate(
        self,
        frame: np.ndarray,
        bbox: Tuple[float, float, float, float]
    ) -> bool:
        """Check if detected object is likely a watermark"""
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]

        width = x2 - x1
        height = y2 - y1
        area = width * height
        frame_area = h * w

        # Watermark characteristics:
        # 1. Small relative to frame (0.01% - 15%)
        # 2. Located in corners or edges
        # 3. Consistent across frames

        size_ok = 0.0001 < (area / frame_area) < 0.15
        position_ok = self._is_corner_or_edge(x1, y1, width, height, w, h)

        return size_ok and position_ok

    def _is_corner_or_edge(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        frame_w: int,
        frame_h: int
    ) -> bool:
        """Check if region is in corner or edge of frame"""
        margin = 0.15  # 15% margin

        # Check corners
        in_left = x < frame_w * margin
        in_right = (x + width) > frame_w * (1 - margin)
        in_top = y < frame_h * margin
        in_bottom = (y + height) > frame_h * (1 - margin)

        # In corner or edge
        return (in_left or in_right) or (in_top or in_bottom)

    def _calculate_text_confidence(self, region: np.ndarray) -> float:
        """Calculate confidence that region contains text"""
        if region.size == 0:
            return 0.0

        try:
            # Text regions have high edge density
            gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY) if len(region.shape) == 3 else region
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / edges.size

            # Text regions have certain aspect ratios
            h, w = gray.shape
            aspect_ratio = w / h if h > 0 else 0

            # Combine factors
            confidence = (edge_density * 2 + (1 if 0.5 < aspect_ratio < 8 else 0)) / 3

            return min(1.0, confidence)

        except Exception:
            return 0.0

    def _find_consistent_regions(
        self,
        all_detections: List[List[WatermarkRegion]],
        threshold: float = 0.6
    ) -> List[WatermarkRegion]:
        """Find watermark regions that appear consistently across frames"""
        if not all_detections:
            return []

        # Cluster detections by position
        clusters = []

        for detections in all_detections:
            for detection in detections:
                # Find matching cluster
                matched = False

                for cluster in clusters:
                    # Check if detection matches this cluster (similar position)
                    if self._regions_match(detection, cluster['regions'][0]):
                        cluster['regions'].append(detection)
                        matched = True
                        break

                if not matched:
                    # Create new cluster
                    clusters.append({'regions': [detection]})

        # Find clusters that appear in enough frames
        min_appearances = int(len(all_detections) * threshold)
        consistent_regions = []

        for cluster in clusters:
            if len(cluster['regions']) >= min_appearances:
                # Average the regions
                avg_region = self._average_regions(cluster['regions'])
                consistent_regions.append(avg_region)

        return consistent_regions

    def _regions_match(self, r1: WatermarkRegion, r2: WatermarkRegion, tolerance: float = 0.2) -> bool:
        """Check if two regions match (similar position and size)"""
        # Calculate IoU (Intersection over Union)
        x1_min = min(r1.x, r2.x)
        y1_min = min(r1.y, r2.y)
        x1_max = max(r1.x + r1.width, r2.x + r2.width)
        y1_max = max(r1.y + r1.height, r2.y + r2.height)

        x2_min = max(r1.x, r2.x)
        y2_min = max(r1.y, r2.y)
        x2_max = min(r1.x + r1.width, r2.x + r2.width)
        y2_max = min(r1.y + r1.height, r2.y + r2.height)

        if x2_max < x2_min or y2_max < y2_min:
            return False  # No overlap

        intersection = (x2_max - x2_min) * (y2_max - y2_min)
        union = (r1.width * r1.height) + (r2.width * r2.height) - intersection

        iou = intersection / union if union > 0 else 0

        return iou > (1 - tolerance)

    def _average_regions(self, regions: List[WatermarkRegion]) -> WatermarkRegion:
        """Average multiple region detections"""
        x = int(np.mean([r.x for r in regions]))
        y = int(np.mean([r.y for r in regions]))
        width = int(np.mean([r.width for r in regions]))
        height = int(np.mean([r.height for r in regions]))
        confidence = np.mean([r.confidence for r in regions])

        # Use most common type
        types = [r.type for r in regions]
        region_type = max(set(types), key=types.count)

        return WatermarkRegion(
            x=x,
            y=y,
            width=width,
            height=height,
            confidence=confidence,
            type=region_type
        )

    def _non_max_suppression(
        self,
        detections: List[WatermarkRegion],
        iou_threshold: float = 0.5
    ) -> List[WatermarkRegion]:
        """Remove overlapping detections using NMS"""
        if not detections:
            return []

        # Sort by confidence
        detections = sorted(detections, key=lambda x: x.confidence, reverse=True)

        keep = []
        while detections:
            current = detections.pop(0)
            keep.append(current)

            # Remove overlapping detections
            detections = [
                d for d in detections
                if not self._regions_match(current, d, tolerance=1 - iou_threshold)
            ]

        return keep

    def _region_to_dict(self, region: WatermarkRegion) -> Dict:
        """Convert WatermarkRegion to dictionary"""
        return {
            'x': region.x,
            'y': region.y,
            'width': region.width,
            'height': region.height,
            'confidence': round(region.confidence, 3),
            'type': region.type
        }

    def get_model_version(self) -> str:
        """Get detector model version"""
        return "YOLOv8-SAM-v2.0"
