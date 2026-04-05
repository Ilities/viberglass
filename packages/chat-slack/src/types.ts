import {AgentSessionMode, AgentSessionStatus, TicketWorkflowPhase} from "@viberglass/types";
import type { Thread } from "chat";

export type SessionAdvanceResult =
  | { kind: "advance"; targetMode: AgentSessionMode }
  | { kind: "chain"; firstMode: AgentSessionMode; thenMode: AgentSessionMode }
  | { kind: "revise" }
  | { kind: "invalid"; message: string };

export interface ProjectSummary {
  id: string;
  name: string;
}

export interface ClankerSummary {
  id: string;
  name: string;
}

export interface SessionDetail {
  session: {
    status: AgentSessionStatus;
    mode: AgentSessionMode;
    ticketId: string;
    clankerId: string;
  };
}

export interface LaunchSessionResult {
  session: { id: string };
}

/**
 * Services the backend must provide to the Slack handler extension.
 * Implement this interface in the backend composition root and pass it to
 * registerSlackHandlers().
 */
export interface SlackHandlerServices {
  // Data queries for the slash-command form
  listProjects(): Promise<ProjectSummary[]>;
  listClankers(): Promise<ClankerSummary[]>;

  // Ticket + job lifecycle
  createTicket(params: {
    projectId: string;
    title: string;
    description: string;
    phase: TicketWorkflowPhase;
  }): Promise<{ id: string; projectId: string }>;
  runJob(params: {
    ticketId: string;
    clankerId: string;
    mode: "research" | "planning" | "execution";
  }): Promise<{ jobId: string; status: string }>;
  launchSession(params: {
    ticketId: string;
    clankerId: string;
    mode: AgentSessionMode;
    initialMessage: string;
  }): Promise<LaunchSessionResult>;

  // Session state queries
  getSessionDetail(sessionId: string): Promise<SessionDetail | null>;
  resolveSessionAdvance(
    instruction: string,
    currentMode: AgentSessionMode,
  ): SessionAdvanceResult;

  // Session interaction
  replyToSession(sessionId: string, text: string): Promise<void>;
  sendMessageToSession(sessionId: string, text: string): Promise<void>;
  approveSession(sessionId: string, approved: boolean): Promise<void>;

  // Thread ↔ session mapping (adapter-agnostic; backend stamps the adapter name)
  getSessionForThread(threadId: string): Promise<string | undefined>;
  linkSessionThread(sessionId: string, thread: Thread): Promise<void>;
  unlinkSession(sessionId: string): Promise<void>;

  // Bridge control
  startBridge(sessionId: string, thread: Thread, chainTo?: AgentSessionMode): void;
  stopBridge(sessionId: string): void;

  // Ticket job flow (non-session)
  runRevisionJob(params: {
    ticketId: string;
    clankerId: string;
    mode: "research" | "planning";
    revisionMessage: string;
  }): Promise<{ jobId: string; status: string }>;
  linkTicketThread(ticketId: string, thread: Thread, clankerId: string, mode: string): Promise<void>;
  getTicketForThread(threadId: string): Promise<{ ticketId: string; clankerId: string; mode: string } | undefined>;

  // URL helpers
  ticketUrl(projectSlug: string, ticketId: string): string | null;
  getProject(id: string): Promise<{ id: string; slug: string } | null>;
}
