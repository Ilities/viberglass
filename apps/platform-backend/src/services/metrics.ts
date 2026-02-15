import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";
import type { Request, Response, NextFunction } from "express";
import logger from "../config/logger";

// Extended request type with user info
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenant_id: string;
  };
}

/**
 * Simple application metrics service for CloudWatch
 *
 * Emits custom metrics that CloudWatch alarms can monitor.
 * Falls back gracefully if CloudWatch is not available (self-hosted without AWS).
 */

const NAMESPACE = "Viberglass/Application";
const ENABLED = process.env.CLOUDWATCH_METRICS_ENABLED === "true";

let cloudWatchClient: CloudWatchClient | null = null;

if (ENABLED) {
  try {
    cloudWatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  } catch (error) {
    logger.warn(
      "CloudWatch client initialization failed, metrics will be logged only",
      {
        error,
      },
    );
  }
}

/**
 * Metric dimensions for filtering and grouping
 */
interface MetricDimensions {
  [key: string]: string;
}

/**
 * Emit a metric to CloudWatch (or log if CloudWatch is not available)
 */
async function emitMetric(
  metricName: string,
  value: number,
  unit: string = "Count",
  dimensions: MetricDimensions = {},
): Promise<void> {
  const timestamp = new Date();

  // Always log metrics locally
  logger.debug("Metric emitted", {
    namespace: NAMESPACE,
    metricName,
    value,
    unit,
    dimensions,
    timestamp: timestamp.toISOString(),
  });

  // Send to CloudWatch if enabled
  if (ENABLED && cloudWatchClient) {
    try {
      const dimensionArray = Object.entries(dimensions).map(
        ([name, value]) => ({
          Name: name,
          Value: value,
        }),
      );

      const command = new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit as StandardUnit,
            Timestamp: timestamp,
            Dimensions: dimensionArray.length > 0 ? dimensionArray : undefined,
          },
        ],
      });

      await cloudWatchClient.send(command);
    } catch (error) {
      logger.error("Failed to send metric to CloudWatch", {
        metricName,
        error,
      });
    }
  }
}

/**
 * Application metrics functions
 */
export const metrics = {
  /**
   * Track Viberator execution started
   */
  viberatorStarted: async (ticketId: string, projectId: string) => {
    await emitMetric("ViberatorStarted", 1, "Count", {
      TicketId: ticketId,
      ProjectId: projectId,
    });
  },

  /**
   * Track Viberator execution succeeded
   */
  viberatorSucceeded: async (
    ticketId: string,
    projectId: string,
    durationMs: number,
  ) => {
    await Promise.all([
      emitMetric("ViberatorSuccess", 1, "Count", {
        TicketId: ticketId,
        ProjectId: projectId,
      }),
      emitMetric("ViberatorDuration", durationMs, "Milliseconds", {
        Status: "success",
      }),
    ]);
  },

  /**
   * Track Viberator execution failed
   */
  viberatorFailed: async (
    ticketId: string,
    projectId: string,
    errorType: string,
    durationMs: number,
  ) => {
    await Promise.all([
      emitMetric("ViberatorFailures", 1, "Count", {
        TicketId: ticketId,
        ProjectId: projectId,
        ErrorType: errorType,
      }),
      emitMetric("ViberatorDuration", durationMs, "Milliseconds", {
        Status: "failed",
      }),
    ]);
  },

  /**
   * Track API request
   */
  apiRequest: async (
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
  ) => {
    await emitMetric("APIRequest", 1, "Count", {
      Endpoint: endpoint,
      Method: method,
      StatusCode: statusCode.toString(),
      Duration: duration.toString(),
    });
  },

  /**
   * Track API error (4xx/5xx responses)
   */
  apiError: async (endpoint: string, statusCode: number, duration: number) => {
    const errorType = statusCode >= 500 ? "ServerError" : "ClientError";
    await emitMetric("APIError", 1, "Count", {
      Endpoint: endpoint,
      StatusCode: statusCode.toString(),
      ErrorType: errorType,
      Duration: duration.toString(),
    });
  },

  /**
   * Track webhook received
   */
  webhookReceived: async (source: string, eventType: string) => {
    await emitMetric("WebhookReceived", 1, "Count", {
      Source: source,
      EventType: eventType,
    });
  },

  /**
   * Track database query duration
   */
  databaseQueryDuration: async (operation: string, durationMs: number) => {
    await emitMetric("DatabaseQueryDuration", durationMs, "Milliseconds", {
      Operation: operation,
    });
  },

  /**
   * Track file upload
   */
  fileUploaded: async (sizeBytes: number, fileType: string) => {
    await Promise.all([
      emitMetric("FileUpload", 1, "Count", {
        FileType: fileType,
      }),
      emitMetric("FileUploadSize", sizeBytes, "Bytes", {
        FileType: fileType,
      }),
    ]);
  },

  /**
   * Track job queue depth
   */
  jobQueueDepth: async (queueName: string, depth: number) => {
    await emitMetric("JobQueueDepth", depth, "Count", {
      QueueName: queueName,
    });
  },

  /**
   * Track active users (daily active users metric)
   */
  activeUser: async (userId: string, tenantId: string) => {
    await emitMetric("ActiveUsers", 1, "Count", {
      UserId: userId,
      TenantId: tenantId,
    });
  },
};

/**
 * Middleware to automatically track API metrics
 */
export function metricsMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - start;
    const routePath = (req.route as { path?: string } | undefined)?.path;
    const endpoint = routePath || req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Track all API requests
    await metrics.apiRequest(endpoint, method, statusCode, duration);

    // Track errors separately
    if (statusCode >= 400) {
      await metrics.apiError(endpoint, statusCode, duration);
    }

    // Track active users (if authenticated)
    if (req.user?.id && req.user?.tenant_id) {
      await metrics.activeUser(req.user.id, req.user.tenant_id);
    }
  });

  next();
}
