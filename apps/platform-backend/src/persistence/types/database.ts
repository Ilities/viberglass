import type { ColumnType } from "kysely";
import type { UserRole } from "./user";

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type Json = ColumnType<JsonValue, string, string>;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [K in string]?: JsonValue;
};

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export interface ProjectsTable {
  id: Generated<string>;
  name: string;
  slug: string;
  ticket_system:
    | "jira"
    | "linear"
    | "github"
    | "gitlab"
    | "bitbucket"
    | "azure"
    | "asana"
    | "trello"
    | "monday"
    | "clickup"
    | "shortcut"
    | "slack"
    | "custom";
  credentials: Json;
  webhook_url: string | null;
  auto_fix_enabled: Generated<boolean>;
  auto_fix_tags: Generated<string[]>;
  custom_field_mappings: Generated<Json>;
  repository_url: string | null;
  repository_urls: Generated<string[]>;
  agent_instructions: string | null;
  primary_ticketing_integration_id: string | null;
  primary_scm_integration_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface MediaAssetsTable {
  id: Generated<string>;
  filename: string;
  mime_type: string;
  size: number | string; // bigint can be returned as string by pg
  url: string;
  uploaded_at: Generated<Timestamp>;
}

export interface TicketsTable {
  id: Generated<string>;
  project_id: string;
  timestamp: Timestamp;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  metadata: Json;
  screenshot_id: string | null;
  recording_id: string | null;
  annotations: Generated<Json>;
  external_ticket_id: string | null;
  external_ticket_url: string | null;
  ticket_system:
    | 2
    | "jira"
    | "linear"
    | "github"
    | "gitlab"
    | "bitbucket"
    | "azure"
    | "asana"
    | "trello"
    | "monday"
    | "clickup"
    | "shortcut"
    | "slack"
    | "custom";
  auto_fix_requested: Generated<boolean>;
  auto_fix_status: "pending" | "in_progress" | "completed" | "failed" | null;
  ticket_status: Generated<"open" | "in_progress" | "resolved">;
  workflow_phase: Generated<"research" | "planning" | "execution">;
  archived_at: Timestamp | null;
  pull_request_url: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface IntegrationsTable {
  id: Generated<string>;
  name: string;
  system:
    | "jira"
    | "linear"
    | "github"
    | "gitlab"
    | "bitbucket"
    | "azure"
    | "asana"
    | "trello"
    | "monday"
    | "clickup"
    | "shortcut"
    | "slack"
    | "custom";
  config: Json;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ProjectIntegrationsTable {
  id: Generated<string>;
  project_id: string;
  integration_id: string;
  is_primary: Generated<boolean>;
  created_at: Generated<Timestamp>;
}

export interface IntegrationCredentialsTable {
  id: Generated<string>;
  integration_id: string;
  name: string;
  credential_type: "token" | "ssh_key" | "oauth" | "basic";
  secret_id: string;
  is_default: Generated<boolean>;
  description: string | null;
  expires_at: Timestamp | null;
  last_used_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ProjectScmConfigsTable {
  id: Generated<string>;
  project_id: string;
  integration_id: string;
  source_repository: string;
  base_branch: Generated<string>;
  pr_repository: string | null;
  pr_base_branch: string | null;
  branch_name_template: string | null;
  credential_secret_id: string | null;
  integration_credential_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface WebhookEventsTable {
  id: Generated<string>;
  project_id: string;
  event_type: string;
  ticket_id: string;
  payload: Json;
  processed: Generated<boolean>;
  error_message: string | null;
  created_at: Generated<Timestamp>;
  processed_at: Timestamp | null;
}

export interface AutoFixQueueTable {
  id: Generated<string>;
  ticket_ref_id: string;
  ticket_id: string;
  status: Generated<"pending" | "in_progress" | "completed" | "failed">;
  error_message: string | null;
  created_at: Generated<Timestamp>;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
}

export interface DeploymentStrategiesTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  config_schema: Json | null;
  created_at: Generated<Timestamp>;
}

export interface ClankerConfigFilesTable {
  id: Generated<string>;
  clanker_id: string;
  file_type: string;
  content: string;
  storage_url: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ClankersTable {
  id: Generated<string>;
  name: string;
  slug: string;
  description: string | null;
  deployment_strategy_id: string | null;
  deployment_config: Json | null;
  agent: string | null;
  secret_ids: Generated<Json>;
  status: Generated<"active" | "inactive" | "deploying" | "failed">;
  status_message: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface JobsTable {
  id: string;
  tenant_id: string;
  repository: string;
  task: string;
  branch: string | null;
  base_branch: string | null;
  context: Json | null;
  settings: Json | null;
  status: Generated<"queued" | "active" | "completed" | "failed">;
  progress: Json | null;
  result: Json | null;
  error_message: string | null;
  created_at: Generated<Timestamp>;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  ticket_id: string | null;
  clanker_id: string | null;
  last_heartbeat: Generated<Timestamp> | null;
  last_heartbeat_grace_period_seconds: Generated<number>;
  callback_token: Generated<string>;
  bootstrap_payload: Json | null;
}

export interface JobProgressUpdatesTable {
  id: Generated<string>;
  job_id: string;
  step: string | null;
  message: string;
  details: Json | null;
  created_at: Generated<Timestamp>;
}

export interface JobLogLinesTable {
  id: Generated<string>;
  job_id: string;
  level: "debug" | "error" | "info" | "warn";
  message: string;
  source: string | null;
  created_at: Generated<Timestamp>;
}

export interface WebhookProviderConfigsTable {
  id: Generated<string>;
  project_id: string | null;
  provider: "github" | "jira" | "shortcut" | "custom";
  direction: Generated<"inbound" | "outbound">;
  provider_project_id: string | null;
  integration_id: string | null;
  secret_location: "database" | "ssm" | "env";
  secret_path: string | null;
  webhook_secret_encrypted: string | null;
  api_token_encrypted: string | null;
  allowed_events: Generated<string[]>;
  auto_execute: Generated<boolean>;
  bot_username: string | null;
  label_mappings: Generated<JsonObject>;
  outbound_target_config: JsonObject | null;
  active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface WebhookDeliveryAttemptsTable {
  id: Generated<string>;
  provider: "github" | "jira" | "shortcut" | "custom";
  webhook_config_id: string | null;
  delivery_id: string;
  event_type: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  error_message: string | null;
  payload: Json;
  project_id: string | null;
  ticket_id: string | null;
  created_at: Generated<Timestamp>;
  processed_at: Timestamp | null;
}

export interface SecretsTable {
  id: Generated<string>;
  name: string;
  secret_location: "env" | "database" | "ssm";
  secret_path: string | null;
  secret_value_encrypted: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  password_hash: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface UserSessionsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  created_at: Generated<Timestamp>;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
}

export interface UserProjectsTable {
  id: Generated<string>;
  user_id: string;
  project_id: string;
  role: string;
  created_at: Generated<Timestamp>;
  updated_at: Timestamp | null;
}

export interface TicketPhaseDocumentsTable {
  id: Generated<string>;
  ticket_id: string;
  phase: "research" | "planning" | "execution";
  content: Generated<string>;
  storage_url: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface Database {
  projects: ProjectsTable;
  media_assets: MediaAssetsTable;
  tickets: TicketsTable;
  integrations: IntegrationsTable;
  project_integrations: ProjectIntegrationsTable;
  integration_credentials: IntegrationCredentialsTable;
  project_scm_configs: ProjectScmConfigsTable;
  webhook_events: WebhookEventsTable;
  auto_fix_queue: AutoFixQueueTable;
  deployment_strategies: DeploymentStrategiesTable;
  clanker_config_files: ClankerConfigFilesTable;
  clankers: ClankersTable;
  jobs: JobsTable;
  job_progress_updates: JobProgressUpdatesTable;
  job_log_lines: JobLogLinesTable;
  webhook_provider_configs: WebhookProviderConfigsTable;
  webhook_delivery_attempts: WebhookDeliveryAttemptsTable;
  secrets: SecretsTable;
  users: UsersTable;
  user_sessions: UserSessionsTable;
  user_projects: UserProjectsTable;
  ticket_phase_documents: TicketPhaseDocumentsTable;
}
