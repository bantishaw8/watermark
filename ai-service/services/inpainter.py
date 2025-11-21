"""
AI Video Inpainting Service
Uses LaMa and advanced inpainting models for high-quality watermark removal
"""

import cv2
import numpy as np
import torch
from typing import List, Dict, Optional
import logging
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor
import tempfile
import shutil

from simple_lama_inpainting import SimpleLama
from moviepy.editor import VideoFileClip, ImageSequenceClip

logger = logging.getLogger(__name__)


class VideoInpainterAI:
    """Enterprise-grade AI video inpainter for watermark removal"""

    def __init__(self, model_manager):
        self.model_manager = model_manager
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.lama_model = None
        self.executor = ThreadPoolExecutor(max_workers=4)
        logger.info(f"Initializing inpainter on device: {self.device}")

    async def initialize(self):
        """Initialize inpainting models"""
        try:
            # Load LaMa model for inpainting
            self.lama_model = SimpleLama()
            logger.info("LaMa model initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize inpainter: {e}", exc_info=True)
            raise

    async def inpaint(
        self,
        video_path: str,
        regions: List[Dict],
        output_path: str,
        quality: str = 'high'
    ) -> Dict:
        """
        Remove watermarks from video using AI inpainting

        Args:
            video_path: Path to input video
            regions: List of watermark regions to remove
            output_path: Path for output video
            quality: Processing quality (low, medium, high, ultra)

        Returns:
            Dict with output path and processing stats
        """
        try:
            logger.info(f"Starting inpainting: {video_path}")
            logger.info(f"Removing {len(regions)} watermark region(s)")

            # Load video
            video = VideoFileClip(video_path)
            fps = video.fps
            duration = video.duration

            # Create temporary directory for frames
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)

                # Extract frames
                logger.info("Extracting video frames...")
                frames = self._extract_all_frames(video)

                # Process frames in parallel
                logger.info(f"Processing {len(frames)} frames...")
                processed_frames = await self._process_frames_parallel(
                    frames,
                    regions,
                    quality
                )

                # Reconstruct video
                logger.info("Reconstructing video...")
                self._reconstruct_video(
                    processed_frames,
                    output_path,
                    fps,
                    video.audio,
                    quality
                )

            logger.info(f"Inpainting completed: {output_path}")

            return {
                'output_path': output_path,
                'frames_processed': len(frames),
                'duration': duration,
                'fps': fps
            }

        except Exception as e:
            logger.error(f"Inpainting failed: {e}", exc_info=True)
            raise

        finally:
            if 'video' in locals():
                video.close()

    def _extract_all_frames(self, video: VideoFileClip) -> List[np.ndarray]:
        """Extract all frames from video"""
        frames = []

        try:
            for frame in video.iter_frames():
                # Convert RGB to BGR for OpenCV
                frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                frames.append(frame_bgr)

            logger.info(f"Extracted {len(frames)} frames")
            return frames

        except Exception as e:
            logger.error(f"Frame extraction failed: {e}", exc_info=True)
            raise

    async def _process_frames_parallel(
        self,
        frames: List[np.ndarray],
        regions: List[Dict],
        quality: str
    ) -> List[np.ndarray]:
        """Process frames in parallel with AI inpainting"""
        processed_frames = []

        # Determine batch size based on quality
        batch_sizes = {
            'low': 16,
            'medium': 8,
            'high': 4,
            'ultra': 2
        }
        batch_size = batch_sizes.get(quality, 4)

        # Process in batches
        for i in range(0, len(frames), batch_size):
            batch = frames[i:i + batch_size]

            # Process batch
            tasks = [
                self._inpaint_frame(frame, regions, quality)
                for frame in batch
            ]

            batch_results = await asyncio.gather(*tasks)
            processed_frames.extend(batch_results)

            if (i // batch_size) % 10 == 0:
                progress = (i / len(frames)) * 100
                logger.info(f"Progress: {progress:.1f}%")

        return processed_frames

    async def _inpaint_frame(
        self,
        frame: np.ndarray,
        regions: List[Dict],
        quality: str
    ) -> np.ndarray:
        """Inpaint a single frame using LaMa"""
        try:
            # Create mask for all watermark regions
            mask = self._create_mask(frame.shape[:2], regions)

            if mask is None or np.sum(mask) == 0:
                # No regions to inpaint
                return frame

            # Convert BGR to RGB for LaMa
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Run inpainting (in thread to avoid blocking)
            loop = asyncio.get_event_loop()
            inpainted = await loop.run_in_executor(
                self.executor,
                self._run_lama,
                frame_rgb,
                mask
            )

            # Convert back to BGR
            inpainted_bgr = cv2.cvtColor(inpainted, cv2.COLOR_RGB2BGR)

            # Apply post-processing for better quality
            if quality in ['high', 'ultra']:
                inpainted_bgr = self._post_process(inpainted_bgr, frame, mask, quality)

            return inpainted_bgr

        except Exception as e:
            logger.warning(f"Frame inpainting failed, using original: {e}")
            return frame

    def _run_lama(self, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """Run LaMa inpainting model"""
        try:
            # LaMa expects PIL Image or numpy array
            result = self.lama_model(image, mask)
            return np.array(result)

        except Exception as e:
            logger.error(f"LaMa inference failed: {e}")
            raise

    def _create_mask(
        self,
        frame_shape: tuple,
        regions: List[Dict]
    ) -> Optional[np.ndarray]:
        """Create binary mask for watermark regions"""
        if not regions:
            return None

        h, w = frame_shape
        mask = np.zeros((h, w), dtype=np.uint8)

        for region in regions:
            x = region.get('x', 0)
            y = region.get('y', 0)
            width = region.get('width', 0)
            height = region.get('height', 0)

            # Ensure coordinates are within frame
            x = max(0, min(x, w - 1))
            y = max(0, min(y, h - 1))
            width = min(width, w - x)
            height = min(height, h - y)

            # Add region to mask
            mask[y:y+height, x:x+width] = 255

            # Add feathering for smooth blending
            mask = self._feather_mask(mask, kernel_size=5)

        return mask

    def _feather_mask(self, mask: np.ndarray, kernel_size: int = 5) -> np.ndarray:
        """Apply feathering to mask edges for smooth blending"""
        # Apply Gaussian blur for soft edges
        feathered = cv2.GaussianBlur(mask, (kernel_size, kernel_size), 0)
        return feathered

    def _post_process(
        self,
        inpainted: np.ndarray,
        original: np.ndarray,
        mask: np.ndarray,
        quality: str
    ) -> np.ndarray:
        """Post-process inpainted frame for better quality"""
        try:
            # 1. Edge blending
            if quality == 'ultra':
                # Multi-band blending for seamless integration
                inpainted = self._multiband_blend(inpainted, original, mask)
            else:
                # Simple alpha blending at edges
                inpainted = self._alpha_blend(inpainted, original, mask)

            # 2. Color correction
            inpainted = self._match_colors(inpainted, original, mask)

            # 3. Sharpening (for ultra quality)
            if quality == 'ultra':
                inpainted = self._sharpen(inpainted, mask)

            return inpainted

        except Exception as e:
            logger.warning(f"Post-processing failed: {e}")
            return inpainted

    def _alpha_blend(
        self,
        inpainted: np.ndarray,
        original: np.ndarray,
        mask: np.ndarray
    ) -> np.ndarray:
        """Blend inpainted region with original using alpha blending"""
        # Normalize mask
        mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR) / 255.0

        # Blend
        blended = (inpainted * mask_3ch + original * (1 - mask_3ch)).astype(np.uint8)

        return blended

    def _multiband_blend(
        self,
        inpainted: np.ndarray,
        original: np.ndarray,
        mask: np.ndarray
    ) -> np.ndarray:
        """Multi-band blending for seamless integration"""
        try:
            # Create Laplacian pyramids
            levels = 5

            # Generate Gaussian pyramid for mask
            mask_float = mask.astype(float) / 255.0
            mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR).astype(float) / 255.0

            # Simple blending (full multi-band is complex)
            # Use feathered alpha blending with multiple passes
            result = inpainted.copy()

            for i in range(3):
                kernel_size = 15 - i * 4
                if kernel_size < 3:
                    kernel_size = 3

                blurred_mask = cv2.GaussianBlur(
                    mask_3ch,
                    (kernel_size, kernel_size),
                    0
                )

                result = (
                    result * blurred_mask +
                    original * (1 - blurred_mask)
                ).astype(np.uint8)

            return result

        except Exception as e:
            logger.warning(f"Multi-band blending failed: {e}")
            return self._alpha_blend(inpainted, original, mask)

    def _match_colors(
        self,
        inpainted: np.ndarray,
        original: np.ndarray,
        mask: np.ndarray
    ) -> np.ndarray:
        """Match colors of inpainted region to surrounding area"""
        try:
            # Get surrounding region (dilate mask)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))
            dilated_mask = cv2.dilate(mask, kernel, iterations=1)
            surround_mask = dilated_mask - mask

            if np.sum(surround_mask) == 0:
                return inpainted

            # Calculate mean and std of surrounding area
            surround_region = original[surround_mask > 0]

            if len(surround_region) == 0:
                return inpainted

            surround_mean = np.mean(surround_region, axis=0)
            surround_std = np.std(surround_region, axis=0)

            # Adjust inpainted region
            inpaint_region = inpainted[mask > 0]
            inpaint_mean = np.mean(inpaint_region, axis=0)
            inpaint_std = np.std(inpaint_region, axis=0)

            # Color transfer
            adjusted = inpainted.copy().astype(float)
            mask_bool = mask > 0

            for c in range(3):
                if inpaint_std[c] > 0:
                    adjusted[mask_bool, c] = (
                        (adjusted[mask_bool, c] - inpaint_mean[c]) *
                        (surround_std[c] / inpaint_std[c]) +
                        surround_mean[c]
                    )

            adjusted = np.clip(adjusted, 0, 255).astype(np.uint8)

            return adjusted

        except Exception as e:
            logger.warning(f"Color matching failed: {e}")
            return inpainted

    def _sharpen(self, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """Apply sharpening to inpainted region"""
        try:
            # Unsharp mask
            gaussian = cv2.GaussianBlur(image, (0, 0), 2.0)
            sharpened = cv2.addWeighted(image, 1.5, gaussian, -0.5, 0)

            # Apply only to masked region
            mask_3ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR) / 255.0
            result = (sharpened * mask_3ch + image * (1 - mask_3ch)).astype(np.uint8)

            return result

        except Exception as e:
            logger.warning(f"Sharpening failed: {e}")
            return image

    def _reconstruct_video(
        self,
        frames: List[np.ndarray],
        output_path: str,
        fps: float,
        audio,
        quality: str
    ):
        """Reconstruct video from processed frames"""
        try:
            # Convert frames to RGB for moviepy
            frames_rgb = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in frames]

            # Create video clip
            clip = ImageSequenceClip(frames_rgb, fps=fps)

            # Add audio if present
            if audio is not None:
                clip = clip.set_audio(audio)

            # Determine codec and bitrate based on quality
            codecs = {
                'low': ('libx264', '2M'),
                'medium': ('libx264', '5M'),
                'high': ('libx264', '10M'),
                'ultra': ('libx265', '20M')
            }

            codec, bitrate = codecs.get(quality, ('libx264', '10M'))

            # Write video
            clip.write_videofile(
                output_path,
                codec=codec,
                bitrate=bitrate,
                audio_codec='aac',
                temp_audiofile='temp-audio.m4a',
                remove_temp=True,
                logger=None  # Suppress moviepy logs
            )

            clip.close()

            logger.info(f"Video saved: {output_path}")

        except Exception as e:
            logger.error(f"Video reconstruction failed: {e}", exc_info=True)
            raise

    def __del__(self):
        """Cleanup executor"""
        if hasattr(self, 'executor'):
            self.executor.shutdown(wait=False)
