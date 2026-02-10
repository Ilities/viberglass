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

export type OutboundWebhookEventType = 'job_started' | 'job_ended';

export interface FeedbackServiceConfig {
  postOnFailure?: boolean;
  timeout?: number;
}
