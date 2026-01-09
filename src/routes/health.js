import { Router } from 'express';
import { healthCheck, getPoolStats } from '../config/database.js';
import { redisHealthCheck, isRedisConnected } from '../config/redis.js';

const router = Router();

// Track server start time
const startTime = new Date();

/**
 * GET /health
 * Full health status with all services
 */
router.get('/', async (req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([
    healthCheck(),
    redisHealthCheck(),
  ]);

  const memUsage = process.memoryUsage();
  const allHealthy = dbHealth.healthy && (redisHealth.available || !isRedisConnected());

  const status = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    startTime: startTime.toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: {
        status: dbHealth.healthy ? 'connected' : 'disconnected',
        latency: dbHealth.latency,
        pool: dbHealth.poolStats,
        error: dbHealth.error,
      },
      redis: {
        status: redisHealth.available ? 'connected' : (isRedisConnected() ? 'disconnected' : 'not configured'),
        latency: redisHealth.latency,
        error: redisHealth.error,
      },
    },
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      unit: 'MB',
    },
  };

  // Log health check failures in production
  if (process.env.NODE_ENV === 'production' && !allHealthy) {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Health check failed',
      database: dbHealth,
      redis: redisHealth,
      timestamp: new Date().toISOString(),
    }));
  }

  res.status(allHealthy ? 200 : 503).json(status);
});

/**
 * GET /health/live
 * Kubernetes liveness probe - is the process running?
 */
router.get('/live', (req, res) => {
  res.json({ 
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe - can we serve traffic?
 */
router.get('/ready', async (req, res) => {
  const dbHealth = await healthCheck();

  if (dbHealth.healthy) {
    res.json({ 
      status: 'ready',
      timestamp: new Date().toISOString(),
      database: {
        latency: dbHealth.latency,
      },
    });
  } else {
    res.status(503).json({ 
      status: 'not ready', 
      reason: 'database unavailable',
      error: dbHealth.error,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/metrics
 * Prometheus-compatible metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([
    healthCheck(),
    redisHealthCheck(),
  ]);
  
  const poolStats = getPoolStats();
  const memUsage = process.memoryUsage();

  const metrics = [
    `# HELP process_uptime_seconds Process uptime in seconds`,
    `# TYPE process_uptime_seconds gauge`,
    `process_uptime_seconds ${process.uptime()}`,
    ``,
    `# HELP database_healthy Database connection health (1=healthy, 0=unhealthy)`,
    `# TYPE database_healthy gauge`,
    `database_healthy ${dbHealth.healthy ? 1 : 0}`,
    ``,
    `# HELP database_latency_ms Database query latency in milliseconds`,
    `# TYPE database_latency_ms gauge`,
    `database_latency_ms ${dbHealth.latency || 0}`,
    ``,
    `# HELP database_pool_total Total connections in pool`,
    `# TYPE database_pool_total gauge`,
    `database_pool_total ${poolStats.totalCount}`,
    ``,
    `# HELP database_pool_idle Idle connections in pool`,
    `# TYPE database_pool_idle gauge`,
    `database_pool_idle ${poolStats.idleCount}`,
    ``,
    `# HELP database_pool_waiting Waiting requests for connections`,
    `# TYPE database_pool_waiting gauge`,
    `database_pool_waiting ${poolStats.waitingCount}`,
    ``,
    `# HELP redis_healthy Redis connection health (1=healthy, 0=unhealthy, -1=not configured)`,
    `# TYPE redis_healthy gauge`,
    `redis_healthy ${redisHealth.available ? 1 : (isRedisConnected() ? 0 : -1)}`,
    ``,
    `# HELP redis_latency_ms Redis ping latency in milliseconds`,
    `# TYPE redis_latency_ms gauge`,
    `redis_latency_ms ${redisHealth.latency || 0}`,
    ``,
    `# HELP nodejs_memory_heap_used_bytes Node.js heap memory used`,
    `# TYPE nodejs_memory_heap_used_bytes gauge`,
    `nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`,
    ``,
    `# HELP nodejs_memory_rss_bytes Node.js RSS memory`,
    `# TYPE nodejs_memory_rss_bytes gauge`,
    `nodejs_memory_rss_bytes ${memUsage.rss}`,
  ].join('\n');

  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

export default router;
