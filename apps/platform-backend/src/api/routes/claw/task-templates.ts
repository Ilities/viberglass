import type { Router } from "express";
import logger from "../../../config/logger";
import type { ClawTaskTemplateService } from "../../../services/claw/ClawTaskTemplateService";
import { validateUuidParam } from "../../middleware/validation";
import {
  validateCreateClawTaskTemplate,
  validateUpdateClawTaskTemplate,
} from "../../middleware/validation";
import { resolveClawServiceError } from "./routeErrors";

interface ClawTaskTemplateRouteDependencies {
  clawTaskTemplateService: ClawTaskTemplateService;
}

export function registerClawTaskTemplateRoutes(
  router: Router,
  { clawTaskTemplateService }: ClawTaskTemplateRouteDependencies,
) {
  router.post(
    "/task-templates",
    validateCreateClawTaskTemplate,
    async (req, res) => {
      try {
        const template = await clawTaskTemplateService.createTemplate(req.body);

        return res.status(201).json({
          success: true,
          data: template,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error creating claw task template", {
          error: error.message,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to create task template",
        });
      }
    },
  );

  router.get("/task-templates", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const projectId = req.query.projectId as string | undefined;

      const result = await clawTaskTemplateService.listTemplates(
        limit,
        offset,
        projectId,
      );

      return res.json({
        success: true,
        data: result.templates,
        pagination: {
          limit,
          offset,
          total: result.total,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error listing claw task templates", {
        error: error.message,
      });

      const serviceError = resolveClawServiceError(err);
      if (serviceError) {
        return res.status(serviceError.statusCode).json(serviceError.body);
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to list task templates",
      });
    }
  });

  router.get(
    "/task-templates/:id",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const template = await clawTaskTemplateService.getTemplate(
          req.params.id,
        );

        return res.json({
          success: true,
          data: template,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error getting claw task template", {
          error: error.message,
          templateId: req.params.id,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to get task template",
        });
      }
    },
  );

  router.put(
    "/task-templates/:id",
    validateUuidParam("id"),
    validateUpdateClawTaskTemplate,
    async (req, res) => {
      try {
        const template = await clawTaskTemplateService.updateTemplate(
          req.params.id,
          req.body,
        );

        return res.json({
          success: true,
          data: template,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error updating claw task template", {
          error: error.message,
          templateId: req.params.id,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to update task template",
        });
      }
    },
  );

  router.delete(
    "/task-templates/:id",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        await clawTaskTemplateService.deleteTemplate(req.params.id);

        return res.status(204).send();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error deleting claw task template", {
          error: error.message,
          templateId: req.params.id,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to delete task template",
        });
      }
    },
  );
}
