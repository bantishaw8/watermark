import { AIServiceClient } from '../ai/AIServiceClient.js';
import { WatermarkDetector as LegacyDetector } from './WatermarkDetector.js';
import logger from '../utils/logger.js';

/**
 * Enhanced watermark detector with AI fallback
 * Uses AI service when available, falls back to legacy detector
 */
export class WatermarkDetectorAI {
  constructor(config = {}) {
    this.config = config;
    this.aiClient = new AIServiceClient(config.aiService);
    this.legacyDetector = new LegacyDetector(config);
    this.useAI = config.useAI !== false;
  }

  async detect(videoPath, tempDir) {
    // Try AI detection first if enabled
    if (this.useAI) {
      try {
        // Check if AI service is available
        const isAvailable = await this.aiClient.isAvailable();

        if (isAvailable) {
          logger.info('Using AI-powered watermark detection');
          return await this._detectWithAI(videoPath);
        } else {
          logger.warning('AI service not available, using legacy detector');
        }
      } catch (error) {
        logger.warning(`AI detection failed: ${error.message}, falling back to legacy`);
      }
    }

    // Fallback to legacy detection
    logger.info('Using legacy watermark detection');
    return await this.legacyDetector.detect(videoPath, tempDir);
  }

  async _detectWithAI(videoPath) {
    try {
      const result = await this.aiClient.detectWatermarks(videoPath, {
        sensitivity: this.config.sensitivity || 0.7,
        minConfidence: this.config.minConfidence || 0.5
      });

      // Convert AI format to internal format
      const regions = result.regions.map(region => ({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        confidence: region.confidence,
        name: region.type || 'detected'
      }));

      logger.success(`AI detected ${regions.length} watermark(s) in ${result.processing_time.toFixed(2)}s`);

      return regions;

    } catch (error) {
      logger.error(`AI detection error: ${error.message}`);
      throw error;
    }
  }

  async getVideoMetadata(videoPath) {
    return await this.legacyDetector.getVideoMetadata(videoPath);
  }
}

export default WatermarkDetectorAI;
