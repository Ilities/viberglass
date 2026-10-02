import { Request, Response, Router } from "express";
import logger from "../../../config/logger";
import { isDomainError } from "../../../services/errors/DomainError";
import { AgentQuestionService } from "../../../services/questions/AgentQuestionService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";

const questions = new AgentQuestionService();

const MAX_QUESTION = 4_000;
const MAX_OPTIONS = 10;

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_OPTIONS) : [];
}

/** A run's agent asking a person on its task a question, through the worker. */
export function registerQuestionCallbackRoute(router: Router): void {
  router.post("/:jobId/questions", tenantMiddleware, validateCallbackToken, async (req: Request, res: Response) => {
    const { question, options, addressee, blocking } = req.body ?? {};
    if (typeof question !== "string" || !question.trim() || question.length > MAX_QUESTION) {
      return res.status(400).json({ error: "question must be a non-empty string of up to 4,000 characters" });
    }
    try {
      const asked = await questions.ask(req.params.jobId, {
        question: question.trim(),
        options: stringList(options),
        addressee: typeof addressee === "string" && addressee.trim() ? addressee.trim() : null,
        blocking: blocking !== false,
      });
      return res.status(201).json({ success: true, data: asked });
    } catch (error) {
      if (isDomainError(error)) return res.status(error.statusCode).json({ error: error.message });
      logger.error("Failed to record an agent's question", {
        jobId: req.params.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
