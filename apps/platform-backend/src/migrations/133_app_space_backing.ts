import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE projects
    DROP CONSTRAINT projects_backing_kind_check,
    DROP CONSTRAINT projects_files_without_scm_check,
    ADD CONSTRAINT projects_backing_kind_check CHECK (backing_kind IN ('git', 'files', 'app')),
    ADD CONSTRAINT projects_files_without_scm_check CHECK (
      backing_kind <> 'files' OR (primary_scm_integration_id IS NULL AND repository_url IS NULL AND cardinality(repository_urls) = 0)
    )`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM projects WHERE backing_kind = 'app') THEN
      RAISE EXCEPTION 'Remove App spaces before rolling back their backing';
    END IF;
  END; $$`.execute(db);
  await sql`ALTER TABLE projects
    DROP CONSTRAINT projects_backing_kind_check,
    DROP CONSTRAINT projects_files_without_scm_check,
    ADD CONSTRAINT projects_backing_kind_check CHECK (backing_kind IN ('git', 'files')),
    ADD CONSTRAINT projects_files_without_scm_check CHECK (
      backing_kind = 'git' OR (primary_scm_integration_id IS NULL AND repository_url IS NULL AND cardinality(repository_urls) = 0)
    )`.execute(db);
}
