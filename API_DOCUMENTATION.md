# AML Node Backend - API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Base URL](#base-url)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Health Check Endpoints](#health-check-endpoints)
6. [Query Endpoints](#query-endpoints)
7. [Error Handling](#error-handling)
8. [Examples](#examples)

---

## Overview

The AML Node Backend is a secure REST API proxy for PostgreSQL database operations. It provides a safe interface to execute SQL queries with built-in security features including:

- API key authentication
- Rate limiting
- IP access control
- SQL injection prevention
- Query validation
- Connection pooling

---

## Base URL

The API base URL depends on your deployment:

- **Local Development**: `http://localhost:3001`
- **Production**: Your deployed Cloud Run URL (e.g., `https://aml-node-backend-xxxxx.run.app`)

All API endpoints are prefixed with `/api/query` (except health checks).

---

## Authentication

All API endpoints (except health checks) require authentication using an API key.

### Headers

Include the API key in the request headers:

```
X-API-Key: your-api-key-here
```

### Example

```bash
curl -X POST https://your-api-url.com/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"sql": "SELECT * FROM users LIMIT 10"}'
```

---

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default Limits**:
  - 100 requests per minute (sliding window)
  - 20 requests per second (burst limit)

### Rate Limit Headers

Responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
Retry-After: 5
```

### Rate Limit Exceeded

If you exceed the rate limit, you'll receive a `429 Too Many Requests` response:

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMITED"
}
```

Wait for the time specified in `Retry-After` (seconds) before making another request.

---

## Health Check Endpoints

These endpoints are **public** and do not require authentication.

### GET /health

Get comprehensive health status of the server and all services.

**Request:**

```bash
GET /health
```

**Response (200 OK):**

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

**Response (503 Service Unavailable):**

```json
{
  "status": "degraded",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": {
      "status": "disconnected",
      "error": "Connection timeout"
    }
  }
}
```

### GET /health/live

Kubernetes liveness probe - checks if the process is running.

**Request:**

```bash
GET /health/live
```

**Response (200 OK):**

```json
{
  "status": "alive",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /health/ready

Kubernetes readiness probe - checks if the server can accept traffic.

**Request:**

```bash
GET /health/ready
```

**Response (200 OK):**

```json
{
  "status": "ready",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": {
    "latency": 5
  }
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "not ready",
  "reason": "database unavailable",
  "error": "Connection timeout",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /health/metrics

Prometheus-compatible metrics endpoint.

**Request:**

```bash
GET /health/metrics
```

**Response (200 OK):**

```
# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds 3600

# HELP database_healthy Database connection health (1=healthy, 0=unhealthy)
# TYPE database_healthy gauge
database_healthy 1

# HELP database_latency_ms Database query latency in milliseconds
# TYPE database_latency_ms gauge
database_latency_ms 5
...
```

---

## Query Endpoints

All query endpoints require:

- `X-API-Key` header
- `Content-Type: application/json` header
- Valid JSON request body

### POST /api/query

Execute a single SQL query.

**Request Body:**

```json
{
  "sql": "SELECT * FROM users WHERE id = $1",
  "params": [123],
  "timeout": 30000
}
```

**Parameters:**

- `sql` (string, required): SQL query with parameterized placeholders (`$1`, `$2`, etc.)
- `params` (array, optional): Query parameters in order
- `timeout` (number, optional): Query timeout in milliseconds (default: 30000)

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "name": "John Doe",
      "email": "john@example.com"
    }
  ],
  "rowCount": 1,
  "fields": [
    {
      "name": "id",
      "dataTypeID": 23
    },
    {
      "name": "name",
      "dataTypeID": 25
    },
    {
      "name": "email",
      "dataTypeID": 25
    }
  ]
}
```

**Example:**

```bash
curl -X POST https://your-api-url.com/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "sql": "SELECT * FROM users WHERE email = $1",
    "params": ["john@example.com"]
  }'
```

### POST /api/query/batch

Execute multiple queries in sequence (not transactional). If one query fails, previous queries are not rolled back.

**Request Body:**

```json
{
  "queries": [
    {
      "sql": "SELECT * FROM users LIMIT 10",
      "params": []
    },
    {
      "sql": "SELECT * FROM orders WHERE user_id = $1",
      "params": [123]
    }
  ],
  "timeout": 30000
}
```

**Parameters:**

- `queries` (array, required): Array of query objects, each with `sql` and optional `params`
- `timeout` (number, optional): Timeout for each query in milliseconds

**Response (200 OK):**

```json
{
  "success": true,
  "results": [
    {
      "data": [...],
      "rowCount": 10
    },
    {
      "data": [...],
      "rowCount": 5
    }
  ]
}
```

**Limits:**

- Maximum 50 queries per batch (configurable via `MAX_BATCH_SIZE`)

**Example:**

```bash
curl -X POST https://your-api-url.com/api/query/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "queries": [
      {"sql": "SELECT COUNT(*) FROM users", "params": []},
      {"sql": "SELECT COUNT(*) FROM orders", "params": []}
    ]
  }'
```

### POST /api/query/transaction

Execute multiple queries within a transaction. All queries succeed or all are rolled back.

**Request Body:**

```json
{
  "queries": [
    {
      "sql": "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
      "params": [100, 1]
    },
    {
      "sql": "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
      "params": [100, 2]
    }
  ],
  "timeout": 30000
}
```

**Parameters:**

- `queries` (array, required): Array of query objects
- `timeout` (number, optional): Transaction timeout in milliseconds (default: 30000)

**Response (200 OK):**

```json
{
  "success": true,
  "results": [
    {
      "data": [...],
      "rowCount": 1
    },
    {
      "data": [...],
      "rowCount": 1
    }
  ]
}
```

**Error Response:**
If any query fails, the entire transaction is rolled back:

```json
{
  "success": false,
  "error": "Insufficient balance",
  "code": "DB_ERROR"
}
```

**Limits:**

- Maximum 20 queries per transaction (configurable via `MAX_TRANSACTION_SIZE`)

**Example:**

```bash
curl -X POST https://your-api-url.com/api/query/transaction \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "queries": [
      {"sql": "INSERT INTO users (name, email) VALUES ($1, $2)", "params": ["John", "john@example.com"]},
      {"sql": "INSERT INTO user_profiles (user_id, bio) VALUES ((SELECT id FROM users WHERE email = $1), $2)", "params": ["john@example.com", "Bio text"]}
    ]
  }'
```

### POST /api/query/insert

Helper endpoint for INSERT operations. Automatically builds a parameterized INSERT query.

**Request Body (Single Row):**

```json
{
  "table": "users",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  },
  "returning": ["id", "created_at"]
}
```

**Request Body (Multiple Rows):**

```json
{
  "table": "users",
  "data": [
    {
      "name": "John Doe",
      "email": "john@example.com"
    },
    {
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  ],
  "returning": ["*"]
}
```

**Parameters:**

- `table` (string, required): Table name
- `data` (object or array, required): Row data as object or array of objects
- `returning` (array, optional): Columns to return (default: `["*"]`)

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "rowCount": 1
}
```

**Limits:**

- Maximum 1000 rows per insert (configurable via `MAX_INSERT_ROWS`)

**Example:**

```bash
curl -X POST https://your-api-url.com/api/query/insert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "table": "users",
    "data": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "returning": ["id", "name", "email"]
  }'
```

### POST /api/query/update

Helper endpoint for UPDATE operations. **Requires a WHERE clause** for safety.

**Request Body:**

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

**Parameters:**

- `table` (string, required): Table name
- `data` (object, required): Fields to update
- `where` (object, required): WHERE conditions (all conditions are ANDed together)
- `returning` (array, optional): Columns to return (default: `["*"]`)

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  ],
  "rowCount": 1
}
```

**Note:** The WHERE clause is required to prevent accidental full table updates.

**Example:**

```bash
curl -X POST https://your-api-url.com/api/query/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "table": "users",
    "data": {
      "name": "Jane Doe"
    },
    "where": {
      "id": 123
    },
    "returning": ["id", "name"]
  }'
```

**Multiple WHERE Conditions:**

```json
{
  "table": "orders",
  "data": {
    "status": "completed"
  },
  "where": {
    "user_id": 123,
    "status": "pending"
  }
}
```

This creates: `WHERE user_id = $1 AND status = $2`

### POST /api/query/delete

Helper endpoint for DELETE operations. **Requires a WHERE clause** for safety.

**Request Body:**

```json
{
  "table": "users",
  "where": {
    "id": 123
  },
  "returning": ["id", "name"]
}
```

**Parameters:**

- `table` (string, required): Table name
- `where` (object, required): WHERE conditions (all conditions are ANDed together)
- `returning` (array, optional): Columns to return (default: `["*"]`)

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "name": "John Doe"
    }
  ],
  "rowCount": 1
}
```

**Note:** The WHERE clause is required to prevent accidental full table deletes.

**Example:**

```bash
curl -X POST https://your-api-url.com/api/query/delete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "table": "users",
    "where": {
      "id": 123
    },
    "returning": ["id"]
  }'
```

---

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code                    | HTTP Status | Description                               |
| ----------------------- | ----------- | ----------------------------------------- |
| `MISSING_API_KEY`       | 401         | API key header missing                    |
| `INVALID_API_KEY`       | 403         | Invalid API key                           |
| `IP_BLOCKED`            | 403         | IP address is blocked                     |
| `IP_NOT_ALLOWED`        | 403         | IP address not in allowlist               |
| `RATE_LIMITED`          | 429         | Rate limit exceeded                       |
| `PAYLOAD_TOO_LARGE`     | 413         | Request body too large                    |
| `MISSING_SQL`           | 400         | SQL query missing                         |
| `QUERY_TOO_LONG`        | 400         | Query exceeds length limit                |
| `DANGEROUS_QUERY`       | 400         | Query contains blocked operations         |
| `BLOCKED_TABLE`         | 400         | Access to system table blocked            |
| `TABLE_NOT_ALLOWED`     | 400         | Table not in allowed list                 |
| `INVALID_TABLE`         | 400         | Invalid table name format                 |
| `MISSING_WHERE`         | 400         | WHERE clause required (for UPDATE/DELETE) |
| `DUPLICATE_ENTRY`       | 409         | Unique constraint violation               |
| `FOREIGN_KEY_VIOLATION` | 400         | Foreign key constraint violation          |
| `QUERY_TIMEOUT`         | 408         | Query execution timeout                   |
| `DB_CONNECTION_ERROR`   | 503         | Database connection failed                |
| `NOT_FOUND`             | 404         | Route not found                           |
| `INTERNAL_ERROR`        | 500         | Internal server error                     |

### Error Response Examples

**Invalid API Key:**

```json
{
  "success": false,
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

**Rate Limit Exceeded:**

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMITED"
}
```

**Query Validation Error:**

```json
{
  "success": false,
  "error": "Query contains potentially dangerous operations",
  "code": "DANGEROUS_QUERY"
}
```

**Database Error:**

```json
{
  "success": false,
  "error": "Duplicate entry",
  "code": "DUPLICATE_ENTRY"
}
```

---

## Examples

### JavaScript/TypeScript (Fetch API)

```javascript
const API_URL = "https://your-api-url.com";
const API_KEY = "your-api-key";

// Execute a query
async function executeQuery() {
  const response = await fetch(`${API_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({
      sql: "SELECT * FROM users WHERE id = $1",
      params: [123],
    }),
  });

  const result = await response.json();
  if (result.success) {
    console.log("Data:", result.data);
  } else {
    console.error("Error:", result.error);
  }
}

// Insert a record
async function insertUser(name, email) {
  const response = await fetch(`${API_URL}/api/query/insert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({
      table: "users",
      data: { name, email },
      returning: ["id", "name", "email"],
    }),
  });

  return await response.json();
}

// Update a record
async function updateUser(id, updates) {
  const response = await fetch(`${API_URL}/api/query/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({
      table: "users",
      data: updates,
      where: { id },
      returning: ["*"],
    }),
  });

  return await response.json();
}

// Delete a record
async function deleteUser(id) {
  const response = await fetch(`${API_URL}/api/query/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({
      table: "users",
      where: { id },
      returning: ["id"],
    }),
  });

  return await response.json();
}

// Execute a transaction
async function transferFunds(fromId, toId, amount) {
  const response = await fetch(`${API_URL}/api/query/transaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({
      queries: [
        {
          sql: "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
          params: [amount, fromId],
        },
        {
          sql: "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
          params: [amount, toId],
        },
      ],
    }),
  });

  return await response.json();
}
```

### Node.js (Axios)

```javascript
const axios = require("axios");

const API_URL = "https://your-api-url.com";
const API_KEY = "your-api-key";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
  },
});

// Execute a query
async function executeQuery() {
  try {
    const response = await api.post("/api/query", {
      sql: "SELECT * FROM users WHERE email = $1",
      params: ["john@example.com"],
    });
    console.log("Data:", response.data.data);
  } catch (error) {
    console.error("Error:", error.response?.data);
  }
}

// Insert a record
async function insertUser(name, email) {
  try {
    const response = await api.post("/api/query/insert", {
      table: "users",
      data: { name, email },
      returning: ["id", "name", "email"],
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || "Insert failed");
  }
}
```

### Python (requests)

```python
import requests

API_URL = 'https://your-api-url.com'
API_KEY = 'your-api-key'

headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
}

# Execute a query
def execute_query():
    response = requests.post(
        f'{API_URL}/api/query',
        headers=headers,
        json={
            'sql': 'SELECT * FROM users WHERE id = $1',
            'params': [123],
        }
    )
    result = response.json()
    if result['success']:
        print('Data:', result['data'])
    else:
        print('Error:', result['error'])

# Insert a record
def insert_user(name, email):
    response = requests.post(
        f'{API_URL}/api/query/insert',
        headers=headers,
        json={
            'table': 'users',
            'data': {'name': name, 'email': email},
            'returning': ['id', 'name', 'email'],
        }
    )
    return response.json()
```

### cURL Examples

**Health Check:**

```bash
curl https://your-api-url.com/health
```

**Execute Query:**

```bash
curl -X POST https://your-api-url.com/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "sql": "SELECT * FROM users LIMIT 10",
    "params": []
  }'
```

**Insert Record:**

```bash
curl -X POST https://your-api-url.com/api/query/insert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "table": "users",
    "data": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "returning": ["id", "name", "email"]
  }'
```

**Update Record:**

```bash
curl -X POST https://your-api-url.com/api/query/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "table": "users",
    "data": {
      "name": "Jane Doe"
    },
    "where": {
      "id": 123
    },
    "returning": ["*"]
  }'
```

**Delete Record:**

```bash
curl -X POST https://your-api-url.com/api/query/delete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "table": "users",
    "where": {
      "id": 123
    },
    "returning": ["id"]
  }'
```

**Transaction:**

```bash
curl -X POST https://your-api-url.com/api/query/transaction \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "queries": [
      {
        "sql": "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
        "params": [100, 1]
      },
      {
        "sql": "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
        "params": [100, 2]
      }
    ]
  }'
```

---

## Best Practices

1. **Always use parameterized queries**: Never concatenate user input into SQL strings. Use `$1`, `$2`, etc. placeholders.

2. **Use helper endpoints when possible**: The `/insert`, `/update`, and `/delete` endpoints handle sanitization automatically.

3. **Handle errors gracefully**: Check the `success` field and handle errors appropriately.

4. **Respect rate limits**: Implement exponential backoff when you receive `429` responses.

5. **Use transactions for related operations**: When multiple queries must succeed or fail together, use `/transaction`.

6. **Specify timeouts**: For long-running queries, set appropriate timeout values.

7. **Use RETURNING clause**: When inserting/updating, use `returning` to get the modified data back.

8. **Monitor rate limit headers**: Check `X-RateLimit-Remaining` to avoid hitting limits.

---

## Support

For issues or questions:

- Check the error codes and messages in responses
- Review server logs (if you have access)
- Verify your API key and network connectivity
- Ensure your IP is allowed (if IP allowlist is configured)

---

## Version

API Version: 1.0.0

Last Updated: 2024
