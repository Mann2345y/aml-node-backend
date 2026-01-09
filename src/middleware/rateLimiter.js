/**
 * Production-grade rate limiter with Redis support
 * Falls back to in-memory when Redis is unavailable
 */

import { getRedis, isRedisConnected } from '../config/redis.js';

// Configuration
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000;
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;
const RATE_LIMIT_BURST = parseInt(process.env.RATE_LIMIT_BURST, 10) || 20;

// Key prefix for Redis
const RATE_LIMIT_PREFIX = process.env.RATE_LIMIT_PREFIX || 'rl:';

// In-memory fallback store
const memoryStore = new Map();

/**
 * Sliding window rate limiter using Redis
 * Uses a sorted set with timestamps for accurate sliding window
 */
async function checkRateLimitRedis(clientIP) {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  const key = `${RATE_LIMIT_PREFIX}${clientIP}`;
  const burstKey = `${RATE_LIMIT_PREFIX}burst:${clientIP}`;

  try {
    // Use pipeline for atomic operations
    const pipeline = redis.pipeline();
    
    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Count current requests in window
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiry on the key
    pipeline.pexpire(key, RATE_LIMIT_WINDOW_MS);
    
    // Check burst (requests in last second)
    const burstWindowStart = now - 1000;
    pipeline.zremrangebyscore(burstKey, 0, burstWindowStart);
    pipeline.zcard(burstKey);
    pipeline.zadd(burstKey, now, `${now}-${Math.random()}`);
    pipeline.pexpire(burstKey, 1000);

    const results = await pipeline.exec();
    
    // results[1][1] is the count before adding current request
    const requestCount = results[1][1];
    const burstCount = results[5][1];

    return {
      allowed: requestCount < RATE_LIMIT_MAX_REQUESTS && burstCount < RATE_LIMIT_BURST,
      count: requestCount + 1,
      burstCount: burstCount + 1,
      remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - requestCount - 1),
      resetAt: now + RATE_LIMIT_WINDOW_MS,
      isBurst: burstCount >= RATE_LIMIT_BURST,
    };
  } catch (error) {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Redis rate limit check failed, falling back to memory',
      error: error.message,
      timestamp: new Date().toISOString(),
    }));
    
    // Fall back to memory-based rate limiting
    return checkRateLimitMemory(clientIP);
  }
}

/**
 * In-memory rate limiter fallback
 */
function checkRateLimitMemory(clientIP) {
  const now = Date.now();
  
  let record = memoryStore.get(clientIP);
  
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record = {
      windowStart: now,
      count: 0,
      burstWindowStart: now,
      burstCount: 0,
    };
    memoryStore.set(clientIP, record);
  }

  // Reset burst window if needed
  if (now - record.burstWindowStart > 1000) {
    record.burstWindowStart = now;
    record.burstCount = 0;
  }

  record.count++;
  record.burstCount++;

  return {
    allowed: record.count <= RATE_LIMIT_MAX_REQUESTS && record.burstCount <= RATE_LIMIT_BURST,
    count: record.count,
    burstCount: record.burstCount,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count),
    resetAt: record.windowStart + RATE_LIMIT_WINDOW_MS,
    isBurst: record.burstCount > RATE_LIMIT_BURST,
  };
}

/**
 * Rate limiting middleware
 */
export async function rateLimit(req, res, next) {
  const clientIP = req.clientIP || req.ip;
  
  // Check rate limit
  const result = isRedisConnected()
    ? await checkRateLimitRedis(clientIP)
    : checkRateLimitMemory(clientIP);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    const retryAfter = result.isBurst ? 1 : Math.ceil((result.resetAt - Date.now()) / 1000);
    
    console.warn(JSON.stringify({
      severity: 'WARNING',
      message: result.isBurst ? 'Burst limit exceeded' : 'Rate limit exceeded',
      ip: clientIP,
      count: result.count,
      burstCount: result.burstCount,
      timestamp: new Date().toISOString(),
    }));

    res.setHeader('Retry-After', retryAfter);
    
    return res.status(429).json({
      success: false,
      error: result.isBurst ? 'Too many requests (burst limit)' : 'Too many requests',
      code: result.isBurst ? 'RATE_LIMITED_BURST' : 'RATE_LIMITED',
      retryAfter,
    });
  }

  next();
}

/**
 * Block an IP temporarily (useful for abuse detection)
 * @param {string} ip - IP address to block
 * @param {number} durationMs - Block duration in milliseconds
 */
export async function blockIP(ip, durationMs = 3600000) {
  const key = `${RATE_LIMIT_PREFIX}blocked:${ip}`;
  
  if (isRedisConnected()) {
    const redis = getRedis();
    await redis.set(key, '1', 'PX', durationMs);
  } else {
    // In-memory blocking
    memoryStore.set(`blocked:${ip}`, {
      blockedUntil: Date.now() + durationMs,
    });
  }
}

/**
 * Check if an IP is blocked
 * @param {string} ip - IP address to check
 */
export async function isIPBlocked(ip) {
  const key = `${RATE_LIMIT_PREFIX}blocked:${ip}`;
  
  if (isRedisConnected()) {
    const redis = getRedis();
    const blocked = await redis.get(key);
    return blocked === '1';
  } else {
    const record = memoryStore.get(`blocked:${ip}`);
    if (record && record.blockedUntil > Date.now()) {
      return true;
    }
    memoryStore.delete(`blocked:${ip}`);
    return false;
  }
}

/**
 * IP blocking middleware
 */
export async function checkIPBlock(req, res, next) {
  const clientIP = req.clientIP || req.ip;
  
  if (await isIPBlocked(clientIP)) {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      message: 'Blocked IP attempted access',
      ip: clientIP,
      timestamp: new Date().toISOString(),
    }));

    return res.status(403).json({
      success: false,
      error: 'Access temporarily blocked',
      code: 'IP_TEMPORARILY_BLOCKED',
    });
  }

  next();
}

// Cleanup memory store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore) {
    if (key.startsWith('blocked:')) {
      if (record.blockedUntil < now) {
        memoryStore.delete(key);
      }
    } else if (record.windowStart && now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      memoryStore.delete(key);
    }
  }
}, 60000);

export default {
  rateLimit,
  blockIP,
  isIPBlocked,
  checkIPBlock,
};
