#!/usr/bin/env node

console.log("[boot] server.ts starting");

import "../config/env";
import app from "./app";
import * as http from "http";
import * as dotenv from "dotenv";
import { OrphanSweeper } from "../workers";
import { HeartbeatSweeper } from "../workers/HeartbeatSweeper";
import logger from "../config/logger";

// Load environment variables
dotenv.config();

// Initialize orphan sweeper for stuck job detection
const orphanSweeper = new OrphanSweeper({
  sweepIntervalMs: parseInt(
    process.env.ORPHAN_SWEEP_INTERVAL_MS || "60000",
    10,
  ),
  jobTimeoutMs: parseInt(process.env.ORPHAN_JOB_TIMEOUT_MS || "1800000", 10),
});

// Initialize heartbeat sweeper for stale job detection
const heartbeatSweeper = new HeartbeatSweeper({
  sweepIntervalMs: parseInt(
    process.env.HEARTBEAT_SWEEP_INTERVAL_MS || "60000",
    10,
  ),
  gracePeriodMs: parseInt(
    process.env.HEARTBEAT_GRACE_PERIOD_MS || "300000",
    10,
  ),
});

// Normalize a port into a number, string, or false
function normalizePort(val: string): number | string | false {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
}

// Event listener for HTTP server "error" event
function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      logger.error("Server requires elevated privileges", { bind });
      process.exit(1);
      break;
    case "EADDRINUSE":
      logger.error("Server address already in use", { bind });
      process.exit(1);
      break;
    default:
      throw error;
  }
}

// Event listener for HTTP server "listening" event
function onListening(): void {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr?.port;

  logger.info("Server starting up");
  logger.info("Environment", { env: process.env.NODE_ENV || "development" });
  logger.info("Listening", { bind });

  // Narrow the type for AddressInfo (port property)
  const port = addr && typeof addr === "object" ? addr.port : 8888;
  logger.debug("Endpoints", {
    healthCheck: `http://localhost:${port}/health`,
    apiDocs: `http://localhost:${port}/api/docs`,
  });

  // Log configuration status
  logger.debug("Configuration status", {
    database: (process.env.DATABASE_URL || process.env.DB_HOST) ? "✓" : "✗ (using defaults)",
    redis: process.env.REDIS_HOST ? "✓" : "✗ (using defaults)",
    awsS3: process.env.AWS_ACCESS_KEY_ID ? "✓" : "✗ (not configured)",
    githubToken: process.env.GITHUB_TOKEN ? "✓" : "✗ (not configured)",
  });

  logger.info("Server ready to receive bug reports");
  logger.info("Starting orphan sweeper for stuck job detection");
  logger.info("Starting heartbeat sweeper for stale job detection");

  // Start orphan sweeper after server is listening
  orphanSweeper.start();
  heartbeatSweeper.start();
}

// Get port from environment and store in Express
const port = normalizePort(process.env.PORT || "8888");
app.set("port", port);

// Create HTTP server
const server = http.createServer(app);

// Listen on provided port, on all network interfaces
server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  orphanSweeper.stop();
  heartbeatSweeper.stop();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  orphanSweeper.stop();
  heartbeatSweeper.stop();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

export default server;
