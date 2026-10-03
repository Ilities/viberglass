import { Request, Response, Router } from "express";
import { isObjectRecord } from "@viberglass/types";
import logger from "../../../config/logger";
import { isDomainError } from "../../../services/errors/DomainError";
import { JobBootstrapService } from "../../../services/job/JobBootstrapService";
import { SkillService } from "../../../services/skills/SkillService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";

const bootstraps = new JobBootstrapService();
const skills = new SkillService();

/** Whether the run's payload gave it this skill; a run's token reaches only its own skills. */
function payloadHasSkill(payload: Record<string, unknown> | null, skillId: string): boolean {
  const listed = payload?.skills;
  return Array.isArray(listed) && listed.some((skill: unknown) => isObjectRecord(skill) && skill.id === skillId);
}

/** A run's worker downloading one of its runner's skills, to write where the agent's harness reads skills. */
export function registerSkillCallbackRoute(router: Router): void {
  router.get("/:jobId/skills/:skillId", tenantMiddleware, validateCallbackToken, async (req: Request, res: Response) => {
    const { jobId, skillId } = req.params;
    try {
      const bootstrap = await bootstraps.getBootstrapPayload(jobId);
      if (!bootstrap || bootstrap.tenantId !== req.tenantId || !payloadHasSkill(bootstrap.payload, skillId)) {
        return res.status(404).json({ error: "Skill not found for this run" });
      }
      return res.json({ success: true, data: await skills.files(skillId) });
    } catch (error) {
      if (isDomainError(error)) return res.status(error.statusCode).json({ error: error.message });
      logger.error("Failed to send a skill to a worker", {
        jobId,
        skillId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
