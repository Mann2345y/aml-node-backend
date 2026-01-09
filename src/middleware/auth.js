/**
 * Production-grade authentication middleware
 */

// Re-export rate limiting from dedicated module
export { rateLimit, checkIPBlock, blockIP } from './rateLimiter.js';

// IP Allowlist (if set, only these IPs can access the API)
const IP_ALLOWLIST = process.env.IP_ALLOWLIST
  ? process.env.IP_ALLOWLIST.split(',').map(ip => ip.trim())
  : null;

// IP Blocklist (static list from env)
const IP_BLOCKLIST = process.env.IP_BLOCKLIST
  ? new Set(process.env.IP_BLOCKLIST.split(',').map(ip => ip.trim()))
  : new Set();

/**
 * Extract real client IP considering proxies (GCP Load Balancer, Cloud Run)
 */
export function getClientIP(req) {
  // GCP Load Balancer / Cloud Run puts real IP in X-Forwarded-For
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Take the first IP (original client)
    return forwardedFor.split(',')[0].trim();
  }
  
  // Cloud Run specific header
  const realIP = req.headers['x-real-ip'];
  if (realIP) return realIP;
  
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * IP-based access control middleware
 */
export function ipAccessControl(req, res, next) {
  const clientIP = getClientIP(req);
  req.clientIP = clientIP; // Store for logging

  // Check static blocklist first
  if (IP_BLOCKLIST.has(clientIP)) {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      message: 'Blocked IP attempted access',
      ip: clientIP,
      path: req.path,
      timestamp: new Date().toISOString(),
    }));
    
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      code: 'IP_BLOCKED',
    });
  }

  // Check allowlist (if configured)
  if (IP_ALLOWLIST && IP_ALLOWLIST.length > 0) {
    const isAllowed = IP_ALLOWLIST.some(allowed => {
      // Support CIDR notation check (basic /24, /16, /8)
      if (allowed.includes('/')) {
        return isIPInCIDR(clientIP, allowed);
      }
      // Support wildcard (e.g., 10.0.0.*)
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\./g, '\\.').replace(/\*/g, '\\d+');
        return new RegExp(`^${pattern}$`).test(clientIP);
      }
      return clientIP === allowed;
    });

    if (!isAllowed) {
      console.warn(JSON.stringify({
        severity: 'WARNING',
        message: 'Unauthorized IP attempted access',
        ip: clientIP,
        path: req.path,
        timestamp: new Date().toISOString(),
      }));

      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'IP_NOT_ALLOWED',
      });
    }
  }

  next();
}

/**
 * Basic CIDR check for common subnet masks
 */
function isIPInCIDR(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);
  
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);
  
  if (mask === 24) {
    return ipParts[0] === rangeParts[0] && 
           ipParts[1] === rangeParts[1] && 
           ipParts[2] === rangeParts[2];
  }
  if (mask === 16) {
    return ipParts[0] === rangeParts[0] && 
           ipParts[1] === rangeParts[1];
  }
  if (mask === 8) {
    return ipParts[0] === rangeParts[0];
  }
  
  // For other masks, do full comparison
  return ip === range;
}

/**
 * API Key authentication middleware
 */
export function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'API_KEY not configured - this is a security risk!',
      timestamp: new Date().toISOString(),
    }));
    
    // In production, block all requests if API key not configured
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
        code: 'CONFIG_ERROR',
      });
    }
    return next();
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      code: 'MISSING_API_KEY',
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(apiKey, expectedKey)) {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      message: 'Invalid API key attempt',
      ip: req.clientIP || getClientIP(req),
      path: req.path,
      timestamp: new Date().toISOString(),
    }));

    return res.status(403).json({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
    });
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Request size validation middleware
 */
export function requestSizeLimit(req, res, next) {
  const contentLength = parseInt(req.headers['content-length'], 10);
  const maxSize = parseInt(process.env.MAX_REQUEST_SIZE, 10) || 1048576; // 1MB default

  if (contentLength > maxSize) {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large',
      code: 'PAYLOAD_TOO_LARGE',
      maxSize,
    });
  }

  next();
}
