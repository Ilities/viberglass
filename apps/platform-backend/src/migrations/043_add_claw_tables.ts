import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Create claw_task_templates table
  await db.schema
    .createTable("claw_task_templates")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("project_id", "uuid", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("clanker_id", "uuid", (col) =>
      col.notNull().references("clankers.id").onDelete("restrict"),
    )
    .addColumn("task_instructions", "text", (col) => col.notNull())
    .addColumn("config", "jsonb", (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("claw_task_templates_project_name_unique", ["project_id", "name"])
    .execute();

  // Create claw_schedules table
  await db.schema
    .createTable("claw_schedules")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("project_id", "uuid", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("task_template_id", "uuid", (col) =>
      col.notNull().references("claw_task_templates.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("schedule_type", "varchar(20)", (col) =>
      col.notNull().check(sql`schedule_type IN ('interval', 'cron')`),
    )
    .addColumn("interval_expression", "text")
    .addColumn("cron_expression", "text")
    .addColumn("timezone", "varchar(50)", (col) => col.defaultTo(sql`'UTC'`))
    .addColumn("is_active", "boolean", (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn("last_run_at", "timestamp")
    .addColumn("next_run_at", "timestamp")
    .addColumn("run_count", "bigint", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("failure_count", "bigint", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("webhook_config", "jsonb")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("created_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addUniqueConstraint("claw_schedules_project_name_unique", ["project_id", "name"])
    .execute();

  // Create claw_executions table
  await db.schema
    .createTable("claw_executions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("schedule_id", "uuid", (col) =>
      col.notNull().references("claw_schedules.id").onDelete("cascade"),
    )
    .addColumn("job_id", "varchar(255)", (col) =>
      col.references("jobs.id").onDelete("set null"),
    )
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().check(sql`status IN ('pending', 'running', 'completed', 'failed', 'cancelled')`),
    )
    .addColumn("started_at", "timestamp")
    .addColumn("completed_at", "timestamp")
    .addColumn("error_message", "text")
    .addColumn("result", "jsonb")
    .addColumn("webhook_delivery_status", "jsonb")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create indexes for claw_task_templates
  await db.schema
    .createIndex("idx_claw_task_templates_project_id")
    .on("claw_task_templates")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("idx_claw_task_templates_clanker_id")
    .on("claw_task_templates")
    .column("clanker_id")
    .execute();

  // Create indexes for claw_schedules
  await db.schema
    .createIndex("idx_claw_schedules_project_id")
    .on("claw_schedules")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("idx_claw_schedules_task_template_id")
    .on("claw_schedules")
    .column("task_template_id")
    .execute();

  await db.schema
    .createIndex("idx_claw_schedules_is_active")
    .on("claw_schedules")
    .column("is_active")
    .execute();

  await db.schema
    .createIndex("idx_claw_schedules_next_run_at")
    .on("claw_schedules")
    .column("next_run_at")
    .execute();

  // Create indexes for claw_executions
  await db.schema
    .createIndex("idx_claw_executions_schedule_id")
    .on("claw_executions")
    .column("schedule_id")
    .execute();

  await db.schema
    .createIndex("idx_claw_executions_status")
    .on("claw_executions")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_claw_executions_created_at")
    .on("claw_executions")
    .column("created_at")
    .execute();

  // Create updated_at triggers
  await sql`CREATE TRIGGER update_claw_task_templates_updated_at BEFORE UPDATE ON claw_task_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db,
  );

  await sql`CREATE TRIGGER update_claw_schedules_updated_at BEFORE UPDATE ON claw_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db,
  );

  // Update jobs table to include 'claw' as a valid job_kind
  // First, drop the existing check constraint
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check;`.execute(db);

  // Add the updated check constraint with 'claw' included
  await sql`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN ('research', 'planning', 'execution', 'claw'));`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop triggers
  await sql`DROP TRIGGER IF EXISTS update_claw_task_templates_updated_at ON claw_task_templates;`.execute(
    db,
  );

  await sql`DROP TRIGGER IF EXISTS update_claw_schedules_updated_at ON claw_schedules;`.execute(
    db,
  );

  // Drop claw_executions table (first due to foreign key)
  await db.schema.dropTable("claw_executions").execute();

  // Drop claw_schedules table
  await db.schema.dropTable("claw_schedules").execute();

  // Drop claw_task_templates table
  await db.schema.dropTable("claw_task_templates").execute();

  // Revert jobs table job_kind check constraint
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check;`.execute(db);
  await sql`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN ('research', 'planning', 'execution'));`.execute(db);
}
