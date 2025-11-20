import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { FileSystem } from '../utils/fileSystem.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

export class VideoDownloader {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 300000,
      maxRetries: config.maxRetries || 3,
      quality: config.quality || 'best',
      format: config.format || 'mp4',
      outputDir: config.outputDir || './temp'
    };
  }

  async download(url, outputPath = null) {
    const platform = this.detectPlatform(url);
    logger.info(`Detected platform: ${platform}`);

    if (!this.isYtDlpInstalled()) {
      throw new Error('yt-dlp is not installed. Please install it: pip install yt-dlp or npm install -g yt-dlp');
    }

    const output = outputPath || path.join(
      this.config.outputDir,
      `video_${Date.now()}.${this.config.format}`
    );

    await FileSystem.ensureDirectory(path.dirname(output));

    logger.info(`Downloading video from ${platform}...`);

    const command = this.buildDownloadCommand(url, output, platform);

    try {
      await this.executeWithRetry(command);
      logger.success(`Video downloaded successfully: ${output}`);
      return output;
    } catch (error) {
      logger.error(`Failed to download video: ${error.message}`);
      throw error;
    }
  }

  buildDownloadCommand(url, output, platform) {
    const baseCommand = 'yt-dlp';
    const options = [
      `--output "${output}"`,
      `--format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"`,
      '--merge-output-format mp4',
      '--no-playlist',
    ];

    // Platform-specific options
    switch (platform) {
      case 'youtube':
        options.push('--no-check-certificate');
        break;
      case 'twitter':
        options.push('--no-check-certificate');
        break;
      case 'facebook':
        options.push('--no-check-certificate');
        break;
      case 'instagram':
        options.push('--no-check-certificate');
        break;
    }

    return `${baseCommand} ${options.join(' ')} "${url}"`;
  }

  async executeWithRetry(command, retries = 0) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.config.timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      if (stderr && !stderr.includes('WARNING')) {
        logger.debug(`stderr: ${stderr}`);
      }

      return stdout;
    } catch (error) {
      if (retries < this.config.maxRetries) {
        logger.warning(`Download failed, retrying (${retries + 1}/${this.config.maxRetries})...`);
        await this.sleep(2000 * (retries + 1)); // Exponential backoff
        return this.executeWithRetry(command, retries + 1);
      }
      throw error;
    }
  }

  detectPlatform(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'youtube';
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      return 'twitter';
    } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
      return 'facebook';
    } else if (url.includes('instagram.com')) {
      return 'instagram';
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      return 'generic';
    }
    return 'unknown';
  }

  async isYtDlpInstalled() {
    try {
      await execAsync('yt-dlp --version');
      return true;
    } catch {
      return false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getVideoInfo(url) {
    try {
      const command = `yt-dlp --dump-json --no-playlist "${url}"`;
      const { stdout } = await execAsync(command, { timeout: 30000 });
      return JSON.parse(stdout);
    } catch (error) {
      logger.error(`Failed to get video info: ${error.message}`);
      return null;
    }
  }
}
