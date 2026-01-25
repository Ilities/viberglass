import type {
  AuthCredentialType,
  AuthCredentials,
  TicketSystem,
} from "@viberglass/types";
import type { PMIntegration } from "../models/PMIntegration";

export type IntegrationCategory = "scm" | "ticketing";

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

export interface IntegrationPluginDefinition<Config = Record<string, unknown>> {
  id: TicketSystem;
  label: string;
  category: IntegrationCategory;
  authTypes: AuthCredentialType[];
  configFields: IntegrationFieldDefinition[];
  supports: IntegrationSupport;
  createIntegration: (config: AuthCredentials & Config) => PMIntegration;
  status?: "ready" | "stub";
}
