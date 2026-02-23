import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import type { MulterError } from "multer";
import { createChildLogger } from "../../config/logger";
import {
  ticketSchema,
  archiveTicketsSchema,
  projectSchema,
  updateTicketSchema,
  updateProjectSchema,
  projectScmConfigSchema,
  clankerSchema,
  updateClankerSchema,
  deploymentStrategySchema,
  updateDeploymentStrategySchema,
  resultCallbackSchema,
  runTicketSchema,
  progressUpdateSchema,
  codexAuthCacheSchema,
  logEntrySchema,
  logBatchSchema,
  secretSchema,
  updateSecretSchema,
  integrationConfigSchema,
  registerSchema,
  createUserSchema,
  updateUserRoleSchema,
  loginSchema,
  forgotPasswordSchema,
} from "./schemas";

const logger = createChildLogger({ middleware: "validation" });

interface ValidatorLoggingOptions {
  name: string;
  logSuccess?: boolean;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBodyKeys(body: unknown): string[] {
  return isObjectRecord(body) ? Object.keys(body) : [];
}

function getStringField(body: unknown, field: string): string | null {
  if (!isObjectRecord(body)) {
    return null;
  }

  const value = body[field];
  return typeof value === "string" ? value : null;
}

function getStringFieldLength(body: unknown, field: string): number | null {
  const value = getStringField(body, field);
  return value === null ? null : value.length;
}

/**
 * Factory function that creates validation middleware from a Joi schema.
 * Handles the standard validation flow: validate req.body, return 400 on error,
 * replace req.body with validated value on success.
 *
 * @param schema - Joi schema to validate against
 * @param options - Logging options for the validator
 * @returns Express middleware function
 */
function createValidator(
  schema: Joi.Schema,
  options?: ValidatorLoggingOptions,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      if (options) {
        logger.warn("Request payload validation failed", {
          validator: options.name,
          method: req.method,
          path: req.originalUrl || req.path,
          bodyKeys: getBodyKeys(req.body),
          authJsonLength: getStringFieldLength(req.body, "authJson"),
          details: error.details.map((detail) => ({
            field: detail.path.join("."),
            message: detail.message,
          })),
        });
      }

      return res.status(400).json({
        error: "Validation error",
        details: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        })),
      });
    }

    if (options?.logSuccess) {
      logger.info("Request payload validation succeeded", {
        validator: options.name,
        method: req.method,
        path: req.originalUrl || req.path,
        bodyKeys: getBodyKeys(value),
        secretName: getStringField(value, "secretName"),
        authJsonLength: getStringFieldLength(value, "authJson"),
      });
    }

    req.body = value;
    next();
  };
}

// Schema validators - each created via factory
export const validateCreateTicket = createValidator(ticketSchema);
export const validateUpdateTicket = createValidator(updateTicketSchema);
export const validateArchiveTickets = createValidator(archiveTicketsSchema);
export const validateCreateProject = createValidator(projectSchema);
export const validateUpdateProject = createValidator(updateProjectSchema);
export const validateProjectScmConfig = createValidator(projectScmConfigSchema);
export const validateCreateClanker = createValidator(clankerSchema);
export const validateUpdateClanker = createValidator(updateClankerSchema);
export const validateCreateDeploymentStrategy = createValidator(
  deploymentStrategySchema,
);
export const validateUpdateDeploymentStrategy = createValidator(
  updateDeploymentStrategySchema,
);
export const validateResultCallback = createValidator(resultCallbackSchema);
export const validateRunTicket = createValidator(runTicketSchema);
export const validateProgressUpdate = createValidator(progressUpdateSchema);
export const validateCodexAuthCache = createValidator(codexAuthCacheSchema, {
  name: "codexAuthCache",
  logSuccess: true,
});
export const validateLogEntry = createValidator(logEntrySchema);
export const validateLogBatch = createValidator(logBatchSchema);
export const validateCreateSecret = createValidator(secretSchema);
export const validateUpdateSecret = createValidator(updateSecretSchema);
export const validateIntegrationConfig = createValidator(
  integrationConfigSchema,
);
export const validateRegister = createValidator(registerSchema);
export const validateCreateUser = createValidator(createUserSchema);
export const validateUpdateUserRole = createValidator(updateUserRoleSchema);
export const validateLogin = createValidator(loginSchema);
export const validateForgotPassword = createValidator(forgotPasswordSchema);

// Custom validators with special logic

export const validateUuidParam = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidSchema = Joi.string().uuid();

    const { error } = uuidSchema.validate(uuid);

    if (error) {
      return res.status(400).json({
        error: "Invalid UUID format",
        field: paramName,
      });
    }

    next();
  };
};

export const validateFileUploads = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  if (!files || !files.screenshot || files.screenshot.length === 0) {
    return next();
  }

  const screenshot = files.screenshot[0];
  const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (!allowedImageTypes.includes(screenshot.mimetype)) {
    return res.status(400).json({
      error:
        "Invalid screenshot file type. Only JPEG, PNG, GIF, and WebP are allowed.",
    });
  }

  // Validate recording if present
  if (files.recording && files.recording.length > 0) {
    const recording = files.recording[0];
    const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime"];

    if (!allowedVideoTypes.includes(recording.mimetype)) {
      return res.status(400).json({
        error:
          "Invalid recording file type. Only MP4, WebM, and QuickTime are allowed.",
      });
    }
  }

  next();
};

/**
 * Middleware to parse JSON string fields in multipart form data.
 * When using multer, text fields that should be objects arrive as strings.
 * This middleware parses known JSON fields back to objects.
 */
export const parseMultipartJsonFields = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const jsonFields = ["metadata", "annotations"];

  for (const field of jsonFields) {
    if (req.body[field] && typeof req.body[field] === "string") {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch {
        return res.status(400).json({
          error: "Validation error",
          details: [
            {
              field: field,
              message: `Invalid JSON format for ${field}`,
            },
          ],
        });
      }
    }
  }

  // Also parse autoFixRequested if it's a string
  if (
    req.body.autoFixRequested &&
    typeof req.body.autoFixRequested === "string"
  ) {
    req.body.autoFixRequested = req.body.autoFixRequested === "true";
  }

  next();
};

/**
 * Error handler for multer errors.
 * Converts multer errors to JSON responses instead of HTML stack traces.
 */
export const handleMulterError = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Check if it's a multer error
  if (err.name === "MulterError") {
    const multerError = err as MulterError;

    let message: string;

    switch (multerError.code) {
      case "LIMIT_FILE_SIZE":
        message = "File too large. Maximum file size is 10MB.";
        break;
      case "LIMIT_FILE_COUNT":
        message = "Too many files uploaded.";
        break;
      case "LIMIT_UNEXPECTED_FILE":
        message = `Unexpected field: ${multerError.field}. Expected 'screenshot' or 'recording'.`;
        break;
      default:
        message = multerError.message;
    }

    return res.status(400).json({
      error: "File upload error",
      message: message,
    });
  }

  // Handle "Invalid file type" error from multer fileFilter
  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(400).json({
      error: "File upload error",
      message: err.message,
    });
  }

  // Pass other errors to the next handler
  next(err);
};
