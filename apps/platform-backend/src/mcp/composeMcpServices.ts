import type { McpToolServices } from "@viberglass/mcp-server";
import type { TicketWorkflowPhase } from "@viberglass/types";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseDocumentDAO } from "../persistence/ticketing/TicketPhaseDocumentDAO";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { TicketWorkflowService } from "../services/TicketWorkflowService";
import { TicketPhaseDocumentCommentService } from "../services/TicketPhaseDocumentCommentService";
import { TicketPlanningApprovalService } from "../services/TicketPlanningApprovalService";
import { TicketPhaseOrchestrationService } from "../services/TicketPhaseOrchestrationService";
import { TicketResearchService } from "../services/TicketResearchService";
import { TicketPlanningService } from "../services/TicketPlanningService";
import { TicketExecutionService } from "../services/TicketExecutionService";
import { getFeedbackService } from "../webhooks/webhookServiceFactory";
import type { FeedbackService } from "../webhooks/FeedbackService";
import logger from "../config/logger";

let feedbackService: FeedbackService | undefined;
try {
  feedbackService = getFeedbackService();
} catch {
  logger.warn("Feedback service unavailable for MCP composition root");
}

const ticketDAO = new TicketDAO();
const ticketPhaseDocumentDAO = new TicketPhaseDocumentDAO();
const clankerDAO = new ClankerDAO();
const projectDAO = new ProjectDAO();
const workflowService = new TicketWorkflowService();
const commentService = new TicketPhaseDocumentCommentService();
const planningApprovalService = new TicketPlanningApprovalService(
  feedbackService,
);
const researchService = new TicketResearchService();
const planningService = new TicketPlanningService();
const executionService = new TicketExecutionService();

const orchestrationService = new TicketPhaseOrchestrationService(
  ticketDAO,
  workflowService,
  planningApprovalService,
  researchService,
  planningService,
  executionService,
);

export const mcpToolServices: McpToolServices = {
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
      );
      return { projects, total: projects.length };
    },
  },

  tickets: {
    async list(filters) {
      return ticketDAO.getTicketsWithFilters({
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
        projectId: filters.projectId,
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
      return ticketDAO.getTicket(ticketId);
    },

    async create(params) {
      return ticketDAO.createTicket({
        projectId: params.projectId,
        title: params.title,
        description: params.description,
        severity:
          (params.severity as "low" | "medium" | "high" | "critical") ??
          "medium",
        category: params.category ?? "general",
        ticketSystem:
          (params.ticketSystem as
            | "jira"
            | "linear"
            | "github"
            | "gitlab"
            | "bitbucket"
            | "azure"
            | "asana"
            | "trello"
            | "monday"
            | "clickup"
            | "shortcut"
            | "slack"
            | "custom") ?? "github",
        metadata: {
          timestamp: new Date().toISOString(),
          timezone: "UTC",
        },
        annotations: [],
        autoFixRequested: false,
      });
    },

    async trigger(ticketId, params) {
      return orchestrationService.advanceAndRun({
        ticketId,
        clankerId: params.clankerId,
        targetPhase: params.targetPhase,
        actor: params.actor,
      });
    },
  },

  review: {
    async getState(ticketId) {
      const workflow = await workflowService.getTicketWorkflow(ticketId);

      const phases: Array<TicketWorkflowPhase> = [
        "research",
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

          if (phase === "research" || phase === "planning") {
            const rawComments = await commentService.listComments(
              ticketId,
              phase as "research" | "planning",
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
            approvalState: doc?.approvalState ?? null,
            approvedAt: doc?.approvedAt?.toISOString() ?? null,
            approvedBy: doc?.approvedBy ?? null,
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

    async requestApproval(ticketId, actor) {
      const result = await planningApprovalService.requestApproval(
        ticketId,
        actor,
      );
      return {
        approvalState: result.document.approvalState,
      };
    },

    async approve(ticketId, actor) {
      const result = await planningApprovalService.approve(ticketId, actor);
      return {
        approvalState: result.document.approvalState,
        approvedAt: result.document.approvedAt,
        approvedBy: result.document.approvedBy,
      };
    },

    async revokeApproval(ticketId, actor) {
      const result = await planningApprovalService.revokeApproval(
        ticketId,
        actor,
      );
      return {
        approvalState: result.document.approvalState,
      };
    },

    async addComment(ticketId, phase, params) {
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
