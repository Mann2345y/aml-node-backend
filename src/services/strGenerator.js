import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate STR (Suspicious Transaction Report) PDF from structured data
 * @param {Object} strData - STR data object
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateSTRPDF(strData) {
  const { profile = {}, transactions = [], status, notes = [] } = strData;

  // Load logo
  let logoBase64 = '';
  try {
    const logoPath = join(__dirname, '../assets/AML KW Logo.png');
    const logoBuffer = await readFile(logoPath);
    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch (error) {
    console.warn('Failed to load logo:', error.message);
  }

  const generationTimestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Generate HTML
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suspicious Transaction Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      background: #ffffff;
      padding: 0;
      margin: 0;
    }
    
    .container {
      max-width: 700px;
      margin: 0 auto;
      padding: 40px 50px 80px 50px;
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
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .logo-img {
      max-width: 180px;
      max-height: 60px;
      object-fit: contain;
    }
    
    .header-right {
      text-align: right;
    }
    
    .title {
      font-size: 15px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    
    .generation-time {
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
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding-bottom: 20px;
      margin-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .info-row:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }
    
    .info-label {
      font-size: 14px;
      color: #6b7280;
      font-weight: 500;
    }
    
    .info-value {
      font-size: 14px;
      color: #1a1a1a;
      font-weight: 500;
      text-align: right;
      max-width: 65%;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    
    .flags-box {
      border: 1px solid #e5e7eb;
      padding: 20px;
      margin-top: 10px;
      font-size: 14px;
      color: #1a1a1a;
      max-width: 65%;
      word-wrap: break-word;
      line-height: 1.5;
    }
    
    .transaction-item {
      padding: 20px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 13px;
      color: #1a1a1a;
    }
    
    .transaction-item:last-child {
      border-bottom: none;
    }
    
    .notes-list {
      list-style: decimal;
      margin-left: 20px;
      font-size: 14px;
      color: #1a1a1a;
    }
    
    .notes-list li {
      margin-bottom: 12px;
      max-width: 65%;
      word-wrap: break-word;
      line-height: 1.5;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      background: #eff6ff;
      color: #2563eb;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
    }
    
    .footer {
      margin-top: auto;
      padding-top: 24px;
      padding-bottom: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
      page-break-inside: avoid;
    }
    
    .section {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="content-wrapper">
    <!-- Header -->
    <div class="header">
      ${logoBase64 ? `<img src="${logoBase64}" alt="AML KW Logo" class="logo-img" />` : ''}
      <div class="header-right">
        <div class="title">Suspicious Transaction Report</div>
        <div class="generation-time">Generated: ${generationTimestamp}</div>
      </div>
    </div>

    <!-- Customer Information -->
    <div class="section">
      <div class="section-title">Customer Information</div>
      <div class="info-row">
        <span class="info-label">Customer</span>
        <span class="info-value">${escapeHtml(profile.name || '')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ID</span>
        <span class="info-value">${escapeHtml(profile.id || '')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Nationality</span>
        <span class="info-value">${escapeHtml(profile.country || '')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Sector</span>
        <span class="info-value">${escapeHtml(profile.sector || '')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Risk Score</span>
        <span class="info-value">${profile.riskScore ?? ''}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Case Status</span>
        <span class="info-value">
          ${status ? `<span class="status-badge">${escapeHtml(status)}</span>` : ''}
        </span>
      </div>
    </div>

    <!-- Flags -->
    <div class="section">
      <div class="section-title">Flags</div>
      ${profile.reason ? `
        <div class="flags-box">${escapeHtml(profile.reason)}</div>
      ` : `
        <div class="info-value" style="text-align: left;">None</div>
      `}
    </div>

    <!-- Recent Transactions -->
    ${transactions.length > 0 ? `
    <div class="section">
      <div class="section-title">Recent Transactions</div>
      ${transactions.map((t) => `
        <div class="transaction-item">
          ${new Date(t.date || Date.now()).toLocaleString()} | 
          ${escapeHtml(t.type || '')} | 
          ${escapeHtml(t.to || '')} | 
          ${t.amount || ''} ${t.currency || ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Compliance Officer Notes -->
    ${notes.length > 0 ? `
    <div class="section">
      <div class="section-title">Compliance Officer Notes</div>
      <ol class="notes-list">
        ${notes.map((note) => `
          <li>${escapeHtml(note)}</li>
        `).join('')}
      </ol>
    </div>
    ` : ''}

    </div>
    <!-- Footer -->
    <div class="footer">
      AML KW - Anti-Money Laundering Compliance Platform
    </div>
  </div>
</body>
</html>
  `;

  // Launch browser and generate PDF
  let page = null;
  let browser = null;

  try {
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Launching Chromium browser for STR',
        timestamp: new Date().toISOString(),
      })
    );

    browser = await chromium.launch({
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
        '--single-process',
      ],
      timeout: 30000,
    });

    page = await browser.newPage({
      timeout: 30000,
    });

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(500);

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '40px',
        right: '50px',
        bottom: '60px',
        left: '50px',
      },
      preferCSSPageSize: false,
      displayHeaderFooter: false,
      timeout: 30000,
    });

    try {
      await page.close();
      page = null;
    } catch (e) {
      // Ignore
    }

    return pdfBuffer;
  } catch (error) {
    const errorMessage = error.message || 'Unknown error';
    throw new Error(`PDF generation failed: ${errorMessage}`);
  } finally {
    if (page) {
      try {
        await page.close().catch(() => {});
      } catch (e) {
        // Ignore
      }
    }

    if (browser) {
      try {
        await browser.close().catch(() => {});
      } catch (e) {
        // Ignore
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
