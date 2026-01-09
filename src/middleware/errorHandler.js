/**
 * Production-grade error handling middleware
 * Provides structured logging for GCP Cloud Logging
 */

/**
 * Global error handling middleware
 */
export function errorHandler(err, req, res, next) {
  // Structured logging for GCP Cloud Logging
  const errorLog = {
    severity: 'ERROR',
    message: err.message,
    error: {
      name: err.name,
      code: err.code,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.clientIP || req.ip,
      userAgent: req.headers['user-agent'],
    },
    timestamp: new Date().toISOString(),
  };

  console.error(JSON.stringify(errorLog));

  // Handle PostgreSQL specific errors
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        return res.status(409).json({
          success: false,
          error: 'Resource already exists',
          code: 'DUPLICATE_ENTRY',
          detail: process.env.NODE_ENV !== 'production' ? err.detail : undefined,
        });

      case '23503': // foreign_key_violation
        return res.status(400).json({
          success: false,
          error: 'Referenced resource not found',
          code: 'FOREIGN_KEY_VIOLATION',
          detail: process.env.NODE_ENV !== 'production' ? err.detail : undefined,
        });

      case '23502': // not_null_violation
        return res.status(400).json({
          success: false,
          error: 'Missing required field',
          code: 'NOT_NULL_VIOLATION',
          detail: process.env.NODE_ENV !== 'production' ? err.detail : undefined,
        });

      case '42P01': // undefined_table
        return res.status(400).json({
          success: false,
          error: 'Table not found',
          code: 'TABLE_NOT_FOUND',
        });

      case '42703': // undefined_column
        return res.status(400).json({
          success: false,
          error: 'Column not found',
          code: 'COLUMN_NOT_FOUND',
        });

      case '57014': // query_canceled (timeout)
        return res.status(408).json({
          success: false,
          error: 'Query timeout exceeded',
          code: 'QUERY_TIMEOUT',
        });

      case 'ECONNREFUSED':
      case 'ENOTFOUND':
      case 'ETIMEDOUT':
        return res.status(503).json({
          success: false,
          error: 'Database connection error',
          code: 'DB_CONNECTION_ERROR',
        });

      case 'ECONNRESET':
        return res.status(503).json({
          success: false,
          error: 'Database connection reset',
          code: 'DB_CONNECTION_RESET',
        });
    }
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: err.message,
      code: 'VALIDATION_ERROR',
    });
  }

  // Handle JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: err.code || 'INTERNAL_ERROR',
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res) {
  // Log 404s in production for monitoring
  if (process.env.NODE_ENV === 'production') {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      message: 'Route not found',
      request: {
        method: req.method,
        path: req.path,
        ip: req.clientIP || req.ip,
      },
      timestamp: new Date().toISOString(),
    }));
  }

  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
}

/**
 * Async handler wrapper to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
