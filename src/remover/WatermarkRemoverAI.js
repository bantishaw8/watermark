import { AIServiceClient } from '../ai/AIServiceClient.js';
import { WatermarkRemover as LegacyRemover } from './WatermarkRemover.js';
import logger from '../utils/logger.js';

/**
 * Enhanced watermark remover with AI inpainting
 * Uses AI service when available, falls back to FFmpeg delogo
 */
export class WatermarkRemoverAI {
  constructor(config = {}) {
    this.config = config;
    this.aiClient = new AIServiceClient(config.aiService);
    this.legacyRemover = new LegacyRemover(config);
    this.useAI = config.useAI !== false;
  }

  async remove(videoPath, watermarkRegions, outputPath) {
    // Try AI inpainting first if enabled
    if (this.useAI && watermarkRegions && watermarkRegions.length > 0) {
      try {
        // Check if AI service is available
        const isAvailable = await this.aiClient.isAvailable();

        if (isAvailable) {
          logger.info('Using AI-powered watermark removal');
          return await this._removeWithAI(videoPath, watermarkRegions, outputPath);
        } else {
          logger.warning('AI service not available, using legacy remover');
        }
      } catch (error) {
        logger.warning(`AI removal failed: ${error.message}, falling back to legacy`);
      }
    }

    // Fallback to legacy removal
    logger.info('Using legacy watermark removal (FFmpeg delogo)');
    return await this.legacyRemover.remove(videoPath, watermarkRegions, outputPath);
  }

  async _removeWithAI(videoPath, watermarkRegions, outputPath) {
    try {
      const result = await this.aiClient.inpaintVideo(videoPath, watermarkRegions, {
        outputPath: outputPath,
        quality: this.config.quality || 'high'
      });

      logger.success(`AI removed watermarks in ${result.processing_time.toFixed(2)}s`);
      logger.info(`Processed ${result.frames_processed} frames`);

      return result.output_path;

    } catch (error) {
      logger.error(`AI inpainting error: ${error.message}`);
      throw error;
    }
  }

  // Legacy methods for compatibility
  async removeWithInpainting(videoPath, watermarkRegions, outputPath, tempDir) {
    return await this.remove(videoPath, watermarkRegions, outputPath);
  }

  async removeMultiPass(videoPath, watermarkRegions, outputPath, tempDir) {
    return await this.legacyRemover.removeMultiPass(videoPath, watermarkRegions, outputPath, tempDir);
  }

  async removeWithMask(videoPath, maskPath, outputPath) {
    return await this.legacyRemover.removeWithMask(videoPath, maskPath, outputPath);
  }

  buildRemovalFilterString(watermarkRegions) {
    return this.legacyRemover.buildRemovalFilterString(watermarkRegions);
  }
}

export default WatermarkRemoverAI;
