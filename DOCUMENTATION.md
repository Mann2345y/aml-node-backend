# AML Node Backend - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Dependencies](#dependencies)
5. [Configuration](#configuration)
6. [Application Entry Point](#application-entry-point)
7. [Database Configuration](#database-configuration)
8. [Redis Configuration](#redis-configuration)
9. [Middleware](#middleware)
10. [Routes](#routes)
11. [Security Features](#security-features)
12. [API Endpoints](#api-endpoints)
13. [Error Handling](#error-handling)
14. [Logging](#logging)
15. [Health Checks](#health-checks)
16. [Deployment](#deployment)
17. [Development](#development)

---

## Overview

**AML Node Backend** is a production-grade Node.js backend server that acts as a secure proxy for PostgreSQL database operations. It provides a RESTful API interface for executing SQL queries with comprehensive security, rate limiting, and monitoring capabilities.

### Key Features

- **Secure API Gateway**: API key authentication with constant-time comparison
- **Rate Limiting**: Distributed rate limiting with Redis support and in-memory fallback
- **IP Access Control**: Configurable IP allowlist/blocklist with CIDR support
- **SQL Validation**: Comprehensive SQL injection prevention and query validation
- **Connection Pooling**: Optimized PostgreSQL connection pool management
- **Health Monitoring**: Kubernetes-compatible health check endpoints
- **Structured Logging**: JSON-formatted logs compatible with GCP Cloud Logging
- **Graceful Shutdown**: Proper cleanup of connections and resources
- **Transaction Support**: Batch queries and transaction management
- **Helper Endpoints**: Simplified INSERT, UPDATE, DELETE operations

### Technology Stack

- **Runtime**: Node.js 20+ (ES Modules)
- **Framework**: Express.js 4.21.0
- **Database**: PostgreSQL (via `pg` library)
- **Cache/Rate Limiting**: Redis (ioredis 5.9.0) with in-memory fallback
- **Security**: Helmet.js, CORS, custom authentication middleware
- **Deployment**: Docker, Google Cloud Run

---

## Architecture

### High-Level Architecture

```
┌─────────────────┐
│   Client App    │
│  (Next.js/Vue)  │
└────────┬────────┘
         │ HTTPS
         │ X-API-Key Header
         ▼
┌─────────────────────────────────────┐
│      AML Node Backend Server        │
│  ┌───────────────────────────────┐  │
│  │  Express.js Application       │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  Middleware Stack       │  │  │
│  │  │  - CORS                 │  │  │
│  │  │  - Helmet               │  │  │
│  │  │  - IP Access Control    │  │  │
│  │  │  - Rate Limiting        │  │  │
│  │  │  - API Key Auth         │  │  │
│  │  │  - Query Validation     │  │  │
│  │  └─────────────────────────┘  │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  Route Handlers         │  │  │
│  │  │  - /health              │  │  │
│  │  │  - /api/query           │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└────────┬───────────────────┬─────────┘
         │                  │
         ▼                  ▼
┌─────────────────┐  ┌──────────────┐
│  PostgreSQL     │  │    Redis     │
│  (Cloud SQL)    │  │ (Memorystore)│
│                 │  │              │
│  Connection     │  │  Rate Limit  │
│  Pool           │  │  IP Blocks   │
└─────────────────┘  └──────────────┘
```

### Request Flow

1. **Client Request** → Express server receives HTTP request
2. **CORS Check** → Validates origin against allowed origins
3. **IP Access Control** → Checks IP allowlist/blocklist
4. **IP Block Check** → Verifies if IP is temporarily blocked (Redis)
5. **Request Size Validation** → Ensures payload doesn't exceed limits
6. **Rate Limiting** → Checks request rate (Redis or in-memory)
7. **API Key Authentication** → Validates X-API-Key header
8. **Query Validation** → Validates SQL query for security
9. **Route Handler** → Processes request and executes query
10. **Database Query** → Executes via connection pool
11. **Response** → Returns JSON response with data/error
12. **Logging** → Logs request details (if enabled)

---

## Project Structure

```
aml-node-backend/
├── src/
│   ├── index.js                 # Main application entry point
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection pool configuration
│   │   └── redis.js            # Redis client configuration
│   ├── middleware/
│   │   ├── auth.js             # Authentication & IP access control
│   │   ├── errorHandler.js     # Global error handling
│   │   ├── queryValidator.js  # SQL query validation & sanitization
│   │   └── rateLimiter.js     # Rate limiting implementation
│   └── routes/
│       ├── health.js           # Health check endpoints
│       └── query.js           # Query execution endpoints
├── .dockerignore               # Docker build exclusions
├── .gitignore                  # Git exclusions
├── cloudbuild.yaml             # Google Cloud Build configuration
├── Dockerfile                  # Production Docker image
├── env.example                 # Environment variable template
├── package.json                # Node.js dependencies & scripts
└── README.md                   # Project readme
```

---

## Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.21.0 | Web framework for Node.js |
| `pg` | ^8.13.0 | PostgreSQL client library |
| `ioredis` | ^5.9.0 | Redis client with cluster support |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing middleware |
| `helmet` | ^7.1.0 | Security headers middleware |
| `dotenv` | ^16.4.5 | Environment variable loader |

### Key Dependency Details

- **express**: Handles HTTP routing, middleware, and request/response processing
- **pg**: Provides connection pooling, query execution, and transaction support
- **ioredis**: Enables distributed rate limiting and IP blocking with automatic reconnection
- **cors**: Manages cross-origin requests with configurable origin allowlist
- **helmet**: Sets security HTTP headers (XSS protection, content security policy, etc.)
- **dotenv**: Loads environment variables from `.env` file at startup

---

## Configuration

### Environment Variables

All configuration is managed through environment variables. Copy `env.example` to `.env` and configure:

#### Server Configuration

```bash
PORT=3001                    # Server port (default: 3001)
NODE_ENV=production          # Environment: development, production
```

#### PostgreSQL Database Configuration

**Option 1: TCP Connection (Local/Cloud SQL Proxy)**
```bash
DB_HOST=localhost            # Database host
DB_PORT=5432                # Database port
DB_NAME=your_database_name  # Database name
DB_USER=your_username       # Database user
DB_PASSWORD=your_password   # Database password
```

**Option 2: Unix Socket (GCP Cloud Run/App Engine)**
```bash
DB_SOCKET_PATH=/cloudsql                                    # Socket path
DB_INSTANCE_CONNECTION_NAME=project-id:region:instance-name # Cloud SQL instance
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_password
```

**Connection Pool Settings**
```bash
DB_POOL_MIN=2                    # Minimum connections in pool (default: 2)
DB_POOL_MAX=10                   # Maximum connections in pool (default: 10)
DB_IDLE_TIMEOUT=30000            # Idle connection timeout in ms (default: 30000)
DB_CONNECTION_TIMEOUT=10000      # Connection timeout in ms (default: 10000)
DB_STATEMENT_TIMEOUT=30000       # Query timeout in ms (default: 30000)
```

**SSL Configuration**
```bash
DB_SSL=false                     # Enable SSL (default: false)
DB_SSL_REJECT_UNAUTHORIZED=true  # Reject unauthorized certificates
# Optional SSL certificates:
# DB_SSL_CA=/path/to/server-ca.pem
# DB_SSL_CERT=/path/to/client-cert.pem
# DB_SSL_KEY=/path/to/client-key.pem
```

#### Query Safety Limits

```bash
MAX_QUERY_LENGTH=50000      # Maximum SQL query length in characters
MAX_QUERY_PARAMS=1000       # Maximum parameters per query
MAX_BATCH_SIZE=50           # Maximum queries in batch request
MAX_TRANSACTION_SIZE=20     # Maximum queries in transaction
MAX_INSERT_ROWS=1000        # Maximum rows in single insert
```

#### API Security

```bash
API_KEY=your-secret-api-key-minimum-32-characters  # REQUIRED: API key for authentication
```

**Generate a secure API key:**
```bash
openssl rand -hex 32
```

#### Rate Limiting

```bash
RATE_LIMIT_MAX_REQUESTS=100    # Requests per window (default: 100)
RATE_LIMIT_WINDOW_MS=60000     # Window duration in ms (default: 60000 = 1 minute)
RATE_LIMIT_BURST=20            # Burst limit - requests per second (default: 20)
RATE_LIMIT_PREFIX=aml:rl:      # Redis key prefix for rate limiting
```

#### IP Access Control

```bash
# IP Allowlist (comma-separated, supports CIDR and wildcards)
IP_ALLOWLIST=10.0.0.0/8,192.168.1.0/24,10.0.0.*

# IP Blocklist (comma-separated static list)
IP_BLOCKLIST=1.2.3.4,5.6.7.8
```

**Supported IP Formats:**
- Exact IP: `192.168.1.100`
- CIDR: `10.0.0.0/8`, `192.168.1.0/24`
- Wildcard: `10.0.0.*`

#### CORS Configuration

```bash
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=https://your-nextjs-app.vercel.app,https://your-domain.com

# Use * to allow all origins (NOT recommended for production)
# ALLOWED_ORIGINS=*
```

#### Request Limits

```bash
MAX_REQUEST_SIZE=1mb  # Maximum request body size (default: 1mb)
```

#### Table Access Control

```bash
# Allowed tables (if set, only these tables can be accessed)
ALLOWED_TABLES=users,orders,products

# Blocked table prefixes (default: pg_,information_schema)
BLOCKED_TABLES=pg_,information_schema,_prisma_migrations
```

#### SQL Validation

```bash
STRICT_SQL_VALIDATION=true  # Enable strict validation even in development
```

#### Redis Configuration

**Option 1: Redis URL (Redis Cloud, Upstash, etc.)**
```bash
REDIS_URL=redis://user:password@host:6379
```

**Option 2: Individual Settings (GCP Memorystore)**
```bash
REDIS_HOST=10.0.0.3
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
REDIS_TLS=true                    # Enable TLS
REDIS_TLS_REJECT_UNAUTHORIZED=true # Reject unauthorized certificates
```

#### Logging

```bash
LOG_ALL_REQUESTS=false  # Log all requests (not just errors)
```

---

## Application Entry Point

### File: `src/index.js`

The main application file initializes the Express server and configures all middleware and routes.

#### Initialization Flow

1. **Environment Setup**: Loads environment variables via `dotenv/config`
2. **Redis Initialization**: Attempts to connect to Redis (optional, falls back to in-memory)
3. **Express App Creation**: Creates Express application instance
4. **Trust Proxy**: Configures Express to trust proxy headers (for GCP Load Balancer)
5. **Security Middleware**: Applies Helmet.js security headers
6. **CORS Configuration**: Sets up CORS with origin validation
7. **Body Parsing**: Configures JSON and URL-encoded body parsers with size limits
8. **Request Logging**: Adds request/response logging middleware
9. **Route Registration**: Registers health and API routes
10. **Error Handlers**: Registers global error and 404 handlers
11. **Graceful Shutdown**: Sets up signal handlers for clean shutdown
12. **Server Start**: Starts HTTP server on configured port

#### Key Components

**Trust Proxy Configuration**
```javascript
app.set('trust proxy', true);
```
- Required for GCP Load Balancer/Cloud Run to correctly identify client IPs
- Enables `req.ip` to use `X-Forwarded-For` header

**CORS Configuration**
- Validates origin against `ALLOWED_ORIGINS` environment variable
- Supports wildcard (`*`) for development
- Allows requests with no origin (load balancer health checks)
- Caches preflight requests for 24 hours
- Enables credentials for authenticated requests

**Request Logging**
- Logs all requests with status code >= 400
- Optionally logs all requests if `LOG_ALL_REQUESTS=true`
- Structured JSON logging compatible with GCP Cloud Logging
- Includes: method, URL, status, latency, IP, user agent

**Route Organization**
- `/health` - Public health check endpoints (no auth required)
- `/api/*` - Protected API endpoints (require authentication)
- `/` - Root endpoint with server info

**Graceful Shutdown**
- Handles `SIGTERM` and `SIGINT` signals
- Stops accepting new connections
- Closes Redis connection
- Closes database connection pool
- Forces exit after 30 seconds if cleanup doesn't complete

**Error Handling**
- Global uncaught exception handler
- Unhandled promise rejection handler
- Structured error logging

---

## Database Configuration

### File: `src/config/database.js`

Manages PostgreSQL connection pooling and query execution.

#### Connection Configuration

**Connection Pool Settings**
- `min`: Minimum connections (default: 2)
- `max`: Maximum connections (default: 10)
- `idleTimeoutMillis`: Idle connection timeout (default: 30000ms)
- `connectionTimeoutMillis`: Connection timeout (default: 10000ms)
- `statement_timeout`: Query timeout (default: 30000ms)

**Connection Methods**

1. **Unix Socket (GCP Cloud Run)**
   ```javascript
   host: path.join(DB_SOCKET_PATH, DB_INSTANCE_CONNECTION_NAME)
   ```

2. **TCP Connection (Local/Proxy)**
   ```javascript
   host: DB_HOST || 'localhost'
   port: DB_PORT || 5432
   ```

**SSL Configuration**
- Supports SSL for secure connections
- Can load SSL certificates from files or environment variables
- Configurable certificate validation

#### Pool Event Handlers

**Connection Tracking**
- `connect` event: Increments active connection counter
- `remove` event: Decrements active connection counter
- `error` event: Logs pool errors

#### Exported Functions

**`query(text, params, timeout)`**
- Executes a SQL query with optional parameters
- Applies statement timeout
- Logs query execution time and row count
- Returns `pg.QueryResult` with rows and metadata

**`getClient()`**
- Gets a client from the pool for transactions
- Implements automatic release timeout (60 seconds)
- Prevents connection leaks

**`transaction(callback, timeout)`**
- Executes multiple queries within a transaction
- Automatically handles BEGIN, COMMIT, ROLLBACK
- Sets statement timeout for transaction
- Ensures client is released even on error

**`healthCheck()`**
- Checks database connectivity
- Returns health status with latency
- Includes pool statistics

**`getPoolStats()`**
- Returns current pool statistics:
  - `totalCount`: Total connections in pool
  - `idleCount`: Idle connections
  - `waitingCount`: Requests waiting for connection
  - `activeConnections`: Currently active connections

**`closePool()`**
- Gracefully closes all pool connections
- Used during shutdown

---

## Redis Configuration

### File: `src/config/redis.js`

Manages Redis connection for distributed rate limiting and IP blocking.

#### Initialization

**Connection Options**
- Supports Redis URL or individual host/port configuration
- Configurable database selection
- TLS support for secure connections
- Automatic retry strategy (max 10 retries)
- Connection timeout: 10 seconds
- Command timeout: 5 seconds

**Retry Strategy**
```javascript
retryStrategy(times) {
  if (times > 10) return null; // Stop retrying
  return Math.min(times * 100, 3000); // Exponential backoff, max 3s
}
```

#### Event Handlers

- `connect`: Sets connection status, logs connection
- `error`: Logs errors, sets connection status to false
- `close`: Logs disconnection, sets connection status to false

#### Exported Functions

**`initRedis()`**
- Initializes Redis client singleton
- Returns null if Redis not configured (falls back to in-memory)
- Should be called at application startup

**`getRedis()`**
- Returns Redis client instance
- Returns null if not initialized

**`isRedisConnected()`**
- Checks if Redis is connected and available
- Returns boolean

**`redisHealthCheck()`**
- Pings Redis to check connectivity
- Returns health status with latency
- Returns `{ available: false, reason: 'not configured' }` if not configured

**`closeRedis()`**
- Gracefully closes Redis connection
- Used during shutdown

---

## Middleware

### Authentication & Access Control

#### File: `src/middleware/auth.js`

**`getClientIP(req)`**
- Extracts real client IP from request
- Checks `X-Forwarded-For` header (first IP)
- Falls back to `X-Real-IP` header
- Falls back to `req.ip` or connection remote address

**`ipAccessControl(req, res, next)`**
- Validates IP against allowlist/blocklist
- Supports CIDR notation (`/8`, `/16`, `/24`)
- Supports wildcard patterns (`10.0.0.*`)
- Returns 403 if IP is blocked or not allowed
- Logs blocked access attempts

**`apiKeyAuth(req, res, next)`**
- Validates `X-API-Key` header
- Uses constant-time comparison to prevent timing attacks
- Returns 401 if API key missing
- Returns 403 if API key invalid
- Logs invalid API key attempts
- Blocks all requests in production if API_KEY not configured

**`requestSizeLimit(req, res, next)`**
- Validates `Content-Length` header
- Returns 413 if request exceeds `MAX_REQUEST_SIZE`
- Prevents DoS attacks via large payloads

**`constantTimeEqual(a, b)`**
- Constant-time string comparison
- Prevents timing attacks on API key validation
- Uses bitwise XOR operations

### Rate Limiting

#### File: `src/middleware/rateLimiter.js`

**Sliding Window Rate Limiter**

Uses Redis sorted sets for distributed rate limiting with sliding window algorithm.

**Redis Implementation (`checkRateLimitRedis`)**
- Uses sorted set with timestamps as scores
- Removes entries outside time window
- Counts requests in current window
- Tracks burst limit (requests per second)
- Sets key expiration automatically
- Falls back to memory if Redis fails

**In-Memory Implementation (`checkRateLimitMemory`)**
- Uses Map for per-IP tracking
- Tracks window start time and request count
- Tracks burst window separately
- Automatically resets windows

**`rateLimit(req, res, next)`**
- Checks rate limit for client IP
- Sets rate limit headers:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp
  - `Retry-After`: Seconds until retry allowed
- Returns 429 if limit exceeded
- Logs rate limit violations

**`blockIP(ip, durationMs)`**
- Temporarily blocks an IP address
- Stores block in Redis or memory
- Default duration: 1 hour (3600000ms)

**`isIPBlocked(ip)`**
- Checks if IP is currently blocked
- Returns boolean

**`checkIPBlock(req, res, next)`**
- Middleware to check if IP is blocked
- Returns 403 if IP is blocked
- Logs blocked access attempts

**Memory Store Cleanup**
- Periodic cleanup (every 60 seconds)
- Removes expired blocks and old rate limit records

### Query Validation

#### File: `src/middleware/queryValidator.js`

**Dangerous SQL Patterns Blocked**
- `DROP` statements
- `DELETE` without `WHERE` clause
- `TRUNCATE` statements
- `ALTER` statements
- `CREATE` statements
- `GRANT`/`REVOKE` statements
- `INFORMATION_SCHEMA` access
- `PG_CATALOG` access
- SQL comments (`--`, `/* */`)
- `COPY` operations
- File operations (`pg_read_file`, `pg_write_file`, `lo_import`, `lo_export`)
- Multiple statements (potential injection)

**`validateQuery(sql, params)`**
- Validates SQL query for security issues
- Checks query length
- Checks parameter count
- Validates against dangerous patterns
- Validates table access permissions
- Validates parameter lengths
- Returns validation result with error details

**`validateTableAccess(sql)`**
- Checks if query accesses blocked tables
- Validates against allowed tables list
- Extracts table names from SQL (FROM, INTO, UPDATE, JOIN)
- Returns validation result

**`sanitizeTableName(table)`**
- Validates table name format
- Only allows alphanumeric, underscores, and schema prefix
- Checks against blocked/allowed tables
- Returns sanitized table name

**`sanitizeColumnNames(columns)`**
- Validates column name format
- Allows `*` for SELECT all
- Wraps column names in double quotes
- Returns sanitized column array

**`queryValidationMiddleware(req, res, next)`**
- Middleware for validating query requests
- Validates single queries (`sql` field)
- Validates batch queries (`queries` array)
- Returns 400 with error details if validation fails

### Error Handling

#### File: `src/middleware/errorHandler.js`

**`errorHandler(err, req, res, next)`**
- Global error handling middleware
- Structured error logging for GCP Cloud Logging
- Handles PostgreSQL-specific error codes:
  - `23505`: Unique violation → 409 Conflict
  - `23503`: Foreign key violation → 400 Bad Request
  - `23502`: Not null violation → 400 Bad Request
  - `42P01`: Undefined table → 400 Bad Request
  - `42703`: Undefined column → 400 Bad Request
  - `57014`: Query canceled (timeout) → 408 Request Timeout
  - `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`: Database connection error → 503 Service Unavailable
  - `ECONNRESET`: Connection reset → 503 Service Unavailable
- Handles validation errors → 400 Bad Request
- Handles JSON parsing errors → 400 Bad Request
- Handles payload too large → 413 Payload Too Large
- Default error → 500 Internal Server Error
- Hides error details in production

**`notFoundHandler(req, res)`**
- 404 Not Found handler
- Logs 404s in production for monitoring
- Returns structured error response

**`asyncHandler(fn)`**
- Wrapper for async route handlers
- Automatically catches promise rejections
- Passes errors to error handler middleware

---

## Routes

### Health Check Routes

#### File: `src/routes/health.js`

**`GET /health`**
- Full health status endpoint
- Checks database and Redis connectivity
- Returns server status, uptime, memory usage
- Returns 200 if healthy, 503 if degraded
- Response includes:
  - `status`: "healthy" or "degraded"
  - `timestamp`: Current ISO timestamp
  - `uptime`: Process uptime in seconds
  - `startTime`: Server start timestamp
  - `version`: Application version
  - `environment`: NODE_ENV value
  - `services.database`: Connection status, latency, pool stats
  - `services.redis`: Connection status, latency
  - `memory`: Heap usage, RSS memory in MB

**`GET /health/live`**
- Kubernetes liveness probe
- Simple endpoint to check if process is running
- Always returns 200 with "alive" status
- No database/Redis checks

**`GET /health/ready`**
- Kubernetes readiness probe
- Checks database connectivity
- Returns 200 if database is ready, 503 if not
- Used to determine if server can accept traffic

**`GET /health/metrics`**
- Prometheus-compatible metrics endpoint
- Returns metrics in Prometheus text format
- Metrics include:
  - `process_uptime_seconds`
  - `database_healthy` (1=healthy, 0=unhealthy)
  - `database_latency_ms`
  - `database_pool_total`
  - `database_pool_idle`
  - `database_pool_waiting`
  - `redis_healthy` (1=healthy, 0=unhealthy, -1=not configured)
  - `redis_latency_ms`
  - `nodejs_memory_heap_used_bytes`
  - `nodejs_memory_rss_bytes`

### Query Routes

#### File: `src/routes/query.js`

All query routes require:
- API key authentication (`X-API-Key` header)
- Query validation middleware
- Rate limiting

**`POST /api/query`**
- Execute a single SQL query
- **Request Body:**
  ```json
  {
    "sql": "SELECT * FROM users WHERE id = $1",
    "params": [123],
    "timeout": 30000
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": [...],
    "rowCount": 10,
    "fields": [
      { "name": "id", "dataTypeID": 23 },
      { "name": "name", "dataTypeID": 25 }
    ]
  }
  ```

**`POST /api/query/batch`**
- Execute multiple queries in sequence (not transactional)
- **Request Body:**
  ```json
  {
    "queries": [
      { "sql": "SELECT * FROM users", "params": [] },
      { "sql": "SELECT * FROM orders", "params": [] }
    ],
    "timeout": 30000
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "results": [
      { "data": [...], "rowCount": 10 },
      { "data": [...], "rowCount": 5 }
    ]
  }
  ```
- **Limits:** Maximum `MAX_BATCH_SIZE` queries (default: 50)

**`POST /api/query/transaction`**
- Execute multiple queries within a transaction
- Automatically rolls back on error
- **Request Body:**
  ```json
  {
    "queries": [
      { "sql": "INSERT INTO users ...", "params": [...] },
      { "sql": "UPDATE orders ...", "params": [...] }
    ],
    "timeout": 30000
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "results": [
      { "data": [...], "rowCount": 1 },
      { "data": [...], "rowCount": 5 }
    ]
  }
  ```
- **Limits:** Maximum `MAX_TRANSACTION_SIZE` queries (default: 20)

**`POST /api/query/insert`**
- Helper endpoint for INSERT operations
- Automatically builds parameterized INSERT query
- **Request Body:**
  ```json
  {
    "table": "users",
    "data": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "returning": ["id", "created_at"]
  }
  ```
- **Batch Insert:**
  ```json
  {
    "table": "users",
    "data": [
      { "name": "John", "email": "john@example.com" },
      { "name": "Jane", "email": "jane@example.com" }
    ],
    "returning": ["*"]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      { "id": 1, "name": "John Doe", "email": "john@example.com", "created_at": "2024-01-01T00:00:00Z" }
    ],
    "rowCount": 1
  }
  ```
- **Limits:** Maximum `MAX_INSERT_ROWS` rows (default: 1000)
- **Validation:** Table name and column names are sanitized

**`POST /api/query/update`**
- Helper endpoint for UPDATE operations
- **Request Body:**
  ```json
  {
    "table": "users",
    "data": {
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "where": {
      "id": 123
    },
    "returning": ["*"]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      { "id": 123, "name": "Jane Doe", "email": "jane@example.com" }
    ],
    "rowCount": 1
  }
  ```
- **Safety:** WHERE clause is required (prevents accidental full table updates)
- **Validation:** Table name, column names, and WHERE columns are sanitized

**`POST /api/query/delete`**
- Helper endpoint for DELETE operations
- **Request Body:**
  ```json
  {
    "table": "users",
    "where": {
      "id": 123
    },
    "returning": ["id", "name"]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      { "id": 123, "name": "John Doe" }
    ],
    "rowCount": 1
  }
  ```
- **Safety:** WHERE clause is required (prevents accidental full table deletes)
- **Validation:** Table name and WHERE columns are sanitized

---

## Security Features

### Authentication

1. **API Key Authentication**
   - Required header: `X-API-Key`
   - Constant-time comparison prevents timing attacks
   - Minimum 32 characters recommended
   - Generate with: `openssl rand -hex 32`

2. **IP Access Control**
   - Configurable allowlist (CIDR, wildcards supported)
   - Static blocklist
   - Dynamic IP blocking via Redis

### SQL Injection Prevention

1. **Parameterized Queries**
   - All queries use parameterized statements (`$1`, `$2`, etc.)
   - Parameters are never interpolated into SQL

2. **Query Validation**
   - Blocks dangerous SQL patterns
   - Prevents multiple statements
   - Validates table/column access
   - Limits query length and parameter count

3. **Table/Column Sanitization**
   - Validates table and column names
   - Only allows alphanumeric and underscores
   - Blocks system tables by default

### Rate Limiting

1. **Sliding Window Algorithm**
   - Distributed rate limiting with Redis
   - In-memory fallback if Redis unavailable
   - Tracks requests per time window
   - Separate burst limit (requests per second)

2. **IP Blocking**
   - Temporary IP blocks stored in Redis
   - Automatic expiration
   - In-memory fallback

### Request Protection

1. **Request Size Limits**
   - Configurable maximum request body size
   - Prevents DoS via large payloads
   - Default: 1MB

2. **CORS Protection**
   - Origin allowlist validation
   - Preflight request caching
   - Credentials support

3. **Security Headers (Helmet.js)**
   - Content Security Policy
   - XSS protection
   - Frame options
   - Other security headers

### Error Information Disclosure

- Error details hidden in production
- Only generic messages returned to clients
- Detailed errors logged server-side
- PostgreSQL error codes mapped to user-friendly messages

---

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Server information | No |
| GET | `/health` | Full health check | No |
| GET | `/health/live` | Liveness probe | No |
| GET | `/health/ready` | Readiness probe | No |
| GET | `/health/metrics` | Prometheus metrics | No |

### Protected Endpoints

All `/api/*` endpoints require:
- `X-API-Key` header
- IP not blocked
- Rate limit not exceeded

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/query` | Execute single query |
| POST | `/api/query/batch` | Execute batch queries |
| POST | `/api/query/transaction` | Execute transactional queries |
| POST | `/api/query/insert` | Insert helper |
| POST | `/api/query/update` | Update helper |
| POST | `/api/query/delete` | Delete helper |

---

## Error Handling

### Error Response Format

All errors follow this structure:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_API_KEY` | 401 | API key header missing |
| `INVALID_API_KEY` | 403 | Invalid API key |
| `IP_BLOCKED` | 403 | IP in static blocklist |
| `IP_NOT_ALLOWED` | 403 | IP not in allowlist |
| `IP_TEMPORARILY_BLOCKED` | 403 | IP temporarily blocked |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `RATE_LIMITED_BURST` | 429 | Burst limit exceeded |
| `PAYLOAD_TOO_LARGE` | 413 | Request body too large |
| `MISSING_SQL` | 400 | SQL query missing |
| `QUERY_TOO_LONG` | 400 | Query exceeds length limit |
| `TOO_MANY_PARAMS` | 400 | Too many parameters |
| `DANGEROUS_QUERY` | 400 | Query contains dangerous operations |
| `MULTI_STATEMENT` | 400 | Multiple statements not allowed |
| `BLOCKED_TABLE` | 400 | Access to system table blocked |
| `TABLE_NOT_ALLOWED` | 400 | Table not in allowed list |
| `INVALID_TABLE` | 400 | Invalid table name |
| `INVALID_COLUMN` | 400 | Invalid column name |
| `MISSING_WHERE` | 400 | WHERE clause required |
| `DUPLICATE_ENTRY` | 409 | Unique constraint violation |
| `FOREIGN_KEY_VIOLATION` | 400 | Foreign key constraint violation |
| `NOT_NULL_VIOLATION` | 400 | Required field missing |
| `TABLE_NOT_FOUND` | 400 | Table does not exist |
| `COLUMN_NOT_FOUND` | 400 | Column does not exist |
| `QUERY_TIMEOUT` | 408 | Query execution timeout |
| `DB_CONNECTION_ERROR` | 503 | Database connection failed |
| `DB_CONNECTION_RESET` | 503 | Database connection reset |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_JSON` | 400 | Invalid JSON in request body |
| `NOT_FOUND` | 404 | Route not found |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `CONFIG_ERROR` | 500 | Server configuration error |

### PostgreSQL Error Code Mapping

The error handler maps PostgreSQL error codes to user-friendly messages:

- `23505` → `DUPLICATE_ENTRY` (409)
- `23503` → `FOREIGN_KEY_VIOLATION` (400)
- `23502` → `NOT_NULL_VIOLATION` (400)
- `42P01` → `TABLE_NOT_FOUND` (400)
- `42703` → `COLUMN_NOT_FOUND` (400)
- `57014` → `QUERY_TIMEOUT` (408)

---

## Logging

### Log Format

All logs are structured JSON compatible with GCP Cloud Logging:

```json
{
  "severity": "INFO|WARNING|ERROR|CRITICAL",
  "message": "Log message",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "additionalFields": "..."
}
```

### Log Levels

- **INFO**: Normal operations (server start, connections)
- **WARNING**: Non-critical issues (rate limits, blocked IPs, CORS violations)
- **ERROR**: Errors that don't crash the server (query failures, Redis errors)
- **CRITICAL**: Fatal errors (uncaught exceptions)

### Logged Events

1. **Server Events**
   - Server start/stop
   - Graceful shutdown
   - Uncaught exceptions
   - Unhandled promise rejections

2. **Request Events**
   - All requests with status >= 400
   - All requests if `LOG_ALL_REQUESTS=true`
   - Includes: method, URL, status, latency, IP, user agent

3. **Security Events**
   - Invalid API key attempts
   - Blocked IP access attempts
   - CORS violations
   - Rate limit violations

4. **Database Events**
   - Query execution (if slow or in development)
   - Query failures
   - Pool errors
   - Connection events

5. **Redis Events**
   - Connection/disconnection
   - Errors
   - Rate limit fallback to memory

6. **Health Check Events**
   - Health check failures in production

---

## Health Checks

### Health Check Endpoints

1. **`GET /health`** - Comprehensive health check
   - Checks database and Redis
   - Returns detailed status
   - HTTP 200 if healthy, 503 if degraded

2. **`GET /health/live`** - Liveness probe
   - Simple process check
   - Always returns 200
   - No external dependencies

3. **`GET /health/ready`** - Readiness probe
   - Checks database connectivity
   - Returns 200 if ready, 503 if not
   - Used by load balancers

4. **`GET /health/metrics`** - Prometheus metrics
   - Prometheus-compatible format
   - Includes all service metrics
   - Text/plain content type

### Health Check Response Example

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "startTime": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": {
      "status": "connected",
      "latency": 5,
      "pool": {
        "totalCount": 5,
        "idleCount": 3,
        "waitingCount": 0,
        "activeConnections": 2
      }
    },
    "redis": {
      "status": "connected",
      "latency": 2
    }
  },
  "memory": {
    "heapUsed": 45,
    "heapTotal": 60,
    "rss": 120,
    "unit": "MB"
  }
}
```

---

## Deployment

### Docker Deployment

#### Dockerfile Structure

1. **Builder Stage**
   - Uses `node:20-alpine` base image
   - Installs production dependencies only
   - Reduces image size

2. **Production Stage**
   - Uses `node:20-alpine` base image
   - Creates non-root user (`nodejs`)
   - Copies dependencies and application code
   - Removes unnecessary files
   - Sets health check
   - Exposes port 3001

#### Building Docker Image

```bash
docker build -t aml-node-backend .
```

#### Running Docker Container

```bash
docker run -p 3001:3001 \
  -e PORT=3001 \
  -e NODE_ENV=production \
  -e API_KEY=your-api-key \
  -e DB_HOST=your-db-host \
  -e DB_NAME=your-db-name \
  -e DB_USER=your-db-user \
  -e DB_PASSWORD=your-db-password \
  aml-node-backend
```

### Google Cloud Run Deployment

#### Cloud Build Configuration

The `cloudbuild.yaml` file configures automated deployment:

1. **Build Steps**
   - Builds Docker image with commit SHA and latest tags
   - Pushes images to Container Registry
   - Deploys to Cloud Run

2. **Cloud Run Configuration**
   - Connects to Cloud SQL via Unix socket
   - Configures min/max instances
   - Sets memory and CPU limits
   - Configures concurrency
   - Sets timeout to 60 seconds

#### Deployment Variables

Set these in Cloud Build trigger or command line:

- `_REGION`: Cloud Run region (e.g., `us-central1`)
- `_CLOUD_SQL_INSTANCE`: Cloud SQL connection name
- `_MIN_INSTANCES`: Minimum instances (default: 0)
- `_MAX_INSTANCES`: Maximum instances (default: 10)
- `_MEMORY`: Memory allocation (default: `512Mi`)
- `_CPU`: CPU allocation (default: `1`)
- `_CONCURRENCY`: Concurrent requests per instance (default: 80)

#### Manual Deployment

```bash
gcloud run deploy aml-node-backend \
  --image gcr.io/PROJECT_ID/aml-node-backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances PROJECT_ID:REGION:INSTANCE_NAME \
  --set-env-vars NODE_ENV=production,DB_SOCKET_PATH=/cloudsql,DB_INSTANCE_CONNECTION_NAME=PROJECT_ID:REGION:INSTANCE_NAME \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --timeout 60s
```

### Environment Variables in Production

Set environment variables in Cloud Run:

```bash
gcloud run services update aml-node-backend \
  --region us-central1 \
  --update-env-vars API_KEY=your-api-key,DB_NAME=your-db-name,DB_USER=your-db-user,DB_PASSWORD=your-db-password,ALLOWED_ORIGINS=https://your-app.com
```

Or use Secret Manager for sensitive values:

```bash
gcloud run services update aml-node-backend \
  --region us-central1 \
  --update-secrets API_KEY=api-key-secret:latest,DB_PASSWORD=db-password-secret:latest
```

---

## Development

### Local Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   Uses `node --watch` for automatic restarts on file changes

4. **Start Production Server**
   ```bash
   npm start
   ```

### Development vs Production

**Development Mode (`NODE_ENV=development`)**
- Detailed error messages in responses
- Query execution logging
- Verbose startup banner
- Stack traces in error responses

**Production Mode (`NODE_ENV=production`)**
- Generic error messages
- Minimal logging
- No stack traces
- API key required (blocks if not configured)
- Strict SQL validation enabled

### Testing Endpoints

**Health Check**
```bash
curl http://localhost:3001/health
```

**Query Execution**
```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "sql": "SELECT * FROM users LIMIT 10",
    "params": []
  }'
```

**Insert Helper**
```bash
curl -X POST http://localhost:3001/api/query/insert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "table": "users",
    "data": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "returning": ["id", "created_at"]
  }'
```

### Database Connection Options

**Local Development with Cloud SQL Proxy**
```bash
# Install Cloud SQL Proxy
# https://cloud.google.com/sql/docs/postgres/sql-proxy

# Start proxy
cloud-sql-proxy PROJECT_ID:REGION:INSTANCE_NAME

# Configure .env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password
```

**Direct Connection (Not Recommended for Production)**
```bash
DB_HOST=your-db-host
DB_PORT=5432
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

### Redis Setup (Optional)

**Local Redis**
```bash
# Install Redis
# macOS: brew install redis
# Ubuntu: sudo apt-get install redis-server

# Start Redis
redis-server

# Configure .env
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Redis Cloud / Upstash**
```bash
REDIS_URL=redis://user:password@host:6379
```

### Monitoring

**Health Check Monitoring**
- Set up monitoring to check `/health` endpoint
- Alert on 503 status codes
- Monitor response times

**Log Monitoring**
- Use GCP Cloud Logging or similar
- Filter by severity level
- Set up alerts for ERROR and CRITICAL logs

**Metrics Collection**
- Scrape `/health/metrics` endpoint with Prometheus
- Monitor database pool statistics
- Track rate limit violations

### Troubleshooting

**Database Connection Issues**
- Check `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Verify network connectivity
- Check Cloud SQL instance status
- Review connection pool settings

**Redis Connection Issues**
- Check `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Verify Redis is running
- Check network connectivity
- Server falls back to in-memory rate limiting

**Rate Limiting Issues**
- Check `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`
- Verify Redis is connected (if using distributed rate limiting)
- Check rate limit headers in response

**Query Validation Errors**
- Review `ALLOWED_TABLES` and `BLOCKED_TABLES` settings
- Check `MAX_QUERY_LENGTH` and `MAX_QUERY_PARAMS`
- Verify SQL query syntax
- Check for dangerous SQL patterns

**CORS Issues**
- Verify `ALLOWED_ORIGINS` includes your frontend URL
- Check for trailing slashes in origin URLs
- Use `*` for development only

---

## Best Practices

### Security

1. **API Key Management**
   - Use strong, randomly generated API keys (minimum 32 characters)
   - Rotate API keys regularly
   - Store in environment variables or secret manager
   - Never commit API keys to version control

2. **IP Access Control**
   - Use allowlist in production
   - Monitor blocked IP attempts
   - Review and update blocklist regularly

3. **SQL Security**
   - Always use parameterized queries
   - Validate all user inputs
   - Use helper endpoints when possible (they handle sanitization)
   - Review `ALLOWED_TABLES` regularly

4. **Rate Limiting**
   - Set appropriate limits based on expected traffic
   - Monitor rate limit violations
   - Adjust burst limits based on usage patterns

### Performance

1. **Connection Pooling**
   - Set `DB_POOL_MIN` and `DB_POOL_MAX` based on database capacity
   - Monitor pool statistics via health endpoint
   - Adjust based on concurrent request patterns

2. **Query Optimization**
   - Use indexes on frequently queried columns
   - Set appropriate `DB_STATEMENT_TIMEOUT`
   - Monitor slow queries via logs

3. **Redis Usage**
   - Use Redis for distributed rate limiting in production
   - Monitor Redis connection health
   - Set up Redis persistence if needed

### Monitoring

1. **Health Checks**
   - Set up automated health check monitoring
   - Alert on degraded status
   - Monitor database and Redis latency

2. **Logging**
   - Enable `LOG_ALL_REQUESTS` for debugging (disable in production)
   - Set up log aggregation and analysis
   - Monitor error rates and types

3. **Metrics**
   - Scrape Prometheus metrics endpoint
   - Set up dashboards for key metrics
   - Alert on anomalies

### Deployment

1. **Environment Variables**
   - Use secret manager for sensitive values
   - Document all required environment variables
   - Use different values for dev/staging/production

2. **Container Optimization**
   - Use multi-stage builds
   - Run as non-root user
   - Minimize image size

3. **Scaling**
   - Set appropriate min/max instances
   - Monitor concurrency settings
   - Adjust based on traffic patterns

---

## Conclusion

This documentation covers all aspects of the AML Node Backend server, from architecture and configuration to deployment and best practices. The server is designed for production use with comprehensive security, monitoring, and error handling capabilities.

For questions or issues, refer to the code comments in individual files or review the error codes and logging output for troubleshooting.
