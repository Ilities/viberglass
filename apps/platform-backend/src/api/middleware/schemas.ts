import Joi from "joi";
import { SUPPORTED_AGENT_TYPES, TICKET_STATUS } from "@viberglass/types";
import { integrationRegistry } from "../../integration-plugins";
import {
  instructionPathErrorMessage,
  isAllowedInstructionPath,
  normalizeInstructionPath,
} from "../../services/instructions/pathPolicy";

const ticketSystemIds = integrationRegistry.listIds();
const ticketLifecycleStatuses = Object.values(TICKET_STATUS);

export const ticketSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  title: Joi.string().min(1).max(500).required(),
  description: Joi.string().min(1).required(),
  severity: Joi.string().valid("low", "medium", "high", "critical").required(),
  category: Joi.string().min(1).max(100).required(),
  metadata: Joi.object({
    browser: Joi.object({
      name: Joi.string().optional(),
      version: Joi.string().optional(),
    }),
    os: Joi.object({
      name: Joi.string().optional(),
      version: Joi.string().optional(),
    }),
    screen: Joi.object({
      width: Joi.number().positive().optional(),
      height: Joi.number().positive().optional(),
      viewportWidth: Joi.number().positive().optional(),
      viewportHeight: Joi.number().positive().optional(),
      pixelRatio: Joi.number().positive().optional(),
    }),
    network: Joi.object({
      userAgent: Joi.string().optional(),
      language: Joi.string().optional(),
      cookiesEnabled: Joi.boolean().optional(),
      onLine: Joi.boolean().optional(),
    }),
    console: Joi.array().items(
      Joi.object({
        level: Joi.string().valid("error", "warn", "info", "debug").optional(),
        message: Joi.string().optional(),
        timestamp: Joi.date().optional(),
        source: Joi.string().optional(),
      }),
    ),
    errors: Joi.array().items(
      Joi.object({
        message: Joi.string().optional(),
        stack: Joi.string().optional(),
        filename: Joi.string().optional(),
        lineno: Joi.number().optional(),
        colno: Joi.number().optional(),
        timestamp: Joi.date().optional(),
      }),
    ),
    pageUrl: Joi.string().uri().optional(),
    referrer: Joi.string().uri().optional(),
    localStorage: Joi.object().optional(),
    sessionStorage: Joi.object().optional(),
    timestamp: Joi.date().required(),
    timezone: Joi.string().required(),
  }).required(),
  annotations: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().uuid().required(),
        type: Joi.string()
          .valid("arrow", "rectangle", "text", "blur")
          .required(),
        x: Joi.number().required(),
        y: Joi.number().required(),
        width: Joi.number().optional(),
        height: Joi.number().optional(),
        text: Joi.string().optional(),
        color: Joi.string().optional(),
      }),
    )
    .required(),
  autoFixRequested: Joi.boolean().required(),
  ticketSystem: Joi.string()
    .valid(...ticketSystemIds)
    .optional(),
});

export const updateTicketSchema = Joi.object({
  title: Joi.string().min(1).max(500).optional(),
  description: Joi.string().min(1).optional(),
  severity: Joi.string().valid("low", "medium", "high", "critical").optional(),
  category: Joi.string().min(1).max(100).optional(),
  status: Joi.string()
    .valid(...ticketLifecycleStatuses)
    .optional(),
  externalTicketId: Joi.string().optional(),
  externalTicketUrl: Joi.string().uri().optional(),
  autoFixStatus: Joi.string()
    .valid("pending", "in_progress", "completed", "failed")
    .optional(),
  pullRequestUrl: Joi.string().uri().optional(),
});

export const archiveTicketsSchema = Joi.object({
  ticketIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

export const projectSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  ticketSystem: Joi.string()
    .valid(...ticketSystemIds)
    .default("custom"),
  credentials: Joi.object().optional(),
  webhookUrl: Joi.string().uri().allow(null).optional(),
  autoFixEnabled: Joi.boolean().optional(),
  autoFixTags: Joi.array().items(Joi.string()).optional(),
  customFieldMappings: Joi.object().optional(),
  agentInstructions: Joi.string().allow(null, "").optional(),
});

export const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  ticketSystem: Joi.string()
    .valid(...ticketSystemIds)
    .optional()
    .allow(null),
  credentials: Joi.object().optional().allow(null),
  webhookUrl: Joi.string().uri().allow(null).optional(),
  autoFixEnabled: Joi.boolean().optional(),
  autoFixTags: Joi.array().items(Joi.string()).optional(),
  customFieldMappings: Joi.object().optional(),
  agentInstructions: Joi.string().allow(null, "").optional(),
});

export const projectScmConfigSchema = Joi.object({
  integrationId: Joi.string().uuid().required(),
  sourceRepository: Joi.string().trim().min(1).max(500).required(),
  baseBranch: Joi.string().trim().min(1).max(255).default("main"),
  pullRequestRepository: Joi.string()
    .trim()
    .max(500)
    .allow(null, "")
    .optional(),
  pullRequestBaseBranch: Joi.string()
    .trim()
    .max(255)
    .allow(null, "")
    .optional(),
  branchNameTemplate: Joi.string().trim().max(255).allow(null, "").optional(),
  integrationCredentialId: Joi.string().uuid().allow(null).optional(),
});

// Config file schema for clankers
const configFileSchema = Joi.object({
  fileType: Joi.string()
    .min(1)
    .max(300)
    .custom((value, helpers) => {
      if (!isAllowedInstructionPath(value)) {
        return helpers.message({ custom: instructionPathErrorMessage(value) });
      }
      return normalizeInstructionPath(value);
    })
    .required(),
  content: Joi.string().required(),
});

const runInstructionFileSchema = Joi.object({
  fileType: Joi.string()
    .min(1)
    .max(300)
    .custom((value, helpers) => {
      if (!isAllowedInstructionPath(value)) {
        return helpers.message({ custom: instructionPathErrorMessage(value) });
      }
      return normalizeInstructionPath(value);
    })
    .required(),
  content: Joi.string().max(200000).required(),
});

const runTicketOverridesSchema = Joi.object({
  additionalContext: Joi.string().max(10000).optional(),
  reproductionSteps: Joi.string().max(10000).optional(),
  expectedBehavior: Joi.string().max(10000).optional(),
  priorityOverride: Joi.string()
    .valid("critical", "high", "medium", "low")
    .optional(),
  settings: Joi.object({
    maxChanges: Joi.number().integer().min(1).max(200).optional(),
    testRequired: Joi.boolean().optional(),
    codingStandards: Joi.string().max(5000).optional(),
    runTests: Joi.boolean().optional(),
    testCommand: Joi.string().max(1000).optional(),
    maxExecutionTime: Joi.number().integer().min(1).max(86400).optional(),
  }).optional(),
}).optional();

export const clankerSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow(null, "").optional(),
  deploymentStrategyId: Joi.string().uuid().allow(null).optional(),
  deploymentConfig: Joi.object().allow(null).optional(),
  configFiles: Joi.array().items(configFileSchema).optional(),
  agent: Joi.string()
    .valid(...SUPPORTED_AGENT_TYPES)
    .allow(null)
    .optional(),
  secretIds: Joi.array().items(Joi.string().uuid()).optional(),
});

export const updateClankerSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().allow(null, "").optional(),
  deploymentStrategyId: Joi.string().uuid().allow(null).optional(),
  deploymentConfig: Joi.object().allow(null).optional(),
  configFiles: Joi.array().items(configFileSchema).optional(),
  agent: Joi.string()
    .valid(...SUPPORTED_AGENT_TYPES)
    .allow(null)
    .optional(),
  secretIds: Joi.array().items(Joi.string().uuid()).optional(),
  status: Joi.string()
    .valid("active", "inactive", "deploying", "failed")
    .optional(),
  statusMessage: Joi.string().allow(null, "").optional(),
});

export const deploymentStrategySchema = Joi.object({
  name: Joi.string().min(1).max(50).required(),
  description: Joi.string().allow(null, "").optional(),
  configSchema: Joi.object().allow(null).optional(),
});

export const updateDeploymentStrategySchema = Joi.object({
  name: Joi.string().min(1).max(50).optional(),
  description: Joi.string().allow(null, "").optional(),
  configSchema: Joi.object().allow(null).optional(),
});

export const resultCallbackSchema = Joi.object({
  success: Joi.boolean().required(),
  commitHash: Joi.string().allow(null, "").optional(),
  pullRequestUrl: Joi.string().uri().allow(null, "").optional(),
  documentContent: Joi.string().allow(null, "").optional(),
  errorMessage: Joi.string().allow(null, "").optional(),
  logs: Joi.array().items(Joi.string()).default([]),
  changedFiles: Joi.array().items(Joi.string()).default([]),
  executionTime: Joi.number().integer().min(0).required(),
  branch: Joi.string().optional(),
});

export const runTicketSchema = Joi.object({
  clankerId: Joi.string().uuid().required(),
  overrides: runTicketOverridesSchema,
  instructionFiles: Joi.array()
    .items(runInstructionFileSchema)
    .max(20)
    .optional(),
});

// Progress update schema for worker progress reporting
export const progressUpdateSchema = Joi.object({
  step: Joi.string().max(100).optional().allow(null, ""),
  message: Joi.string().min(1).max(1000).required(),
  details: Joi.object().optional().allow(null),
});

export const codexAuthCacheSchema = Joi.object({
  secretName: Joi.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).min(1).max(255).required(),
  authJson: Joi.string().min(2).required(),
  updatedAt: Joi.string().isoDate().optional(),
});

// Log entry schema for worker logging
export const logEntrySchema = Joi.object({
  level: Joi.string().valid("info", "warn", "error", "debug").required(),
  message: Joi.string().min(1).max(5000).required(),
  source: Joi.string().max(100).optional().allow(null, ""),
});

// Batch log entries schema for efficient bulk logging
export const logBatchSchema = Joi.object({
  logs: Joi.array()
    .items(logEntrySchema)
    .min(1)
    .max(100) // Limit batch size to 100 logs
    .required(),
});

const secretNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const secretSchema = Joi.object({
  name: Joi.string().pattern(secretNamePattern).min(1).max(255).required(),
  secretLocation: Joi.string().valid("env", "database", "ssm").required(),
  secretPath: Joi.string().max(500).allow(null, "").optional(),
  secretValue: Joi.string().allow("").optional(),
});

export const updateSecretSchema = Joi.object({
  name: Joi.string().pattern(secretNamePattern).min(1).max(255).optional(),
  secretLocation: Joi.string().valid("env", "database", "ssm").optional(),
  secretPath: Joi.string().max(500).allow(null, "").optional(),
  secretValue: Joi.string().allow("").optional(),
});

export const integrationConfigSchema = Joi.object({
  authType: Joi.string().valid("api_key", "oauth", "basic", "token").required(),
  values: Joi.object().required(),
});

const userRoleSchema = Joi.string().valid("admin", "member");

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(1).max(255).required(),
  password: Joi.string().min(8).max(255).required(),
});

export const createUserSchema = registerSchema.keys({
  role: userRoleSchema.optional(),
});

export const updateUserRoleSchema = Joi.object({
  role: userRoleSchema.required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(255).required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

// Claw (scheduled task) schemas
const clawWebhookConfigSchema = Joi.object({
  url: Joi.string().uri().required(),
  secret: Joi.string().optional(),
  events: Joi.array().items(
    Joi.string().valid("started", "completed", "failed")
  ).default(["started", "completed", "failed"]),
});

export const clawTaskTemplateSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow(null, "").optional(),
  clankerId: Joi.string().uuid().required(),
  taskInstructions: Joi.string().min(1).max(50000).required(),
  config: Joi.object().optional().default({}),
  secretIds: Joi.array().items(Joi.string().uuid()).optional().default([]),
});

export const updateClawTaskTemplateSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().allow(null, "").optional(),
  clankerId: Joi.string().uuid().optional(),
  taskInstructions: Joi.string().min(1).max(50000).optional(),
  config: Joi.object().optional(),
  secretIds: Joi.array().items(Joi.string().uuid()).optional(),
});

export const clawScheduleSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  taskTemplateId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow(null, "").optional(),
  scheduleType: Joi.string().valid("interval", "cron").required(),
  intervalExpression: Joi.string().when("scheduleType", {
    is: "interval",
    then: Joi.string().pattern(/^[1-9]\d*[mhdw]$/).required().messages({
      "string.pattern.base": "Interval must be a positive number followed by m, h, d, or w (e.g. 5m, 2h). Minimum is 1 minute.",
    }),
    otherwise: Joi.optional(),
  }),
  cronExpression: Joi.string().when("scheduleType", {
    is: "cron",
    then: Joi.string().custom((value, helpers) => {
      const parts = value.trim().split(/\s+/);
      if (parts.length !== 6) {
        return helpers.message({ custom: "Cron expression must have exactly 6 fields: second minute hour day month weekday" });
      }
      const secondsField = parts[0];
      if (!/^\d+$/.test(secondsField) || parseInt(secondsField, 10) > 59) {
        return helpers.message({ custom: "Cron seconds field must be a fixed value (0-59). Sub-minute scheduling is not allowed." });
      }
      return value;
    }).required(),
    otherwise: Joi.optional(),
  }),
  timezone: Joi.string().default("UTC").optional(),
  isActive: Joi.boolean().default(true).optional(),
  webhookConfig: clawWebhookConfigSchema.optional().allow(null),
});

export const updateClawScheduleSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().allow(null, "").optional(),
  scheduleType: Joi.string().valid("interval", "cron").optional(),
  intervalExpression: Joi.string().pattern(/^[1-9]\d*[mhdw]$/).optional().messages({
    "string.pattern.base": "Interval must be a positive number followed by m, h, d, or w (e.g. 5m, 2h). Minimum is 1 minute.",
  }),
  cronExpression: Joi.string().custom((value, helpers) => {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 6) {
      return helpers.message({ custom: "Cron expression must have exactly 6 fields: second minute hour day month weekday" });
    }
    const secondsField = parts[0];
    if (!/^\d+$/.test(secondsField) || parseInt(secondsField, 10) > 59) {
      return helpers.message({ custom: "Cron seconds field must be a fixed value (0-59). Sub-minute scheduling is not allowed." });
    }
    return value;
  }).optional(),
  timezone: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
  webhookConfig: clawWebhookConfigSchema.optional().allow(null),
});
