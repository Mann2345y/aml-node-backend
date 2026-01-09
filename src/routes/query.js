import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { 
  validateQuery, 
  sanitizeTableName, 
  sanitizeColumnNames,
  queryValidationMiddleware 
} from '../middleware/queryValidator.js';

const router = Router();

// Apply query validation to all routes
router.use(queryValidationMiddleware);

/**
 * POST /api/query
 * Execute a single SQL query
 * Body: { sql: string, params?: any[], timeout?: number }
 */
router.post('/', async (req, res, next) => {
  try {
    const { sql, params = [], timeout } = req.body;
    
    const result = await query(sql, params, timeout);

    res.json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
      fields: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/query/batch
 * Execute multiple queries in sequence (not transactional)
 * Body: { queries: Array<{ sql: string, params?: any[] }>, timeout?: number }
 */
router.post('/batch', async (req, res, next) => {
  try {
    const { queries, timeout } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Queries array is required',
        code: 'MISSING_QUERIES',
      });
    }

    // Limit batch size
    const maxBatchSize = parseInt(process.env.MAX_BATCH_SIZE, 10) || 50;
    if (queries.length > maxBatchSize) {
      return res.status(400).json({
        success: false,
        error: `Batch size exceeds maximum of ${maxBatchSize}`,
        code: 'BATCH_TOO_LARGE',
      });
    }

    const results = [];
    for (const q of queries) {
      const result = await query(q.sql, q.params || [], timeout);
      results.push({
        data: result.rows,
        rowCount: result.rowCount,
      });
    }

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/query/transaction
 * Execute multiple queries within a transaction
 * Body: { queries: Array<{ sql: string, params?: any[] }>, timeout?: number }
 */
router.post('/transaction', async (req, res, next) => {
  try {
    const { queries, timeout } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Queries array is required',
        code: 'MISSING_QUERIES',
      });
    }

    // Limit transaction size
    const maxTxSize = parseInt(process.env.MAX_TRANSACTION_SIZE, 10) || 20;
    if (queries.length > maxTxSize) {
      return res.status(400).json({
        success: false,
        error: `Transaction size exceeds maximum of ${maxTxSize}`,
        code: 'TRANSACTION_TOO_LARGE',
      });
    }

    const results = await transaction(async (client) => {
      const txResults = [];
      for (const q of queries) {
        const result = await client.query(q.sql, q.params || []);
        txResults.push({
          data: result.rows,
          rowCount: result.rowCount,
        });
      }
      return txResults;
    }, timeout || 30000);

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/query/insert
 * Helper for INSERT operations with RETURNING
 * Body: { table: string, data: object | object[], returning?: string[] }
 */
router.post('/insert', async (req, res, next) => {
  try {
    const { table, data, returning = ['*'] } = req.body;

    // Validate table name
    const tableValidation = sanitizeTableName(table);
    if (!tableValidation.valid) {
      return res.status(400).json({
        success: false,
        error: tableValidation.error,
        code: 'INVALID_TABLE',
      });
    }

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Data is required',
        code: 'MISSING_DATA',
      });
    }

    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Data array cannot be empty',
        code: 'EMPTY_DATA',
      });
    }

    // Limit batch insert size
    const maxInsertRows = parseInt(process.env.MAX_INSERT_ROWS, 10) || 1000;
    if (rows.length > maxInsertRows) {
      return res.status(400).json({
        success: false,
        error: `Insert batch size exceeds maximum of ${maxInsertRows}`,
        code: 'INSERT_TOO_LARGE',
      });
    }

    const columns = Object.keys(rows[0]);
    
    // Validate column names
    const columnValidation = sanitizeColumnNames(columns);
    if (!columnValidation.valid) {
      return res.status(400).json({
        success: false,
        error: columnValidation.error,
        code: 'INVALID_COLUMN',
      });
    }

    // Validate returning columns
    const returningValidation = sanitizeColumnNames(returning);
    if (!returningValidation.valid) {
      return res.status(400).json({
        success: false,
        error: returningValidation.error,
        code: 'INVALID_RETURNING',
      });
    }

    const values = [];
    const placeholders = [];

    rows.forEach((row, rowIndex) => {
      const rowPlaceholders = [];
      columns.forEach((col, colIndex) => {
        values.push(row[col]);
        rowPlaceholders.push(`$${rowIndex * columns.length + colIndex + 1}`);
      });
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    const sql = `
      INSERT INTO "${tableValidation.sanitized}" (${columnValidation.sanitized.join(', ')})
      VALUES ${placeholders.join(', ')}
      RETURNING ${returningValidation.sanitized.join(', ')}
    `;

    const result = await query(sql, values);

    res.json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/query/update
 * Helper for UPDATE operations
 * Body: { table: string, data: object, where: object, returning?: string[] }
 */
router.post('/update', async (req, res, next) => {
  try {
    const { table, data, where, returning = ['*'] } = req.body;

    // Validate table name
    const tableValidation = sanitizeTableName(table);
    if (!tableValidation.valid) {
      return res.status(400).json({
        success: false,
        error: tableValidation.error,
        code: 'INVALID_TABLE',
      });
    }

    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Data is required',
        code: 'MISSING_DATA',
      });
    }

    if (!where || Object.keys(where).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'WHERE clause is required (safety measure)',
        code: 'MISSING_WHERE',
      });
    }

    // Validate column names
    const dataColumns = Object.keys(data);
    const whereColumns = Object.keys(where);
    
    const dataColValidation = sanitizeColumnNames(dataColumns);
    if (!dataColValidation.valid) {
      return res.status(400).json({
        success: false,
        error: dataColValidation.error,
        code: 'INVALID_COLUMN',
      });
    }

    const whereColValidation = sanitizeColumnNames(whereColumns);
    if (!whereColValidation.valid) {
      return res.status(400).json({
        success: false,
        error: whereColValidation.error,
        code: 'INVALID_WHERE_COLUMN',
      });
    }

    const returningValidation = sanitizeColumnNames(returning);
    if (!returningValidation.valid) {
      return res.status(400).json({
        success: false,
        error: returningValidation.error,
        code: 'INVALID_RETURNING',
      });
    }

    const setClauses = [];
    const whereClauses = [];
    const values = [];
    let paramIndex = 1;

    // Build SET clause
    for (let i = 0; i < dataColumns.length; i++) {
      setClauses.push(`${dataColValidation.sanitized[i]} = $${paramIndex}`);
      values.push(data[dataColumns[i]]);
      paramIndex++;
    }

    // Build WHERE clause
    for (let i = 0; i < whereColumns.length; i++) {
      whereClauses.push(`${whereColValidation.sanitized[i]} = $${paramIndex}`);
      values.push(where[whereColumns[i]]);
      paramIndex++;
    }

    const sql = `
      UPDATE "${tableValidation.sanitized}"
      SET ${setClauses.join(', ')}
      WHERE ${whereClauses.join(' AND ')}
      RETURNING ${returningValidation.sanitized.join(', ')}
    `;

    const result = await query(sql, values);

    res.json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/query/delete
 * Helper for DELETE operations
 * Body: { table: string, where: object, returning?: string[] }
 */
router.post('/delete', async (req, res, next) => {
  try {
    const { table, where, returning = ['*'] } = req.body;

    // Validate table name
    const tableValidation = sanitizeTableName(table);
    if (!tableValidation.valid) {
      return res.status(400).json({
        success: false,
        error: tableValidation.error,
        code: 'INVALID_TABLE',
      });
    }

    if (!where || Object.keys(where).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'WHERE clause is required (safety measure)',
        code: 'MISSING_WHERE',
      });
    }

    // Validate column names
    const whereColumns = Object.keys(where);
    const whereColValidation = sanitizeColumnNames(whereColumns);
    if (!whereColValidation.valid) {
      return res.status(400).json({
        success: false,
        error: whereColValidation.error,
        code: 'INVALID_WHERE_COLUMN',
      });
    }

    const returningValidation = sanitizeColumnNames(returning);
    if (!returningValidation.valid) {
      return res.status(400).json({
        success: false,
        error: returningValidation.error,
        code: 'INVALID_RETURNING',
      });
    }

    const whereClauses = [];
    const values = [];

    for (let i = 0; i < whereColumns.length; i++) {
      whereClauses.push(`${whereColValidation.sanitized[i]} = $${i + 1}`);
      values.push(where[whereColumns[i]]);
    }

    const sql = `
      DELETE FROM "${tableValidation.sanitized}"
      WHERE ${whereClauses.join(' AND ')}
      RETURNING ${returningValidation.sanitized.join(', ')}
    `;

    const result = await query(sql, values);

    res.json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
