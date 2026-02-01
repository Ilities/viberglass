import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Drop indexes that depend on the old varchar type (safe/reliable even if empty).
  await sql`DROP INDEX IF EXISTS pm_integrations_project_system_unique`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS pm_integrations_project_id_idx`.execute(db);

  // Change project_id from varchar -> uuid.
  // Database is empty, but we still include USING for correctness.
  await sql`
    ALTER TABLE pm_integrations
    ALTER COLUMN project_id TYPE uuid
    USING project_id::uuid
  `.execute(db);

  // Add a real FK to projects(id).
  await sql`
    ALTER TABLE pm_integrations
    ADD CONSTRAINT pm_integrations_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE
  `.execute(db);

  // Recreate indexes (now on uuid).
  await db.schema
    .createIndex("pm_integrations_project_id_idx")
    .on("pm_integrations")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("pm_integrations_project_system_unique")
    .on("pm_integrations")
    .columns(["project_id", "system"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop FK
  await sql`
    ALTER TABLE pm_integrations
    DROP CONSTRAINT IF EXISTS pm_integrations_project_id_fkey
  `.execute(db);

  // Drop indexes (uuid-based)
  await sql`DROP INDEX IF EXISTS pm_integrations_project_system_unique`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS pm_integrations_project_id_idx`.execute(db);

  // Change back to varchar
  await sql`
    ALTER TABLE pm_integrations
    ALTER COLUMN project_id TYPE varchar(255)
    USING project_id::text
  `.execute(db);

  // Recreate indexes (varchar-based)
  await db.schema
    .createIndex("pm_integrations_project_id_idx")
    .on("pm_integrations")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("pm_integrations_project_system_unique")
    .on("pm_integrations")
    .columns(["project_id", "system"])
    .unique()
    .execute();
}
