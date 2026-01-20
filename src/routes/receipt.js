import { Router } from 'express';
import { generateReceiptPDF } from '../services/pdfGenerator.js';
import { generateScreeningReportPDF } from '../services/screeningReportGenerator.js';
import { generateSTRPDF } from '../services/strGenerator.js';

const router = Router();

/**
 * POST /api/generate-receipt-pdf
 * Generate a single-page receipt PDF from structured data
 * Body: {
 *   customerName?: string,
 *   amount?: number,
 *   currency?: string,
 *   date?: string,
 *   location?: string,
 *   category?: string,
 *   paymentMethod?: string,
 *   taxAmount?: number,
 *   description?: string,
 *   notes?: string,
 *   receiptImageUrl?: string,
 *   uploader?: { name?: string, email?: string }
 * }
 */
router.post('/generate-receipt-pdf', async (req, res, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Receipt PDF generation request received',
        requestId,
        timestamp: new Date().toISOString(),
      })
    );

    const receiptData = req.body;

    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Request body received',
        requestId,
        hasData: !!receiptData,
        dataType: typeof receiptData,
        bodyKeys: receiptData ? Object.keys(receiptData) : [],
        bodyContent: receiptData,
        timestamp: new Date().toISOString(),
      })
    );

    // Validate that we have at least some data
    if (!receiptData || typeof receiptData !== 'object') {
      console.warn(
        JSON.stringify({
          severity: 'WARNING',
          message: 'Invalid request body',
          requestId,
          timestamp: new Date().toISOString(),
        })
      );
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_BODY',
      });
    }

    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Starting PDF generation',
        requestId,
        timestamp: new Date().toISOString(),
      })
    );

    // Log the actual data being passed to PDF generator
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Data being passed to PDF generator',
        requestId,
        receiptData: receiptData,
        receiptDataKeys: Object.keys(receiptData || {}),
        timestamp: new Date().toISOString(),
      })
    );

    // Generate PDF
    const pdfBuffer = await generateReceiptPDF(receiptData);

    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'PDF generation completed',
        requestId,
        pdfSize: pdfBuffer?.length || 0,
        timestamp: new Date().toISOString(),
      })
    );

    // Check if PDF was generated
    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error(
        JSON.stringify({
          severity: 'ERROR',
          message: 'Generated PDF is empty',
          requestId,
          timestamp: new Date().toISOString(),
        })
      );
      throw new Error('Generated PDF is empty');
    }

    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Setting response headers',
        requestId,
        contentLength: pdfBuffer.length,
        timestamp: new Date().toISOString(),
      })
    );

    // Check if client disconnected
    if (req.aborted || res.headersSent) {
      console.warn(
        JSON.stringify({
          severity: 'WARNING',
          message: 'Client disconnected before sending response',
          requestId,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="receipt.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Sending PDF response',
        requestId,
        timestamp: new Date().toISOString(),
      })
    );

    // Handle client disconnect
    req.on('close', () => {
      if (!res.headersSent) {
        console.warn(
          JSON.stringify({
            severity: 'WARNING',
            message: 'Client disconnected during PDF send',
            requestId,
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    // Handle response errors
    res.on('error', (err) => {
      console.error(
        JSON.stringify({
          severity: 'ERROR',
          message: 'Error sending PDF response',
          requestId,
          error: err.message,
          timestamp: new Date().toISOString(),
        })
      );
    });

    // Ensure we're sending binary data, not JSON
    // Check if response was already sent
    if (res.headersSent) {
      console.warn(
        JSON.stringify({
          severity: 'WARNING',
          message: 'Response headers already sent',
          requestId,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Send the buffer - use send() which handles binary data properly
    res.status(200).send(pdfBuffer);
    
    // Log after response is sent
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(
        JSON.stringify({
          severity: 'INFO',
          message: 'Receipt PDF response sent and connection closed',
          requestId,
          duration: `${duration}ms`,
          pdfSize: pdfBuffer.length,
          headersSent: res.headersSent,
          timestamp: new Date().toISOString(),
        })
      );
    });
    
    const duration = Date.now() - startTime;
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Receipt PDF generation completed successfully',
        requestId,
        duration: `${duration}ms`,
        pdfSize: pdfBuffer.length,
        contentType: res.getHeader('Content-Type'),
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: 'Receipt PDF generation failed',
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      })
    );

    // Pass error to error handler middleware
    error.code = error.code || 'PDF_GENERATION_ERROR';
    next(error);
  }
});

/**
 * POST /api/generate-screening-report-pdf
 * Generate screening report PDF from structured data
 * Body: {
 *   name?: string,
 *   riskScore?: number | string,
 *   status?: string,
 *   country?: string,
 *   sector?: string,
 *   reason?: string,
 *   totalMatches?: number,
 *   executionTime?: number,
 *   transactionCount?: number,
 *   suspiciousCount?: number,
 *   matches?: Array<{ name?: string, score?: number | string, listSource?: string, dob?: unknown, nationality?: unknown, description?: string }>,
 *   transactions?: Array<{ date?: string, type?: string, amount?: number | string, currency?: string, to?: string, from?: string }>,
 *   suspiciousTransactions?: Array<{ transaction: { date?: string, type?: string, amount?: number | string, currency?: string, to?: string, from?: string }, reason: string, riskPoints: number }>
 * }
 */
router.post('/generate-screening-report-pdf', async (req, res, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Screening report PDF generation request received',
        requestId,
        timestamp: new Date().toISOString(),
      })
    );

    const reportData = req.body;

    if (!reportData || typeof reportData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_BODY',
      });
    }

    const pdfBuffer = await generateScreeningReportPDF(reportData);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF is empty');
    }

    if (req.aborted || res.headersSent) {
      return;
    }

    const filenameSafe = (reportData.name || 'unknown').replace(/\s+/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="screening-report-${filenameSafe}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    res.status(200).send(pdfBuffer);

    const duration = Date.now() - startTime;
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Screening report PDF generation completed',
        requestId,
        duration: `${duration}ms`,
        pdfSize: pdfBuffer.length,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: 'Screening report PDF generation failed',
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      })
    );

    error.code = error.code || 'PDF_GENERATION_ERROR';
    next(error);
  }
});

/**
 * POST /api/generate-str-pdf
 * Generate STR (Suspicious Transaction Report) PDF from structured data
 * Body: {
 *   profile?: { name?: string, id?: string, country?: string, sector?: string, riskScore?: number | string, reason?: string },
 *   transactions?: Array<{ date?: string, type?: string, amount?: number | string, currency?: string, to?: string, from?: string }>,
 *   status?: string,
 *   notes?: string[]
 * }
 */
router.post('/generate-str-pdf', async (req, res, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'STR PDF generation request received',
        requestId,
        timestamp: new Date().toISOString(),
      })
    );

    const strData = req.body;

    if (!strData || typeof strData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_BODY',
      });
    }

    const pdfBuffer = await generateSTRPDF(strData);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF is empty');
    }

    if (req.aborted || res.headersSent) {
      return;
    }

    const filenameSafe = ((strData.profile?.name || 'report').replace(/\s+/g, '_'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameSafe}_STR.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    res.status(200).send(pdfBuffer);

    const duration = Date.now() - startTime;
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'STR PDF generation completed',
        requestId,
        duration: `${duration}ms`,
        pdfSize: pdfBuffer.length,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: 'STR PDF generation failed',
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      })
    );

    error.code = error.code || 'PDF_GENERATION_ERROR';
    next(error);
  }
});

export default router;
