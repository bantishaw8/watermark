#!/usr/bin/env node

/**
 * Background Worker for Processing Watermark Removal Jobs
 * Processes jobs from the queue with monitoring and error handling
 */

import { WatermarkQueue } from './WatermarkQueue.js';
import logger from '../utils/logger.js';

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY) || 2;

logger.info('Starting watermark removal worker...');
logger.info(`Concurrency: ${CONCURRENCY}`);

// Create queue
const queue = new WatermarkQueue();

// Start worker
queue.startWorker(CONCURRENCY);

// Handle shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down worker...`);

  try {
    await queue.stopWorker();
    await queue.close();
    logger.info('Worker shut down gracefully');
    process.exit(0);
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Log worker status periodically
setInterval(async () => {
  try {
    const stats = await queue.getStats();
    logger.info(`Queue stats: ${JSON.stringify(stats)}`);
  } catch (error) {
    logger.error(`Failed to get queue stats: ${error.message}`);
  }
}, 60000); // Every minute

logger.info('Worker ready and waiting for jobs...');
