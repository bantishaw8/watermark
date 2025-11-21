#!/usr/bin/env node

/**
 * Enterprise REST API Server for Watermark Removal
 * Provides HTTP API with authentication, rate limiting, and monitoring
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { promClient, collectDefaultMetrics, httpMetrics } from '../monitoring/metrics.js';
import { WatermarkQueue } from '../queue/WatermarkQueue.js';
import { AIServiceClient } from '../ai/AIServiceClient.js';
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

const app = express();
const PORT = process.env.API_PORT || 3000;

// Initialize services
const queue = new WatermarkQueue();
const aiClient = new AIServiceClient();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    httpMetrics.requestDuration.observe(
      { method: req.method, route: req.route?.path || req.path, status: res.statusCode },
      duration / 1000
    );
    httpMetrics.requestCount.inc(
      { method: req.method, route: req.route?.path || req.path, status: res.statusCode }
    );
  });

  next();
});

// Routes

/**
 * Health check
 */
app.get('/health', async (req, res) => {
  try {
    const aiHealth = await aiClient.isAvailable();
    const queueStats = await queue.getStats();

    res.json({
      status: 'healthy',
      ai_service: aiHealth ? 'available' : 'unavailable',
      queue: queueStats,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * Prometheus metrics
 */
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  const metrics = await promClient.register.metrics();
  res.send(metrics);
});

/**
 * Submit video for processing
 */
app.post('/api/v1/process', async (req, res) => {
  try {
    const { video_path, options } = req.body;

    if (!video_path) {
      return res.status(400).json({ error: 'video_path is required' });
    }

    // Check if file exists
    try {
      await fs.access(video_path);
    } catch (error) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    // Add job to queue
    const job = await queue.addJob(video_path, options || {});

    logger.info(`Job submitted: ${job.jobId}`);

    res.json({
      job_id: job.jobId,
      status: job.status,
      message: 'Job submitted successfully'
    });

  } catch (error) {
    logger.error(`Failed to submit job: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Submit batch of videos
 */
app.post('/api/v1/batch', async (req, res) => {
  try {
    const { videos } = req.body;

    if (!videos || !Array.isArray(videos)) {
      return res.status(400).json({ error: 'videos array is required' });
    }

    // Validate all videos
    for (const video of videos) {
      if (!video.path) {
        return res.status(400).json({ error: 'Each video must have a path' });
      }
    }

    // Add jobs
    const jobs = await queue.addBulkJobs(videos);

    logger.info(`Batch submitted: ${jobs.length} jobs`);

    res.json({
      jobs: jobs,
      count: jobs.length,
      message: 'Batch submitted successfully'
    });

  } catch (error) {
    logger.error(`Failed to submit batch: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get job status
 */
app.get('/api/v1/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await queue.getJobStatus(jobId);

    if (status.status === 'not_found') {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(status);

  } catch (error) {
    logger.error(`Failed to get job status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel job
 */
app.delete('/api/v1/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const removed = await queue.removeJob(jobId);

    if (!removed) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job cancelled successfully' });

  } catch (error) {
    logger.error(`Failed to cancel job: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Retry failed job
 */
app.post('/api/v1/jobs/:jobId/retry', async (req, res) => {
  try {
    const { jobId } = req.params;
    const retried = await queue.retryJob(jobId);

    if (!retried) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job queued for retry' });

  } catch (error) {
    logger.error(`Failed to retry job: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get queue statistics
 */
app.get('/api/v1/stats', async (req, res) => {
  try {
    const stats = await queue.getStats();
    res.json(stats);

  } catch (error) {
    logger.error(`Failed to get stats: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * AI service status
 */
app.get('/api/v1/ai/status', async (req, res) => {
  try {
    const health = await aiClient.healthCheck();
    res.json(health);

  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      error: error.message
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });

  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`API server listening on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Metrics: http://localhost:${PORT}/metrics`);
  logger.info(`API docs: http://localhost:${PORT}/api/v1/`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  await queue.close();

  process.exit(0);
});

export default app;
