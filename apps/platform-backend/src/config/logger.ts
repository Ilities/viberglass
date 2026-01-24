/**
 * Winston Logger Configuration
 *
 * Provides structured logging with:
 * - Environment-based configuration (dev/prod/test)
 * - Automatic log rotation in production
 * - Sensitive data redaction
 * - Child logger support for contextual logging
 */

import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { sanitizeInPlace } from "../utils/logRedaction";

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Determine environment
const env = process.env.NODE_ENV || "development";
const isDevelopment = env === "development";
const isProduction = env === "production";
const isTest = env === "test";

// Log level based on environment
const logLevel = (
  process.env.LOG_LEVEL || (isProduction ? "info" : "debug")
).toLowerCase();

/**
 * Custom format for development - human-readable with colors
 */
const developmentFormat = printf(
  ({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]`;

    // Add service/component context if present
    if (metadata.service) msg += ` [${metadata.service}]`;
    if (metadata.component) msg += ` [${metadata.component}]`;
    if (metadata.worker) msg += ` [${metadata.worker}]`;
    if (metadata.invoker) msg += ` [${metadata.invoker}]`;

    msg += `: ${message}`;

    // Add remaining metadata if present
    const remainingMeta = { ...metadata };
    delete remainingMeta.service;
    delete remainingMeta.component;
    delete remainingMeta.worker;
    delete remainingMeta.invoker;

    if (Object.keys(remainingMeta).length > 0) {
      msg += ` ${JSON.stringify(remainingMeta)}`;
    }

    return msg;
  },
);

/**
 * Create transports based on environment
 */
function createTransports(): winston.transport[] {
  const transports: winston.transport[] = [];

  // Console transport (always present, but minimal in test)
  transports.push(
    new winston.transports.Console({
      format: isDevelopment ? combine(colorize(), developmentFormat) : json(),
      silent: isTest, // Suppress console output in tests
    }),
  );

  // File rotation in production
  if (isProduction) {
    // Error log - only errors
    transports.push(
      new DailyRotateFile({
        filename: "logs/error-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        level: "error",
        maxSize: "20m",
        maxFiles: "14d",
        format: json(),
      }),
    );

    // Combined log - all levels
    transports.push(
      new DailyRotateFile({
        filename: "logs/combined-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "20m",
        maxFiles: "14d",
        format: json(),
      }),
    );
  }

  return transports;
}

/**
 * Create a custom format for sanitizing sensitive data
 */
const sanitizeFormat = winston.format((info) => {
  sanitizeInPlace(info);
  return info;
})();

/**
 * Create the Winston logger instance
 */
const logger = winston.createLogger({
  level: logLevel,
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }), // Capture stack traces
    sanitizeFormat, // Redact sensitive data
  ),
  transports: createTransports(),
  // Don't exit on error
  exitOnError: false,
});

/**
 * Create a child logger with additional context
 *
 * @param context - Context metadata (e.g., { service: 'JobService' })
 * @returns Child logger instance with context
 *
 * @example
 * const jobLogger = createChildLogger({ service: 'JobService' });
 * jobLogger.info('Job created', { jobId: '123' });
 * // Output: [JobService] Job created { jobId: '123' }
 */
export function createChildLogger(
  context: Record<string, string>,
): winston.Logger {
  return logger.child(context);
}

// Export the default logger
export default logger;
