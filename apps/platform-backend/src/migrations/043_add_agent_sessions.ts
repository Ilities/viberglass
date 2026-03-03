import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("agent_sessions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("project_id", "uuid", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("ticket_id", "uuid", (col) =>
      col.notNull().references("tickets.id").onDelete("cascade"),
    )
    .addColumn("clanker_id", "uuid", (col) =>
      col.notNull().references("clankers.id"),
    )
    .addColumn("mode", "varchar(20)", (col) => col.notNull())
    .addColumn("status", "varchar(32)", (col) =>
      col.notNull().defaultTo("active"),
    )
    .addColumn("title", "varchar(255)")
    .addColumn("repository", "varchar(512)")
    .addColumn("base_branch", "varchar(255)")
    .addColumn("workspace_branch", "varchar(255)")
    .addColumn("draft_pull_request_url", "varchar(2048)")
    .addColumn("head_commit_hash", "varchar(64)")
    .addColumn("last_job_id", "varchar(255)")
    .addColumn("last_turn_id", "uuid")
    .addColumn("latest_pending_request_id", "uuid")
    .addColumn("metadata_json", "jsonb")
    .addColumn("created_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("completed_at", "timestamptz")
    .execute();

  await sql`
    ALTER TABLE agent_sessions
    ADD CONSTRAINT agent_sessions_mode_check
    CHECK (mode IN ('research', 'planning', 'execution'))
  `.execute(db);

  await sql`
    ALTER TABLE agent_sessions
    ADD CONSTRAINT agent_sessions_status_check
    CHECK (
      status IN (
        'active',
        'waiting_on_user',
        'waiting_on_approval',
        'completed',
        'failed',
        'cancelled'
      )
    )
  `.execute(db);

  await db.schema
    .createIndex("idx_agent_sessions_ticket_created")
    .on("agent_sessions")
    .columns(["ticket_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_agent_sessions_project_status_updated")
    .on("agent_sessions")
    .columns(["project_id", "status", "updated_at"])
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_agent_sessions_ticket_mode_active
    ON agent_sessions (ticket_id, mode)
    WHERE status IN ('active', 'waiting_on_user', 'waiting_on_approval')
  `.execute(db);

  await db.schema
    .createTable("agent_turns")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("session_id", "uuid", (col) =>
      col.notNull().references("agent_sessions.id").onDelete("cascade"),
    )
    .addColumn("role", "varchar(20)", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("queued"),
    )
    .addColumn("sequence", "integer", (col) => col.notNull())
    .addColumn("content_markdown", "text")
    .addColumn("content_json", "jsonb")
    .addColumn("job_id", "varchar(255)", (col) =>
      col.references("jobs.id").onDelete("set null"),
    )
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE agent_turns
    ADD CONSTRAINT agent_turns_role_check
    CHECK (role IN ('user', 'assistant', 'system'))
  `.execute(db);

  await sql`
    ALTER TABLE agent_turns
    ADD CONSTRAINT agent_turns_status_check
    CHECK (
      status IN ('queued', 'running', 'blocked', 'completed', 'failed', 'cancelled')
    )
  `.execute(db);

  await sql`
    ALTER TABLE agent_turns
    ADD CONSTRAINT agent_turns_sequence_check
    CHECK (sequence > 0)
  `.execute(db);

  await db.schema
    .createIndex("uq_agent_turns_session_sequence")
    .on("agent_turns")
    .columns(["session_id", "sequence"])
    .unique()
    .execute();

  await db.schema
    .createIndex("uq_agent_turns_job_id")
    .on("agent_turns")
    .column("job_id")
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_agent_turns_session_created")
    .on("agent_turns")
    .columns(["session_id", "created_at"])
    .execute();

  await db.schema
    .createTable("agent_session_events")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("session_id", "uuid", (col) =>
      col.notNull().references("agent_sessions.id").onDelete("cascade"),
    )
    .addColumn("turn_id", "uuid", (col) =>
      col.references("agent_turns.id").onDelete("set null"),
    )
    .addColumn("job_id", "varchar(255)", (col) =>
      col.references("jobs.id").onDelete("set null"),
    )
    .addColumn("sequence", "bigint", (col) => col.notNull())
    .addColumn("event_type", "varchar(64)", (col) => col.notNull())
    .addColumn("payload_json", "jsonb", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE agent_session_events
    ADD CONSTRAINT agent_session_events_sequence_check
    CHECK (sequence > 0)
  `.execute(db);

  await sql`
    ALTER TABLE agent_session_events
    ADD CONSTRAINT agent_session_events_type_check
    CHECK (
      event_type IN (
        'session_started',
        'turn_started',
        'user_message',
        'assistant_message',
        'progress',
        'reasoning',
        'tool_call_started',
        'tool_call_completed',
        'needs_input',
        'needs_approval',
        'approval_resolved',
        'artifact_updated',
        'turn_completed',
        'turn_failed',
        'session_completed',
        'session_failed'
      )
    )
  `.execute(db);

  await db.schema
    .createIndex("uq_agent_session_events_session_sequence")
    .on("agent_session_events")
    .columns(["session_id", "sequence"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_agent_session_events_session_created")
    .on("agent_session_events")
    .columns(["session_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_agent_session_events_job_created")
    .on("agent_session_events")
    .columns(["job_id", "created_at"])
    .execute();

  await db.schema
    .createTable("agent_pending_requests")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("session_id", "uuid", (col) =>
      col.notNull().references("agent_sessions.id").onDelete("cascade"),
    )
    .addColumn("turn_id", "uuid", (col) =>
      col.references("agent_turns.id").onDelete("set null"),
    )
    .addColumn("job_id", "varchar(255)", (col) =>
      col.references("jobs.id").onDelete("set null"),
    )
    .addColumn("request_type", "varchar(32)", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("open"),
    )
    .addColumn("prompt_markdown", "text", (col) => col.notNull())
    .addColumn("request_json", "jsonb")
    .addColumn("response_json", "jsonb")
    .addColumn("resolved_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("resolved_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE agent_pending_requests
    ADD CONSTRAINT agent_pending_requests_type_check
    CHECK (request_type IN ('input', 'approval'))
  `.execute(db);

  await sql`
    ALTER TABLE agent_pending_requests
    ADD CONSTRAINT agent_pending_requests_status_check
    CHECK (status IN ('open', 'resolved', 'expired', 'cancelled'))
  `.execute(db);

  await db.schema
    .createIndex("idx_agent_pending_requests_session_status_created")
    .on("agent_pending_requests")
    .columns(["session_id", "status", "created_at"])
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_agent_pending_requests_session_open
    ON agent_pending_requests (session_id)
    WHERE status = 'open'
  `.execute(db);

  await db.schema
    .alterTable("jobs")
    .addColumn("agent_session_id", "uuid", (col) =>
      col.references("agent_sessions.id").onDelete("set null"),
    )
    .addColumn("agent_turn_id", "uuid", (col) =>
      col.references("agent_turns.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createIndex("idx_jobs_agent_session_created")
    .on("jobs")
    .columns(["agent_session_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_jobs_agent_turn_id")
    .on("jobs")
    .column("agent_turn_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("idx_jobs_agent_session_created").ifExists().execute();
  await db.schema.dropIndex("idx_jobs_agent_turn_id").ifExists().execute();

  await db.schema
    .alterTable("jobs")
    .dropColumn("agent_session_id")
    .dropColumn("agent_turn_id")
    .execute();

  await sql`DROP INDEX IF EXISTS uq_agent_pending_requests_session_open`.execute(db);
  await db.schema.dropTable("agent_pending_requests").execute();

  await db.schema.dropTable("agent_session_events").execute();
  await db.schema.dropTable("agent_turns").execute();

  await sql`DROP INDEX IF EXISTS uq_agent_sessions_ticket_mode_active`.execute(db);
  await db.schema.dropTable("agent_sessions").execute();
}
