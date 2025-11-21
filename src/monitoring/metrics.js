/**
 * Prometheus Metrics for Monitoring
 */

import promClient from 'prom-client';

// Enable default metrics (CPU, memory, etc.)
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// Custom metrics
const httpMetrics = {
  requestCount: new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
  }),

  requestDuration: new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
  }),

  activeConnections: new promClient.Gauge({
    name: 'http_active_connections',
    help: 'Number of active HTTP connections'
  })
};

const jobMetrics = {
  jobsProcessed: new promClient.Counter({
    name: 'jobs_processed_total',
    help: 'Total number of jobs processed',
    labelNames: ['status']
  }),

  jobDuration: new promClient.Histogram({
    name: 'job_duration_seconds',
    help: 'Job processing duration in seconds',
    buckets: [10, 30, 60, 120, 300, 600, 1800, 3600]
  }),

  activeJobs: new promClient.Gauge({
    name: 'jobs_active',
    help: 'Number of currently active jobs'
  }),

  queueSize: new promClient.Gauge({
    name: 'queue_size',
    help: 'Number of jobs in queue',
    labelNames: ['state']
  })
};

const aiMetrics = {
  aiRequests: new promClient.Counter({
    name: 'ai_requests_total',
    help: 'Total AI service requests',
    labelNames: ['operation', 'status']
  }),

  aiDuration: new promClient.Histogram({
    name: 'ai_request_duration_seconds',
    help: 'AI request duration',
    labelNames: ['operation'],
    buckets: [1, 5, 10, 30, 60, 120, 300]
  }),

  circuitBreakerState: new promClient.Gauge({
    name: 'circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)'
  })
};

export {
  promClient,
  collectDefaultMetrics,
  httpMetrics,
  jobMetrics,
  aiMetrics
};
