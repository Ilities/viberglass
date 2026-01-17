import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import {bugReportSchema, projectSchema, updateBugReportSchema, updateProjectSchema} from "./schemas";

export const validateCreateBugReport = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = bugReportSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  next();
};

export const validateUpdateBugReport = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = updateBugReportSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  next();
};

export const validateCreateProject = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = projectSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }

  req.body = value;
  next();
};

export const validateUpdateProject = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = updateProjectSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: 'Validation error',
      details: error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
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
        error: 'Invalid UUID format',
        field: paramName
      });
    }
    
    next();
  };
};

export const validateFileUploads = (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  if (!files || !files.screenshot || files.screenshot.length === 0) {
    return res.status(400).json({
      error: 'Screenshot file is required'
    });
  }
  
  const screenshot = files.screenshot[0];
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (!allowedImageTypes.includes(screenshot.mimetype)) {
    return res.status(400).json({
      error: 'Invalid screenshot file type. Only JPEG, PNG, GIF, and WebP are allowed.'
    });
  }
  
  // Validate recording if present
  if (files.recording && files.recording.length > 0) {
    const recording = files.recording[0];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    
    if (!allowedVideoTypes.includes(recording.mimetype)) {
      return res.status(400).json({
        error: 'Invalid recording file type. Only MP4, WebM, and QuickTime are allowed.'
      });
    }
  }
  
  next();
};