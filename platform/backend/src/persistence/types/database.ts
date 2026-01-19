import type { ColumnType } from "kysely";

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
    | "azure"
    | "asana"
    | "trello"
    | "monday"
    | "clickup";
  credentials: Json;
  webhook_url: string | null;
  auto_fix_enabled: Generated<boolean>;
  auto_fix_tags: Generated<string[]>;
  custom_field_mappings: Generated<Json>;
  repository_url: string | null;
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
    | "azure"
    | "asana"
    | "trello"
    | "monday"
    | "clickup";
  auto_fix_requested: Generated<boolean>;
  auto_fix_status: "pending" | "in_progress" | "completed" | "failed" | null;
  pull_request_url: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface PMIntegrationsTable {
  id: Generated<string>;
  project_id: string;
  system:
    | "jira"
    | "linear"
    | "github"
    | "gitlab"
    | "azure"
    | "asana"
    | "trello"
    | "monday"
    | "clickup";
  config: Json;
  is_active: Generated<boolean>;
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
}

export interface Database {
  projects: ProjectsTable;
  media_assets: MediaAssetsTable;
  tickets: TicketsTable;
  pm_integrations: PMIntegrationsTable;
  webhook_events: WebhookEventsTable;
  auto_fix_queue: AutoFixQueueTable;
  deployment_strategies: DeploymentStrategiesTable;
  clanker_config_files: ClankerConfigFilesTable;
  clankers: ClankersTable;
  jobs: JobsTable;
}
