import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import {
  ticketSchema,
  projectSchema,
  updateTicketSchema,
  updateProjectSchema,
  clankerSchema,
  updateClankerSchema,
  deploymentStrategySchema,
  updateDeploymentStrategySchema,
  resultCallbackSchema,
  runTicketSchema,
  progressUpdateSchema,
  logEntrySchema,
  logBatchSchema,
  secretSchema,
  updateSecretSchema,
  integrationConfigSchema,
} from "./schemas";

/**
 * Factory function that creates validation middleware from a Joi schema.
 * Handles the standard validation flow: validate req.body, return 400 on error,
 * replace req.body with validated value on success.
 *
 * @param schema - Joi schema to validate against
 * @returns Express middleware function
 */
function createValidator(schema: Joi.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation error",
        details: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        })),
      });
    }
    req.body = value;
    next();
  };
}

// Schema validators - each created via factory
export const validateCreateTicket = createValidator(ticketSchema);
export const validateUpdateTicket = createValidator(updateTicketSchema);
export const validateCreateProject = createValidator(projectSchema);
export const validateUpdateProject = createValidator(updateProjectSchema);
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
export const validateLogEntry = createValidator(logEntrySchema);
export const validateLogBatch = createValidator(logBatchSchema);
export const validateCreateSecret = createValidator(secretSchema);
export const validateUpdateSecret = createValidator(updateSecretSchema);
export const validateIntegrationConfig = createValidator(integrationConfigSchema);

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
