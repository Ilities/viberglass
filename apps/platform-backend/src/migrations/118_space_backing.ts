import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .addColumn("backing_kind", "text", (column) =>
      column.notNull().defaultTo("git"),
    )
    .execute();
  await sql`ALTER TABLE projects
    ADD CONSTRAINT projects_backing_kind_check CHECK (backing_kind IN ('git', 'files')),
    ADD CONSTRAINT projects_files_without_scm_check CHECK (
      backing_kind = 'git' OR (primary_scm_integration_id IS NULL AND repository_url IS NULL AND cardinality(repository_urls) = 0)
    )`.execute(db);
  await sql`CREATE FUNCTION enforce_space_backing() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_TABLE_NAME = 'projects' THEN
        IF NEW.backing_kind IS DISTINCT FROM OLD.backing_kind THEN
          RAISE EXCEPTION 'Space backing cannot be changed after creation' USING ERRCODE = '23514';
        END IF;
      ELSIF EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND backing_kind = 'files') THEN
        RAISE EXCEPTION 'Files spaces cannot have repository configuration' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
  $$`.execute(db);
  await sql`CREATE TRIGGER projects_backing_immutable BEFORE UPDATE OF backing_kind ON projects
    FOR EACH ROW EXECUTE FUNCTION enforce_space_backing()`.execute(db);
  await sql`CREATE TRIGGER project_scm_configs_git_backing BEFORE INSERT OR UPDATE ON project_scm_configs
    FOR EACH ROW EXECUTE FUNCTION enforce_space_backing()`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM projects WHERE backing_kind = 'files') THEN
      RAISE EXCEPTION 'Remove Files spaces before rolling back their backing model';
    END IF;
  END; $$`.execute(db);
  await sql`DROP TRIGGER project_scm_configs_git_backing ON project_scm_configs`.execute(
    db,
  );
  await sql`DROP TRIGGER projects_backing_immutable ON projects`.execute(db);
  await sql`DROP FUNCTION enforce_space_backing()`.execute(db);
  await db.schema.alterTable("projects").dropColumn("backing_kind").execute();
}
