import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';
import path from 'path';
import { FileSystem } from '../utils/fileSystem.js';
import logger from '../utils/logger.js';

ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);

export class WatermarkDetector {
  constructor(config = {}) {
    this.config = {
      sensitivity: config.sensitivity || 0.7,
      minSize: config.minSize || 20,
      maxSize: config.maxSize || 500,
      sampleFrames: config.sampleFrames || 10,
      method: config.method || 'auto'
    };
  }

  async detect(videoPath, tempDir) {
    logger.info('Detecting watermarks in video...');

    await FileSystem.ensureDirectory(tempDir);

    // Extract sample frames from video
    const frames = await this.extractFrames(videoPath, tempDir);

    // Analyze frames to detect watermark regions
    const detections = await this.analyzeFrames(frames);

    // Find consistent watermark regions across frames
    const watermarkRegions = this.findConsistentRegions(detections);

    if (watermarkRegions.length === 0) {
      logger.warning('No watermarks detected');
      return [];
    }

    logger.success(`Detected ${watermarkRegions.length} watermark region(s)`);
    watermarkRegions.forEach((region, i) => {
      logger.debug(`Region ${i + 1}: x=${region.x}, y=${region.y}, width=${region.width}, height=${region.height}`);
    });

    return watermarkRegions;
  }

  async extractFrames(videoPath, tempDir) {
    return new Promise((resolve, reject) => {
      const framePaths = [];
      const outputPattern = path.join(tempDir, 'frame_%03d.png');

      ffmpeg(videoPath)
        .on('end', () => {
          // Get all extracted frame paths
          for (let i = 1; i <= this.config.sampleFrames; i++) {
            const framePath = path.join(tempDir, `frame_${String(i).padStart(3, '0')}.png`);
            framePaths.push(framePath);
          }
          resolve(framePaths);
        })
        .on('error', (err) => {
          logger.error(`Error extracting frames: ${err.message}`);
          reject(err);
        })
        .screenshots({
          count: this.config.sampleFrames,
          folder: tempDir,
          filename: 'frame_%03d.png'
        });
    });
  }

  async analyzeFrames(framePaths) {
    const detections = [];

    for (const framePath of framePaths) {
      try {
        const detection = await this.analyzeFrame(framePath);
        detections.push(detection);
      } catch (error) {
        logger.warning(`Failed to analyze frame ${framePath}: ${error.message}`);
      }
    }

    return detections;
  }

  async analyzeFrame(framePath) {
    // Load image with sharp
    const image = sharp(framePath);
    const metadata = await image.metadata();

    // Get image dimensions
    const { width, height } = metadata;

    // Detect potential watermark regions using edge detection and variance analysis
    const regions = await this.detectRegions(framePath, width, height);

    return {
      framePath,
      width,
      height,
      regions
    };
  }

  async detectRegions(framePath, width, height) {
    // Comprehensive watermark positions to check (9 regions instead of 5)
    const positions = [
      { name: 'top-left', x: Math.floor(width * 0.02), y: Math.floor(height * 0.02), width: Math.floor(width * 0.30), height: Math.floor(height * 0.12) },
      { name: 'top-center', x: Math.floor(width * 0.35), y: Math.floor(height * 0.02), width: Math.floor(width * 0.30), height: Math.floor(height * 0.12) },
      { name: 'top-right', x: Math.floor(width * 0.68), y: Math.floor(height * 0.02), width: Math.floor(width * 0.30), height: Math.floor(height * 0.12) },
      { name: 'middle-left', x: Math.floor(width * 0.02), y: Math.floor(height * 0.44), width: Math.floor(width * 0.25), height: Math.floor(height * 0.12) },
      { name: 'center', x: Math.floor(width * 0.35), y: Math.floor(height * 0.44), width: Math.floor(width * 0.30), height: Math.floor(height * 0.12) },
      { name: 'middle-right', x: Math.floor(width * 0.73), y: Math.floor(height * 0.44), width: Math.floor(width * 0.25), height: Math.floor(height * 0.12) },
      { name: 'bottom-left', x: Math.floor(width * 0.02), y: Math.floor(height * 0.86), width: Math.floor(width * 0.30), height: Math.floor(height * 0.12) },
      { name: 'bottom-center', x: Math.floor(width * 0.35), y: Math.floor(height * 0.86), width: Math.floor(width * 0.30), height: Math.floor(height * 0.12) },
      { name: 'bottom-right', x: Math.floor(width * 0.68), y: Math.floor(height * 0.86), width: Math.floor(width * 0.30), height: Math.floor(height * 0.12) }
    ];

    const detectedRegions = [];

    for (const pos of positions) {
      try {
        // Extract region
        const region = await sharp(framePath)
          .extract({ left: pos.x, top: pos.y, width: pos.width, height: pos.height })
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Analyze both variance and edge density for better detection
        const variance = this.calculateVariance(region.data);
        const edgeDensity = this.calculateEdgeDensity(region.data, region.info);

        // Combined score for better detection
        const score = (variance * 0.6) + (edgeDensity * 0.4);

        // Lower threshold for better detection
        if (score > this.config.sensitivity * 0.5) {
          detectedRegions.push({
            ...pos,
            variance,
            edgeDensity,
            score,
            confidence: Math.min(score, 1.0)
          });
          logger.debug(`Detected potential watermark in ${pos.name}: score=${score.toFixed(3)}`);
        }
      } catch (error) {
        // Skip this region if extraction fails
        logger.debug(`Failed to analyze region ${pos.name}: ${error.message}`);
      }
    }

    return detectedRegions;
  }

  calculateEdgeDensity(pixelData, info) {
    // Calculate edge density (watermarks often have strong edges)
    const { width, height, channels } = info;
    let edgeCount = 0;
    const threshold = 30;

    // Simple edge detection using differences
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const idx = (y * width + x) * channels;
        const idxRight = (y * width + (x + 1)) * channels;
        const idxDown = ((y + 1) * width + x) * channels;

        // Calculate horizontal and vertical gradients
        const gradX = Math.abs(pixelData[idx] - pixelData[idxRight]);
        const gradY = Math.abs(pixelData[idx] - pixelData[idxDown]);

        if (gradX > threshold || gradY > threshold) {
          edgeCount++;
        }
      }
    }

    const totalPixels = width * height;
    return Math.min((edgeCount / totalPixels) * 10, 1.0);
  }

  calculateVariance(pixelData) {
    // Calculate variance of pixel values (simple method)
    let sum = 0;
    let sumSq = 0;
    const n = pixelData.length;

    for (let i = 0; i < n; i++) {
      sum += pixelData[i];
      sumSq += pixelData[i] * pixelData[i];
    }

    const mean = sum / n;
    const variance = (sumSq / n) - (mean * mean);

    // Normalize to 0-1 range
    return Math.min(variance / 10000, 1.0);
  }

  findConsistentRegions(detections) {
    if (detections.length === 0) return [];

    // Group regions by position name across frames
    const regionsByPosition = {};

    detections.forEach(detection => {
      detection.regions.forEach(region => {
        if (!regionsByPosition[region.name]) {
          regionsByPosition[region.name] = [];
        }
        regionsByPosition[region.name].push(region);
      });
    });

    // Find regions that appear consistently (in at least 40% of frames - more lenient)
    const consistentRegions = [];
    const threshold = Math.max(2, Math.floor(detections.length * 0.4)); // At least 40% or 2 frames

    for (const [name, regions] of Object.entries(regionsByPosition)) {
      if (regions.length >= threshold) {
        // Calculate average confidence
        const avgConfidence = regions.reduce((sum, r) => sum + (r.score || r.confidence), 0) / regions.length;

        // Average the region coordinates
        const avgRegion = {
          name,
          x: Math.floor(regions.reduce((sum, r) => sum + r.x, 0) / regions.length),
          y: Math.floor(regions.reduce((sum, r) => sum + r.y, 0) / regions.length),
          width: Math.floor(regions.reduce((sum, r) => sum + r.width, 0) / regions.length),
          height: Math.floor(regions.reduce((sum, r) => sum + r.height, 0) / regions.length),
          confidence: avgConfidence,
          detectionCount: regions.length
        };
        consistentRegions.push(avgRegion);
        logger.info(`Found consistent watermark in ${name}: detected in ${regions.length}/${detections.length} frames (confidence: ${avgConfidence.toFixed(2)})`);
      }
    }

    // Sort by confidence descending
    consistentRegions.sort((a, b) => b.confidence - a.confidence);

    return consistentRegions;
  }

  async getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
  }
}
