import { BugReport, TicketSystem } from './BugReport';

export interface AuthCredentials {
  type: 'api_key' | 'oauth' | 'basic' | 'token';
  apiKey?: string;
  username?: string;
  password?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  baseUrl?: string; // For on-premise installations
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority?: string;
  assignee?: string;
  labels: string[];
  customFields: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  url: string;
  projectKey?: string;
  repositoryUrl?: string;
}

export interface TicketUpdate {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  customFields?: Record<string, any>;
  comment?: string;
}

export interface CustomFieldMapping {
  [key: string]: any;
}

export interface WebhookEvent {
  type: 'ticket_created' | 'ticket_updated' | 'ticket_deleted' | 'comment_added';
  ticketId: string;
  ticket: Ticket;
  changes?: Record<string, any>;
  timestamp: Date;
  source: TicketSystem;
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

export interface ProjectConfig {
  id: string;
  name: string;
  ticketSystem: TicketSystem;
  credentials: AuthCredentials;
  webhookUrl?: string;
  autoFixEnabled: boolean;
  autoFixTags: string[];
  customFieldMappings: Record<string, string>;
  repositoryUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

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