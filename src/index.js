import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import {
  apiKeyAuth,
  rateLimit,
  ipAccessControl,
  requestSizeLimit,
  checkIPBlock,
} from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { closePool, testConnection } from "./config/database.js";
import { initRedis, closeRedis } from "./config/redis.js";

import healthRoutes from "./routes/health.js";
import queryRoutes from "./routes/query.js";

// Initialize Redis for rate limiting (optional, falls back to memory)
initRedis();

// Test database connection on startup
testConnection().catch((error) => {
  console.error(
    JSON.stringify({
      severity: "CRITICAL",
      message: "Failed to connect to database on startup",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  );
  // Don't exit - let the server start and handle errors gracefully
});

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for GCP Load Balancer / Cloud Run
app.set("trust proxy", true);

// Parse allowed origins from environment
const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [];

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like health checks from load balancers)
      if (!origin) return callback(null, true);

      // Allow all origins if wildcard is set
      if (allowedOrigins.includes("*")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(
          JSON.stringify({
            severity: "WARNING",
            message: "CORS blocked request",
            origin,
            timestamp: new Date().toISOString(),
          })
        );
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    maxAge: 86400, // Cache preflight for 24 hours
  })
);

// Body parsing with size limits
const maxRequestSize = process.env.MAX_REQUEST_SIZE || "1mb";
app.use(express.json({ limit: maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: maxRequestSize }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const log = {
      severity: res.statusCode >= 400 ? "WARNING" : "INFO",
      message: "Request completed",
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        status: res.statusCode,
        latency: `${duration}ms`,
        remoteIp: req.clientIP || req.ip,
        userAgent: req.headers["user-agent"],
      },
      timestamp: new Date().toISOString(),
    };

    // Always log errors, log successful requests based on verbosity setting
    if (res.statusCode >= 400 || process.env.LOG_ALL_REQUESTS === "true") {
      console.log(JSON.stringify(log));
    }
  });

  next();
});

// Public routes (no auth required)
// Health checks must be accessible for GCP load balancer / Cloud Run
app.use("/health", healthRoutes);

// Apply security middleware to API routes
app.use("/api", ipAccessControl);
app.use("/api", checkIPBlock); // Check Redis-based IP blocks
app.use("/api", requestSizeLimit);
app.use("/api", rateLimit);
app.use("/api", apiKeyAuth);

// API routes
app.use("/api/query", queryRoutes);

// Root endpoint (public info)
app.get("/", (req, res) => {
  res.json({
    name: "AML Node Backend",
    version: "1.0.0",
    status: "running",
    health: "/health",
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown handler
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(
    JSON.stringify({
      severity: "INFO",
      message: `${signal} received, starting graceful shutdown`,
      timestamp: new Date().toISOString(),
    })
  );

  // Stop accepting new connections
  server.close(async () => {
    console.log(
      JSON.stringify({
        severity: "INFO",
        message: "HTTP server closed",
        timestamp: new Date().toISOString(),
      })
    );

    // Close Redis connection
    await closeRedis();
    console.log(
      JSON.stringify({
        severity: "INFO",
        message: "Redis connection closed",
        timestamp: new Date().toISOString(),
      })
    );

    // Close database connections
    await closePool();
    console.log(
      JSON.stringify({
        severity: "INFO",
        message: "Database connections closed",
        timestamp: new Date().toISOString(),
      })
    );

    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    console.error(
      JSON.stringify({
        severity: "ERROR",
        message: "Forced shutdown after timeout",
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error(
    JSON.stringify({
      severity: "CRITICAL",
      message: "Uncaught exception",
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    })
  );
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    JSON.stringify({
      severity: "ERROR",
      message: "Unhandled promise rejection",
      reason: reason?.message || reason,
      timestamp: new Date().toISOString(),
    })
  );
});

// Start server
const server = app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      severity: "INFO",
      message: "Server started",
      port: PORT,
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    })
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    AML Node Backend                        ║
╠════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT.toString().padEnd(33)}║
║  Environment: ${(process.env.NODE_ENV || "development").padEnd(42)}║
║  Health check: http://localhost:${PORT}/health              ║
╚════════════════════════════════════════════════════════════╝
    `);
  }
});

export default app;
