import type { JobResult } from '../../types/Job';

export interface JobWithTicket {
  id: string;
  ticketId?: string;
  status: 'active' | 'completed' | 'failed';
  result?: JobResult;
  repository?: string;
}

export interface FeedbackResult {
  success: boolean;
  commentPosted?: boolean;
  labelsUpdated?: boolean;
  error?: string;
}

export type OutboundWebhookEventType =
  | 'job_started'
  | 'job_ended'
  | 'research_approved'
  | 'planning_approved';

export interface FeedbackServiceConfig {
  postOnFailure?: boolean;
  timeout?: number;
}

export interface ResearchApprovalEvent {
  id: string;
  ticketId: string;
  workflowPhase: 'research';
}

export interface PlanningApprovalEvent {
  id: string;
  ticketId: string;
  workflowPhase: 'planning';
}
