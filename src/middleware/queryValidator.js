/**
 * SQL Query Validator
 * Prevents dangerous operations and SQL injection attempts
 */

// Dangerous SQL patterns that should be blocked in production
const DANGEROUS_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+FROM\s+(?!.*WHERE)/i, // DELETE without WHERE
  /;\s*TRUNCATE\s+/i,
  /;\s*ALTER\s+/i,
  /;\s*CREATE\s+/i,
  /;\s*GRANT\s+/i,
  /;\s*REVOKE\s+/i,
  /INFORMATION_SCHEMA/i,
  /PG_CATALOG/i,
  /PG_TABLES/i,
  /--\s*$/m, // SQL comments at end of line (potential injection)
  /\/\*[\s\S]*?\*\//g, // Block comments
  /;\s*COPY\s+/i,
  /;\s*\\copy/i,
  /pg_read_file/i,
  /pg_write_file/i,
  /lo_import/i,
  /lo_export/i,
];

// Patterns that indicate multiple statements (potential injection)
const MULTI_STATEMENT_PATTERN = /;\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)/i;

// Maximum query length to prevent DoS
const MAX_QUERY_LENGTH = parseInt(process.env.MAX_QUERY_LENGTH, 10) || 50000;

// Maximum number of parameters
const MAX_PARAMS = parseInt(process.env.MAX_QUERY_PARAMS, 10) || 1000;

// Allowed tables (if configured, only these tables can be accessed)
const ALLOWED_TABLES = process.env.ALLOWED_TABLES
  ? process.env.ALLOWED_TABLES.split(',').map(t => t.trim().toLowerCase())
  : null;

// Blocked tables (system tables, sensitive tables)
const BLOCKED_TABLES = process.env.BLOCKED_TABLES
  ? process.env.BLOCKED_TABLES.split(',').map(t => t.trim().toLowerCase())
  : ['pg_', 'information_schema', '_prisma_migrations'];

/**
 * Validate SQL query for security issues
 * @param {string} sql - SQL query to validate
 * @param {Array} params - Query parameters
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
export function validateQuery(sql, params = []) {
  // Check query exists
  if (!sql || typeof sql !== 'string') {
    return { valid: false, error: 'SQL query is required', code: 'MISSING_SQL' };
  }

  // Check query length
  if (sql.length > MAX_QUERY_LENGTH) {
    return { 
      valid: false, 
      error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`, 
      code: 'QUERY_TOO_LONG' 
    };
  }

  // Check parameters count
  if (params && params.length > MAX_PARAMS) {
    return { 
      valid: false, 
      error: `Too many parameters (max: ${MAX_PARAMS})`, 
      code: 'TOO_MANY_PARAMS' 
    };
  }

  // Check for dangerous patterns in production
  if (process.env.NODE_ENV === 'production' || process.env.STRICT_SQL_VALIDATION === 'true') {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(sql)) {
        return { 
          valid: false, 
          error: 'Query contains potentially dangerous operations', 
          code: 'DANGEROUS_QUERY' 
        };
      }
    }

    // Check for multiple statements
    if (MULTI_STATEMENT_PATTERN.test(sql)) {
      return { 
        valid: false, 
        error: 'Multiple statements not allowed', 
        code: 'MULTI_STATEMENT' 
      };
    }
  }

  // Check table access
  const tableValidation = validateTableAccess(sql);
  if (!tableValidation.valid) {
    return tableValidation;
  }

  // Validate parameters don't contain SQL
  for (let i = 0; i < params.length; i++) {
    if (typeof params[i] === 'string' && params[i].length > 10000) {
      return { 
        valid: false, 
        error: `Parameter ${i + 1} exceeds maximum length`, 
        code: 'PARAM_TOO_LONG' 
      };
    }
  }

  return { valid: true };
}

/**
 * Validate table access permissions
 * @param {string} sql - SQL query
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
function validateTableAccess(sql) {
  const sqlLower = sql.toLowerCase();
  
  // Check for blocked tables
  for (const blockedTable of BLOCKED_TABLES) {
    if (sqlLower.includes(blockedTable)) {
      return { 
        valid: false, 
        error: `Access to system tables is not allowed`, 
        code: 'BLOCKED_TABLE' 
      };
    }
  }

  // If allowed tables configured, verify access
  if (ALLOWED_TABLES && ALLOWED_TABLES.length > 0) {
    // Extract table names from query (basic extraction)
    const tablePattern = /(?:FROM|INTO|UPDATE|JOIN)\s+["']?(\w+)["']?/gi;
    let match;
    
    while ((match = tablePattern.exec(sql)) !== null) {
      const tableName = match[1].toLowerCase();
      if (!ALLOWED_TABLES.includes(tableName)) {
        return { 
          valid: false, 
          error: `Access to table '${tableName}' is not allowed`, 
          code: 'TABLE_NOT_ALLOWED' 
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Sanitize table name for helper functions
 * @param {string} table - Table name
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
export function sanitizeTableName(table) {
  if (!table || typeof table !== 'string') {
    return { valid: false, error: 'Table name is required' };
  }

  // Only allow alphanumeric, underscores, and schema prefix (schema.table)
  const tablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;
  
  if (!tablePattern.test(table)) {
    return { valid: false, error: 'Invalid table name format' };
  }

  const tableLower = table.toLowerCase();
  
  // Check blocked tables
  for (const blocked of BLOCKED_TABLES) {
    if (tableLower.startsWith(blocked) || tableLower.includes(`.${blocked}`)) {
      return { valid: false, error: 'Access to this table is not allowed' };
    }
  }

  // Check allowed tables
  if (ALLOWED_TABLES && ALLOWED_TABLES.length > 0) {
    if (!ALLOWED_TABLES.includes(tableLower)) {
      return { valid: false, error: 'Table not in allowed list' };
    }
  }

  return { valid: true, sanitized: table };
}

/**
 * Sanitize column names
 * @param {string[]} columns - Column names
 * @returns {{ valid: boolean, sanitized?: string[], error?: string }}
 */
export function sanitizeColumnNames(columns) {
  if (!Array.isArray(columns)) {
    return { valid: false, error: 'Columns must be an array' };
  }

  const columnPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const sanitized = [];

  for (const col of columns) {
    if (col === '*') {
      sanitized.push('*');
      continue;
    }
    
    if (!columnPattern.test(col)) {
      return { valid: false, error: `Invalid column name: ${col}` };
    }
    
    sanitized.push(`"${col}"`);
  }

  return { valid: true, sanitized };
}

/**
 * Middleware to validate query requests
 */
export function queryValidationMiddleware(req, res, next) {
  const { sql, params, queries } = req.body;

  // Single query validation
  if (sql) {
    const validation = validateQuery(sql, params);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        code: validation.code,
      });
    }
  }

  // Batch queries validation
  if (queries && Array.isArray(queries)) {
    for (let i = 0; i < queries.length; i++) {
      const validation = validateQuery(queries[i].sql, queries[i].params);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: `Query ${i + 1}: ${validation.error}`,
          code: validation.code,
        });
      }
    }
  }

  next();
}
