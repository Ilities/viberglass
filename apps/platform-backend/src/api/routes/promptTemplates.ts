import express from "express";
import { requireAuth } from "../middleware/authentication";
import { PromptTemplateDAO } from "../../persistence/promptTemplate/PromptTemplateDAO";
import { PromptTemplateService } from "../../services/PromptTemplateService";
import type { PromptType } from "../../persistence/promptTemplate/PromptTemplateDAO";
import { ALL_PROMPT_TYPES } from "../../persistence/promptTemplate/PromptTemplateDAO";
import logger from "../../config/logger";

const router = express.Router();
const promptTemplateService = new PromptTemplateService(new PromptTemplateDAO());

router.use(requireAuth);

// GET /api/prompt-templates — list all 7 system defaults
router.get("/", async (_req, res) => {
  try {
    const templates = await promptTemplateService.listSystemDefaults();
    res.json({ success: true, data: templates });
  } catch (error) {
    logger.error("Error fetching system prompt templates", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/prompt-templates/:type — update a system default
router.put("/:type", async (req, res) => {
  try {
    const type = req.params.type as PromptType;
    if (!ALL_PROMPT_TYPES.includes(type)) {
      return res.status(400).json({ error: "Invalid prompt type" });
    }

    const { template } = req.body as { template?: unknown };
    if (typeof template !== "string" || template.trim().length === 0) {
      return res.status(400).json({ error: "template is required" });
    }

    await promptTemplateService.setSystemDefault(type, template);
    const templates = await promptTemplateService.listSystemDefaults();
    const updated = templates.find((t) => t.type === type);
    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("Error updating system prompt template", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
