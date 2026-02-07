import { Request, Response, NextFunction } from "express";
import { JobService } from "../../services/JobService";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ middleware: "callbackTokenValidation" });

/**
 * Callback token validation middleware (SEC-05)
 *
 * Validates that worker callbacks include a valid callback token
 * that matches the job's stored token. This prevents unauthorized
 * entities from spoofing job callbacks.
 *
 * The callback token is:
 * - Generated when a job is created (64-char hex string)
 * - Passed to the worker in the job payload
 * - Sent by the worker in the X-Callback-Token header
 * - Validated on every callback endpoint (result, progress, logs)
 */

declare global {
  namespace Express {
    interface Request {
      callbackTokenValidated?: boolean;
    }
  }
}

const jobService = new JobService();

/**
 * Middleware to validate callback token for worker callbacks
 *
 * Expects:
 * - jobId in req.params.jobId
 * - X-Callback-Token header with the token
 *
 * Returns 401 if token is missing, 403 if token is invalid
 */
export async function validateCallbackToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { jobId } = req.params;
  const callbackToken = req.get("X-Callback-Token");

  if (!jobId) {
    res.status(400).json({
      error: "Missing job ID",
      message: "Job ID is required in the request path",
    });
    return;
  }

  if (!callbackToken) {
    logger.warn("Callback request missing token", { jobId });
    res.status(401).json({
      error: "Missing callback token",
      message: "X-Callback-Token header is required for worker callbacks",
    });
    return;
  }

  try {
    const isValid = await jobService.validateCallbackToken(jobId, callbackToken);

    if (!isValid) {
      logger.warn("Invalid callback token", { jobId });
      res.status(403).json({
        error: "Invalid callback token",
        message: "The provided callback token does not match the job",
      });
      return;
    }

    req.callbackTokenValidated = true;
    next();
  } catch (error) {
    logger.error("Error validating callback token", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "Token validation failed",
      message: "An error occurred while validating the callback token",
    });
  }
}
