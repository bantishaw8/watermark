import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import logger from '../utils/logger.js';

ffmpeg.setFfmpegPath(ffmpegPath.path);

export class VideoEnhancer {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      upscale: config.upscale !== false,
      denoise: config.denoise !== false,
      sharpen: config.sharpen || false,
      targetWidth: config.targetWidth || 1920,
      targetHeight: config.targetHeight || 1080,
      quality: config.quality || 'high'
    };
  }

  async enhance(videoPath, outputPath) {
    if (!this.config.enabled) {
      logger.info('Enhancement disabled, copying video as-is');
      return this.copyVideo(videoPath, outputPath);
    }

    logger.info('Enhancing video quality...');

    const filters = await this.buildEnhancementFilters(videoPath);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath);

      // Apply video filters
      if (filters.length > 0) {
        command.videoFilters(filters);
      }

      // Output options based on quality setting
      const outputOptions = this.getOutputOptions();

      command
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('start', (cmdLine) => {
          logger.debug(`FFmpeg command: ${cmdLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logger.debug(`Enhancing: ${progress.percent.toFixed(1)}% complete`);
          }
        })
        .on('end', () => {
          logger.success('Video enhancement completed');
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          logger.error(`Error enhancing video: ${err.message}`);
          logger.debug(`FFmpeg stderr: ${stderr}`);
          reject(err);
        })
        .run();
    });
  }

  async buildEnhancementFilters(videoPath) {
    const filters = [];
    const metadata = await this.getVideoMetadata(videoPath);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');

    if (!videoStream) {
      throw new Error('No video stream found');
    }

    const currentWidth = videoStream.width;
    const currentHeight = videoStream.height;

    logger.debug(`Current resolution: ${currentWidth}x${currentHeight}`);

    // Upscaling filter
    if (this.config.upscale && (currentWidth < this.config.targetWidth || currentHeight < this.config.targetHeight)) {
      logger.info(`Upscaling to ${this.config.targetWidth}x${this.config.targetHeight}`);

      // Use Lanczos scaling for better quality
      filters.push({
        filter: 'scale',
        options: {
          w: this.config.targetWidth,
          h: this.config.targetHeight,
          flags: 'lanczos'
        }
      });

      // Add unsharp filter after upscaling to improve sharpness
      filters.push({
        filter: 'unsharp',
        options: '5:5:1.0:5:5:0.0'
      });
    }

    // Denoising filter
    if (this.config.denoise) {
      logger.info('Applying denoise filter');
      filters.push({
        filter: 'hqdn3d',
        options: '4:3:6:4.5' // luma_spatial:chroma_spatial:luma_tmp:chroma_tmp
      });
    }

    // Sharpening filter
    if (this.config.sharpen) {
      logger.info('Applying sharpen filter');
      filters.push({
        filter: 'unsharp',
        options: '5:5:1.5:5:5:0.0'
      });
    }

    // Color enhancement
    filters.push({
      filter: 'eq',
      options: {
        contrast: 1.1,
        brightness: 0.0,
        saturation: 1.05
      }
    });

    return filters;
  }

  getOutputOptions() {
    const options = [];

    switch (this.config.quality) {
      case 'high':
        options.push(
          '-c:v libx264',
          '-preset slow',
          '-crf 18',
          '-profile:v high',
          '-level 4.1',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 192k',
          '-ar 48000',
          '-movflags +faststart'
        );
        break;

      case 'medium':
        options.push(
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-profile:v high',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart'
        );
        break;

      case 'low':
        options.push(
          '-c:v libx264',
          '-preset fast',
          '-crf 28',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 96k',
          '-movflags +faststart'
        );
        break;

      default:
        options.push(
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-c:a copy',
          '-movflags +faststart'
        );
    }

    return options;
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

  async getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
  }

  async upscaleToHD(videoPath, outputPath) {
    logger.info('Upscaling video to HD quality...');

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .videoFilters([
          {
            filter: 'scale',
            options: {
              w: 1920,
              h: 1080,
              flags: 'lanczos'
            }
          },
          'unsharp=5:5:1.0:5:5:0.0'
        ])
        .outputOptions([
          '-c:v libx264',
          '-preset slow',
          '-crf 18',
          '-profile:v high',
          '-pix_fmt yuv420p',
          '-c:a copy',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => {
          logger.success('Video upscaled to HD');
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(`Error upscaling: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }
}
