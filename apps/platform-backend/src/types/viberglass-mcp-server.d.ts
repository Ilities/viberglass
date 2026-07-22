declare module "@viberglass/mcp-server" {
  import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  import type {
    Clanker,
    ClankerStatus,
    Project,
    Ticket,
    TicketWorkflowPhase,
  } from "@viberglass/types";

  export interface TicketListFilters {
    projectId?: string;
    statuses?: string[];
    workflowPhases?: string[];
    severity?: string;
    search?: string;
    limit?: number;
    offset?: number;
    archived?: string;
  }

  export interface CreateTicketParams {
    projectId: string;
    title: string;
    description: string;
    severity?: string;
    category?: string;
    ticketSystem?: string;
  }

  export interface TriggerParams {
    clankerId: string;
    targetPhase: TicketWorkflowPhase;
    actor?: string;
  }

  export interface CommentParams {
    lineNumber: number;
    content: string;
    actor?: string;
  }

  export interface ApprovalResult {
    approvalState: string;
    approvedAt?: string | null;
    approvedBy?: string | null;
  }

  export interface ReviewPhaseDocument {
    phase: TicketWorkflowPhase;
    content: string | null;
    approvalState: string | null;
    approvedAt: string | null;
    approvedBy: string | null;
    comments: Array<{
      id: string;
      lineNumber: number;
      content: string;
      status: string;
      actor: string | null;
      createdAt: string;
    }>;
  }

  export interface ReviewState {
    ticketId: string;
    workflowPhase: TicketWorkflowPhase;
    phases: Array<{
      phase: TicketWorkflowPhase;
      status: "completed" | "current" | "upcoming";
    }>;
    documents: ReviewPhaseDocument[];
  }

  export interface McpToolServices {
    clankers: {
      list(filters?: {
        status?: ClankerStatus;
        limit?: number;
        offset?: number;
      }): Promise<{ clankers: Clanker[]; total: number }>;
    };
    projects: {
      list(filters?: {
        limit?: number;
        offset?: number;
      }): Promise<{ projects: Project[]; total: number }>;
    };
    tickets: {
      list(
        filters: TicketListFilters,
      ): Promise<{ tickets: Ticket[]; total: number }>;
      get(ticketId: string): Promise<Ticket | null>;
      create(params: CreateTicketParams): Promise<Ticket>;
      trigger(
        ticketId: string,
        params: TriggerParams,
      ): Promise<{ jobId: string; status: string }>;
    };
    review: {
      getState(ticketId: string): Promise<ReviewState>;
      requestApproval(
        ticketId: string,
        actor?: string,
      ): Promise<ApprovalResult>;
      approve(ticketId: string, actor?: string): Promise<ApprovalResult>;
      revokeApproval(ticketId: string, actor?: string): Promise<ApprovalResult>;
      addComment(
        ticketId: string,
        phase: "research" | "planning",
        params: CommentParams,
      ): Promise<{
        id: string;
        lineNumber: number;
        content: string;
        status: string;
      }>;
      listComments(
        ticketId: string,
        phase: "research" | "planning",
      ): Promise<
        Array<{
          id: string;
          lineNumber: number;
          content: string;
          status: string;
          actor: string | null;
          createdAt: string;
        }>
      >;
    };
  }

  export function createMcpServer(
    services: McpToolServices,
    options?: { name?: string; version?: string },
  ): McpServer;
}
