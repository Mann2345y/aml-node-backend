import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate screening report PDF from structured data
 * @param {Object} reportData - Screening report data object
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateScreeningReportPDF(reportData) {
  const {
    name,
    id,
    riskScore,
    status,
    country,
    sector,
    reason,
    totalMatches,
    executionTime,
    transactionCount,
    suspiciousCount,
    matches = [],
    transactions = [],
    suspiciousTransactions = [],
    listsScreened = [],
    queryLists = [],
    analystComments,
    auditTrail,
  } = reportData;

  // Professional financial report colors - minimal and clean
  const COLORS = {
    text: '#1a1a1a',
    textMuted: '#6b7280',
    border: '#e5e7eb',
    background: '#ffffff',
    accent: '#2563eb',
    accentLight: '#eff6ff',
  };

  // Format score
  const formatScore = (score) => {
    if (score === undefined || score === null) return 'N/A';
    const num = typeof score === 'string' ? parseFloat(score) : score;
    if (isNaN(num)) return 'N/A';
    if (num > 1) return `${Math.round(num)}%`;
    return `${Math.round(num * 100)}%`;
  };

  // Format value
  const formatValue = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.map((v) => formatValue(v)).join(', ');
      }
      const entries = Object.entries(value);
      if (entries.length > 0) {
        return entries
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([, v]) => formatValue(v))
          .join(', ');
      }
      return 'N/A';
    }
    return String(value);
  };

  // Get risk color - subtle for professional look
  const getRiskColor = (riskStatus) => {
    switch (riskStatus) {
      case 'High':
        return COLORS.text; // Use text color instead of red
      case 'Medium':
        return COLORS.text;
      case 'Low':
        return COLORS.text;
      default:
        return COLORS.textMuted;
    }
  };

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

  const scoreNum = typeof riskScore === 'string' ? parseFloat(riskScore) : riskScore || 0;

  // Generate HTML
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Screening Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: ${COLORS.text};
      background: ${COLORS.background};
      padding: 0;
      margin: 0;
      font-size: 13px;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
      padding: 20px 40px 60px 40px;
      box-sizing: border-box;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid ${COLORS.border};
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
      font-size: 18px;
      font-weight: 600;
      color: ${COLORS.text};
      margin-bottom: 4px;
    }
    
    .generation-time {
      font-size: 12px;
      color: ${COLORS.textMuted};
    }
    
    .risk-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #991b1b;
    }
    
    .risk-indicator-icon {
      font-size: 14px;
    }
    
    .risk-score-inline {
      font-size: 12px;
      color: ${COLORS.textMuted};
      font-weight: 500;
      margin-left: 8px;
    }
    

    
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: ${COLORS.text};
      margin-bottom: 16px;
      margin-top:16px;
      padding-bottom: 8px;
      border-bottom: 1px solid ${COLORS.border};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .subject-card {
      border: 1px solid ${COLORS.border};
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
      background: #f9fafb;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
      orphans: 3;
      widows: 3;
    }
    
    .subject-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid ${COLORS.border};
    }
    
    .subject-header-left {
      flex: 1;
    }
    
    .subject-name {
      font-size: 20px;
      font-weight: 700;
      color: ${COLORS.text};
      margin-bottom: 8px;
      line-height: 1.3;
    }
    
    .subject-header-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .subject-details {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .subject-detail-item {
      display: flex;
      align-items: flex-start;
      font-size: 13px;
      line-height: 1.6;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    
    .subject-detail-label {
      color: ${COLORS.textMuted};
      font-weight: 500;
      min-width: 120px;
      flex-shrink: 0;
    }
    
    .subject-detail-value {
      color: ${COLORS.text};
      font-weight: 500;
      flex: 1;
    }
    
    .warning-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-left: 4px solid #dc2626;
      padding: 10px 14px;
      margin-top: 12px;
      border-radius: 4px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    
    .warning-icon {
      color: #dc2626;
      font-size: 18px;
      flex-shrink: 0;
    }
    
    .warning-text {
      font-size: 13px;
      color: #991b1b;
      line-height: 1.5;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px 40px;
    }
    
    .info-item {
      margin-bottom: 20px;
    }
    
    .info-label {
      font-size: 14px;
      color: ${COLORS.textMuted};
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .info-value {
      font-size: 14px;
      font-weight: 500;
      color: ${COLORS.text};
    }
    
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: ${COLORS.accentLight};
      color: ${COLORS.accent};
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
    }
    
    .score-large {
      font-size: 16px;
      font-weight: 600;
      color: ${COLORS.text};
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 20px;
    }
    
    .stat-item {
      text-align: left;
      padding-bottom: 20px;
      border-bottom: 1px solid ${COLORS.border};
    }
    
    .stat-label {
      font-size: 14px;
      color: ${COLORS.textMuted};
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .stat-value {
      font-size: 14px;
      font-weight: 500;
      color: ${COLORS.text};
    }
    
    .match-card {
      border: 1px solid ${COLORS.border};
      border-radius: 6px;
      padding: 0;
      margin-bottom: 14px;
      overflow: hidden;
      background: ${COLORS.background};
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
      orphans: 2;
      widows: 2;
    }
    
    .match-header-bar {
      background: ${COLORS.accent};
      color: ${COLORS.background};
      padding: 8px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .match-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .match-number {
      font-size: 13px;
      font-weight: 600;
      color: ${COLORS.background};
    }
    
    .match-name {
      font-size: 14px;
      font-weight: 600;
      color: ${COLORS.background};
    }
    
    .match-score-badge {
      background: ${COLORS.background};
      color: ${COLORS.accent};
      padding: 3px 10px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .match-content {
      padding: 12px 14px;
    }
    
    .match-entity-info {
      font-size: 13px;
      color: ${COLORS.text};
      margin-bottom: 10px;
      line-height: 1.5;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    
    .match-status-row {
      display: flex;
      gap: 20px;
      margin-bottom: 12px;
      flex-wrap: wrap;
      align-items: baseline;
    }
    
    .match-status-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: ${COLORS.text};
      line-height: 1.4;
    }
    
    .match-status-checkbox {
      width: 14px;
      height: 14px;
      border: 1.5px solid ${COLORS.border};
      border-radius: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: ${COLORS.background};
      flex-shrink: 0;
    }
    
    .match-status-checkbox.checked {
      background: ${COLORS.accent};
      border-color: ${COLORS.accent};
      color: ${COLORS.background};
    }
    
    .match-status-checkbox.checked::after {
      content: '✓';
      font-size: 10px;
      font-weight: 700;
    }
    
    .match-lists-table {
      margin-top: 12px;
      border-top: 1px solid ${COLORS.border};
      padding-top: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    
    .match-lists-label {
      font-size: 11px;
      color: ${COLORS.textMuted};
      font-weight: 600;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .match-lists-text {
      font-size: 12px;
      color: ${COLORS.text};
      line-height: 1.5;
    }
    
    .match-aliases {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid ${COLORS.border};
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    
    .match-aliases-label {
      font-size: 11px;
      color: ${COLORS.textMuted};
      font-weight: 600;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .match-aliases-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 12px;
    }
    
    .match-aliases-item {
      display: inline-block;
      padding: 4px 8px;
      background: #f3f4f6;
      border: 1px solid ${COLORS.border};
      border-radius: 4px;
      color: ${COLORS.text};
      font-size: 11px;
      line-height: 1.3;
    }
    
    .match-aliases-overflow {
      display: inline-block;
      padding: 4px 8px;
      background: #f9fafb;
      border: 1px dashed ${COLORS.border};
      border-radius: 4px;
      color: ${COLORS.textMuted};
      font-size: 11px;
      font-style: italic;
    }
    
    .sidebar-section {
      border: 1px solid ${COLORS.border};
      border-radius: 6px;
      padding: 14px;
      margin-bottom: 14px;
      background: #f9fafb;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
      orphans: 2;
      widows: 2;
    }
    
    .sidebar-title {
      font-size: 14px;
      font-weight: 700;
      color: ${COLORS.text};
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .transaction-item {
      padding: 10px 0;
      border-bottom: 1px solid ${COLORS.border};
      font-size: 12px;
      color: ${COLORS.text};
      display: flex;
      justify-content: space-between;
      align-items: center;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    
    .transaction-item:last-child {
      border-bottom: none;
    }
    
    .transaction-date {
      color: ${COLORS.textMuted};
    }
    
    .transaction-amount {
      font-weight: 600;
      color: ${COLORS.text};
    }
    
    .match-summary-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid ${COLORS.border};
      font-size: 12px;
    }
    
    .match-summary-item:last-child {
      border-bottom: none;
    }
    
    .match-summary-name {
      color: ${COLORS.text};
    }
    
    .match-summary-count {
      color: ${COLORS.text};
      font-weight: 600;
    }
    
    .match-summary-check {
      color: #059669;
      margin-left: 8px;
    }
    
    .analyst-comments {
      font-size: 13px;
      color: ${COLORS.text};
      line-height: 1.6;
      padding: 12px;
      background: #f9fafb;
      border-radius: 4px;
    }
    
    .audit-trail-item {
      font-size: 12px;
      color: ${COLORS.text};
      padding: 6px 0;
      border-bottom: 1px solid ${COLORS.border};
    }
    
    .audit-trail-item:last-child {
      border-bottom: none;
    }
    
    .audit-trail-check {
      color: #059669;
      margin-left: 8px;
    }
    
    .no-matches {
      padding: 20px;
      text-align: center;
      color: ${COLORS.textMuted};
      font-size: 14px;
      border: 1px solid ${COLORS.border};
    }
    
    .lists-screened {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid ${COLORS.border};
    }
    
    .lists-screened-label {
      font-size: 12px;
      color: ${COLORS.textMuted};
      font-weight: 500;
      margin-bottom: 12px;
    }
    
    .lists-screened-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }
    
    .lists-screened-item {
      font-size: 11px;
      color: ${COLORS.text};
      padding: 6px 10px;
      background: ${COLORS.accentLight};
      border-radius: 3px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .lists-screened-status {
      font-size: 10px;
      color: ${COLORS.textMuted};
      font-weight: 500;
    }
    
    .lists-screened-count {
      font-size: 10px;
      color: ${COLORS.text};
      font-weight: 600;
      margin-left: 8px;
    }
    
    .suspicious-transaction {
      border: 1px solid ${COLORS.border};
      padding: 20px;
      margin-bottom: 20px;
      border-bottom: 1px solid ${COLORS.border};
    }
    
    .st-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    
    .st-amount {
      font-size: 14px;
      font-weight: 600;
      color: ${COLORS.text};
    }
    
    .st-risk {
      font-size: 13px;
      color: ${COLORS.textMuted};
    }
    
    .st-details {
      font-size: 13px;
      color: ${COLORS.textMuted};
      margin-bottom: 8px;
    }
    
    .st-reason {
      font-size: 13px;
      color: ${COLORS.textMuted};
      max-width: 65%;
      word-wrap: break-word;
      line-height: 1.5;
    }
    
    .transaction-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    
    .table-header {
      background: ${COLORS.background};
      padding: 12px 8px;
      text-align: left;
      font-size: 14px;
      font-weight: 600;
      color: ${COLORS.text};
      border-bottom: 2px solid ${COLORS.border};
    }
    
    .table-row {
      border-bottom: 1px solid ${COLORS.border};
    }
    
    .table-cell {
      padding: 12px 8px;
      font-size: 13px;
      color: ${COLORS.text};
    }
    
    .table-cell-bold {
      font-weight: 500;
    }
    
    .footer {
      margin-top: auto;
      padding-top: 20px;
      padding-bottom: 16px;
      border-top: 1px solid ${COLORS.border};
      text-align: center;
      font-size: 13px;
      color: ${COLORS.textMuted};
    }
    
    /* Allow flexible page breaks while keeping content readable */
    .section {
      orphans: 2;
      widows: 2;
    }
    
    /* ============================================
       PAGINATION UTILITY CLASSES
       ============================================ */
    
    /* Prevent element from breaking across pages */
    .no-break {
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    
    /* Force page break before element */
    .page-break-before {
      page-break-before: always;
      break-before: page;
    }
    
    /* Force page break after element */
    .page-break-after {
      page-break-after: always;
      break-after: page;
    }
    
    /* Prevent breaking inside, but allow breaking before if needed */
    .keep-together {
      page-break-inside: avoid;
      break-inside: avoid;
      orphans: 3;
      widows: 3;
    }
    
    /* Prevent breaking table rows */
    .no-break-row {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    /* ============================================
       ELEMENT-SPECIFIC PAGINATION RULES
       ============================================ */
    
    /* Note: Subject card, match card, and sidebar-section pagination rules
       are defined in their respective class definitions above */
    
    /* Prevent breaking inside atomic elements */
    .match-header-bar,
    .subject-header,
    .warning-box,
    .section-title {
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    
    /* Note: Transaction items, match status rows, detail items, aliases,
       lists matched, and match entity info pagination rules are defined
       in their respective class definitions above */
    
    /* Section container - allow breaking but keep children together */
    .section {
      orphans: 2;
      widows: 2;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      ${logoBase64 ? `<img src="${logoBase64}" alt="AML KW Logo" class="logo-img" />` : ''}
      <div class="header-right">
        <div class="title">Screening Report</div>
        <div class="generation-time">Generated: ${generationTimestamp}</div>
      </div>
    </div>

    <!-- Subject Information Card -->
    <div class="subject-card">
      <div class="subject-header">
        <div class="subject-header-left">
          <div class="subject-name">${escapeHtml(name || 'N/A')}</div>
          <div class="subject-header-meta">
            ${status ? `
            <span class="risk-indicator">
              <span class="risk-indicator-icon">⚠</span>
              <span>${escapeHtml(status.toUpperCase())} RISK</span>
            </span>
            ` : ''}
            ${riskScore !== undefined ? `
            <span class="risk-score-inline">Risk Score: ${Math.round(scoreNum)}</span>
            ` : ''}
          </div>
        </div>
      </div>
      <div class="subject-details">
        ${id ? `
        <div class="subject-detail-item">
          <span class="subject-detail-label">ID:</span>
          <span class="subject-detail-value">${escapeHtml(id)}</span>
        </div>
        ` : ''}
        ${matches.length > 0 && matches[0].entity_type ? `
        <div class="subject-detail-item">
          <span class="subject-detail-label">Type:</span>
          <span class="subject-detail-value">${escapeHtml(matches[0].entity_type)}</span>
        </div>
        ` : ''}
        ${matches.length > 0 && matches[0].date_of_birth ? `
        <div class="subject-detail-item">
          <span class="subject-detail-label">Date of Birth:</span>
          <span class="subject-detail-value">${escapeHtml(formatValue(matches[0].date_of_birth))}</span>
        </div>
        ` : ''}
        ${country ? `
        <div class="subject-detail-item">
          <span class="subject-detail-label">Country:</span>
          <span class="subject-detail-value">${escapeHtml(country)}</span>
        </div>
        ` : ''}
      </div>
      ${totalMatches > 0 ? `
      <div class="warning-box">
        <div class="warning-icon">⚠</div>
        <div class="warning-text">Multiple matches found in PEP, Sanctions, and Watchlists. Further investigation is recommended.</div>
      </div>
      ` : ''}
    </div>


    <!-- AML Screening Results -->
    <div>
      <div class="section-title">Screening Results</div>
      ${matches.length > 0 ? matches.map((match, index) => {
        const hasAliases = match.aliases && Array.isArray(match.aliases) && match.aliases.length > 0;
        const hasSanctions = match.sanctions && Array.isArray(match.sanctions) && match.sanctions.length > 0;
        const entityId = match.entity_id || '';
        const entityType = match.entity_type || '';
        const dob = match.date_of_birth ? formatValue(match.date_of_birth) : '';
        
        return `
        <div class="match-card">
          <div class="match-header-bar">
            <div class="match-header-left">
              <span class="match-number">${index + 1}.</span>
              <span class="match-name">${escapeHtml(match.name || 'Unknown')}</span>
            </div>
            <div class="match-score-badge">Risk Score ${formatScore(match.score)}</div>
          </div>
          
          <div class="match-content">
            <div class="match-entity-info">
              <strong>Entity ID:</strong> ${escapeHtml(entityId)} ${dob ? `| <strong>Born:</strong> ${escapeHtml(dob)}` : ''}
            </div>
            
            <div class="match-status-row">
              <div class="match-status-item">
                <span class="match-status-checkbox ${entityType ? 'checked' : ''}"></span>
                <span>Person</span>
              </div>
              <div class="match-status-item">
                <span class="match-status-checkbox ${match.is_pep ? 'checked' : ''}"></span>
                <span>Politically Exposed</span>
              </div>
              <div class="match-status-item">
                <span class="match-status-checkbox ${match.is_sanctioned ? 'checked' : ''}"></span>
                <span>Sanctions</span>
              </div>
            </div>
            
            ${hasAliases ? `
            <div class="match-aliases">
              <div class="match-aliases-label">Aliases</div>
              <div class="match-aliases-list">
                ${match.aliases.slice(0, 5).map(alias => `<span class="match-aliases-item">${escapeHtml(alias)}</span>`).join('')}
                ${match.aliases.length > 5 ? `<span class="match-aliases-overflow">+${match.aliases.length - 5} more</span>` : ''}
                ${match.aliases.slice(5).map(alias => `<span class="match-aliases-item" style="display: none;">${escapeHtml(alias)}</span>`).join('')}
              </div>
            </div>
            ` : ''}
            
            ${hasSanctions ? `
            <div class="match-lists-table">
              <div class="match-lists-label">Lists Matched</div>
              <div class="match-lists-text">${match.sanctions.map(sanction => escapeHtml(sanction)).join(', ')}</div>
            </div>
            ` : ''}
          </div>
        </div>
      `;
      }).join('') : `
        <div class="no-matches">No matches found in sanctions databases</div>
      `}
    </div>

    <!-- Sidebar Sections -->
    ${transactions.length > 0 ? `
    <div style="margin-top: 16px;">
      <div class="sidebar-section">
        <div class="sidebar-title">Recent Transactions</div>
        ${transactions.slice(0, 4).map((tx) => `
          <div class="transaction-item">
            <span class="transaction-date">${tx.date ? new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
            <span class="transaction-amount">${tx.currency || ''} ${Number(tx.amount || 0).toLocaleString()}</span>
          </div>
        `).join('')}
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid ${COLORS.border}; font-size: 12px; color: ${COLORS.textMuted};">
          Total: ${transactions.length}
        </div>
      </div>
    </div>
    ` : ''}
    
    <!-- Analyst Comments -->
    ${analystComments ? `
    <div class="sidebar-section">
      <div class="sidebar-title">Analyst Comments</div>
      <div class="analyst-comments">${escapeHtml(analystComments)}</div>
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
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Launching Chromium browser for screening report',
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
        top: '30px',
        right: '40px',
        bottom: '80px',
        left: '40px',
      },
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="width: 100%; text-align: center; font-size: 12px; color: #6b7280; padding: 10px 0;">Generated By : AML KW</div>',
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
