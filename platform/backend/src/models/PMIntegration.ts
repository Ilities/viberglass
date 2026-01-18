// Re-export types from shared types package
export type {
  AuthCredentials,
  AuthCredentialType,
  Ticket,
  TicketUpdate,
  WebhookEvent,
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
} from '@viberator/types';

import type { BugReport, TicketSystem, AuthCredentials, Ticket, TicketUpdate, WebhookEvent, Project } from '@viberator/types';

// Backend-specific interface for PM Integration implementations
export interface CustomFieldMapping {
  [key: string]: any;
}

export interface PMIntegration {
  // Authentication
  authenticate(credentials: AuthCredentials): Promise<void>;

  // Ticket operations
  createTicket(bugReport: BugReport): Promise<Ticket>;
  updateTicket(ticketId: string, updates: TicketUpdate): Promise<void>;
  getTicket(ticketId: string): Promise<Ticket>;

  // Auto-fix tag detection
  hasAutoFixTag(ticket: Ticket): boolean;

  // Custom field mapping
  mapCustomFields(bugReport: BugReport): CustomFieldMapping;

  // Webhook support
  registerWebhook(url: string, events: string[]): Promise<void>;
  handleWebhook(payload: unknown): WebhookEvent;
}

// Alias for backward compatibility
export type ProjectConfig = Project;

// Specific integration configurations
export interface JiraConfig extends AuthCredentials {
  instanceUrl: string;
  projectKey: string;
  issueTypeId?: string;
}

export interface GitHubConfig extends AuthCredentials {
  owner: string;
  repo: string;
  labels?: string[];
}

export interface LinearConfig extends AuthCredentials {
  teamId: string;
  workflowStateId?: string;
}

// Auto-fix detection strategies
export interface AutoFixDetectionConfig {
  labelMatching: string[]; // ['auto-fix', 'ai-fix', '🤖 auto-fix']
  customFields: Record<string, any>; // { autoFixEnabled: true }
  titlePrefixes: string[]; // ['[AUTO-FIX]', '[AI-FIX]']
  descriptionMarkers: string[]; // ['<!-- AUTO-FIX -->']
  projectSettings: {
    enableForAllBugs: boolean;
    enableForSeverity: string[];
  };
}
