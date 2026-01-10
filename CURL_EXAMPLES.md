# Query API - cURL Examples

This document contains comprehensive cURL examples for all query API endpoints.

## Base Configuration

Replace the following placeholders:
- `BASE_URL`: Your API base URL (e.g., `http://localhost:3001` or `https://your-api-url.com`)
- `YOUR_API_KEY`: Your API key

## Authentication

All query endpoints require the `X-API-Key` header:

```bash
-H "X-API-Key: YOUR_API_KEY"
```

---

## 1. POST /api/query

Execute a single SQL query.

### Basic SELECT Query

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "sql": "SELECT * FROM users LIMIT 10",
    "params": []
  }'
```

### SELECT with Parameters

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "sql": "SELECT * FROM users WHERE email = $1",
    "params": ["john@example.com"]
  }'
```

### SELECT with Multiple Parameters

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "sql": "SELECT * FROM users WHERE age > $1 AND status = $2",
    "params": [18, "active"]
  }'
```

### Query with Timeout

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "sql": "SELECT * FROM large_table",
    "params": [],
    "timeout": 60000
  }'
```

---

## 2. POST /api/query/batch

Execute multiple queries in sequence (not transactional).

### Basic Batch Query

```bash
curl -X POST http://localhost:3001/api/query/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "queries": [
      {
        "sql": "SELECT COUNT(*) as user_count FROM users",
        "params": []
      },
      {
        "sql": "SELECT COUNT(*) as order_count FROM orders",
        "params": []
      }
    ]
  }'
```

### Batch Query with Parameters

```bash
curl -X POST http://localhost:3001/api/query/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "queries": [
      {
        "sql": "SELECT * FROM users WHERE id = $1",
        "params": [123]
      },
      {
        "sql": "SELECT * FROM orders WHERE user_id = $1",
        "params": [123]
      }
    ],
    "timeout": 30000
  }'
```

### Complex Batch Query

```bash
curl -X POST http://localhost:3001/api/query/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "queries": [
      {
        "sql": "INSERT INTO logs (message, level) VALUES ($1, $2) RETURNING id",
        "params": ["User logged in", "info"]
      },
      {
        "sql": "UPDATE users SET last_login = NOW() WHERE id = $1",
        "params": [123]
      },
      {
        "sql": "SELECT * FROM users WHERE id = $1",
        "params": [123]
      }
    ]
  }'
```

---

## 3. POST /api/query/transaction

Execute multiple queries within a transaction (all succeed or all fail).

### Basic Transaction

```bash
curl -X POST http://localhost:3001/api/query/transaction \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
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

### Transaction with Timeout

```bash
curl -X POST http://localhost:3001/api/query/transaction \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "queries": [
      {
        "sql": "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
        "params": ["John Doe", "john@example.com"]
      },
      {
        "sql": "INSERT INTO user_profiles (user_id, bio) VALUES ($1, $2)",
        "params": [null, "Bio text"]
      }
    ],
    "timeout": 60000
  }'
```

### Complex Transaction Example

```bash
curl -X POST http://localhost:3001/api/query/transaction \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "queries": [
      {
        "sql": "INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id",
        "params": [123, 99.99]
      },
      {
        "sql": "INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)",
        "params": [null, 456, 2]
      },
      {
        "sql": "UPDATE inventory SET stock = stock - $1 WHERE product_id = $2",
        "params": [2, 456]
      }
    ]
  }'
```

---

## 4. POST /api/query/insert

Helper endpoint for INSERT operations.

### Insert Single Row

```bash
curl -X POST http://localhost:3001/api/query/insert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "data": {
      "name": "John Doe",
      "email": "john@example.com",
      "age": 30
    },
    "returning": ["id", "name", "email", "created_at"]
  }'
```

### Insert Single Row (Return All Columns)

```bash
curl -X POST http://localhost:3001/api/query/insert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "data": {
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "returning": ["*"]
  }'
```

### Insert Multiple Rows

```bash
curl -X POST http://localhost:3001/api/query/insert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "data": [
      {
        "name": "John Doe",
        "email": "john@example.com"
      },
      {
        "name": "Jane Doe",
        "email": "jane@example.com"
      },
      {
        "name": "Bob Smith",
        "email": "bob@example.com"
      }
    ],
    "returning": ["id", "name", "email"]
  }'
```

### Insert with Specific Returning Columns

```bash
curl -X POST http://localhost:3001/api/query/insert \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "products",
    "data": {
      "name": "Widget",
      "price": 29.99,
      "description": "A useful widget"
    },
    "returning": ["id", "name", "price"]
  }'
```

---

## 5. POST /api/query/update

Helper endpoint for UPDATE operations. **Requires a WHERE clause**.

### Update Single Row

```bash
curl -X POST http://localhost:3001/api/query/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "data": {
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "where": {
      "id": 123
    },
    "returning": ["*"]
  }'
```

### Update with Single Field

```bash
curl -X POST http://localhost:3001/api/query/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "data": {
      "status": "active"
    },
    "where": {
      "id": 123
    },
    "returning": ["id", "status"]
  }'
```

### Update with Multiple WHERE Conditions

```bash
curl -X POST http://localhost:3001/api/query/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "orders",
    "data": {
      "status": "completed"
    },
    "where": {
      "user_id": 123,
      "status": "pending"
    },
    "returning": ["id", "status", "updated_at"]
  }'
```

### Update Multiple Fields

```bash
curl -X POST http://localhost:3001/api/query/update \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "data": {
      "name": "John Smith",
      "email": "john.smith@example.com",
      "age": 35,
      "status": "active"
    },
    "where": {
      "id": 123
    },
    "returning": ["*"]
  }'
```

---

## 6. POST /api/query/delete

Helper endpoint for DELETE operations. **Requires a WHERE clause**.

### Delete Single Row

```bash
curl -X POST http://localhost:3001/api/query/delete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "where": {
      "id": 123
    },
    "returning": ["id", "name"]
  }'
```

### Delete with Multiple WHERE Conditions

```bash
curl -X POST http://localhost:3001/api/query/delete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "orders",
    "where": {
      "user_id": 123,
      "status": "cancelled"
    },
    "returning": ["id", "status"]
  }'
```

### Delete and Return All Columns

```bash
curl -X POST http://localhost:3001/api/query/delete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "table": "users",
    "where": {
      "id": 123
    },
    "returning": ["*"]
  }'
```

---

## Pretty-Printed Responses

To format JSON responses, pipe through `jq` (if installed):

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"sql": "SELECT * FROM users LIMIT 5", "params": []}' \
  | jq '.'
```

---

## Using Environment Variables

For easier testing, you can set environment variables:

```bash
export API_URL="http://localhost:3001"
export API_KEY="YOUR_API_KEY"

# Then use in curl commands:
curl -X POST $API_URL/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"sql": "SELECT * FROM users LIMIT 10", "params": []}'
```

---

## Windows Command Prompt

For Windows Command Prompt, use double quotes and escape inner quotes:

```cmd
curl -X POST http://localhost:3001/api/query ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: YOUR_API_KEY" ^
  -d "{\"sql\": \"SELECT * FROM users LIMIT 10\", \"params\": []}"
```

---

## Windows PowerShell

For Windows PowerShell, use single quotes for the JSON body:

```powershell
curl -X POST http://localhost:3001/api/query `
  -H "Content-Type: application/json" `
  -H "X-API-Key: YOUR_API_KEY" `
  -d '{\"sql\": \"SELECT * FROM users LIMIT 10\", \"params\": []}'
```

Or use a here-string:

```powershell
$body = @{
    sql = "SELECT * FROM users LIMIT 10"
    params = @()
} | ConvertTo-Json

curl -X POST http://localhost:3001/api/query `
  -H "Content-Type: application/json" `
  -H "X-API-Key: YOUR_API_KEY" `
  -d $body
```

---

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Example error response:

```bash
curl -X POST http://localhost:3001/api/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: INVALID_KEY" \
  -d '{"sql": "SELECT * FROM users", "params": []}'
```

Response:
```json
{
  "success": false,
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

---

## Notes

1. **All query endpoints require authentication** via the `X-API-Key` header
2. **WHERE clauses are required** for UPDATE and DELETE operations (safety measure)
3. **Use parameterized queries** - Never concatenate user input into SQL strings
4. **Batch size limits**: 
   - Batch: Maximum 50 queries (configurable)
   - Transaction: Maximum 20 queries (configurable)
   - Insert: Maximum 1000 rows (configurable)
5. **Timeouts**: Default is 30000ms (30 seconds), can be customized per request
6. **RETURNING clause**: Use `returning` parameter to get modified data back from INSERT/UPDATE/DELETE operations
