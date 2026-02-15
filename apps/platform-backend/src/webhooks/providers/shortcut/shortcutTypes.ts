import type { ParsedWebhookEvent, WebhookResult } from '../../WebhookProvider';

export type ShortcutWebhookObjectType = 'story' | 'comment';

export interface ShortcutProjectData {
  id?: number;
  name?: string;
}

export interface ShortcutStoryData {
  id?: number;
  name?: string;
  description?: string;
  story_type?: 'feature' | 'bug' | 'chore';
  workflow_state_id?: number;
  workflow_state?: {
    id?: number;
    name?: string;
  };
  project_id?: number;
  project?: ShortcutProjectData;
  labels?: Array<{
    id?: number;
    name?: string;
  }>;
  owner_ids?: string[];
  created_at?: string;
  updated_at?: string;
  app_url?: string;
}

export interface ShortcutCommentData {
  id?: number;
  story_id?: number;
  text?: string;
  author_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ShortcutWebhookPayload {
  id?: string;
  object_type?: ShortcutWebhookObjectType | string;
  event_type?: string;
  action?: string;
  member_id?: string;
  data?: Record<string, unknown>;
  story?: Record<string, unknown>;
  comment?: Record<string, unknown>;
  payload?: Record<string, unknown> | string;
  refs?: Array<{
    id?: number;
    entity_type?: string;
  }>;
  references?: Array<{
    id?: number;
    entity_type?: string;
  }>;
  changed_fields?: string[];
  changedFields?: string[];
}

export interface ShortcutOutboundSettings {
  successLabel: string;
  failureLabel: string;
  skipLabelUpdates: boolean;
  successWorkflowStateId?: number;
  failureWorkflowStateId?: number;
}

export interface ShortcutStory {
  id: number;
  name: string;
  description?: string;
  story_type: string;
  state: string;
  labels: string[];
  url: string;
}

export interface ParsedShortcutEvent {
  eventType: string;
  deduplicationId: string;
  timestamp: string;
  metadata: ParsedWebhookEvent['metadata'];
  payload: ShortcutWebhookPayload;
}

export interface ShortcutLabelResultConfig {
  success: string;
  failure: string;
}

export interface ShortcutPostResultInput {
  storyId: string;
  result: WebhookResult;
}

export const DEFAULT_SUCCESS_LABEL = 'fix-submitted';
export const DEFAULT_FAILURE_LABEL = 'fix-failed';
export const DEFAULT_SHORTCUT_API_BASE_URL = 'https://api.app.shortcut.com/api/v3';
