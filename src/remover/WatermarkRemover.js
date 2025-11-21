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

    // Build filter string for watermark removal
    const filterString = this.buildRemovalFilterString(watermarkRegions);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath);

      // Apply delogo filters for each watermark region
      if (filterString) {
        command.videoFilters(filterString);
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

  buildRemovalFilterString(watermarkRegions) {
    if (watermarkRegions.length === 0) return '';

    // Use advanced inpainting approach with multiple filter stages
    const filters = [];

    watermarkRegions.forEach((region, index) => {
      // Expand region slightly for better edge blending
      const expandedRegion = this.expandRegion(region, 5);

      // Stage 1: Apply delogo with band parameter for better edge blending
      // The 'band' parameter creates a smoother transition at edges
      const delogoFilter = `delogo=x=${expandedRegion.x}:y=${expandedRegion.y}:w=${expandedRegion.width}:h=${expandedRegion.height}:band=10:show=0`;
      filters.push(delogoFilter);
    });

    // Stage 2: Apply unsharp mask to restore sharpness lost during inpainting
    // This helps blend the inpainted region with the rest of the video
    filters.push('unsharp=5:5:1.0:5:5:0.0');

    // Stage 3: Apply slight denoising to smooth out inpainting artifacts
    filters.push('hqdn3d=1.5:1.5:6:6');

    return filters.join(',');
  }

  expandRegion(region, pixels) {
    // Expand region by specified pixels in all directions for better blending
    return {
      x: Math.max(0, region.x - pixels),
      y: Math.max(0, region.y - pixels),
      width: region.width + (pixels * 2),
      height: region.height + (pixels * 2)
    };
  }

  buildRemovalFilters(watermarkRegions) {
    // Legacy method - kept for backwards compatibility
    return this.buildRemovalFilterString(watermarkRegions);
  }

  async removeWithInpainting(videoPath, watermarkRegions, outputPath, tempDir) {
    logger.info('Using advanced inpainting method...');

    // Multi-stage inpainting process for better quality
    // This uses FFmpeg's advanced filtering capabilities to achieve better results

    return new Promise((resolve, reject) => {
      const filters = [];

      watermarkRegions.forEach((region) => {
        // Create a sophisticated inpainting filter chain for each region
        const expandedRegion = this.expandRegion(region, 8);

        // Apply delogo with larger band for smoother inpainting
        filters.push(
          `delogo=x=${expandedRegion.x}:y=${expandedRegion.y}:w=${expandedRegion.width}:h=${expandedRegion.height}:band=15:show=0`
        );
      });

      // Post-processing filters for better quality
      // 1. Edge enhancement to restore details
      filters.push('unsharp=7:7:1.5:7:7:0.0');

      // 2. Slight blur to blend inpainted areas
      filters.push('gblur=sigma=0.5:steps=1');

      // 3. Denoise to remove artifacts
      filters.push('hqdn3d=2:2:8:8');

      // 4. Final sharpening pass
      filters.push('unsharp=5:5:0.8:5:5:0.0');

      const filterString = filters.join(',');

      ffmpeg(videoPath)
        .videoFilters(filterString)
        .outputOptions([
          '-c:v libx264',
          '-preset slower',  // Use slower preset for better quality
          '-crf 17',         // Lower CRF for higher quality
          '-pix_fmt yuv420p',
          '-profile:v high',
          '-level 4.1',
          '-c:a copy',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('start', (cmdLine) => {
          logger.debug(`FFmpeg inpainting command: ${cmdLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`Inpainting: ${progress.percent.toFixed(1)}% complete`);
          }
        })
        .on('end', () => {
          logger.success('Advanced inpainting completed');
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error(`Error during inpainting: ${err.message}`);
          logger.debug(`FFmpeg stderr: ${stderr}`);
          reject(err);
        })
        .run();
    });
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
    // Multi-pass approach for better quality removal
    logger.info('Using multi-pass removal for superior results...');

    const passes = this.config.iterations || 3;
    let currentInput = videoPath;

    for (let i = 0; i < passes; i++) {
      const passOutput = path.join(tempDir, `pass_${i}.mp4`);

      logger.info(`Pass ${i + 1}/${passes}...`);

      // Each pass uses progressively refined inpainting
      await this.removePassWithQuality(currentInput, watermarkRegions, passOutput, i);
      currentInput = passOutput;
    }

    // Final output
    await this.copyVideo(currentInput, outputPath);

    return outputPath;
  }

  async removePassWithQuality(videoPath, watermarkRegions, outputPath, passIndex) {
    // Each pass uses different parameters for progressive refinement
    const filters = [];

    watermarkRegions.forEach((region) => {
      // Progressively expand region less in each pass
      const expansion = Math.max(2, 10 - (passIndex * 3));
      const expandedRegion = this.expandRegion(region, expansion);

      // Use larger band in later passes for better blending
      const band = 10 + (passIndex * 5);

      filters.push(
        `delogo=x=${expandedRegion.x}:y=${expandedRegion.y}:w=${expandedRegion.width}:h=${expandedRegion.height}:band=${band}:show=0`
      );
    });

    // Apply progressive refinement filters
    if (passIndex === 0) {
      // First pass: Aggressive removal
      filters.push('hqdn3d=3:3:10:10');
      filters.push('unsharp=5:5:1.2:5:5:0.0');
    } else if (passIndex === 1) {
      // Second pass: Blend and refine
      filters.push('gblur=sigma=0.8:steps=2');
      filters.push('unsharp=7:7:1.0:7:7:0.0');
    } else {
      // Final pass: Polish and sharpen
      filters.push('hqdn3d=1:1:4:4');
      filters.push('unsharp=5:5:0.9:5:5:0.0');
    }

    const filterString = filters.join(',');

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .videoFilters(filterString)
        .outputOptions([
          '-c:v libx264',
          '-preset slower',
          '-crf 17',
          '-pix_fmt yuv420p',
          '-c:a copy',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  async removeWithContentAwareFill(videoPath, watermarkRegions, outputPath) {
    // Advanced content-aware fill using sophisticated FFmpeg filters
    logger.info('Using content-aware fill method...');

    return new Promise((resolve, reject) => {
      const filters = [];

      watermarkRegions.forEach((region) => {
        // Expand region for better context
        const expandedRegion = this.expandRegion(region, 10);

        // Multi-stage content-aware approach:
        // 1. Heavy delogo with large band
        filters.push(
          `delogo=x=${expandedRegion.x}:y=${expandedRegion.y}:w=${expandedRegion.width}:h=${expandedRegion.height}:band=20:show=0`
        );
      });

      // Advanced post-processing pipeline
      filters.push(
        // Edge-preserving denoising
        'nlmeans=s=3.0:p=7:r=15',
        // Gaussian blur for smooth inpainting
        'gblur=sigma=1.0:steps=2',
        // Edge enhancement
        'unsharp=luma_msize_x=7:luma_msize_y=7:luma_amount=1.8',
        // Final denoise to remove artifacts
        'hqdn3d=1.5:1.5:6:6'
      );

      const filterString = filters.join(',');

      ffmpeg(videoPath)
        .videoFilters(filterString)
        .outputOptions([
          '-c:v libx264',
          '-preset veryslow',  // Best quality preset
          '-crf 16',           // Very high quality
          '-pix_fmt yuv420p',
          '-profile:v high',
          '-level 4.2',
          '-c:a copy',
          '-movflags +faststart',
          '-bf 2',
          '-g 30'
        ])
        .output(outputPath)
        .on('start', (cmdLine) => {
          logger.debug(`Content-aware fill command: ${cmdLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`Content-aware fill: ${progress.percent.toFixed(1)}% complete`);
          }
        })
        .on('end', () => {
          logger.success('Content-aware fill completed');
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error(`Error during content-aware fill: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }
}
