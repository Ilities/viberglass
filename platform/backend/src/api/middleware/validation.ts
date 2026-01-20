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
} from "./schemas";

export const validateCreateTicket = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = ticketSchema.validate(req.body);

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

export const validateUpdateTicket = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = updateTicketSchema.validate(req.body);

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

export const validateCreateProject = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = projectSchema.validate(req.body);

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

export const validateUpdateProject = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = updateProjectSchema.validate(req.body);

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

export const validateCreateClanker = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = clankerSchema.validate(req.body);

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

export const validateUpdateClanker = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = updateClankerSchema.validate(req.body);

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

export const validateCreateDeploymentStrategy = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = deploymentStrategySchema.validate(req.body);

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

export const validateUpdateDeploymentStrategy = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = updateDeploymentStrategySchema.validate(req.body);

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

export const validateResultCallback = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = resultCallbackSchema.validate(req.body);

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

export const validateRunTicket = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { error, value } = runTicketSchema.validate(req.body);

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
