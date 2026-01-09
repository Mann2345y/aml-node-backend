import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

/**
 * Build PostgreSQL connection configuration for GCP Cloud SQL
 * Supports both TCP connections (via Cloud SQL Auth Proxy) and Unix sockets
 */
function buildConnectionConfig() {
  const config = {
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 10000,
    // Query timeout - critical for preventing runaway queries
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT, 10) || 30000,
  };

  // GCP Cloud SQL Unix Socket connection (for Cloud Run, App Engine, etc.)
  if (process.env.DB_SOCKET_PATH) {
    config.host = path.join(process.env.DB_SOCKET_PATH, process.env.DB_INSTANCE_CONNECTION_NAME);
  } else {
    // TCP connection (local dev or via Cloud SQL Auth Proxy)
    config.host = process.env.DB_HOST || 'localhost';
    config.port = parseInt(process.env.DB_PORT, 10) || 5432;
  }

  // SSL configuration for secure connections
  if (process.env.DB_SSL === 'true') {
    config.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    };

    // Load SSL certificates if provided (for direct Cloud SQL connections)
    if (process.env.DB_SSL_CA) {
      config.ssl.ca = fs.existsSync(process.env.DB_SSL_CA)
        ? fs.readFileSync(process.env.DB_SSL_CA).toString()
        : process.env.DB_SSL_CA;
    }
    if (process.env.DB_SSL_CERT) {
      config.ssl.cert = fs.existsSync(process.env.DB_SSL_CERT)
        ? fs.readFileSync(process.env.DB_SSL_CERT).toString()
        : process.env.DB_SSL_CERT;
    }
    if (process.env.DB_SSL_KEY) {
      config.ssl.key = fs.existsSync(process.env.DB_SSL_KEY)
        ? fs.readFileSync(process.env.DB_SSL_KEY).toString()
        : process.env.DB_SSL_KEY;
    }
  }

  return config;
}

const pool = new Pool(buildConnectionConfig());

// Track active connections for monitoring
let activeConnections = 0;

pool.on('connect', () => {
  activeConnections++;
});

pool.on('remove', () => {
  activeConnections--;
});

pool.on('error', (err) => {
  console.error(JSON.stringify({
    severity: 'ERROR',
    message: 'Unexpected database pool error',
    error: err.message,
    code: err.code,
    timestamp: new Date().toISOString(),
  }));
});

/**
 * Get pool statistics for monitoring
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    activeConnections,
  };
}

/**
 * Execute a query with optional parameters and timeout
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @param {number} timeout - Query timeout in ms (optional)
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params, timeout) {
  const start = Date.now();
  const queryTimeout = timeout || parseInt(process.env.DB_STATEMENT_TIMEOUT, 10) || 30000;
  
  try {
    // Set statement timeout for this specific query
    const result = await pool.query({
      text,
      values: params,
      query_timeout: queryTimeout,
    });
    
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV !== 'production' || duration > 1000) {
      console.log(JSON.stringify({
        severity: duration > 5000 ? 'WARNING' : 'DEBUG',
        message: 'Query executed',
        query: text.substring(0, 200),
        duration,
        rows: result.rowCount,
        timestamp: new Date().toISOString(),
      }));
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Query failed',
      query: text.substring(0, 200),
      duration,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
    }));
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  const client = await pool.connect();
  const originalRelease = client.release.bind(client);
  let released = false;
  
  // Timeout to ensure client is released
  const releaseTimeout = setTimeout(() => {
    if (!released) {
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'Client not released within timeout, forcing release',
        timestamp: new Date().toISOString(),
      }));
      client.release(true);
    }
  }, 60000); // 60 second timeout

  client.release = (err) => {
    if (released) return;
    released = true;
    clearTimeout(releaseTimeout);
    return originalRelease(err);
  };
  
  return client;
}

/**
 * Execute a transaction with automatic rollback on error
 * @param {Function} callback - Async function receiving client
 * @param {number} timeout - Transaction timeout in ms
 * @returns {Promise<any>}
 */
export async function transaction(callback, timeout = 30000) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    await client.query(`SET statement_timeout = ${timeout}`);
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database connection health
 * @returns {Promise<{healthy: boolean, latency?: number, error?: string}>}
 */
export async function healthCheck() {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      healthy: true,
      latency: Date.now() - start,
      poolStats: getPoolStats(),
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Close all pool connections gracefully
 */
export async function closePool() {
  await pool.end();
}

export default pool;
