import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import { up as releasesUp } from "../../migrations/135_app_releases";
import { up as appsUp } from "../../migrations/136_apps";
import { up as sessionsUp } from "../../migrations/137_app_gateway_sessions";
import { up as stateUp } from "../../migrations/139_app_handoff_state";
import { up as releaseTasksUp } from "../../migrations/140_app_release_tasks";
import { up as previewsUp } from "../../migrations/141_app_previews";
import { up as rollbackUp } from "../../migrations/142_app_rollback";
import { up as expiryUp } from "../../migrations/143_app_credential_expiry";
import { up as archiveUp } from "../../migrations/144_app_archive_backup";
import { up, down } from "../../migrations/145_app_settings";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
const SECRET = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
let container: StartedPostgreSqlContainer;
const apps = new AppDAO();
const releases = new AppReleaseDAO();
const settings = new AppSettingDAO();

async function readyRelease(commit: string, createdAt: string, declared: unknown): Promise<string> {
  const row = await mockDb
    .insertInto("app_releases")
    .values({ project_id: SPACE, commit_sha: commit.repeat(40), status: "ready", created_at: new Date(createdAt), settings: declared === null ? null : JSON.stringify(declared) })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (
    id uuid PRIMARY KEY, backing_kind text NOT NULL, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`.execute(mockDb);
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL, job_kind text NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE clankers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, deleted_at timestamptz)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE users (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE user_sessions (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE secrets (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`INSERT INTO projects (id, backing_kind) VALUES (${SPACE}, 'app')`.execute(mockDb);
  await sql`INSERT INTO users (id) VALUES (${USER})`.execute(mockDb);
  await sql`INSERT INTO secrets (id) VALUES (${SECRET})`.execute(mockDb);
  await releasesUp(mockDb);
  await appsUp(mockDb);
  await sessionsUp(mockDb);
  await stateUp(mockDb);
  await releaseTasksUp(mockDb);
  await previewsUp(mockDb);
  await rollbackUp(mockDb);
  await expiryUp(mockDb);
  await archiveUp(mockDb);
  await up(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

describe("app settings", () => {
  it("keeps a plain value or a secret, replacing either, and goes with its secret", async () => {
    await settings.put(SPACE, "SLACK_CHANNEL", { value: "#laptops", secretId: null, forPreviews: false, updatedBy: USER });
    await settings.put(SPACE, "SLACK_TOKEN", { value: "plain at first", secretId: null, forPreviews: false, updatedBy: USER });
    await settings.put(SPACE, "SLACK_TOKEN", { value: null, secretId: SECRET, forPreviews: true, updatedBy: USER });

    await expect(settings.list(SPACE)).resolves.toMatchObject([
      { name: "SLACK_CHANNEL", value: "#laptops", secretId: null },
      { name: "SLACK_TOKEN", value: null, secretId: SECRET, forPreviews: true },
    ]);

    await sql`DELETE FROM secrets WHERE id = ${SECRET}`.execute(mockDb);
    await expect(settings.get(SPACE, "SLACK_TOKEN")).resolves.toBeNull();
    await settings.delete(SPACE, "SLACK_CHANNEL");
    await expect(settings.list(SPACE)).resolves.toEqual([]);
  });

  it("refuses a setting with both a value and a secret, or neither", async () => {
    await expect(sql`INSERT INTO app_settings (project_id, name) VALUES (${SPACE}, 'EMPTY')`.execute(mockDb)).rejects.toMatchObject({ code: "23514" });
  });

  it("asks for a restart, and clears the request", async () => {
    await apps.ensure(SPACE);
    await apps.requestRestart(SPACE);
    await expect(apps.get(SPACE)).resolves.toMatchObject({ restartDue: true });
    await apps.clearRestart(SPACE);
    await expect(apps.get(SPACE)).resolves.toMatchObject({ restartDue: false });
  });

  it("declares the current release's settings, or else the newest release that recorded any", async () => {
    const older = await readyRelease("a", "2026-11-05T10:00:00Z", [{ name: "SLACK_TOKEN", secret: true }]);
    await readyRelease("b", "2026-11-05T11:00:00Z", [{ name: "SLACK_TOKEN", secret: true }, { name: "STRIPE_KEY", secret: true, description: "Payments" }]);
    await readyRelease("c", "2026-11-05T12:00:00Z", null);

    await expect(releases.declaredSettings(SPACE, older)).resolves.toEqual([{ name: "SLACK_TOKEN", secret: true }]);
    await expect(releases.declaredSettings(SPACE, null)).resolves.toEqual([
      { name: "SLACK_TOKEN", secret: true },
      { name: "STRIPE_KEY", secret: true, description: "Payments" },
    ]);
  });

  it("migrates down", async () => {
    await down(mockDb);
    await up(mockDb);
  });
});
