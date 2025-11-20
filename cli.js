#!/usr/bin/env node

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { VideoPipeline } from './src/index.js';
import logger from './src/utils/logger.js';
import chalk from 'chalk';

const program = new Command();

// Load package.json for version
const packageJson = JSON.parse(
  await readFile(new URL('./package.json', import.meta.url))
);

// Load default config
let defaultConfig = {};
const configPath = './config/default.json';
if (existsSync(configPath)) {
  defaultConfig = JSON.parse(await readFile(configPath, 'utf-8'));
}

program
  .name('video-watermark-remover')
  .description('Advanced video watermark removal and enhancement tool')
  .version(packageJson.version);

program
  .command('process')
  .description('Process a video to remove watermarks and enhance quality')
  .argument('<input>', 'Video file path or URL (YouTube, Twitter, Facebook, Instagram)')
  .option('-o, --output <path>', 'Output file path')
  .option('-c, --config <path>', 'Custom configuration file')
  .option('--no-detect', 'Skip automatic watermark detection')
  .option('--no-enhance', 'Skip video enhancement')
  .option('--region <x,y,w,h>', 'Manual watermark region (can be used multiple times)', collect, [])
  .option('--quality <level>', 'Output quality: low, medium, high', 'high')
  .option('--resolution <WxH>', 'Target resolution (e.g., 1920x1080)')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (input, options) => {
    try {
      if (options.verbose) {
        logger.verbose = true;
      }

      console.log(chalk.bold.cyan('\n🎬 Video Watermark Remover\n'));

      // Load custom config if provided
      let config = { ...defaultConfig };
      if (options.config && existsSync(options.config)) {
        const customConfig = JSON.parse(await readFile(options.config, 'utf-8'));
        config = { ...config, ...customConfig };
      }

      // Apply CLI options to config
      if (options.quality) {
        config.enhancement = config.enhancement || {};
        config.enhancement.quality = options.quality;
      }

      if (options.resolution) {
        const [width, height] = options.resolution.split('x').map(Number);
        config.enhancement = config.enhancement || {};
        config.enhancement.targetWidth = width;
        config.enhancement.targetHeight = height;
      }

      if (options.enhance === false) {
        config.enhancement = config.enhancement || {};
        config.enhancement.enabled = false;
      }

      // Parse manual regions
      let manualRegions = [];
      if (options.region && options.region.length > 0) {
        manualRegions = options.region.map(r => {
          const [x, y, w, h] = r.split(',').map(Number);
          return { x, y, width: w, height: h };
        });
      }

      // Create pipeline
      const pipeline = new VideoPipeline(config);

      // Process video
      const processOptions = {
        skipDetection: options.detect === false,
        manualRegions,
        outputFilename: options.output ? path.basename(options.output) : undefined
      };

      const result = await pipeline.process(input, processOptions);

      console.log(chalk.bold.green('\n✨ Success!\n'));
      console.log(chalk.gray('Output:'), result.outputPath);
      console.log(chalk.gray('Duration:'), `${result.duration}s`);
      console.log(chalk.gray('File size:'), `${result.fileSize} MB`);

      if (result.watermarkRegions.length > 0) {
        console.log(chalk.gray('Watermarks removed:'), result.watermarkRegions.length);
      }

    } catch (error) {
      logger.error(error.message);
      if (options.verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Process multiple videos')
  .argument('<inputs...>', 'Video file paths or URLs')
  .option('-c, --config <path>', 'Custom configuration file')
  .option('--quality <level>', 'Output quality: low, medium, high', 'high')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (inputs, options) => {
    try {
      if (options.verbose) {
        logger.verbose = true;
      }

      console.log(chalk.bold.cyan('\n🎬 Batch Video Processing\n'));

      // Load config
      let config = { ...defaultConfig };
      if (options.config && existsSync(options.config)) {
        const customConfig = JSON.parse(await readFile(options.config, 'utf-8'));
        config = { ...config, ...customConfig };
      }

      if (options.quality) {
        config.enhancement = config.enhancement || {};
        config.enhancement.quality = options.quality;
      }

      const pipeline = new VideoPipeline(config);
      const results = await pipeline.processBatch(inputs);

      console.log(chalk.bold.green('\n✨ Batch processing complete!\n'));

      results.forEach((result, i) => {
        if (result.success) {
          console.log(chalk.green(`✓ ${i + 1}. ${result.input}`));
          console.log(chalk.gray(`   Output: ${result.outputPath}`));
        } else {
          console.log(chalk.red(`✗ ${i + 1}. ${result.input}`));
          console.log(chalk.gray(`   Error: ${result.error}`));
        }
      });

    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Get information about a video')
  .argument('<input>', 'Video file path or URL')
  .action(async (input) => {
    try {
      console.log(chalk.bold.cyan('\n📹 Video Information\n'));

      const pipeline = new VideoPipeline(defaultConfig);
      const info = await pipeline.getInfo(input);

      console.log(chalk.bold('Format:'), info.format);
      console.log(chalk.bold('Duration:'), `${info.duration.toFixed(2)}s`);
      console.log(chalk.bold('Size:'), `${(info.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(chalk.bold('Bitrate:'), `${(info.bitrate / 1000).toFixed(0)} kbps`);

      if (info.video) {
        console.log(chalk.bold('\nVideo Stream:'));
        console.log(chalk.gray('  Codec:'), info.video.codec);
        console.log(chalk.gray('  Resolution:'), `${info.video.width}x${info.video.height}`);
        console.log(chalk.gray('  FPS:'), info.video.fps.toFixed(2));
        console.log(chalk.gray('  Bitrate:'), `${(info.video.bitrate / 1000).toFixed(0)} kbps`);
      }

      if (info.audio) {
        console.log(chalk.bold('\nAudio Stream:'));
        console.log(chalk.gray('  Codec:'), info.audio.codec);
        console.log(chalk.gray('  Sample Rate:'), `${info.audio.sampleRate} Hz`);
        console.log(chalk.gray('  Channels:'), info.audio.channels);
        console.log(chalk.gray('  Bitrate:'), `${(info.audio.bitrate / 1000).toFixed(0)} kbps`);
      }

    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

program
  .command('download')
  .description('Download a video from a URL')
  .argument('<url>', 'Video URL (YouTube, Twitter, Facebook, Instagram)')
  .option('-o, --output <path>', 'Output file path')
  .action(async (url, options) => {
    try {
      console.log(chalk.bold.cyan('\n⬇️  Video Downloader\n'));

      const pipeline = new VideoPipeline(defaultConfig);
      const videoPath = await pipeline.downloader.download(url, options.output);

      console.log(chalk.bold.green('\n✨ Download complete!\n'));
      console.log(chalk.gray('Output:'), videoPath);

    } catch (error) {
      logger.error(error.message);
      process.exit(1);
    }
  });

// Helper function to collect multiple option values
function collect(value, previous) {
  return previous.concat([value]);
}

program.parse();
