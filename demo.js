#!/usr/bin/env node

import { VideoPipeline } from './src/index.js';
import logger from './src/utils/logger.js';

async function demo() {
  console.log('\n🎬 Video Watermark Remover Demo\n');

  // Create pipeline with custom config
  const pipeline = new VideoPipeline({
    output: {
      directory: './output',
      quality: 'medium'
    },
    enhancement: {
      enabled: true,
      targetWidth: 1920,
      targetHeight: 1080,
      quality: 'medium'
    }
  });

  // Define watermark region manually (top-left corner)
  const watermarkRegions = [
    { x: 5, y: 5, width: 200, height: 60, name: 'top-left' }
  ];

  logger.info('Processing video with manual watermark regions...');
  logger.info(`Watermark region: x=5, y=5, width=200, height=60`);

  const result = await pipeline.processWithManualRegions(
    'test-videos/sample-with-watermark.mp4',
    watermarkRegions,
    { outputFilename: 'demo-output.mp4' }
  );

  console.log('\n✨ Demo Complete!\n');
  console.log('Input:', 'test-videos/sample-with-watermark.mp4');
  console.log('Output:', result.outputPath);
  console.log('Processing time:', result.duration, 'seconds');
  console.log('File size:', result.fileSize, 'MB');
  console.log('\nWatermark at (5,5) with size 200x60 has been removed!');
}

demo().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
