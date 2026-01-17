import Joi from "joi";

export const bugReportSchema = Joi.object({
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

export const updateBugReportSchema = Joi.object({
  title: Joi.string().min(1).max(500).optional(),
  description: Joi.string().min(1).optional(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  category: Joi.string().min(1).max(100).optional(),
  ticketId: Joi.string().optional(),
  ticketUrl: Joi.string().uri().optional(),
  autoFixStatus: Joi.string().valid('pending', 'in_progress', 'completed', 'failed').optional(),
  pullRequestUrl: Joi.string().uri().optional()
});

export const projectSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  ticketSystem: Joi.string()
    .valid('jira', 'linear', 'github', 'gitlab', 'azure', 'asana', 'trello', 'monday', 'clickup')
    .required(),
  credentials: Joi.object().required(),
  webhookUrl: Joi.string().uri().allow(null).optional(),
  autoFixEnabled: Joi.boolean().optional(),
  autoFixTags: Joi.array().items(Joi.string()).optional(),
  customFieldMappings: Joi.object().optional(),
  repositoryUrl: Joi.string().uri().allow(null).optional()
});

export const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  ticketSystem: Joi.string()
    .valid('jira', 'linear', 'github', 'gitlab', 'azure', 'asana', 'trello', 'monday', 'clickup')
    .optional(),
  credentials: Joi.object().optional(),
  webhookUrl: Joi.string().uri().allow(null).optional(),
  autoFixEnabled: Joi.boolean().optional(),
  autoFixTags: Joi.array().items(Joi.string()).optional(),
  customFieldMappings: Joi.object().optional(),
  repositoryUrl: Joi.string().uri().allow(null).optional()
});
