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
      padding: 40px 50px;
    }
    
    .container {
      max-width: 700px;
      margin: 0 auto;
      min-height: calc(100vh - 80px);
      display: flex;
      flex-direction: column;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .logo-img {
      max-width: 180px;
      max-height: 60px;
      object-fit: contain;
    }
    
    .receipt-title {
      font-size: 15px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    
    .generation-time {
      font-size: 13px;
      color: #6b7280;
    }
    
    .separator {
      height: 1px;
      background: #e5e7eb;
      margin-bottom: 24px;
    }
    
    .row {
      display: flex;
      justify-content: space-between;
      padding-bottom: 20px;
      margin-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .row:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }
    
    .label {
      font-size: 14px;
      color: #6b7280;
      font-weight: 500;
    }
    
    .value {
      font-size: 14px;
      color: #1a1a1a;
      font-weight: 500;
      text-align: right;
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
    
    .footer {
      margin-top: auto;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      ${logoBase64 ? `
      <img src="${logoBase64}" alt="AML KW Logo" class="logo-img" />
      ` : ''}
      <div>
        <div class="receipt-title">Receipt</div>
        <div class="generation-time">Generated: ${generationTimestamp}</div>
      </div>
    </div>
    
    <!-- Separator -->
    <div class="separator"></div>
    
    <!-- Receipt Info -->
    ${customerName ? `
    <div class="row">
      <span class="label">Customer Name</span>
      <span class="value">${escapeHtml(String(customerName))}</span>
    </div>
    ` : ''}
    
    ${amount != null ? `
    <div class="row">
      <span class="label">Amount</span>
      <span class="value amount">${formatAmount(Number(amount), currency)}</span>
    </div>
    ` : ''}
    
    ${date ? `
    <div class="row">
      <span class="label">Date</span>
      <span class="value">${formatDate(String(date))}</span>
    </div>
    ` : ''}
    
    ${location ? `
    <div class="row">
      <span class="label">Location</span>
      <span class="value">${escapeHtml(String(location))}</span>
    </div>
    ` : ''}
    
    ${category ? `
    <div class="row">
      <span class="label">Category</span>
      <span class="value"><span class="badge">${escapeHtml(String(category))}</span></span>
    </div>
    ` : ''}
    
    ${paymentMethod ? `
    <div class="row">
      <span class="label">Payment Method</span>
      <span class="value"><span class="badge">${escapeHtml(String(paymentMethod))}</span></span>
    </div>
    ` : ''}
    
    ${description ? `
    <div class="row">
      <span class="label">Description</span>
      <span class="value">${escapeHtml(description)}</span>
    </div>
    ` : ''}
    
    ${taxAmount != null ? `
    <div class="row">
      <span class="label">Tax Amount</span>
      <span class="value">${formatAmount(taxAmount, currency)}</span>
    </div>
    ` : ''}
    
    ${notes ? `
    <div class="row">
      <span class="label">Notes</span>
      <span class="value">${escapeHtml(notes)}</span>
    </div>
    ` : ''}
    
    ${receiptImageUrl ? `
    <div class="row">
      <span class="label">Receipt Image</span>
      <span class="value"><a href="${escapeHtml(receiptImageUrl)}" style="color: #2563eb; text-decoration: underline;">View</a></span>
    </div>
    ` : ''}
    
    ${uploader.name ? `
    <div class="row">
      <span class="label">Uploader Name</span>
      <span class="value">${escapeHtml(uploader.name)}</span>
    </div>
    ` : ''}
    
    ${uploader.email ? `
    <div class="row">
      <span class="label">Uploader Email</span>
      <span class="value">${escapeHtml(uploader.email)}</span>
    </div>
    ` : ''}
    
    ${!customerName && amount == null && !date && !location && !category && !paymentMethod && !description && taxAmount == null && !notes && !receiptImageUrl && !uploader.name && !uploader.email ? `
    <div class="row">
      <span class="label" style="color: #999; font-style: italic;">No receipt details provided</span>
    </div>
    ` : ''}
    
    <!-- Footer -->
    <div class="footer">
      Generated by AML KW
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
      printBackground: false,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
      preferCSSPageSize: true,
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
