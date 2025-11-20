#!/usr/bin/env node

/**
 * Example usage of the Video Watermark Remover API
 *
 * This demonstrates how to use the library programmatically
 * in your own Node.js applications.
 */

import { VideoPipeline, VideoDownloader, WatermarkDetector } from '../src/index.js';

async function example1_BasicProcessing() {
  console.log('\n=== Example 1: Basic Video Processing ===\n');

  const pipeline = new VideoPipeline({
    output: { directory: './output' },
    enhancement: { enabled: true }
  });

  // Process a local video file
  const result = await pipeline.process('./input/video.mp4');

  console.log('Success!');
  console.log('Output:', result.outputPath);
  console.log('Watermarks detected:', result.watermarkRegions.length);
}

async function example2_ManualWatermarkRegions() {
  console.log('\n=== Example 2: Manual Watermark Regions ===\n');

  const pipeline = new VideoPipeline({
    output: { directory: './output' }
  });

  // Define watermark regions manually
  const regions = [
    { x: 10, y: 10, width: 200, height: 50 },      // Top-left logo
    { x: 1720, y: 10, width: 190, height: 50 },    // Top-right logo
    { x: 10, y: 1030, width: 200, height: 50 }     // Bottom-left watermark
  ];

  const result = await pipeline.processWithManualRegions('./input/video.mp4', regions);

  console.log('Success!');
  console.log('Output:', result.outputPath);
}

async function example3_YouTubeDownloadAndProcess() {
  console.log('\n=== Example 3: YouTube Download & Process ===\n');

  const pipeline = new VideoPipeline({
    output: { directory: './output' },
    enhancement: {
      enabled: true,
      targetWidth: 1920,
      targetHeight: 1080,
      quality: 'high'
    }
  });

  // Process directly from YouTube URL
  const result = await pipeline.process('https://www.youtube.com/watch?v=YOUR_VIDEO_ID');

  console.log('Success!');
  console.log('Output:', result.outputPath);
}

async function example4_BatchProcessing() {
  console.log('\n=== Example 4: Batch Processing ===\n');

  const pipeline = new VideoPipeline({
    output: { directory: './output' },
    enhancement: { quality: 'medium' }
  });

  const inputs = [
    './input/video1.mp4',
    './input/video2.mp4',
    'https://www.youtube.com/watch?v=VIDEO_ID'
  ];

  const results = await pipeline.processBatch(inputs);

  console.log('\nBatch Results:');
  results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.success ? '✓' : '✗'} ${result.input}`);
    if (result.success) {
      console.log(`   Output: ${result.outputPath}`);
    } else {
      console.log(`   Error: ${result.error}`);
    }
  });
}

async function example5_CustomConfiguration() {
  console.log('\n=== Example 5: Custom Configuration ===\n');

  const customConfig = {
    output: {
      directory: './custom-output',
      quality: 'high'
    },
    watermark: {
      detection: {
        sensitivity: 0.8,
        sampleFrames: 20
      },
      removal: {
        iterations: 5,
        blendEdges: true
      }
    },
    enhancement: {
      enabled: true,
      upscale: true,
      denoise: true,
      sharpen: true,
      targetWidth: 3840,
      targetHeight: 2160,
      quality: 'high'
    }
  };

  const pipeline = new VideoPipeline(customConfig);
  const result = await pipeline.process('./input/video.mp4');

  console.log('Success!');
  console.log('Output:', result.outputPath);
  console.log('File size:', result.fileSize, 'MB');
  console.log('Processing time:', result.duration, 'seconds');
}

async function example6_VideoInformation() {
  console.log('\n=== Example 6: Get Video Information ===\n');

  const pipeline = new VideoPipeline();
  const info = await pipeline.getInfo('./input/video.mp4');

  console.log('Video Information:');
  console.log('Format:', info.format);
  console.log('Duration:', info.duration, 'seconds');
  console.log('Resolution:', `${info.video.width}x${info.video.height}`);
  console.log('FPS:', info.video.fps);
  console.log('Video Codec:', info.video.codec);
  console.log('Audio Codec:', info.audio.codec);
}

async function example7_DownloadOnly() {
  console.log('\n=== Example 7: Download Video Only ===\n');

  const downloader = new VideoDownloader({
    outputDir: './downloads',
    quality: 'best'
  });

  const videoPath = await downloader.download(
    'https://www.youtube.com/watch?v=YOUR_VIDEO_ID',
    './downloads/my-video.mp4'
  );

  console.log('Downloaded to:', videoPath);
}

async function example8_DetectionOnly() {
  console.log('\n=== Example 8: Watermark Detection Only ===\n');

  const detector = new WatermarkDetector({
    sensitivity: 0.7,
    sampleFrames: 10
  });

  const regions = await detector.detect('./input/video.mp4', './temp');

  console.log('Detected Watermark Regions:');
  regions.forEach((region, i) => {
    console.log(`${i + 1}. Position: ${region.name}`);
    console.log(`   Coordinates: (${region.x}, ${region.y})`);
    console.log(`   Size: ${region.width}x${region.height}`);
    console.log(`   Confidence: ${(region.confidence * 100).toFixed(1)}%`);
  });
}

// Run examples
async function main() {
  console.log('Video Watermark Remover - Usage Examples');
  console.log('========================================');

  try {
    // Uncomment the example you want to run

    // await example1_BasicProcessing();
    // await example2_ManualWatermarkRegions();
    // await example3_YouTubeDownloadAndProcess();
    // await example4_BatchProcessing();
    // await example5_CustomConfiguration();
    // await example6_VideoInformation();
    // await example7_DownloadOnly();
    // await example8_DetectionOnly();

    console.log('\n✨ Done!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Uncomment to run
// main();

export {
  example1_BasicProcessing,
  example2_ManualWatermarkRegions,
  example3_YouTubeDownloadAndProcess,
  example4_BatchProcessing,
  example5_CustomConfiguration,
  example6_VideoInformation,
  example7_DownloadOnly,
  example8_DetectionOnly
};
