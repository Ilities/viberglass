import { promises as fs } from "fs";
import * as path from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppDataOrderDAO } from "../../persistence/apps/AppDataOrderDAO";
import { AppRetentionDAO } from "../../persistence/apps/AppRetentionDAO";
import { down, up } from "../../migrations/152_scheduled_app_data_restore";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

let container: StartedPostgreSqlContainer;
const apps = new AppDAO();
const backups = new AppDataBackupDAO();
const orders = new AppDataOrderDAO();
const retention = new AppRetentionDAO();
const LONG_AGO = "2026-09-01T10:00:00Z";
const CUTOFF = new Date("2026-10-01T00:00:00Z");

async function one<T>(query: Promise<{ rows: T[] }>): Promise<T> {
  return (await query).rows[0];
}

async function space(slug: string): Promise<string> {
  const row = await one(
    sql<{ id: string }>`INSERT INTO projects (name, slug, key_prefix, ticket_system, backing_kind)
      VALUES (${slug}, ${slug}, ${slug.slice(0, 3).toUpperCase()}, 'native', 'app') RETURNING id`.execute(mockDb),
  );
  await apps.ensure(row.id);
  return row.id;
}

async function backup(projectId: string, takenAt = LONG_AGO, reason: "release" | "manual" = "release"): Promise<string> {
  const row = await one(
    sql<{ id: string }>`INSERT INTO app_data_backups (project_id, reason, objects, bytes, created_at)
      VALUES (${projectId}, ${reason}, 1, 10, ${new Date(takenAt)}) RETURNING id`.execute(mockDb),
  );
  return row.id;
}

async function restoreSchedule(projectId: string, backupId: string | null): Promise<string> {
  const row = await one(
    sql<{ id: string }>`INSERT INTO claw_schedules (project_id, action, backup_id, name, schedule_type, interval_expression)
      VALUES (${projectId}, 'app_restore_data', ${backupId}, ${`Reset ${backupId}`}, 'interval', '1h') RETURNING id`.execute(mockDb),
  );
  return row.id;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  const migrator = new Migrator({
    db: mockDb,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: path.resolve(__dirname, "../../migrations") }),
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}, 180_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

describe("a schedule that restores an app's data", () => {
  it("needs a backup, and only that action has one", async () => {
    const id = await space("needs");
    const kept = await backup(id);

    await expect(restoreSchedule(id, null)).rejects.toThrow("claw_schedules_backup_for_action");
    await expect(
      sql`INSERT INTO claw_schedules (project_id, action, backup_id, name, schedule_type, interval_expression)
        VALUES (${id}, 'app_stop', ${kept}, 'Off', 'interval', '1h')`.execute(mockDb),
    ).rejects.toThrow("claw_schedules_backup_for_action");
  });

  it("keeps the backup it points at, and one a restore waits on, from retention", async () => {
    const id = await space("keeps");
    const pinned = await backup(id);
    const waitedOn = await backup(id);
    const old = await backup(id);
    await restoreSchedule(id, pinned);
    await expect(orders.orderRestore(id, { backupId: waitedOn, executionId: null })).resolves.toBe(true);

    const deleted = (await retention.listBackupsToDelete(CUTOFF)).filter((row) => row.projectId === id);

    expect(deleted.map((row) => row.id)).toEqual([old]);
  });

  it("can't lose its backup while it exists, but goes with its space", async () => {
    const id = await space("goes");
    const pinned = await backup(id);
    const scheduleId = await restoreSchedule(id, pinned);

    await expect(sql`DELETE FROM app_data_backups WHERE id = ${pinned}`.execute(mockDb)).rejects.toThrow("claw_schedules_backup_id_fkey");
    await sql`DELETE FROM projects WHERE id = ${id}`.execute(mockDb);

    const left = await one(sql<{ n: string }>`SELECT count(*) AS n FROM claw_schedules WHERE id = ${scheduleId}`.execute(mockDb));
    expect(Number(left.n)).toBe(0);
  });
});

describe("the app's data orders", () => {
  it("keeps one restore at a time until it's cleared", async () => {
    const id = await space("orders");
    const first = await backup(id);
    const second = await backup(id);

    await expect(orders.orderRestore(id, { backupId: first, executionId: null })).resolves.toBe(true);
    await expect(orders.orderRestore(id, { backupId: second, executionId: null })).resolves.toBe(false);
    await expect(apps.get(id)).resolves.toMatchObject({ dataRestore: { backupId: first, executionId: null } });

    await orders.clearRestore(id, first);
    await expect(apps.get(id)).resolves.toMatchObject({ dataRestore: null });
  });

  it("records a backup asked for until it's taken", async () => {
    const id = await space("asked");

    await orders.requestBackup(id);
    await expect(apps.get(id)).resolves.toMatchObject({ backupDue: true });
    await orders.clearBackup(id);
    await expect(apps.get(id)).resolves.toMatchObject({ backupDue: false });
  });

  it("lists the app's backups newest first, with the release whose data each is", async () => {
    const id = await space("lists");
    const release = await one(
      sql<{ id: string }>`INSERT INTO app_releases (project_id, commit_sha, status) VALUES (${id}, ${"a".repeat(40)}, 'ready') RETURNING id`.execute(mockDb),
    );
    await backups.create({ id: "55555555-5555-4555-8555-555555555555", projectId: id, reason: "manual", releaseId: null, fromReleaseId: release.id, objects: 2, bytes: 2048 });
    const older = await backup(id);

    const listed = await backups.list(id, 10);

    expect(listed).toEqual([
      { id: "55555555-5555-4555-8555-555555555555", reason: "manual", takenAt: expect.any(String), fromRelease: { id: release.id, commitSha: "a".repeat(40) }, bytes: 2048 },
      { id: older, reason: "release", takenAt: new Date(LONG_AGO).toISOString(), fromRelease: null, bytes: 10 },
    ]);
  });
});

describe("migration 152", () => {
  it("goes down and up again", async () => {
    await down(mockDb);
    await up(mockDb);
    const columns = await mockDb.selectFrom("claw_schedules").select("backup_id").limit(1).execute();
    expect(columns).toEqual(expect.any(Array));
  });
});
