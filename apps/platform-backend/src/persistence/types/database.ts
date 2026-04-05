import type { ColumnType } from "kysely";
import type { TicketWorkflowPhase } from "@viberglass/types";
import type {
  AgentPendingRequestStatus,
  AgentPendingRequestType,
  AgentSessionEventType,
  AgentSessionMode,
  AgentSessionStatus,
  AgentTurnRole,
  AgentTurnStatus,
} from "../../types/agentSession";
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
  credentials: Json | null;
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
  ticket_status: Generated<"open" | "in_progress" | "in_review" | "resolved">;
  workflow_phase: Generated<"research" | "planning" | "execution">;
  workflow_override_reason: string | null;
  workflow_overridden_at: Timestamp | null;
  workflow_overridden_by: string | null;
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
  job_kind: Generated<"research" | "planning" | "execution" | "claw">;
  agent_session_id: string | null;
  agent_turn_id: string | null;
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
  approval_state: Generated<
    "draft" | "approval_requested" | "approved" | "rejected"
  >;
  approved_at: Timestamp | null;
  approved_by: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface TicketPhaseApprovalsTable {
  id: Generated<string>;
  ticket_id: string;
  phase: "research" | "planning" | "execution";
  action: "approval_requested" | "approved" | "rejected" | "revoked";
  actor: string | null;
  comment: string | null;
  created_at: Generated<Timestamp>;
}

export interface TicketPhaseRunsTable {
  id: Generated<string>;
  ticket_id: string;
  phase: TicketWorkflowPhase;
  job_id: string;
  clanker_id: string;
  created_at: Generated<Timestamp>;
}

export interface TicketPhaseDocumentRevisionsTable {
  id: Generated<string>;
  document_id: string;
  ticket_id: string;
  phase: TicketWorkflowPhase;
  content: string;
  source: "manual" | "agent";
  actor: string | null;
  created_at: Generated<Timestamp>;
}

export interface TicketPhaseDocumentCommentsTable {
  id: Generated<string>;
  document_id: string;
  ticket_id: string;
  phase: "research" | "planning";
  line_number: number;
  content: string;
  status: Generated<"open" | "resolved">;
  actor: string | null;
  resolved_at: Timestamp | null;
  resolved_by: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ClawTaskTemplatesTable {
  id: Generated<string>;
  project_id: string;
  name: string;
  description: string | null;
  clanker_id: string;
  task_instructions: string;
  config: Json;
  secret_ids: Generated<Json>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ClawSchedulesTable {
  id: Generated<string>;
  project_id: string;
  task_template_id: string;
  name: string;
  description: string | null;
  schedule_type: Generated<"interval" | "cron">;
  interval_expression: string | null;
  cron_expression: string | null;
  timezone: Generated<string>;
  is_active: Generated<boolean>;
  last_run_at: Timestamp | null;
  next_run_at: Timestamp | null;
  run_count: Generated<bigint>;
  failure_count: Generated<bigint>;
  webhook_config: Json | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
}

export interface ClawExecutionsTable {
  id: Generated<string>;
  schedule_id: string;
  job_id: string | null;
  status: Generated<"pending" | "running" | "completed" | "failed" | "cancelled">;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  error_message: string | null;
  result: Json | null;
  webhook_delivery_status: Json | null;
  created_at: Generated<Timestamp>;
}

export interface AgentSessionsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string;
  ticket_id: string;
  clanker_id: string;
  mode: AgentSessionMode;
  status: Generated<AgentSessionStatus>;
  title: string | null;
  repository: string | null;
  base_branch: string | null;
  workspace_branch: string | null;
  draft_pull_request_url: string | null;
  head_commit_hash: string | null;
  last_job_id: string | null;
  last_turn_id: string | null;
  latest_pending_request_id: string | null;
  metadata_json: Json | null;
  created_by: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  completed_at: Timestamp | null;
}

export interface AgentTurnsTable {
  id: Generated<string>;
  session_id: string;
  role: AgentTurnRole;
  status: Generated<AgentTurnStatus>;
  sequence: number;
  content_markdown: string | null;
  content_json: Json | null;
  job_id: string | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface AgentSessionEventsTable {
  id: Generated<string>;
  session_id: string;
  turn_id: string | null;
  job_id: string | null;
  sequence: number | string;
  event_type: AgentSessionEventType;
  payload_json: Json;
  created_at: Generated<Timestamp>;
}

export interface PromptTemplatesTable {
  id: Generated<string>;
  prompt_type: string;
  project_id: string | null;
  template: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface AgentPendingRequestsTable {
  id: Generated<string>;
  session_id: string;
  turn_id: string | null;
  job_id: string | null;
  request_type: AgentPendingRequestType;
  status: Generated<AgentPendingRequestStatus>;
  prompt_markdown: string;
  request_json: Json | null;
  response_json: Json | null;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ChatSessionThreadsTable {
  id: Generated<string>;
  session_id: string;
  thread_id: string;
  channel_id: string;
  adapter_name: string;
  created_at: Generated<Timestamp>;
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
  ticket_phase_runs: TicketPhaseRunsTable;
  ticket_phase_approvals: TicketPhaseApprovalsTable;
  ticket_phase_document_revisions: TicketPhaseDocumentRevisionsTable;
  ticket_phase_document_comments: TicketPhaseDocumentCommentsTable;
  claw_task_templates: ClawTaskTemplatesTable;
  claw_schedules: ClawSchedulesTable;
  claw_executions: ClawExecutionsTable;
  agent_sessions: AgentSessionsTable;
  agent_turns: AgentTurnsTable;
  agent_session_events: AgentSessionEventsTable;
  agent_pending_requests: AgentPendingRequestsTable;
  prompt_templates: PromptTemplatesTable;
  chat_session_threads: ChatSessionThreadsTable;
}
