# ═══════════════════════════════════════════════════════════════════
# Production Dockerfile for GCP Cloud Run
# ═══════════════════════════════════════════════════════════════════

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Install Playwright Chromium
RUN npx playwright install chromium

# ───────────────────────────────────────────────────────────────────
# Production image
# ───────────────────────────────────────────────────────────────────
FROM node:20-alpine

# Install system dependencies for Playwright Chromium
RUN apk add --no-cache \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    wqy-zhenhei \
    && rm -rf /var/cache/apk/*

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy Playwright browsers (installed as root in builder, accessible to all)
COPY --from=builder --chown=nodejs:nodejs /root/.cache/ms-playwright /home/nodejs/.cache/ms-playwright

# Set Playwright browsers path
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nodejs/.cache/ms-playwright

# Copy application code
COPY --chown=nodejs:nodejs . .

# Remove unnecessary files
RUN rm -rf Dockerfile .dockerignore .git .gitignore env.example README.md

# Switch to non-root user
USER nodejs

# Expose port (Cloud Run uses PORT env var)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/health/live || exit 1

# Start application
CMD ["node", "src/index.js"]
