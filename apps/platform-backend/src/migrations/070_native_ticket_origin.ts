import { Kysely, sql } from "kysely";

// Tasks and spaces made in Viberglass were stored as "custom", the Custom
// Webhook's id. "native" names them; "custom" now only means the webhook.
const withNative =
  "'jira', 'linear', 'github', 'gitlab', 'bitbucket', 'azure', 'asana', 'trello', 'monday', 'clickup', 'shortcut', 'slack', 'custom', 'native'";
const withoutNative =
  "'jira', 'linear', 'github', 'gitlab', 'bitbucket', 'azure', 'asana', 'trello', 'monday', 'clickup', 'shortcut', 'slack', 'custom'";

async function setConstraints(db: Kysely<any>, systems: string): Promise<void> {
  for (const table of ["projects", "tickets"]) {
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT IF EXISTS ${sql.raw(`${table}_ticket_system_check`)};`.execute(db);
    await sql`ALTER TABLE ${sql.raw(table)} ADD CONSTRAINT ${sql.raw(`${table}_ticket_system_check`)} CHECK (ticket_system IN (${sql.raw(systems)}));`.execute(db);
  }
}

export async function up(db: Kysely<any>): Promise<void> {
  await setConstraints(db, withNative);

  // A task came from the Custom Webhook only if a webhook delivery created it.
  await sql`
    UPDATE tickets SET ticket_system = 'native'
    WHERE ticket_system = 'custom'
      AND NOT EXISTS (SELECT 1 FROM webhook_delivery_attempts d WHERE d.ticket_id = tickets.id::text)
  `.execute(db);

  // A space takes its tasks from the Custom Webhook only if that is its primary ticketing connection.
  await sql`
    UPDATE projects SET ticket_system = 'native'
    WHERE ticket_system = 'custom'
      AND NOT EXISTS (
        SELECT 1 FROM integrations i
        WHERE i.id = projects.primary_ticketing_integration_id AND i.system = 'custom'
      )
  `.execute(db);

}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`UPDATE tickets SET ticket_system = 'custom' WHERE ticket_system = 'native'`.execute(db);
  await sql`UPDATE projects SET ticket_system = 'custom' WHERE ticket_system = 'native'`.execute(db);
  await setConstraints(db, withoutNative);
}
