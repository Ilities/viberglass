import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

const bugReportSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  title: Joi.string().min(1).max(500).required(),
  description: Joi.string().min(1).required(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  category: Joi.string().min(1).max(100).required(),
  metadata: Joi.object({
    browser: Joi.object({
      name: Joi.string().required(),
      version: Joi.string().required()
    }).required(),
    os: Joi.object({
      name: Joi.string().required(),
      version: Joi.string().required()
    }).required(),
    screen: Joi.object({
      width: Joi.number().positive().required(),
      height: Joi.number().positive().required(),
      viewportWidth: Joi.number().positive().required(),
      viewportHeight: Joi.number().positive().required(),
      pixelRatio: Joi.number().positive().required()
    }).required(),
    network: Joi.object({
      userAgent: Joi.string().required(),
      language: Joi.string().required(),
      cookiesEnabled: Joi.boolean().required(),
      onLine: Joi.boolean().required()
    }).required(),
    console: Joi.array().items(
      Joi.object({
        level: Joi.string().valid('error', 'warn', 'info', 'debug').required(),
        message: Joi.string().required(),
        timestamp: Joi.date().required(),
        source: Joi.string().optional()
      })
    ).required(),
    errors: Joi.array().items(
      Joi.object({
        message: Joi.string().required(),
        stack: Joi.string().optional(),
        filename: Joi.string().optional(),
        lineno: Joi.number().optional(),
        colno: Joi.number().optional(),
        timestamp: Joi.date().required()
      })
    ).required(),
    pageUrl: Joi.string().uri().required(),
    referrer: Joi.string().uri().optional(),
    localStorage: Joi.object().optional(),
    sessionStorage: Joi.object().optional(),
    timestamp: Joi.date().required(),
    timezone: Joi.string().required()
  }).required(),
  annotations: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      type: Joi.string().valid('arrow', 'rectangle', 'text', 'blur').required(),
      x: Joi.number().required(),
      y: Joi.number().required(),
      width: Joi.number().optional(),
      height: Joi.number().optional(),
      text: Joi.string().optional(),
      color: Joi.string().optional()
    })
  ).required(),
  autoFixRequested: Joi.boolean().required(),
  ticketSystem: Joi.string().valid('jira', 'linear', 'github', 'gitlab', 'azure', 'asana', 'trello', 'monday', 'clickup').required()
});

const updateBugReportSchema = Joi.object({
  title: Joi.string().min(1).max(500).optional(),
  description: Joi.string().min(1).optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  category: Joi.string().min(1).max(100).optional(),
  ticketId: Joi.string().optional(),
  ticketUrl: Joi.string().uri().optional(),
  autoFixStatus: Joi.string().valid('pending', 'in_progress', 'completed', 'failed').optional(),
  pullRequestUrl: Joi.string().uri().optional()
});

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