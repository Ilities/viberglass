import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Drop existing triggers that reference bug_reports
  await sql`DROP TRIGGER IF EXISTS update_bug_reports_updated_at ON bug_reports;`.execute(db);

  // Rename the bug_reports table to tickets
  await sql`ALTER TABLE bug_reports RENAME TO tickets;`.execute(db);

  // Rename columns in tickets table
  await sql`ALTER TABLE tickets RENAME COLUMN ticket_id TO external_ticket_id;`.execute(db);
  await sql`ALTER TABLE tickets RENAME COLUMN ticket_url TO external_ticket_url;`.execute(db);

  // Rename the foreign key column in auto_fix_queue from bug_report_id to ticket_ref_id
  await sql`ALTER TABLE auto_fix_queue RENAME COLUMN bug_report_id TO ticket_ref_id;`.execute(db);

  // Rename indexes
  await sql`ALTER INDEX idx_bug_reports_project_id RENAME TO idx_tickets_project_id;`.execute(db);
  await sql`ALTER INDEX idx_bug_reports_timestamp RENAME TO idx_tickets_timestamp;`.execute(db);
  await sql`ALTER INDEX idx_bug_reports_ticket_id RENAME TO idx_tickets_external_ticket_id;`.execute(db);
  await sql`ALTER INDEX idx_bug_reports_auto_fix_status RENAME TO idx_tickets_auto_fix_status;`.execute(db);

  // Recreate trigger with new table name
  await sql`CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the new trigger
  await sql`DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;`.execute(db);

  // Rename columns back in tickets table (before renaming table)
  await sql`ALTER TABLE tickets RENAME COLUMN external_ticket_id TO ticket_id;`.execute(db);
  await sql`ALTER TABLE tickets RENAME COLUMN external_ticket_url TO ticket_url;`.execute(db);

  // Rename the tickets table back to bug_reports
  await sql`ALTER TABLE tickets RENAME TO bug_reports;`.execute(db);

  // Rename the foreign key column back
  await sql`ALTER TABLE auto_fix_queue RENAME COLUMN ticket_ref_id TO bug_report_id;`.execute(db);

  // Rename indexes back
  await sql`ALTER INDEX idx_tickets_project_id RENAME TO idx_bug_reports_project_id;`.execute(db);
  await sql`ALTER INDEX idx_tickets_timestamp RENAME TO idx_bug_reports_timestamp;`.execute(db);
  await sql`ALTER INDEX idx_tickets_external_ticket_id RENAME TO idx_bug_reports_ticket_id;`.execute(db);
  await sql`ALTER INDEX idx_tickets_auto_fix_status RENAME TO idx_bug_reports_auto_fix_status;`.execute(db);

  // Recreate trigger with old table name
  await sql`CREATE TRIGGER update_bug_reports_updated_at BEFORE UPDATE ON bug_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(db);
}
