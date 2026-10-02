import type { Router } from "express";
import type { AgentQuestionAnswerService } from "../../../services/questions/AgentQuestionAnswerService";
import { validateUuidParam } from "../../middleware/validation";

/**
 * Answering an agent's question on a task. Registered on the tasks router, so
 * its `:id` guard applies; viewers are refused posting by the global guard.
 */
export function registerTaskQuestionRoutes(router: Router, deps: { answers: Pick<AgentQuestionAnswerService, "answer"> }): void {
  router.post("/:id/questions/:questionId/answer", validateUuidParam("id"), validateUuidParam("questionId"), async (req, res, next) => {
    const answer: unknown = req.body?.answer;
    if (typeof answer !== "string") return res.status(400).json({ error: "answer must be a string" });
    try {
      const asked = await deps.answers.answer(req.params.id, req.params.questionId, req.authContext!.user.id, answer);
      res.status(201).json({
        success: true,
        turn: { sessionId: asked.session.id, turnId: asked.currentTurn.id, jobId: asked.job.id, status: asked.job.status },
      });
    } catch (error) {
      next(error);
    }
  });
}
