import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create bug_reports table
  await db.schema
    .createTable('bug_reports')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('project_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('timestamp', 'timestamp', (col) => col.notNull())
    .addColumn('title', 'varchar(500)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('severity', 'varchar(50)', (col) => col.notNull())
    .addColumn('category', 'varchar(255)', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.notNull())
    .addColumn('screenshot_id', 'varchar(255)')
    .addColumn('screenshot_filename', 'varchar(500)')
    .addColumn('screenshot_mime_type', 'varchar(100)')
    .addColumn('screenshot_size', 'integer')
    .addColumn('screenshot_url', 'text')
    .addColumn('screenshot_uploaded_at', 'timestamp')
    .addColumn('recording_id', 'varchar(255)')
    .addColumn('recording_filename', 'varchar(500)')
    .addColumn('recording_mime_type', 'varchar(100)')
    .addColumn('recording_size', 'integer')
    .addColumn('recording_url', 'text')
    .addColumn('recording_uploaded_at', 'timestamp')
    .addColumn('annotations', 'jsonb', (col) => col.notNull().defaultTo('[]'))
    .addColumn('ticket_id', 'varchar(255)')
    .addColumn('ticket_url', 'text')
    .addColumn('ticket_system', 'varchar(50)', (col) => col.notNull())
    .addColumn('auto_fix_requested', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('auto_fix_status', 'varchar(50)')
    .addColumn('pull_request_url', 'text')
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Create indexes for bug_reports
  await db.schema
    .createIndex('bug_reports_project_id_idx')
    .on('bug_reports')
    .column('project_id')
    .execute();

  await db.schema
    .createIndex('bug_reports_created_at_idx')
    .on('bug_reports')
    .column('created_at')
    .execute();

  await db.schema
    .createIndex('bug_reports_severity_idx')
    .on('bug_reports')
    .column('severity')
    .execute();

  // Create pm_integrations table
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

  // Create indexes for pm_integrations
  await db.schema
    .createIndex('pm_integrations_project_id_idx')
    .on('pm_integrations')
    .column('project_id')
    .execute();

  await db.schema
    .createIndex('pm_integrations_system_idx')
    .on('pm_integrations')
    .column('system')
    .execute();

  // Create unique constraint on project_id + system
  await db.schema
    .createIndex('pm_integrations_project_system_unique')
    .on('pm_integrations')
    .columns(['project_id', 'system'])
    .unique()
    .execute();

  // Create updated_at trigger function
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `.execute(db);

  // Create triggers for updated_at
  await sql`
    CREATE TRIGGER update_bug_reports_updated_at BEFORE UPDATE ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `.execute(db);

  await sql`
    CREATE TRIGGER update_pm_integrations_updated_at BEFORE UPDATE ON pm_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop triggers
  await sql`DROP TRIGGER IF EXISTS update_bug_reports_updated_at ON bug_reports;`.execute(db);
  await sql`DROP TRIGGER IF EXISTS update_pm_integrations_updated_at ON pm_integrations;`.execute(db);

  // Drop function
  await sql`DROP FUNCTION IF EXISTS update_updated_at_column();`.execute(db);

  // Drop tables
  await db.schema.dropTable('pm_integrations').execute();
  await db.schema.dropTable('bug_reports').execute();
}
