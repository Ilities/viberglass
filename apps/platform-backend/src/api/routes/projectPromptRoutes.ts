import type { Router } from "express";
import { ALL_PROMPT_TYPES } from "../../persistence/promptTemplate/PromptTemplateDAO";
import type { PromptTemplateService } from "../../services/PromptTemplateService";
import { validateUuidParam } from "../middleware/validation";
import logger from "../../config/logger";

export function registerProjectPromptRoutes(
  router: Router,
  promptTemplateService: Pick<
    PromptTemplateService,
    "listForProject" | "setProjectTemplate" | "deleteProjectTemplate"
  >,
): void {
  // GET /api/spaces/:id/prompt-templates
  router.get(
    "/:id/prompt-templates",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const templates = await promptTemplateService.listForProject(
          req.params.id,
        );
        res.json({ success: true, data: templates });
      } catch (error) {
        logger.error("Error fetching project prompt templates", {
          error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // PUT /api/spaces/:id/prompt-templates/:type
  router.put(
    "/:id/prompt-templates/:type",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const type = ALL_PROMPT_TYPES.find(
          (candidate) => candidate === req.params.type,
        );
        if (!type) {
          return res.status(400).json({ error: "Invalid prompt type" });
        }

        const template: unknown = req.body?.template;
        if (typeof template !== "string" || template.trim().length === 0) {
          return res.status(400).json({ error: "template is required" });
        }

        await promptTemplateService.setProjectTemplate(
          req.params.id,
          type,
          template,
        );
        const templates = await promptTemplateService.listForProject(
          req.params.id,
        );
        const updated = templates.find((t) => t.type === type);
        res.json({ success: true, data: updated });
      } catch (error) {
        logger.error("Error updating project prompt template", {
          error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // DELETE /api/spaces/:id/prompt-templates/:type
  router.delete(
    "/:id/prompt-templates/:type",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const type = ALL_PROMPT_TYPES.find(
          (candidate) => candidate === req.params.type,
        );
        if (!type) {
          return res.status(400).json({ error: "Invalid prompt type" });
        }

        await promptTemplateService.deleteProjectTemplate(req.params.id, type);
        res.status(204).send();
      } catch (error) {
        logger.error("Error deleting project prompt template", {
          error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
