import path from 'path';
import { existsSync } from 'fs';
import { VideoDownloader } from '../downloader/VideoDownloader.js';
import { WatermarkDetector } from '../detector/WatermarkDetector.js';
import { WatermarkRemover } from '../remover/WatermarkRemover.js';
import { VideoEnhancer } from '../enhancer/VideoEnhancer.js';
import { FileSystem } from '../utils/fileSystem.js';
import logger from '../utils/logger.js';

export class VideoPipeline {
  constructor(config = {}) {
    this.config = config;

    // Initialize modules
    this.downloader = new VideoDownloader(config.downloader || {});
    this.detector = new WatermarkDetector(config.watermark?.detection || {});
    this.remover = new WatermarkRemover(config.watermark?.removal || {});
    this.enhancer = new VideoEnhancer(config.enhancement || {});

    // Setup directories
    this.tempDir = config.processing?.tempDirectory || './temp';
    this.outputDir = config.output?.directory || './output';
    this.cleanupTemp = config.processing?.cleanupTemp !== false;
  }

  async process(input, options = {}) {
    const startTime = Date.now();
    logger.info('Starting video processing pipeline...');

    try {
      // Ensure directories exist
      await FileSystem.ensureDirectory(this.tempDir);
      await FileSystem.ensureDirectory(this.outputDir);

      // Step 1: Get video file
      logger.step(1, 5, 'Obtaining video');
      const videoPath = await this.getVideoFile(input);

      // Step 2: Detect watermarks
      logger.step(2, 5, 'Detecting watermarks');
      const detectionTempDir = path.join(this.tempDir, 'detection');
      await FileSystem.ensureDirectory(detectionTempDir);

      let watermarkRegions = [];
      if (options.skipDetection) {
        logger.info('Skipping watermark detection');
        watermarkRegions = options.manualRegions || [];
      } else {
        watermarkRegions = await this.detector.detect(videoPath, detectionTempDir);
      }

      // Step 3: Remove watermarks
      logger.step(3, 5, 'Removing watermarks');
      const removalOutput = path.join(this.tempDir, 'removed.mp4');

      // Use advanced removal method based on configuration
      const removalMethod = this.config.watermark?.removal?.method || 'inpaint';
      const removalTempDir = path.join(this.tempDir, 'removal');
      await FileSystem.ensureDirectory(removalTempDir);

      if (removalMethod === 'multipass') {
        await this.remover.removeMultiPass(videoPath, watermarkRegions, removalOutput, removalTempDir);
      } else if (removalMethod === 'content-aware') {
        await this.remover.removeWithContentAwareFill(videoPath, watermarkRegions, removalOutput);
      } else if (removalMethod === 'inpaint') {
        await this.remover.removeWithInpainting(videoPath, watermarkRegions, removalOutput, removalTempDir);
      } else {
        await this.remover.remove(videoPath, watermarkRegions, removalOutput);
      }

      // Step 4: Enhance video quality
      logger.step(4, 5, 'Enhancing video quality');
      const outputFilename = options.outputFilename || this.generateOutputFilename(input);
      const finalOutput = path.join(this.outputDir, outputFilename);
      await this.enhancer.enhance(removalOutput, finalOutput);

      // Step 5: Cleanup
      logger.step(5, 5, 'Cleaning up');
      if (this.cleanupTemp) {
        await FileSystem.removeDirectory(this.tempDir);
        logger.info('Temporary files cleaned up');
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const fileSize = await FileSystem.getFileSizeMB(finalOutput);

      logger.success(`✨ Processing complete in ${duration}s`);
      logger.info(`Output file: ${finalOutput}`);
      logger.info(`File size: ${fileSize} MB`);

      return {
        success: true,
        outputPath: finalOutput,
        watermarkRegions,
        duration: parseFloat(duration),
        fileSize: parseFloat(fileSize)
      };

    } catch (error) {
      logger.error(`Pipeline failed: ${error.message}`);
      throw error;
    }
  }

  async getVideoFile(input) {
    // Check if input is a URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      logger.info('Input is a URL, downloading video...');
      const downloadPath = path.join(this.tempDir, 'downloaded.mp4');
      return await this.downloader.download(input, downloadPath);
    }

    // Check if input is a local file
    if (existsSync(input)) {
      logger.info('Input is a local file');
      return input;
    }

    throw new Error(`Invalid input: ${input} is not a valid URL or file path`);
  }

  generateOutputFilename(input) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const basename = FileSystem.getBasename(input) || 'video';
    return `${basename}_processed_${timestamp}.mp4`;
  }

  async processWithManualRegions(input, regions, options = {}) {
    return this.process(input, {
      ...options,
      skipDetection: true,
      manualRegions: regions
    });
  }

  async processBatch(inputs, options = {}) {
    logger.info(`Processing batch of ${inputs.length} videos`);

    const results = [];

    for (let i = 0; i < inputs.length; i++) {
      logger.info(`\n--- Processing video ${i + 1}/${inputs.length} ---`);

      try {
        const result = await this.process(inputs[i], options);
        results.push({ input: inputs[i], ...result });
      } catch (error) {
        logger.error(`Failed to process ${inputs[i]}: ${error.message}`);
        results.push({
          input: inputs[i],
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.success(`\nBatch processing complete: ${successCount}/${inputs.length} successful`);

    return results;
  }

  async getInfo(input) {
    const videoPath = await this.getVideoFile(input);
    const metadata = await this.detector.getVideoMetadata(videoPath);

    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

    return {
      format: metadata.format.format_name,
      duration: parseFloat(metadata.format.duration),
      size: parseInt(metadata.format.size),
      bitrate: parseInt(metadata.format.bit_rate),
      video: videoStream ? {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        fps: eval(videoStream.r_frame_rate),
        bitrate: parseInt(videoStream.bit_rate)
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        sampleRate: parseInt(audioStream.sample_rate),
        channels: audioStream.channels,
        bitrate: parseInt(audioStream.bit_rate)
      } : null
    };
  }
}
