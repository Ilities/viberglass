import type { Request, Router } from "express";
import type { SituationViewer } from "@viberglass/types";
import logger from "../../../config/logger";
import type { AgentSessionDAO } from "../../../persistence/agentSession/AgentSessionDAO";
import type { TaskParticipantDAO } from "../../../persistence/ticketing/TaskParticipantDAO";
import type { TaskReadDAO } from "../../../persistence/ticketing/TaskReadDAO";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { isDomainError } from "../../../services/errors/DomainError";
import type { SpaceAccessService } from "../../../services/spaces/SpaceAccessService";
import { situationTaskOf, type TaskSituationService } from "../../../services/tasks/TaskSituationService";
import type { TaskAskPolicyService } from "../../../services/taskTurns/TaskAskPolicyService";
import { spaceViewerOf } from "../../middleware/spaceAccessGuards";
import { validateUuidParam } from "../../middleware/validation";
import {
  parseArchivedQuery,
  parseSeverityQuery,
  parseStatusesQuery,
  parseWorkflowPhasesQuery,
  uuidRegex,
} from "./taskListQuery";

interface TaskReadRouteDependencies {
  ticketService: Pick<TicketDAO, "getTicket" | "getTicketsWithFilters">;
  agentSessionDAO: Pick<AgentSessionDAO, "listOpenSessionIdsByTicket">;
  spaceAccess: Pick<SpaceAccessService, "scopeFor">;
  participantDAO: Pick<TaskParticipantDAO, "listOwners">;
  situations: Pick<TaskSituationService, "describe">;
  policy: Pick<TaskAskPolicyService, "describe">;
  reads: Pick<TaskReadDAO, "markRead">;
}

const situationViewerOf = (req: Request): SituationViewer => ({
  id: req.authContext!.user.id,
  isAdmin: req.authContext!.user.role === "admin",
});

/**
 * Reading tasks: the list, one task, and marking a task's thread read. Each
 * task comes with its situation for the person asking; one task also says what
 * they may ask the agent for. Registered after the routes with fixed paths
 * (`/stats`), so `/:id` doesn't shadow them.
 */
export function registerTaskReadRoutes(
  router: Router,
  { ticketService, agentSessionDAO, spaceAccess, participantDAO, situations, policy, reads }: TaskReadRouteDependencies,
): void {
  // GET /api/tasks - Tasks in the spaces the person can see
  router.get("/", async (req, res, next) => {
    try {
      const projectId = req.query.projectId as string;
      const projectSlug = req.query.projectSlug as string;
      const limit = Math.max(
        1,
        Math.min(200, parseInt(req.query.limit as string, 10) || 50),
      );
      const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
      const statuses = parseStatusesQuery(
        req.query.statuses as string | string[] | undefined,
      );
      const workflowPhases = parseWorkflowPhasesQuery(
        req.query.workflowPhases as string | string[] | undefined,
      );
      const archived = parseArchivedQuery(
        req.query.archived as string | string[] | undefined,
      );
      const severity = parseSeverityQuery(
        req.query.severity as string | string[] | undefined,
      );
      const searchRaw = req.query.search as string | undefined;
      const search =
        typeof searchRaw === "string" ? searchRaw.trim() : undefined;

      if (statuses === null) {
        return res.status(400).json({
          error: "Invalid statuses filter",
        });
      }

      if (archived === null) {
        return res.status(400).json({
          error: "Invalid archived filter",
        });
      }

      if (workflowPhases === null) {
        return res.status(400).json({
          error: "Invalid workflowPhases filter",
        });
      }

      if ((req.query.severity as string | undefined) && !severity) {
        return res.status(400).json({
          error: "Invalid severity filter",
        });
      }

      if (!projectSlug && projectId && !uuidRegex.test(projectId)) {
        return res.status(400).json({
          error: "Invalid projectId format",
        });
      }
      const scope = await spaceAccess.scopeFor(spaceViewerOf(req)!, projectSlug || projectId);

      const { tickets, total } = await ticketService.getTicketsWithFilters({
        limit,
        offset,
        projectId: scope.projectId,
        projectIds: scope.projectIds,
        statuses,
        workflowPhases,
        archived,
        severity: severity || undefined,
        search,
      });

      const ticketIds = tickets.map((ticket) => ticket.id);
      const [liveSessions, owners, described] = await Promise.all([
        agentSessionDAO.listOpenSessionIdsByTicket(ticketIds),
        participantDAO.listOwners(ticketIds),
        situations.describe(tickets.map(situationTaskOf), situationViewerOf(req)),
      ]);

      res.json({
        success: true,
        data: tickets.map((ticket) => {
          const liveSessionId = liveSessions.get(ticket.id);
          const owner = owners.get(ticket.id);
          const situation = described.get(ticket.id)?.situation;
          return { ...ticket, ...(liveSessionId && { liveSessionId }), ...(owner && { owner }), ...(situation && { situation }) };
        }),
        pagination: {
          limit,
          offset,
          count: tickets.length,
          total,
        },
      });
    } catch (error) {
      if (isDomainError(error)) return next(error);
      logger.error("Error fetching tickets", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch tickets",
      });
    }
  });


  // GET /api/tasks/:id - One task, with its situation and what the person may ask for
  router.get("/:id", validateUuidParam("id"), async (req, res, next) => {
    try {
      const ticket = await ticketService.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const [described, capabilities] = await Promise.all([
        situations.describe([situationTaskOf(ticket)], situationViewerOf(req)),
        policy.describe(req.authContext!.user.id, ticket.id),
      ]);
      res.json({ success: true, data: { ...ticket, situation: described.get(ticket.id)?.situation, capabilities } });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/tasks/:id/read - The person has read the thread up to now
  router.post("/:id/read", validateUuidParam("id"), async (req, res, next) => {
    try {
      await reads.markRead(req.params.id, req.authContext!.user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
