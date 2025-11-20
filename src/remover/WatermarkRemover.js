import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import logger from '../utils/logger.js';

ffmpeg.setFfmpegPath(ffmpegPath.path);

export class WatermarkRemover {
  constructor(config = {}) {
    this.config = {
      method: config.method || 'inpaint',
      iterations: config.iterations || 3,
      blendEdges: config.blendEdges !== false
    };
  }

  async remove(videoPath, watermarkRegions, outputPath) {
    logger.info('Removing watermarks from video...');

    if (!watermarkRegions || watermarkRegions.length === 0) {
      logger.warning('No watermark regions provided, copying video as-is');
      return this.copyVideo(videoPath, outputPath);
    }

    // Build filter complex for watermark removal
    const filters = this.buildRemovalFilters(watermarkRegions);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath);

      // Apply delogo filters for each watermark region
      if (filters.length > 0) {
        command.complexFilter(filters);
      }

      command
        .outputOptions([
          '-c:v libx264',
          '-preset slow',
          '-crf 18',
          '-c:a copy',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('start', (cmdLine) => {
          logger.debug(`FFmpeg command: ${cmdLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`Processing: ${progress.percent.toFixed(1)}% complete`);
          }
        })
        .on('end', () => {
          logger.success('Watermark removal completed');
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error(`Error removing watermark: ${err.message}`);
          logger.debug(`FFmpeg stderr: ${stderr}`);
          reject(err);
        })
        .run();
    });
  }

  buildRemovalFilters(watermarkRegions) {
    const filters = [];

    watermarkRegions.forEach((region, index) => {
      // Use delogo filter to blur/remove watermark
      // The delogo filter removes a TV logo by a simple interpolation of surrounding pixels
      const delogoFilter = {
        filter: 'delogo',
        options: {
          x: region.x,
          y: region.y,
          w: region.width,
          h: region.height,
          show: 0 // Set to 1 to show the watermark box
        }
      };

      filters.push(delogoFilter);

      // Optional: Add additional smoothing for better results
      if (this.config.blendEdges) {
        filters.push({
          filter: 'boxblur',
          options: {
            luma_radius: 2,
            luma_power: 1
          }
        });
      }
    });

    return filters;
  }

  async removeWithInpainting(videoPath, watermarkRegions, outputPath, tempDir) {
    logger.info('Using advanced inpainting method...');

    // This is a more advanced method that would require additional tools
    // For now, we'll use the delogo method as the primary approach
    // In a production system, you might integrate with:
    // - ProPainter (https://github.com/sczhou/ProPainter)
    // - E2FGVI (https://github.com/MCG-NKU/E2FGVI)
    // - LaMa (https://github.com/advimman/lama)

    logger.warning('Advanced inpainting requires additional ML models. Falling back to delogo method.');
    return this.remove(videoPath, watermarkRegions, outputPath);
  }

  async copyVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-c copy'])
        .output(outputPath)
        .on('end', () => {
          logger.info('Video copied successfully');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }

  async removeWithMask(videoPath, maskPath, outputPath) {
    // Alternative method using a mask image
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(maskPath)
        .complexFilter([
          '[0:v][1:v]overlay'
        ])
        .outputOptions([
          '-c:v libx264',
          '-preset slow',
          '-crf 18',
          '-c:a copy'
        ])
        .output(outputPath)
        .on('end', () => {
          logger.success('Watermark removed using mask');
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(`Error: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  async removeMultiPass(videoPath, watermarkRegions, outputPath, tempDir) {
    // Multi-pass approach for better quality
    logger.info('Using multi-pass removal...');

    const passes = this.config.iterations || 3;
    let currentInput = videoPath;

    for (let i = 0; i < passes; i++) {
      const passOutput = path.join(tempDir, `pass_${i}.mp4`);

      logger.info(`Pass ${i + 1}/${passes}...`);

      await this.remove(currentInput, watermarkRegions, passOutput);
      currentInput = passOutput;
    }

    // Final output
    await this.copyVideo(currentInput, outputPath);

    return outputPath;
  }
}
