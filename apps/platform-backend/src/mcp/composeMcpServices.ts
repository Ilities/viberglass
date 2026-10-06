import type { McpToolServices } from "@viberglass/mcp-server";
import { isTicketOrigin, NATIVE_TICKET_ORIGIN, type TicketWorkflowPhase } from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketListDAO } from "../persistence/ticketing/TicketListDAO";
import { TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { TicketWorkflowService } from "../services/TicketWorkflowService";
import { TicketPhaseDocumentCommentService } from "../services/TicketPhaseDocumentCommentService";
import { TicketPhaseOrchestrationService } from "../services/TicketPhaseOrchestrationService";
import { TaskTurnService } from "../services/taskTurns/TaskTurnService";
import { currentActorId } from "../api/auth/requestActor";
import { TaskCodeBranchService } from "../services/tasks/TaskCodeBranchService";

const ticketDAO = new TicketDAO();
const ticketLists = new TicketListDAO();
const ticketPhaseDocumentDAO = new TicketPhaseDocumentDAO();
const clankerDAO = new ClankerDAO();
const projectDAO = new ProjectDAO();
const workflowService = new TicketWorkflowService();
const commentService = new TicketPhaseDocumentCommentService();
const orchestrationService = new TicketPhaseOrchestrationService(new TaskTurnService());
const codeBranches = new TaskCodeBranchService();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What one MCP caller may reach: `projectIds` null means every space (admins);
 * the assertions refuse a space or task outside it.
 */
export interface McpScope {
  projectIds: string[] | null;
  assertSpace(projectId: string): Promise<void>;
  assertTask(ticketId: string): Promise<void>;
}

/** The MCP tools for one caller, limited to the spaces they can see. */
export function createMcpToolServices(scope: McpScope): McpToolServices {
  return {
    clankers: {
      async list(filters) {
        let clankers = await clankerDAO.listClankers(
          filters?.limit ?? 50,
          filters?.offset ?? 0,
        );
        if (filters?.status) {
          clankers = clankers.filter((c) => c.status === filters.status);
        }
        return { clankers, total: clankers.length };
      },
    },

    projects: {
      async list(filters) {
        const projects = await projectDAO.listProjects(
          filters?.limit ?? 50,
          filters?.offset ?? 0,
          scope.projectIds,
        );
        return { projects, total: projects.length };
      },
    },

    tickets: {
      async list(filters) {
        if (filters.projectId) await scope.assertSpace(filters.projectId);
        return ticketLists.getTicketsWithFilters({
          limit: filters.limit ?? 50,
          offset: filters.offset ?? 0,
          projectId: filters.projectId,
          projectIds: scope.projectIds,
          statuses:
            (filters.statuses as Array<
              "open" | "in_progress" | "in_review" | "resolved"
            >) ?? [],
          workflowPhases: (filters.workflowPhases as TicketWorkflowPhase[]) ?? [],
          archived:
            (filters.archived as "exclude" | "only" | "include") ?? "exclude",
          severity: filters.severity as
            | "low"
            | "medium"
            | "high"
            | "critical"
            | undefined,
          search: filters.search,
        });
      },

      async get(ticketId) {
        await scope.assertTask(ticketId);
        return ticketDAO.getTicket(ticketId);
      },

      async branch(task) {
        const ticketId = UUID.test(task) ? task : await ticketDAO.findIdByKey(task.toUpperCase());
        if (!ticketId) return null;
        await scope.assertTask(ticketId);
        return codeBranches.describe(ticketId);
      },

      async create(params) {
        await scope.assertSpace(params.projectId);
        return ticketDAO.createTicket({
          projectId: params.projectId,
          title: params.title,
          description: params.description,
          severity:
            (params.severity as "low" | "medium" | "high" | "critical") ??
            "medium",
          category: params.category ?? "general",
          ticketSystem: isTicketOrigin(params.ticketSystem)
            ? params.ticketSystem
            : NATIVE_TICKET_ORIGIN,
          metadata: {
            timestamp: new Date().toISOString(),
            timezone: "UTC",
          },
          annotations: [],
          autoFixRequested: false,
        });
      },

      async trigger(ticketId, params) {
        await scope.assertTask(ticketId);
        return orchestrationService.advanceAndRun({
          ticketId,
          clankerId: params.clankerId,
          targetPhase: params.targetPhase,
          actorId: currentActorId(),
        });
      },
    },

    review: {
      async getState(ticketId) {
        await scope.assertTask(ticketId);
        const workflow = await workflowService.getTicketWorkflow(ticketId);

        const phases: Array<TicketWorkflowPhase> = [
          "planning",
          "execution",
        ];
        const documents = await Promise.all(
          phases.map(async (phase) => {
            const doc = await ticketPhaseDocumentDAO.getByTicketAndPhase(
              ticketId,
              phase,
            );
            let comments: Array<{
              id: string;
              lineNumber: number;
              content: string;
              status: string;
              actor: string | null;
              createdAt: string;
            }> = [];

            if (phase === "planning") {
              const rawComments = await commentService.listComments(
                ticketId,
                phase,
              );
              comments = rawComments.map((c) => ({
                id: c.id,
                lineNumber: c.lineNumber,
                content: c.content,
                status: c.status,
                actor: c.actor,
                createdAt: c.createdAt,
              }));
            }

            return {
              phase,
              content: doc?.content ?? null,
              comments,
            };
          }),
        );

        return {
          ticketId,
          workflowPhase: workflow.workflowPhase,
          phases: workflow.phases,
          documents,
        };
      },

      async addComment(ticketId, phase, params) {
        await scope.assertTask(ticketId);
        const comment = await commentService.createComment(ticketId, phase, {
          lineNumber: params.lineNumber,
          content: params.content,
          actor: params.actor,
        });
        return {
          id: comment.id,
          lineNumber: comment.lineNumber,
          content: comment.content,
          status: comment.status,
        };
      },

      async listComments(ticketId, phase) {
        await scope.assertTask(ticketId);
        const comments = await commentService.listComments(ticketId, phase);
        return comments.map((c) => ({
          id: c.id,
          lineNumber: c.lineNumber,
          content: c.content,
          status: c.status,
          actor: c.actor,
          createdAt: c.createdAt,
        }));
      },
    },
  };
}
