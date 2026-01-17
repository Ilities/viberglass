import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create projects table
  await db.schema
    .createTable('projects')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('slug', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('ticket_system', 'varchar(50)', (col) =>
      col.notNull().check(sql`ticket_system IN ('jira', 'linear', 'github', 'gitlab', 'azure', 'asana', 'trello', 'monday', 'clickup')`)
    )
    .addColumn('credentials', 'jsonb', (col) => col.notNull())
    .addColumn('webhook_url', 'varchar(500)')
    .addColumn('auto_fix_enabled', 'boolean', (col) => col.defaultTo(false))
    .addColumn('auto_fix_tags', sql`text[]`, (col) => col.defaultTo(sql`'{}'`))
    .addColumn('custom_field_mappings', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('repository_url', 'varchar(500)')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create media_assets table
  await db.schema
    .createTable('media_assets')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('filename', 'varchar(255)', (col) => col.notNull())
    .addColumn('mime_type', 'varchar(100)', (col) => col.notNull())
    .addColumn('size', 'bigint', (col) => col.notNull())
    .addColumn('url', 'varchar(1000)', (col) => col.notNull())
    .addColumn('uploaded_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create bug_reports table
  await db.schema
    .createTable('bug_reports')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('project_id', 'uuid', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('timestamp', 'timestamp', (col) => col.notNull())
    .addColumn('title', 'varchar(500)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('severity', 'varchar(20)', (col) =>
      col.notNull().check(sql`severity IN ('low', 'medium', 'high', 'critical')`)
    )
    .addColumn('category', 'varchar(100)', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.notNull())
    .addColumn('screenshot_id', 'uuid', (col) =>
      col.notNull().references('media_assets.id')
    )
    .addColumn('recording_id', 'uuid', (col) =>
      col.references('media_assets.id')
    )
    .addColumn('annotations', 'jsonb', (col) => col.defaultTo('[]'))
    .addColumn('ticket_id', 'varchar(255)')
    .addColumn('ticket_url', 'varchar(1000)')
    .addColumn('ticket_system', 'varchar(50)', (col) =>
      col.notNull().check(sql`ticket_system IN ('jira', 'linear', 'github', 'gitlab', 'azure', 'asana', 'trello', 'monday', 'clickup')`)
    )
    .addColumn('auto_fix_requested', 'boolean', (col) => col.defaultTo(false))
    .addColumn('auto_fix_status', 'varchar(20)', (col) =>
      col.check(sql`auto_fix_status IN ('pending', 'in_progress', 'completed', 'failed')`)
    )
    .addColumn('pull_request_url', 'varchar(1000)')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create pm_integrations table (Keeping this as it might be used in the code, though not in database.sql)
  await db.schema
    .createTable('pm_integrations')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('project_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('system', 'varchar(50)', (col) => col.notNull())
    .addColumn('config', 'jsonb', (col) => col.notNull())
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create webhook_events table
  await db.schema
    .createTable('webhook_events')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('project_id', 'uuid', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('event_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('ticket_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('processed', 'boolean', (col) => col.defaultTo(false))
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('processed_at', 'timestamp')
    .execute();

  // Create auto_fix_queue table
  await db.schema
    .createTable('auto_fix_queue')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('bug_report_id', 'uuid', (col) =>
      col.notNull().references('bug_reports.id').onDelete('cascade')
    )
    .addColumn('ticket_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('status', 'varchar(20)', (col) =>
      col.defaultTo('pending').check(sql`status IN ('pending', 'in_progress', 'completed', 'failed')`)
    )
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('started_at', 'timestamp')
    .addColumn('completed_at', 'timestamp')
    .execute();

  // Indexes
  await db.schema.createIndex('idx_bug_reports_project_id').on('bug_reports').column('project_id').execute();
  await db.schema.createIndex('idx_bug_reports_timestamp').on('bug_reports').column('timestamp').execute();
  await db.schema.createIndex('idx_bug_reports_ticket_id').on('bug_reports').column('ticket_id').execute();
  await db.schema.createIndex('idx_bug_reports_auto_fix_status').on('bug_reports').column('auto_fix_status').execute();
  await db.schema.createIndex('idx_webhook_events_processed').on('webhook_events').columns(['processed', 'created_at']).execute();
  await db.schema.createIndex('idx_auto_fix_queue_status').on('auto_fix_queue').columns(['status', 'created_at']).execute();
  await db.schema.createIndex('pm_integrations_project_id_idx').on('pm_integrations').column('project_id').execute();
  await db.schema.createIndex('pm_integrations_system_idx').on('pm_integrations').column('system').execute();
  await db.schema.createIndex('pm_integrations_project_system_unique').on('pm_integrations').columns(['project_id', 'system']).unique().execute();

  // Triggers
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `.execute(db);

  await sql`CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(db);
  await sql`CREATE TRIGGER update_bug_reports_updated_at BEFORE UPDATE ON bug_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(db);
  await sql`CREATE TRIGGER update_pm_integrations_updated_at BEFORE UPDATE ON pm_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS update_pm_integrations_updated_at ON pm_integrations;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_bug_reports_updated_at ON bug_reports;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;`.execute(db);
  await sql`DROP FUNCTION IF EXISTS update_updated_at_column();`.execute(db);

  await db.schema.dropTable('auto_fix_queue').execute();
  await db.schema.dropTable('webhook_events').execute();
  await db.schema.dropTable('pm_integrations').execute();
  await db.schema.dropTable('bug_reports').execute();
  await db.schema.dropTable('media_assets').execute();
  await db.schema.dropTable('projects').execute();
}
