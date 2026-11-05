import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * A git space can become an App space and back. Only the service that does it
 * may change a backing, by turning on `viberglass.switching_backing` in its
 * transaction; Files spaces never change. An ejected app keeps a last copy of
 * its data for a while.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE OR REPLACE FUNCTION enforce_space_backing() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_TABLE_NAME = 'projects' THEN
        IF NEW.backing_kind IS DISTINCT FROM OLD.backing_kind AND NOT (
          OLD.backing_kind IN ('git', 'app') AND NEW.backing_kind IN ('git', 'app')
          AND coalesce(current_setting('viberglass.switching_backing', true), '') = 'on'
        ) THEN
          RAISE EXCEPTION 'Space backing cannot be changed after creation' USING ERRCODE = '23514';
        END IF;
      ELSIF EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND backing_kind = 'files') THEN
        RAISE EXCEPTION 'Files spaces cannot have repository configuration' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
  $$`.execute(db);

  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release', 'rollback', 'archive', 'eject'))`.execute(db);
  await db.schema
    .alterTable("apps")
    .addColumn("ejected_at", "timestamptz")
    .addColumn("ejected_backup_id", "uuid")
    .addColumn("ejected_copy_bytes", "bigint")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("apps").dropColumn("ejected_at").dropColumn("ejected_backup_id").dropColumn("ejected_copy_bytes").execute();
  await db.deleteFrom("app_data_backups").where("reason", "=", "eject").execute();
  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release', 'rollback', 'archive'))`.execute(db);
  await sql`CREATE OR REPLACE FUNCTION enforce_space_backing() RETURNS trigger LANGUAGE plpgsql AS $$
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
}
