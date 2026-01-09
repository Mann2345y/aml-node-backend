import Redis from 'ioredis';

/**
 * Redis client singleton for rate limiting and caching
 * Supports GCP Memorystore Redis
 */

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis connection
 * Call this at startup to enable Redis-based rate limiting
 */
export function initRedis() {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;

  if (!redisUrl && !redisHost) {
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Redis not configured, using in-memory rate limiting',
      timestamp: new Date().toISOString(),
    }));
    return null;
  }

  const options = {
    // GCP Memorystore settings
    host: redisHost || undefined,
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    
    // Connection settings
    connectTimeout: 10000,
    commandTimeout: 5000,
    
    // Retry strategy
    retryStrategy(times) {
      if (times > 10) {
        console.error(JSON.stringify({
          severity: 'ERROR',
          message: 'Redis connection failed after 10 retries',
          timestamp: new Date().toISOString(),
        }));
        return null; // Stop retrying
      }
      return Math.min(times * 100, 3000);
    },

    // TLS for Memorystore (if enabled)
    ...(process.env.REDIS_TLS === 'true' && {
      tls: {
        rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
      },
    }),
  };

  // Use URL if provided (for Redis Cloud, etc.)
  if (redisUrl) {
    redisClient = new Redis(redisUrl, options);
  } else {
    redisClient = new Redis(options);
  }

  redisClient.on('connect', () => {
    isConnected = true;
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Redis connected',
      host: redisHost || 'from URL',
      timestamp: new Date().toISOString(),
    }));
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Redis error',
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
  });

  redisClient.on('close', () => {
    isConnected = false;
    console.log(JSON.stringify({
      severity: 'WARNING',
      message: 'Redis connection closed',
      timestamp: new Date().toISOString(),
    }));
  });

  return redisClient;
}

/**
 * Get Redis client instance
 */
export function getRedis() {
  return redisClient;
}

/**
 * Check if Redis is connected and available
 */
export function isRedisConnected() {
  return isConnected && redisClient !== null;
}

/**
 * Check Redis health
 */
export async function redisHealthCheck() {
  if (!redisClient) {
    return { available: false, reason: 'not configured' };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    return {
      available: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
  }
}

export default {
  initRedis,
  getRedis,
  isRedisConnected,
  redisHealthCheck,
  closeRedis,
};
