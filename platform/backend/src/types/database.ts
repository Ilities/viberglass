import type { ColumnType } from 'kysely';

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
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

export interface BugReportsTable {
  id: Generated<string>;
  project_id: string;
  timestamp: Timestamp;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  metadata: Json;
  screenshot_id: string | null;
  screenshot_filename: string | null;
  screenshot_mime_type: string | null;
  screenshot_size: number | null;
  screenshot_url: string | null;
  screenshot_uploaded_at: Timestamp | null;
  recording_id: string | null;
  recording_filename: string | null;
  recording_mime_type: string | null;
  recording_size: number | null;
  recording_url: string | null;
  recording_uploaded_at: Timestamp | null;
  annotations: Json;
  ticket_id: string | null;
  ticket_url: string | null;
  ticket_system: 'jira' | 'linear' | 'github' | 'gitlab' | 'azure' | 'asana' | 'trello' | 'monday' | 'clickup';
  auto_fix_requested: boolean;
  auto_fix_status: 'pending' | 'in_progress' | 'completed' | 'failed' | null;
  pull_request_url: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface PMIntegrationsTable {
  id: Generated<string>;
  project_id: string;
  system: 'jira' | 'linear' | 'github' | 'gitlab' | 'azure' | 'asana' | 'trello' | 'monday' | 'clickup';
  config: Json;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface Database {
  bug_reports: BugReportsTable;
  pm_integrations: PMIntegrationsTable;
}
