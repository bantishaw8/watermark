import axios from 'axios';
import retry from 'retry';
import logger from '../utils/logger.js';

/**
 * Enterprise-grade client for AI Watermark Removal Service
 * Includes retry logic, circuit breaker, and health monitoring
 */
export class AIServiceClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || process.env.AI_SERVICE_URL || 'http://localhost:8000';
    this.timeout = config.timeout || 300000; // 5 minutes
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      threshold: 5,
      resetTimeout: 60000, // 1 minute
      state: 'closed', // closed, open, half-open
      lastFailureTime: null
    };

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      request => {
        logger.debug(`AI Service Request: ${request.method.toUpperCase()} ${request.url}`);
        return request;
      },
      error => {
        logger.error(`AI Service Request Error: ${error.message}`);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      response => {
        this._recordSuccess();
        return response;
      },
      error => {
        this._recordFailure();
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if AI service is healthy
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error(`AI service health check failed: ${error.message}`);
      throw new Error(`AI service is unavailable: ${error.message}`);
    }
  }

  /**
   * Detect watermarks in video using AI
   */
  async detectWatermarks(videoPath, options = {}) {
    await this._checkCircuitBreaker();

    const operation = retry.operation({
      retries: this.retries,
      factor: 2,
      minTimeout: this.retryDelay,
      maxTimeout: 10000,
      randomize: true
    });

    return new Promise((resolve, reject) => {
      operation.attempt(async (currentAttempt) => {
        try {
          logger.info(`Detecting watermarks (attempt ${currentAttempt}/${this.retries + 1}): ${videoPath}`);

          const response = await this.client.post('/api/v1/detect', {
            video_path: videoPath,
            sensitivity: options.sensitivity || 0.7,
            min_confidence: options.minConfidence || 0.5
          });

          logger.success(`Watermark detection completed: ${response.data.regions.length} region(s) found`);
          resolve(response.data);

        } catch (error) {
          logger.warning(`Detection attempt ${currentAttempt} failed: ${error.message}`);

          if (operation.retry(error)) {
            return;
          }

          reject(new Error(`AI detection failed after ${currentAttempt} attempts: ${error.message}`));
        }
      });
    });
  }

  /**
   * Remove watermarks using AI inpainting
   */
  async inpaintVideo(videoPath, regions, options = {}) {
    await this._checkCircuitBreaker();

    const operation = retry.operation({
      retries: this.retries,
      factor: 2,
      minTimeout: this.retryDelay,
      maxTimeout: 10000,
      randomize: true
    });

    return new Promise((resolve, reject) => {
      operation.attempt(async (currentAttempt) => {
        try {
          logger.info(`Inpainting video (attempt ${currentAttempt}/${this.retries + 1}): ${videoPath}`);

          const response = await this.client.post('/api/v1/inpaint', {
            video_path: videoPath,
            regions: regions,
            output_path: options.outputPath,
            quality: options.quality || 'high'
          });

          logger.success(`Inpainting completed: ${response.data.output_path}`);
          resolve(response.data);

        } catch (error) {
          logger.warning(`Inpainting attempt ${currentAttempt} failed: ${error.message}`);

          if (operation.retry(error)) {
            return;
          }

          reject(new Error(`AI inpainting failed after ${currentAttempt} attempts: ${error.message}`));
        }
      });
    });
  }

  /**
   * Complete pipeline: detect and remove watermarks
   */
  async processVideo(videoPath, options = {}) {
    await this._checkCircuitBreaker();

    try {
      logger.info(`Processing video with AI: ${videoPath}`);

      const response = await this.client.post('/api/v1/process', {
        video_path: videoPath,
        sensitivity: options.sensitivity || 0.7,
        min_confidence: options.minConfidence || 0.5
      });

      logger.success(`Video processing completed: ${response.data.status}`);
      return response.data;

    } catch (error) {
      logger.error(`AI processing failed: ${error.message}`);
      throw new Error(`Failed to process video with AI: ${error.message}`);
    }
  }

  /**
   * Check circuit breaker state
   */
  async _checkCircuitBreaker() {
    const breaker = this.circuitBreaker;

    // Check if circuit is open
    if (breaker.state === 'open') {
      const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;

      // Try to move to half-open state
      if (timeSinceLastFailure > breaker.resetTimeout) {
        breaker.state = 'half-open';
        logger.info('Circuit breaker moved to half-open state');
      } else {
        throw new Error('AI service circuit breaker is open. Service may be down.');
      }
    }
  }

  /**
   * Record successful request
   */
  _recordSuccess() {
    const breaker = this.circuitBreaker;

    if (breaker.state === 'half-open') {
      // Reset circuit breaker
      breaker.state = 'closed';
      breaker.failures = 0;
      logger.info('Circuit breaker closed - service recovered');
    }
  }

  /**
   * Record failed request
   */
  _recordFailure() {
    const breaker = this.circuitBreaker;
    breaker.failures++;
    breaker.lastFailureTime = Date.now();

    // Open circuit if threshold reached
    if (breaker.failures >= breaker.threshold && breaker.state === 'closed') {
      breaker.state = 'open';
      logger.error(`Circuit breaker opened after ${breaker.failures} failures`);
    }
  }

  /**
   * Get service metrics
   */
  async getMetrics() {
    try {
      const response = await this.client.get('/metrics');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if service is available
   */
  async isAvailable() {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      threshold: this.circuitBreaker.threshold
    };
  }
}

export default AIServiceClient;
