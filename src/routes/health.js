import { Router } from 'express';
import { healthCheck } from '../config/database.js';

const router = Router();

// Track server start time
const startTime = new Date();

/**
 * GET /health
 * Full health status with all services
 */
router.get('/', async (req, res) => {
  const dbHealth = await healthCheck();

  const memUsage = process.memoryUsage();
  const allHealthy = dbHealth.healthy;

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

export default router;
