import { promises as fs } from "fs";
import * as path from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppRetentionDAO } from "../../persistence/apps/AppRetentionDAO";
import { SpaceBackingDAO } from "../../persistence/apps/SpaceBackingDAO";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

let container: StartedPostgreSqlContainer;
const backing = new SpaceBackingDAO();
const retention = new AppRetentionDAO();

async function one<T>(query: Promise<{ rows: T[] }>): Promise<T> {
  return (await query).rows[0];
}

async function space(slug: string, kind: "git" | "files" | "app"): Promise<string> {
  const row = await one(
    sql<{ id: string }>`INSERT INTO projects (name, slug, key_prefix, ticket_system, backing_kind)
      VALUES (${slug}, ${slug}, ${slug.slice(0, 3).toUpperCase()}, 'native', ${kind}) RETURNING id`.execute(mockDb),
  );
  return row.id;
}

async function backingOf(projectId: string): Promise<string> {
  return (await one(sql<{ backing_kind: string }>`SELECT backing_kind FROM projects WHERE id = ${projectId}`.execute(mockDb))).backing_kind;
}

async function count(table: string, projectId: string): Promise<number> {
  const row = await one(sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(table)} WHERE project_id = ${projectId}`.execute(mockDb));
  return Number(row.n);
}

describe("switching a space between git and App against Postgres", () => {
  let userId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
    const migrator = new Migrator({
      db: mockDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder: path.resolve(__dirname, "../../migrations") }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    userId = (
      await one(sql<{ id: string }>`INSERT INTO users (email, name, password_hash, role) VALUES ('kim@example.com', 'Kim', 'x', 'app_user') RETURNING id`.execute(mockDb))
    ).id;
  }, 180_000);

  afterAll(async () => {
    await mockDb?.destroy();
    await container?.stop();
  });

  it("refuses a backing change from anything but the switch", async () => {
    const id = await space("direct", "git");
    await expect(sql`UPDATE projects SET backing_kind = 'app' WHERE id = ${id}`.execute(mockDb)).rejects.toThrow("cannot be changed");
  });

  it("never changes a Files space, even in a switch", async () => {
    const id = await space("notes", "files");
    await expect(backing.makeApp(id)).rejects.toThrow("cannot be changed");
    expect(await backingOf(id)).toBe("files");
  });

  it("makes a git space an App space with an app that's on", async () => {
    const id = await space("tracker", "git");

    await backing.makeApp(id);

    expect(await backingOf(id)).toBe("app");
    const app = await one(sql<{ power: string; state: string }>`SELECT power, state FROM apps WHERE project_id = ${id}`.execute(mockDb));
    expect(app).toEqual({ power: "on", state: "off" });
  });

  it("leaves what only an app has when ejecting, and keeps the app's row with its last copy", async () => {
    const id = await space("ejectme", "app");
    await sql`INSERT INTO apps (project_id, power, state) VALUES (${id}, 'on', 'running')`.execute(mockDb);
    await sql`INSERT INTO app_access (project_id, user_id) VALUES (${id}, ${userId})`.execute(mockDb);
    await sql`INSERT INTO app_settings (project_id, name, value) VALUES (${id}, 'SLACK_CHANNEL', '#laptops')`.execute(mockDb);
    await sql`INSERT INTO claw_schedules (project_id, action, name, schedule_type, cron_expression) VALUES (${id}, 'app_stop', 'Off', 'cron', '0 22 * * *')`.execute(mockDb);
    await sql`INSERT INTO invites (email, role, token_hash, expires_at, app_ids) VALUES ('lee@example.com', 'app_user', 'h1', now() + interval '1 day', ARRAY[${id}::uuid])`.execute(mockDb);
    const backupId = "99999999-9999-4999-8999-999999999999";

    await backing.makeGit(id, { backupId, copyBytes: 4096 }, new Date("2026-11-05T12:00:00Z"));

    expect(await backingOf(id)).toBe("git");
    expect(await count("app_access", id)).toBe(0);
    expect(await count("app_settings", id)).toBe(0);
    expect(await count("claw_schedules", id)).toBe(0);
    const invite = await one(sql<{ app_ids: string[]; revoked_at: Date | null }>`SELECT app_ids, revoked_at FROM invites WHERE token_hash = 'h1'`.execute(mockDb));
    expect(invite.app_ids).toEqual([]);
    expect(invite.revoked_at).not.toBeNull();
    expect(await backing.ejected(id)).toEqual({ ejectedAt: new Date("2026-11-05T12:00:00Z"), backupId, copyBytes: 4096 });
    const app = await one(sql<{ power: string; state: string }>`SELECT power, state FROM apps WHERE project_id = ${id}`.execute(mockDb));
    expect(app).toEqual({ power: "off", state: "off" });
  });

  it("brings an ejected space back in on its old app row", async () => {
    const id = await space("comeback", "app");
    await sql`INSERT INTO apps (project_id) VALUES (${id})`.execute(mockDb);
    await backing.makeGit(id, { backupId: null, copyBytes: null });

    await backing.makeApp(id);

    expect(await backingOf(id)).toBe("app");
    expect(await backing.ejected(id)).toBeNull();
    expect(await count("apps", id)).toBe(1);
  });

  it("forgets an ejected app once its time is up, and not one brought back in", async () => {
    const gone = await space("longgone", "app");
    const back = await space("backagain", "app");
    for (const id of [gone, back]) {
      await sql`INSERT INTO apps (project_id) VALUES (${id})`.execute(mockDb);
      await backing.makeGit(id, { backupId: null, copyBytes: null }, new Date("2026-09-01T00:00:00Z"));
    }
    await backing.makeApp(back);
    await sql`INSERT INTO app_data_backups (project_id, reason, objects, bytes) VALUES (${gone}, 'eject', 2, 100)`.execute(mockDb);

    const listed = await retention.listEjectedBefore(new Date("2026-10-01T00:00:00Z"));
    expect(listed).toContain(gone);
    expect(listed).not.toContain(back);

    await retention.forgetEjected(gone);
    expect(await count("apps", gone)).toBe(0);
    expect(await count("app_data_backups", gone)).toBe(0);
  });
});
