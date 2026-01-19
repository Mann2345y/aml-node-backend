# ═══════════════════════════════════════════════════════════════════
# Production Dockerfile for GCP Cloud Run
# Uses Playwright's official Docker image with browsers pre-installed
# ═══════════════════════════════════════════════════════════════════

# Use Playwright's official image - includes Node.js, browsers, and all dependencies
# Using latest stable version that matches playwright ^1.57.0
FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Note: Browsers are already pre-installed in the Playwright image
# No need to install or copy browsers - they're already available

# Copy application code
COPY . .

# Remove unnecessary files
RUN rm -rf Dockerfile .dockerignore .git .gitignore env.example README.md

# Note: Playwright image runs as root by default
# For Cloud Run, this is acceptable, but you can switch to a non-root user if needed
# The Playwright image already has proper permissions set up

# Expose port (Cloud Run uses PORT env var)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/health/live || exit 1

# Start application
CMD ["node", "src/index.js"]
