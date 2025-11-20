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
    // Common watermark positions to check
    const positions = [
      { name: 'top-left', x: 0, y: 0, width: Math.floor(width * 0.25), height: Math.floor(height * 0.15) },
      { name: 'top-right', x: Math.floor(width * 0.75), y: 0, width: Math.floor(width * 0.25), height: Math.floor(height * 0.15) },
      { name: 'bottom-left', x: 0, y: Math.floor(height * 0.85), width: Math.floor(width * 0.25), height: Math.floor(height * 0.15) },
      { name: 'bottom-right', x: Math.floor(width * 0.75), y: Math.floor(height * 0.85), width: Math.floor(width * 0.25), height: Math.floor(height * 0.15) },
      { name: 'center', x: Math.floor(width * 0.4), y: Math.floor(height * 0.45), width: Math.floor(width * 0.2), height: Math.floor(height * 0.1) }
    ];

    const detectedRegions = [];

    for (const pos of positions) {
      try {
        // Extract region
        const region = await sharp(framePath)
          .extract({ left: pos.x, top: pos.y, width: pos.width, height: pos.height })
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Analyze variance (watermarks typically have distinct patterns)
        const variance = this.calculateVariance(region.data);

        // If variance is high enough, this might be a watermark
        if (variance > this.config.sensitivity) {
          detectedRegions.push({
            ...pos,
            variance,
            confidence: Math.min(variance, 1.0)
          });
        }
      } catch (error) {
        // Skip this region if extraction fails
        logger.debug(`Failed to analyze region ${pos.name}: ${error.message}`);
      }
    }

    return detectedRegions;
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

    // Find regions that appear consistently (in most frames)
    const consistentRegions = [];
    const threshold = Math.floor(detections.length * 0.6); // Appear in 60% of frames

    for (const [name, regions] of Object.entries(regionsByPosition)) {
      if (regions.length >= threshold) {
        // Average the region coordinates
        const avgRegion = {
          name,
          x: Math.floor(regions.reduce((sum, r) => sum + r.x, 0) / regions.length),
          y: Math.floor(regions.reduce((sum, r) => sum + r.y, 0) / regions.length),
          width: Math.floor(regions.reduce((sum, r) => sum + r.width, 0) / regions.length),
          height: Math.floor(regions.reduce((sum, r) => sum + r.height, 0) / regions.length),
          confidence: regions.reduce((sum, r) => sum + r.confidence, 0) / regions.length
        };
        consistentRegions.push(avgRegion);
      }
    }

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
