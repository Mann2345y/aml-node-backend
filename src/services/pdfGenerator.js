import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate receipt PDF from structured data
 * @param {Object} receiptData - Receipt data object
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateReceiptPDF(receiptData) {
  // Log received data for debugging
  console.log(
    JSON.stringify({
      severity: 'INFO',
      message: 'PDF generator received data',
      data: receiptData,
      timestamp: new Date().toISOString(),
    })
  );

  const {
    customerName,
    amount,
    currency = 'KWD',
    date,
    location,
    category,
    paymentMethod,
    taxAmount,
    description,
    notes,
    receiptImageUrl,
    uploader = {},
    receiptId,
    caseReference,
    riskContext,
    riskClassification,
    riskScore,
    triggerReason,
    sourceSystem,
    documentId,
    referenceId,
    uploadTimestamp,
  } = receiptData;

  // Log extracted values
  console.log(
    JSON.stringify({
      severity: 'INFO',
      message: 'PDF generator extracted values',
      extracted: {
        customerName: !!customerName,
        amount: amount != null,
        currency,
        date: !!date,
        location: !!location,
        category: !!category,
        paymentMethod: !!paymentMethod,
        taxAmount: taxAmount != null,
        description: !!description,
        notes: !!notes,
        receiptImageUrl: !!receiptImageUrl,
        uploader: Object.keys(uploader).length > 0,
      },
      timestamp: new Date().toISOString(),
    })
  );

  // Format amount with currency
  const formatAmount = (amt, curr) => {
    if (amt == null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amt);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const generationTimestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Load and convert logo to base64
  let logoBase64 = '';
  try {
    const logoPath = join(__dirname, '../assets/AML KW Logo.png');
    const logoBuffer = await readFile(logoPath);
    const logoMimeType = 'image/png';
    logoBase64 = `data:${logoMimeType};base64,${logoBuffer.toString('base64')}`;
  } catch (error) {
    console.warn(
      JSON.stringify({
        severity: 'WARNING',
        message: 'Failed to load logo image, using placeholder',
        error: error.message,
        timestamp: new Date().toISOString(),
      })
    );
  }

  // Generate HTML template
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      background: #ffffff;
      padding: 0;
      margin: 0;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
      padding: 40px 50px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    
    .content-wrapper {
      flex: 1;
      padding-bottom: 40px;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .logo-img {
      max-width: 180px;
      max-height: 60px;
      object-fit: contain;
    }
    
    .header-right {
      text-align: right;
    }
    
    .document-title {
      font-size: 15px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .document-id {
      font-size: 13px;
      color: #6b7280;
    }
    
    .section {
      margin-bottom: 20px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 20px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .transaction-table {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .transaction-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .transaction-row:last-child {
      border-bottom: none;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 30px;
    }
    
    .info-item {
      margin-bottom: 16px;
    }
    
    .label {
      font-size: 14px;
      color: #6b7280;
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .value {
      font-size: 14px;
      color: #1a1a1a;
      font-weight: 500;
    }
    
    .amount {
      font-weight: 600;
      color: #2563eb;
    }
    
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: #eff6ff;
      color: #1e40af;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .compliance-box {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px;
      background: #ffffff;
    }
    
    .risk-score-display {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin-top: 4px;
    }
    
    .trigger-reasons {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }
    
    .trigger-reason-item {
      font-size: 13px;
      color: #1a1a1a;
      margin-bottom: 6px;
      padding-left: 16px;
      position: relative;
    }
    
    .trigger-reason-item::before {
      content: '•';
      position: absolute;
      left: 0;
      color: #6b7280;
    }
    
    .text-content {
      font-size: 14px;
      color: #1a1a1a;
      line-height: 1.6;
      max-width: 100%;
      word-wrap: break-word;
    }
    
    .footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      padding: 20px 50px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      line-height: 1.6;
      background: #ffffff;
      box-sizing: border-box;
    }
    
    body {
      position: relative;
      padding-bottom: 80px;
    }
    
    .section {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    .transaction-table {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .generation-time {
      font-size: 12px
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="content-wrapper">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        ${logoBase64 ? `<img src="${logoBase64}" alt="AML KW Logo" class="logo-img" />` : ''}
      </div>
      <div class="header-right">
        <div class="document-title">Receipt Record</div>
        ${documentId ? `<div class="document-id">${escapeHtml(documentId)}</div>` : ''}
        <div class="generation-time">Generated on: ${generationTimestamp}</div>
      </div>
    </div>
    
    <!-- Transaction Details -->
    <div class="transaction-table">
      <div class="section-title">Transaction Details</div>
      ${customerName ? `
      <div class="transaction-row">
        <span class="label">Customer Name</span>
        <span class="value">${escapeHtml(String(customerName))}</span>
      </div>
      ` : ''}
      ${amount != null ? `
      <div class="transaction-row">
        <span class="label">Transaction Amount</span>
        <span class="value amount">${formatAmount(Number(amount), currency)}</span>
      </div>
      ` : ''}
      ${date ? `
      <div class="transaction-row">
        <span class="label">Location</span>
        <span class="value">${formatDate(String(date))}</span>
      </div>
      ` : ''}
      ${location ? `
      <div class="transaction-row">
        <span class="label">Category</span>
        <span class="value">${escapeHtml(String(location))}</span>
      </div>
      ` : ''}
      ${category ? `
      <div class="transaction-row">
        <span class="label">Category</span>
        <span class="value"><span class="badge">${escapeHtml(String(category))}</span></span>
      </div>
      ` : ''}
      ${paymentMethod ? `
      <div class="transaction-row">
        <span class="label">Payment Method</span>
        <span class="value"><span class="badge">${escapeHtml(String(paymentMethod))}</span></span>
      </div>
      ` : ''}
      ${taxAmount != null ? `
      <div class="transaction-row">
        <span class="label">Tax Amount</span>
        <span class="value">${formatAmount(taxAmount, currency)}</span>
      </div>
      ` : ''}
      ${caseReference ? `
      <div class="transaction-row">
        <span class="label">Case Reference</span>
        <span class="value">${escapeHtml(caseReference)}</span>
      </div>
      ` : ''}
      ${sourceSystem ? `
      <div class="transaction-row">
        <span class="label">Source System</span>
        <span class="value">${escapeHtml(sourceSystem)}</span>
      </div>
      ` : ''}
      ${riskContext ? `
      <div class="transaction-row">
        <span class="label">Risk Context</span>
        <span class="value">${escapeHtml(riskContext)}</span>
      </div>
      ` : ''}
      ${receiptImageUrl ? `
      <div class="transaction-row">
        <span class="label">Receipt Image URL</span>
        <span class="value"><a href="${escapeHtml(receiptImageUrl)}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(receiptImageUrl)}</a></span>
      </div>
      ` : ''}
    </div>
    
    <!-- Compliance Context -->
    ${riskClassification || riskScore !== undefined ? `
    <div class="section">
      <div class="section-title">Compliance Context</div>
      <div class="compliance-box">
        ${riskClassification ? `
        <div class="info-item">
          <div class="label">Risk Classification</div>
          <div class="value"><span class="badge">${escapeHtml(String(riskClassification).toUpperCase())}</span></div>
        </div>
        ` : ''}
        ${riskScore !== undefined ? `
        <div class="info-item">
          <div class="label">Risk Score</div>
          <div class="risk-score-display">${typeof riskScore === 'number' ? riskScore : parseFloat(riskScore) || 0} / 100</div>
        </div>
        ` : ''}
        ${triggerReason ? `
        <div class="trigger-reasons">
          <div class="label">Trigger Reason:</div>
          ${Array.isArray(triggerReason) ? triggerReason.map(reason => `
            <div class="trigger-reason-item">${escapeHtml(String(reason))}</div>
          `).join('') : `
            <div class="trigger-reason-item">${escapeHtml(String(triggerReason))}</div>
          `}
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}
    
    <!-- Description and Notes -->
    ${(description || notes) ? `
    <div class="section">
      <div class="section-title">Description and Notes</div>
      ${description ? `
      <div class="text-content" style="margin-bottom: ${notes ? '16px' : '0'};">
        <strong>Description:</strong><br>
        ${escapeHtml(description)}
      </div>
      ` : ''}
      ${notes ? `
      <div class="text-content">
        <strong>Internal Notes:</strong><br>
        ${escapeHtml(notes)}
      </div>
      ` : ''}
    </div>
    ` : ''}
    
    <!-- Attached Documents -->
    ${referenceId ? `
    <div class="section">
      <div class="section-title">Attached Documents</div>
      <div class="info-grid">
        ${referenceId ? `
        <div class="info-item">
          <div class="label">Reference ID</div>
          <div class="value">${escapeHtml(referenceId)}</div>
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}
    
    <!-- Source Information -->
    ${uploader.name || uploader.email || uploadTimestamp ? `
    <div class="section">
      <div class="section-title">Source Information</div>
      <div class="info-grid">
        ${uploader.name ? `
        <div class="info-item">
          <div class="label">Uploader By</div>
          <div class="value">${escapeHtml(uploader.name)}</div>
        </div>
        ` : ''}
        ${uploader.email ? `
        <div class="info-item">
          <div class="label">Uploader Email</div>
          <div class="value">${escapeHtml(uploader.email)}</div>
        </div>
        ` : ''}
        ${uploadTimestamp ? `
        <div class="info-item">
          <div class="label">Upload Timestamp</div>
          <div class="value">${escapeHtml(String(uploadTimestamp))}</div>
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}
    </div>
  </div>
</body>
</html>
  `;

  // Launch browser and generate PDF
  let page = null;
  let browser = null;
  
  try {
    // With Playwright's official Docker image, browsers are pre-installed
    // Playwright will automatically find them - no need to set executablePath
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Launching Chromium browser (using Playwright official image)',
        timestamp: new Date().toISOString(),
      })
    );

    // Launch a new browser instance for each request (more reliable)
    // Playwright will use the pre-installed browser from the official image
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pings',
        '--no-zygote',
        '--single-process', // Use single process mode for better stability
      ],
      timeout: 30000,
    };

    browser = await chromium.launch(launchOptions);

    page = await browser.newPage({
      timeout: 30000,
    });

    // Set a reasonable timeout for content loading
    await page.setContent(html, {
      waitUntil: 'networkidle', // Wait for fonts to load
      timeout: 30000,
    });

    // Wait for fonts to be fully loaded
    await page.waitForTimeout(1000);
    
    // Ensure fonts are loaded by checking font-family
    await page.evaluate(() => {
      return document.fonts.ready;
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '40px',
        right: '50px',
        bottom: '80px',
        left: '50px',
      },
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="width: 100%; text-align: center; font-size: 12px; color: #6b7280; padding: 10px 0;">Generated By : AML KW</div>',
      timeout: 30000,
    });

    // Close page immediately after PDF generation, before browser
    // This prevents context disposal errors
    try {
      await page.close();
      page = null; // Mark as closed
    } catch (e) {
      // Ignore - page might already be closing
    }

    return pdfBuffer;
  } catch (error) {
    // Re-throw with more context
    const errorMessage = error.message || 'Unknown error';
    throw new Error(`PDF generation failed: ${errorMessage}`);
  } finally {
    // Ensure cleanup happens in correct order
    // Close page first (if not already closed), then browser
    // Errors are expected if context is already disposed, so we catch and ignore them
    
    if (page) {
      try {
        await page.close().catch(() => {
          // Silently ignore - page context might already be disposed
        });
      } catch (e) {
        // Ignore all errors - context might already be disposed
      }
    }
    
    if (browser) {
      try {
        await browser.close().catch(() => {
          // Silently ignore - browser might already be closed
        });
      } catch (e) {
        // Ignore all errors
      }
    }
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (text == null) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}
