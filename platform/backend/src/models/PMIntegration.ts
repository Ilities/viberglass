import {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Project,
  Ticket,
  WebhookEvent,
} from "@viberator/types";

// Backend-specific interface for PM Integration implementations
export interface CustomFieldMapping {
  [key: string]: any;
}

export interface PMIntegration {
  // Authentication
  authenticate(credentials: AuthCredentials): Promise<void>;

  // Ticket operations
  createTicket(ticket: Ticket): Promise<ExternalTicket>;

  updateTicket(ticketId: string, updates: ExternalTicketUpdate): Promise<void>;

  getTicket(ticketId: string): Promise<ExternalTicket>;

  // Auto-fix tag detection
  hasAutoFixTag(ticket: ExternalTicket): boolean;

  // Custom field mapping
  mapCustomFields(ticket: Ticket): CustomFieldMapping;

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
