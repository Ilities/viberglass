import { isClankerConfigV1, isObjectRecord } from "@viberglass/types";
import type { ForeignKey } from "../bundle/DatabaseSchema";
import { idValue, textValue, type Row } from "../bundle/jsonValues";

export interface SelectionContext {
  /** The spaces to export; null exports every space. */
  spaceIds: ReadonlySet<string> | null;
  excludedUserIds: ReadonlySet<string>;
  excludedTaskIds: ReadonlySet<string>;
  excludedJobIds: ReadonlySet<string>;
  excludedMessageIds: ReadonlySet<string>;
  /** Each job's space, for jobs no task points at. */
  jobProjects: ReadonlyMap<string, string>;
}

export interface KeptRows {
  /** The non-null values of a column across the rows kept so far. */
  values(table: string, column: string): ReadonlySet<string>;
}

export type ColumnRule = { drop: true } | { set: unknown } | { map: (value: unknown) => unknown };

export interface TablePolicy {
  keep?: (row: Row, context: SelectionContext) => boolean;
  /** Nullable references that drop the row, rather than clear, when the row they name isn't exported. */
  owners?: string[];
  /** Rows exported only while this holds against the rows kept so far, for links no foreign key covers. */
  keepWhile?: (row: Row, kept: KeptRows) => boolean;
  columns?: Record<string, ColumnRule>;
}

const DROP: ColumnRule = { drop: true };
const NULL: ColumnRule = { set: null };

const inSpaces = (column: string) => (row: Row, context: SelectionContext): boolean => {
  const id = idValue(row, column);
  return context.spaceIds === null || (id !== null && context.spaceIds.has(id));
};

function runnerConfig(value: unknown): unknown {
  if (!isClankerConfigV1(value)) return null;
  const agent: Record<string, unknown> = { type: value.agent.type };
  if (typeof value.agent.model === "string") agent.model = value.agent.model;
  return { version: 1, strategy: { type: value.strategy.type }, agent };
}

const PULL_REQUEST_URLS: Array<[string, string]> = [
  ["task_pull_requests", "url"],
  ["job_run_manifests", "pull_request_url"],
  ["app_previews", "pull_request_url"],
  ["agent_sessions", "draft_pull_request_url"],
];

const MEDIA_REFERENCES: Array<[string, string]> = [
  ["tickets", "screenshot_id"],
  ["tickets", "recording_id"],
  ["task_message_images", "media_id"],
];

const referencedBy = (references: Array<[string, string]>, column: string) => (row: Row, kept: KeptRows): boolean => {
  const value = textValue(row, column);
  return value !== null && references.some(([table, from]) => kept.values(table, from).has(value));
};

/** Ids an activity entry's payload names, and where each lives. */
const ACTIVITY_PAYLOAD_REFERENCES: ReadonlyArray<[string, string, string]> = [
  ["jobId", "jobs", "id"],
  ["questionId", "agent_pending_requests", "id"],
  ["messageId", "task_messages", "id"],
  ["commentId", "ticket_phase_document_comments", "id"],
  ["releaseId", "app_releases", "id"],
];

function activityReferencesKept(row: Row, kept: KeptRows): boolean {
  const payload = row.payload_json;
  if (!isObjectRecord(payload)) return true;
  return ACTIVITY_PAYLOAD_REFERENCES.every(([key, table, column]) => {
    const value = payload[key];
    return typeof value !== "string" || kept.values(table, column).has(value);
  });
}

/**
 * The only tables an export reads. A table missing here, a new one included,
 * is never exported.
 */
export const EXPORTED_TABLES: Readonly<Record<string, TablePolicy>> = {
  users: {
    keep: (row, context) => !context.excludedUserIds.has(idValue(row, "id") ?? ""),
    columns: { password_hash: DROP, avatar_url: NULL },
  },
  // Older installs still have the legacy `credentials` column.
  projects: { keep: inSpaces("id"), columns: { webhook_url: NULL, credentials: DROP } },
  space_members: {},
  integrations: { columns: { config: { set: {} } } },
  project_integrations: {},
  project_scm_configs: {},
  clankers: {
    columns: { deployment_config: { map: runnerConfig }, secret_bindings: { set: [] }, status_message: NULL },
  },
  model_endpoints: {
    keep: (row) => textValue(row, "source") !== "deployment",
    columns: { auth: { set: { scheme: "none" } }, secret_id: NULL, extra_headers: { set: {} } },
  },
  clanker_model_endpoints: {},
  media_assets: { keepWhile: referencedBy(MEDIA_REFERENCES, "id") },
  tickets: { keep: (row, context) => !context.excludedTaskIds.has(idValue(row, "id") ?? "") },
  task_participants: {},
  task_messages: { keep: (row, context) => !context.excludedMessageIds.has(idValue(row, "id") ?? "") },
  task_message_images: {},
  task_mentions: { owners: ["message_id", "agent_turn_id"] },
  task_reads: {},
  task_attention: {},
  task_summaries: {},
  task_activity: { keepWhile: activityReferencesKept },
  task_pull_requests: {},
  task_plan_part_marks: {},
  task_comparisons: {},
  task_comparison_arms: {},
  ticket_phase_documents: {},
  ticket_phase_document_revisions: {},
  ticket_phase_document_comments: {},
  ticket_phase_runs: {},
  agent_sessions: {},
  agent_turns: { owners: ["job_id", "task_message_id"] },
  agent_session_events: { owners: ["job_id", "turn_id"] },
  agent_pending_requests: { owners: ["answer_message_id"] },
  jobs: {
    keep: (row, context) => {
      if (textValue(row, "job_kind") === "agent_login") return false;
      if (context.excludedJobIds.has(idValue(row, "id") ?? "")) return false;
      const project = context.jobProjects.get(idValue(row, "id") ?? "");
      return context.spaceIds === null || (project !== undefined && context.spaceIds.has(project));
    },
    owners: ["ticket_id"],
    columns: { callback_token: DROP, bootstrap_payload: DROP },
  },
  job_progress_updates: {},
  job_log_lines: {},
  job_run_manifests: {},
  pull_request_outcomes: { keepWhile: referencedBy(PULL_REQUEST_URLS, "pull_request_url") },
  space_file_snapshots: {},
  space_file_changes: {},
  space_file_state: { columns: { lease_job_id: NULL, lease_expires_at: NULL, lease_operation_id: NULL } },
  space_file_runs: { columns: { lease_token: NULL } },
  artifacts: {},
  artifact_versions: {},
  apps: { columns: { credentials_expire_at: NULL } },
  app_releases: {},
  app_previews: {},
  app_data_backups: {},
  app_settings: { keep: (row) => row.secret_id === null || row.secret_id === undefined },
  app_access: {},
  claw_task_templates: { columns: { secret_bindings: { set: [] } } },
  claw_schedules: { columns: { webhook_config: NULL } },
  claw_executions: { columns: { webhook_delivery_status: NULL } },
};

/** References kept in plain columns without a foreign key; cleared when the row they name isn't exported. */
export const LOOSE_REFERENCES: readonly ForeignKey[] = [
  { table: "agent_sessions", column: "last_job_id", references: "jobs", referencedColumn: "id", nullable: true },
  { table: "agent_sessions", column: "last_turn_id", references: "agent_turns", referencedColumn: "id", nullable: true },
  { table: "agent_sessions", column: "latest_pending_request_id", references: "agent_pending_requests", referencedColumn: "id", nullable: true },
  { table: "agent_turns", column: "consumed_by_turn_id", references: "agent_turns", referencedColumn: "id", nullable: true },
  { table: "job_run_manifests", column: "ticket_id", references: "tickets", referencedColumn: "id", nullable: true },
];

/** Tables left out on purpose, so only tables nobody has looked at yet are reported. */
export const EXCLUDED_TABLES: ReadonlySet<string> = new Set([
  "secrets",
  "integration_credentials",
  "webhook_provider_configs",
  "webhook_delivery_attempts",
  "webhook_events",
  "user_sessions",
  "api_tokens",
  "invites",
  "password_reset_links",
  "audit_log",
  "clanker_config_files",
  "clanker_mcp_servers",
  "clanker_skills",
  "mcp_servers",
  "skills",
  "model_host_accounts",
  "model_deployments",
  "deployment_strategies",
  "prompt_templates",
  "workspace_settings",
  "tracker_issue_rules",
  "task_issue_links",
  "chat_ticket_threads",
  "user_chat_identities",
  "auto_fix_queue",
  "app_data_grants",
  "app_handoff_codes",
  "app_sessions",
  "demo_seed_records",
  "kysely_migration",
  "kysely_migration_lock",
]);

/**
 * What people and agents did, which the seed puts a day back from now. Other
 * times move with them but don't count: pollers and page views keep
 * refreshing them on a live instance.
 */
export const ACTIVITY_COLUMNS: ReadonlyArray<[string, string]> = [
  ["task_activity", "created_at"],
  ["task_messages", "created_at"],
  ["agent_turns", "created_at"],
  ["jobs", "created_at"],
  ["ticket_phase_document_revisions", "created_at"],
  ["app_releases", "created_at"],
];

/** Keys removed from every JSON value: signed links and conversation archives. */
export const STRIPPED_JSON_KEYS: ReadonlySet<string> = new Set(["accessUrl", "appDataCopy", "conversationStateUrl"]);

/** Object keys never exported, whatever points at them. */
export const EXCLUDED_OBJECT_PREFIXES: readonly RegExp[] = [/^conversation-state\//, /^spaces\/[^/]+\/ejected\//];
