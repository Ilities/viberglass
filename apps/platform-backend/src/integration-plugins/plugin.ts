import type {
  AuthCredentialType,
  AuthCredentials,
  TicketSystem,
} from "@viberglass/types";
import type { PMIntegration } from "../models/PMIntegration";

export type IntegrationCategory = "scm" | "ticketing" | "inbound";

export type IntegrationFieldType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "secret";

export interface IntegrationFieldOption {
  label: string;
  value: string;
}

export interface IntegrationFieldDefinition {
  key: string;
  label: string;
  type: IntegrationFieldType;
  required?: boolean;
  description?: string;
  options?: IntegrationFieldOption[];
}

export interface IntegrationSupport {
  issues: boolean;
  webhooks?: boolean;
  pullRequests?: boolean;
}

export interface WebhookEventDefinition {
  name: string;
  description?: string;
}

export interface IntegrationPluginDefinition<Config = Record<string, unknown>> {
  id: TicketSystem;
  label: string;
  category: IntegrationCategory;
  authTypes: AuthCredentialType[];
  configFields: IntegrationFieldDefinition[];
  supports: IntegrationSupport;
  createIntegration: (config: AuthCredentials & Config) => PMIntegration;
  status?: "ready" | "stub";
  /** Webhook provider ID - if null, the integration doesn't support webhooks */
  webhookProvider?: string;
  /** Default inbound webhook events for this integration */
  defaultInboundEvents?: string[];
  /** Extract provider-specific project ID from integration config (e.g., "owner/repo" for GitHub) */
  getProviderProjectId?: (config: Record<string, unknown>) => string | null;
}
