import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import logger from '../utils/logger.js';
import { VideoPipeline } from '../pipeline/VideoPipeline.js';

/**
 * Enterprise job queue for batch watermark removal
 * Uses BullMQ with Redis for distributed processing
 */
export class WatermarkQueue {
  constructor(config = {}) {
    this.redisConfig = {
      host: config.redisHost || process.env.REDIS_HOST || 'localhost',
      port: config.redisPort || process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: null
    };

    // Create connection
    this.connection = new Redis(this.redisConfig);

    // Create queue
    this.queue = new Queue('watermark-removal', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: {
          age: 86400, // Keep for 24 hours
          count: 1000
        },
        removeOnFail: {
          age: 604800 // Keep for 7 days
        }
      }
    });

    // Worker instance
    this.worker = null;

    logger.info('Watermark queue initialized');
  }

  /**
   * Add video processing job to queue
   */
  async addJob(videoPath, options = {}) {
    try {
      const job = await this.queue.add(
        'process-video',
        {
          videoPath,
          options
        },
        {
          jobId: options.jobId,
          priority: options.priority || 10
        }
      );

      logger.info(`Job added to queue: ${job.id}`);
      return {
        jobId: job.id,
        status: 'queued'
      };

    } catch (error) {
      logger.error(`Failed to add job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add multiple jobs at once
   */
  async addBulkJobs(videos) {
    try {
      const jobs = videos.map((video, index) => ({
        name: 'process-video',
        data: {
          videoPath: video.path,
          options: video.options || {}
        },
        opts: {
          priority: video.priority || 10
        }
      }));

      const result = await this.queue.addBulk(jobs);
      logger.info(`Added ${result.length} jobs to queue`);

      return result.map(job => ({
        jobId: job.id,
        status: 'queued'
      }));

    } catch (error) {
      logger.error(`Failed to add bulk jobs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    try {
      const job = await this.queue.getJob(jobId);

      if (!job) {
        return { status: 'not_found' };
      }

      const state = await job.getState();
      const progress = job.progress;

      return {
        jobId: job.id,
        status: state,
        progress,
        data: job.data,
        result: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp
      };

    } catch (error) {
      logger.error(`Failed to get job status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start worker to process jobs
   */
  startWorker(concurrency = 2) {
    if (this.worker) {
      logger.warning('Worker already running');
      return;
    }

    this.worker = new Worker(
      'watermark-removal',
      async (job) => {
        return await this._processJob(job);
      },
      {
        connection: this.connection,
        concurrency,
        limiter: {
          max: 10,
          duration: 60000 // 10 jobs per minute
        }
      }
    );

    // Worker event handlers
    this.worker.on('completed', (job) => {
      logger.success(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed: ${err.message}`);
    });

    this.worker.on('progress', (job, progress) => {
      logger.debug(`Job ${job.id} progress: ${progress}%`);
    });

    logger.info(`Worker started with concurrency: ${concurrency}`);
  }

  /**
   * Stop worker
   */
  async stopWorker() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      logger.info('Worker stopped');
    }
  }

  /**
   * Process a single job
   */
  async _processJob(job) {
    const { videoPath, options } = job.data;

    logger.info(`Processing job ${job.id}: ${videoPath}`);

    try {
      // Update progress
      await job.updateProgress(0);

      // Create pipeline
      const pipeline = new VideoPipeline({
        output: options.output || {},
        watermark: options.watermark || {},
        enhancement: options.enhancement || {},
        useAI: options.useAI !== false // Use AI by default
      });

      // Progress callback
      const progressCallback = (progress) => {
        job.updateProgress(progress);
      };

      // Process video
      const result = await pipeline.process(videoPath, progressCallback);

      // Update final progress
      await job.updateProgress(100);

      logger.success(`Job ${job.id} completed: ${result.outputPath}`);

      return result;

    } catch (error) {
      logger.error(`Job ${job.id} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    try {
      const waiting = await this.queue.getWaitingCount();
      const active = await this.queue.getActiveCount();
      const completed = await this.queue.getCompletedCount();
      const failed = await this.queue.getFailedCount();
      const delayed = await this.queue.getDelayedCount();

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed
      };

    } catch (error) {
      logger.error(`Failed to get queue stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean old jobs
   */
  async clean(grace = 86400000) {
    try {
      const cleaned = await this.queue.clean(grace, 1000, 'completed');
      logger.info(`Cleaned ${cleaned.length} old jobs`);
      return cleaned.length;

    } catch (error) {
      logger.error(`Failed to clean queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pause queue
   */
  async pause() {
    await this.queue.pause();
    logger.info('Queue paused');
  }

  /**
   * Resume queue
   */
  async resume() {
    await this.queue.resume();
    logger.info('Queue resumed');
  }

  /**
   * Remove job from queue
   */
  async removeJob(jobId) {
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info(`Job ${jobId} removed`);
        return true;
      }
      return false;

    } catch (error) {
      logger.error(`Failed to remove job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retry failed job
   */
  async retryJob(jobId) {
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.retry();
        logger.info(`Job ${jobId} queued for retry`);
        return true;
      }
      return false;

    } catch (error) {
      logger.error(`Failed to retry job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close queue connection
   */
  async close() {
    await this.stopWorker();
    await this.queue.close();
    await this.connection.quit();
    logger.info('Queue closed');
  }
}

export default WatermarkQueue;
