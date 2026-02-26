import { Kysely, sql } from "kysely";

const currentSystems =
  "'jira', 'linear', 'github', 'gitlab', 'bitbucket', 'azure', 'asana', 'trello', 'monday', 'clickup', 'shortcut', 'slack', 'custom'";
const previousSystems =
  "'jira', 'linear', 'github', 'gitlab', 'bitbucket', 'azure', 'asana', 'trello', 'monday', 'clickup', 'shortcut', 'slack'";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_ticket_system_check;`.execute(
    db,
  );
  await sql`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_ticket_system_check;`.execute(
    db,
  );
  await sql`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS bug_reports_ticket_system_check;`.execute(
    db,
  );

  await sql`ALTER TABLE projects ADD CONSTRAINT projects_ticket_system_check CHECK (ticket_system IN (${sql.raw(
    currentSystems,
  )}));`.execute(db);
  await sql`ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_system_check CHECK (ticket_system IN (${sql.raw(
    currentSystems,
  )}));`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_ticket_system_check;`.execute(
    db,
  );
  await sql`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_ticket_system_check;`.execute(
    db,
  );
  await sql`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS bug_reports_ticket_system_check;`.execute(
    db,
  );

  await sql`ALTER TABLE projects ADD CONSTRAINT projects_ticket_system_check CHECK (ticket_system IN (${sql.raw(
    previousSystems,
  )}));`.execute(db);
  await sql`ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_system_check CHECK (ticket_system IN (${sql.raw(
    previousSystems,
  )}));`.execute(db);
}
