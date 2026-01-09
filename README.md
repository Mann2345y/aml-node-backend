# AML Node Backend

A production-grade Node.js backend that acts as a proxy between Next.js serverless routes and PostgreSQL database on GCP Cloud SQL.

## Security Features

| Feature | Description |
|---------|-------------|
| **API Key Auth** | Constant-time comparison to prevent timing attacks |
| **Rate Limiting** | Sliding window + burst protection (100 req/min, 20 req/sec burst) |
| **IP Access Control** | Allowlist/blocklist with CIDR support |
| **SQL Injection Prevention** | Query validation, dangerous pattern detection |
| **Table Access Control** | Allowlist/blocklist tables |
| **Query Timeouts** | Configurable statement timeout (default 30s) |
| **Request Size Limits** | Configurable body size limit (default 1MB) |
| **Structured Logging** | GCP Cloud Logging compatible JSON logs |

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` with your settings. **Critical settings:**

```env
# Generate a strong API key
API_KEY=$(openssl rand -hex 32)

# Your Cloud SQL credentials
DB_NAME=your_database
DB_USER=your_user
DB_PASSWORD=your_password

# For local dev (via Cloud SQL Auth Proxy)
DB_HOST=127.0.0.1
DB_PORT=5432

# Restrict access to your Next.js app
ALLOWED_ORIGINS=https://your-app.vercel.app
```

### 3. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

## GCP Cloud Run Deployment

### Prerequisites

1. GCP project with Cloud SQL PostgreSQL instance
2. Cloud Run API enabled
3. Container Registry or Artifact Registry enabled

### Option 1: Deploy via Cloud Build

1. **Set up secrets in Secret Manager:**

```bash
# Create secrets
echo -n "your-api-key" | gcloud secrets create API_KEY --data-file=-
echo -n "your-db-password" | gcloud secrets create DB_PASSWORD --data-file=-
```

2. **Deploy using Cloud Build:**

```bash
gcloud builds submit \
  --substitutions=_REGION=us-central1,_CLOUD_SQL_INSTANCE=project:region:instance
```

### Option 2: Deploy Manually

1. **Build and push container:**

```bash
# Build
docker build -t gcr.io/YOUR_PROJECT_ID/aml-node-backend .

# Push
docker push gcr.io/YOUR_PROJECT_ID/aml-node-backend
```

2. **Deploy to Cloud Run:**

```bash
gcloud run deploy aml-node-backend \
  --image gcr.io/YOUR_PROJECT_ID/aml-node-backend \
  --region us-central1 \
  --platform managed \
  --add-cloudsql-instances YOUR_PROJECT:us-central1:YOUR_INSTANCE \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "DB_SOCKET_PATH=/cloudsql" \
  --set-env-vars "DB_INSTANCE_CONNECTION_NAME=YOUR_PROJECT:us-central1:YOUR_INSTANCE" \
  --set-env-vars "DB_NAME=your_db" \
  --set-env-vars "DB_USER=your_user" \
  --set-secrets "API_KEY=API_KEY:latest,DB_PASSWORD=DB_PASSWORD:latest" \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --timeout 60s
```

### Cloud Run Settings for Cost Control

| Setting | Recommended | Why |
|---------|-------------|-----|
| `min-instances` | 0 | Scale to zero when not in use |
| `max-instances` | 10 | Cap maximum scaling |
| `concurrency` | 80 | Requests per instance |
| `cpu-throttling` | true | Reduce CPU when idle |
| `timeout` | 60s | Kill long requests |

## API Endpoints

### Health Checks (No Auth)

```
GET /health         - Full health status
GET /health/live    - Liveness probe (always 200 if running)
GET /health/ready   - Readiness probe (200 if DB connected)
GET /health/metrics - Prometheus metrics
```

### Query Endpoints (Auth Required)

All require `x-api-key` header.

#### Execute Query
```http
POST /api/query
Content-Type: application/json
x-api-key: your-api-key

{
  "sql": "SELECT * FROM users WHERE id = $1",
  "params": [1],
  "timeout": 5000
}
```

#### Batch Queries
```http
POST /api/query/batch
{
  "queries": [
    { "sql": "SELECT * FROM users", "params": [] },
    { "sql": "SELECT * FROM orders WHERE user_id = $1", "params": [1] }
  ]
}
```

#### Transaction
```http
POST /api/query/transaction
{
  "queries": [
    { "sql": "UPDATE accounts SET balance = balance - $1 WHERE id = $2", "params": [100, 1] },
    { "sql": "UPDATE accounts SET balance = balance + $1 WHERE id = $2", "params": [100, 2] }
  ],
  "timeout": 10000
}
```

#### Insert Helper
```http
POST /api/query/insert
{
  "table": "users",
  "data": { "name": "John", "email": "john@example.com" },
  "returning": ["id", "name"]
}
```

#### Update Helper
```http
POST /api/query/update
{
  "table": "users",
  "data": { "name": "Jane" },
  "where": { "id": 1 },
  "returning": ["*"]
}
```

#### Delete Helper
```http
POST /api/query/delete
{
  "table": "users",
  "where": { "id": 1 }
}
```

## Next.js Client Library

Create `lib/db.ts` in your Next.js project:

```typescript
const DB_PROXY_URL = process.env.DB_PROXY_URL!;
const DB_API_KEY = process.env.DB_API_KEY!;

interface QueryResult<T = any> {
  success: boolean;
  data?: T[];
  rowCount?: number;
  error?: string;
  code?: string;
}

async function dbFetch<T>(
  endpoint: string,
  body: object
): Promise<QueryResult<T>> {
  const response = await fetch(`${DB_PROXY_URL}/api/query${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': DB_API_KEY,
    },
    body: JSON.stringify(body),
    // Important for serverless: don't keep connections alive
    cache: 'no-store',
  });

  if (!response.ok && response.status !== 400) {
    throw new Error(`Database proxy error: ${response.status}`);
  }

  return response.json();
}

export async function dbQuery<T = any>(
  sql: string,
  params: any[] = [],
  timeout?: number
): Promise<QueryResult<T>> {
  return dbFetch('', { sql, params, timeout });
}

export async function dbInsert<T = any>(
  table: string,
  data: Record<string, any> | Record<string, any>[],
  returning: string[] = ['*']
): Promise<QueryResult<T>> {
  return dbFetch('/insert', { table, data, returning });
}

export async function dbUpdate<T = any>(
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
  returning: string[] = ['*']
): Promise<QueryResult<T>> {
  return dbFetch('/update', { table, data, where, returning });
}

export async function dbDelete<T = any>(
  table: string,
  where: Record<string, any>,
  returning: string[] = ['*']
): Promise<QueryResult<T>> {
  return dbFetch('/delete', { table, where, returning });
}

export async function dbTransaction<T = any>(
  queries: Array<{ sql: string; params?: any[] }>,
  timeout?: number
): Promise<{ success: boolean; results?: QueryResult<T>[]; error?: string }> {
  return dbFetch('/transaction', { queries, timeout });
}
```

Usage in API routes:

```typescript
// app/api/users/route.ts
import { dbQuery, dbInsert } from '@/lib/db';

export async function GET() {
  const result = await dbQuery('SELECT * FROM users ORDER BY created_at DESC LIMIT 100');
  
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  
  return Response.json(result.data);
}

export async function POST(request: Request) {
  const body = await request.json();
  
  const result = await dbInsert('users', {
    name: body.name,
    email: body.email,
  });
  
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  
  return Response.json(result.data?.[0], { status: 201 });
}
```

## Security Best Practices

### 1. API Key
- Use a strong random key: `openssl rand -hex 32`
- Store in GCP Secret Manager, not env vars
- Rotate regularly

### 2. Network Security
- Use IP allowlisting for your Next.js deployment IPs
- If using Vercel, allowlist Vercel's IP ranges
- Consider VPC connector for Cloud Run → Cloud SQL

### 3. Database
- Use a dedicated database user with minimal permissions
- Enable Cloud SQL SSL/TLS
- Use private IP if possible

### 4. Table Access Control
```env
# Only allow access to specific tables
ALLOWED_TABLES=users,orders,products

# Block system tables (default)
BLOCKED_TABLES=pg_,information_schema,_prisma_migrations
```

### 5. Query Limits
```env
DB_STATEMENT_TIMEOUT=30000   # 30 second max query time
MAX_QUERY_LENGTH=50000       # 50KB max query size
MAX_BATCH_SIZE=50            # Max queries per batch
MAX_INSERT_ROWS=1000         # Max rows per insert
```

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `MISSING_API_KEY` | 401 | No API key provided |
| `INVALID_API_KEY` | 403 | Wrong API key |
| `IP_BLOCKED` | 403 | IP in blocklist |
| `IP_NOT_ALLOWED` | 403 | IP not in allowlist |
| `RATE_LIMITED` | 429 | Too many requests |
| `RATE_LIMITED_BURST` | 429 | Burst limit exceeded |
| `PAYLOAD_TOO_LARGE` | 413 | Request body too large |
| `QUERY_TIMEOUT` | 408 | Query took too long |
| `DANGEROUS_QUERY` | 400 | SQL contains blocked patterns |
| `TABLE_NOT_ALLOWED` | 400 | Table not in allowlist |
| `BLOCKED_TABLE` | 400 | Table in blocklist |
| `DUPLICATE_ENTRY` | 409 | Unique constraint violation |
| `FOREIGN_KEY_VIOLATION` | 400 | FK constraint violation |
| `DB_CONNECTION_ERROR` | 503 | Cannot connect to database |

## Monitoring

### GCP Cloud Logging
All logs are JSON-formatted for Cloud Logging. Filter queries:

```
resource.type="cloud_run_revision"
resource.labels.service_name="aml-node-backend"
jsonPayload.severity="ERROR"
```

### Prometheus Metrics
```
GET /health/metrics
```

Exposes:
- `process_uptime_seconds`
- `database_healthy`
- `database_latency_ms`
- `database_pool_total/idle/waiting`
- `nodejs_memory_heap_used_bytes`
- `nodejs_memory_rss_bytes`

## License

ISC
