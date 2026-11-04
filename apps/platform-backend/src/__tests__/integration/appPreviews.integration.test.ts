import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import { up as releasesUp } from "../../migrations/135_app_releases";
import { up as appsUp } from "../../migrations/136_apps";
import { up as sessionsUp } from "../../migrations/137_app_gateway_sessions";
import { up as stateUp } from "../../migrations/139_app_handoff_state";
import { up as releaseTasksUp } from "../../migrations/140_app_release_tasks";
import { up, down } from "../../migrations/141_app_previews";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const URL_3 = "https://github.com/acme/laptops/pull/3";
const COMMIT = "a".repeat(40);
let container: StartedPostgreSqlContainer;
const previews = new AppPreviewDAO();
const releases = new AppReleaseDAO();
const signIns = new AppSignInDAO();

async function preview(address = "preview-abcd2345", pullRequestUrl = URL_3) {
  const build = await releases.createBuilding(SPACE, COMMIT, { preview: true });
  const created = await previews.create({
    address,
    projectId: SPACE,
    ticketId: TASK,
    pullRequestUrl,
    commitSha: COMMIT,
    releaseId: build?.id ?? (await releases.findPreviewBuild(SPACE, COMMIT))!.id,
  });
  return created!;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (
    id uuid PRIMARY KEY, slug text NOT NULL, is_private boolean NOT NULL DEFAULT false, backing_kind text NOT NULL,
    archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`.execute(mockDb);
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL, job_kind text NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE clankers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, deleted_at timestamptz)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY, task_key text NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE user_sessions (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE pull_request_outcomes (pull_request_url text PRIMARY KEY, state text)`.execute(mockDb);
  await sql`INSERT INTO projects (id, slug, backing_kind) VALUES (${SPACE}, 'laptops', 'app')`.execute(mockDb);
  await sql`INSERT INTO tickets (id, task_key) VALUES (${TASK}, 'LT-2')`.execute(mockDb);
  await sql`INSERT INTO user_sessions (id) VALUES (${SESSION})`.execute(mockDb);
  await releasesUp(mockDb);
  await appsUp(mockDb);
  await sessionsUp(mockDb);
  await stateUp(mockDb);
  await releaseTasksUp(mockDb);
  await up(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`DELETE FROM app_sessions`.execute(mockDb);
  await sql`DELETE FROM app_handoff_codes`.execute(mockDb);
  await sql`DELETE FROM app_previews`.execute(mockDb);
  await sql`DELETE FROM app_releases`.execute(mockDb);
  await sql`DELETE FROM pull_request_outcomes`.execute(mockDb);
  await sql`UPDATE projects SET archived_at = NULL`.execute(mockDb);
});

describe("app previews", () => {
  it("keeps preview builds apart from releases of the same commit", async () => {
    await expect(releases.createBuilding(SPACE, COMMIT, { preview: true })).resolves.not.toBeNull();
    await expect(releases.hasCommit(SPACE, COMMIT)).resolves.toBe(false);
    await expect(releases.createBuilding(SPACE, COMMIT)).resolves.not.toBeNull();
    await expect(releases.createBuilding(SPACE, COMMIT, { preview: true })).resolves.toBeNull();
    await expect(releases.listForProject(SPACE, 10)).resolves.toHaveLength(1);
  });

  it("finds a preview by its address with what the gateway needs, and one per change", async () => {
    const created = await preview();

    await expect(previews.findByAddress("preview-abcd2345")).resolves.toEqual({
      previewId: created.id,
      address: "preview-abcd2345",
      projectId: SPACE,
      projectSlug: "laptops",
      isPrivate: false,
      ticketId: TASK,
      taskKey: "LT-2",
      state: "off",
    });
    await expect(previews.create({
      address: "preview-other234",
      projectId: SPACE,
      ticketId: TASK,
      pullRequestUrl: URL_3,
      commitSha: COMMIT,
      releaseId: created.releaseId!,
    })).resolves.toBeNull();
    await sql`UPDATE projects SET archived_at = now()`.execute(mockDb);
    await expect(previews.findByAddress("preview-abcd2345")).resolves.toBeNull();
  });

  it("clears a failed attempt when the change is tried again, and leaves other states alone", async () => {
    const created = await preview();
    await previews.update(created.id, { power: "off", state: "failed", statusMessage: "The app answered 500" });

    await previews.request(created.id, { commitSha: "b".repeat(40), releaseId: created.releaseId! });
    await expect(previews.get(created.id)).resolves.toMatchObject({ power: "on", state: "off", statusMessage: null, commitSha: "b".repeat(40) });

    await previews.update(created.id, { state: "running" });
    await previews.request(created.id, { commitSha: COMMIT, releaseId: created.releaseId! });
    await expect(previews.get(created.id)).resolves.toMatchObject({ state: "running" });
  });

  it("lists previews whose change was merged or closed", async () => {
    const merged = await preview();
    await preview("preview-open2345", "https://github.com/acme/laptops/pull/4");
    await sql`INSERT INTO pull_request_outcomes VALUES (${URL_3}, 'merged'), ('https://github.com/acme/laptops/pull/4', 'open')`.execute(mockDb);

    await expect(previews.listEnded()).resolves.toEqual([expect.objectContaining({ id: merged.id })]);
  });

  it("redeems a preview's sign-in code only for that preview", async () => {
    const created = await preview();
    const expiresAt = new Date(Date.now() + 60_000);
    await signIns.createCode({ codeHash: "code", stateHash: "state", projectId: SPACE, previewId: created.id, sessionId: SESSION, returnPath: "/", expiresAt });

    await expect(signIns.redeemCode("code", "state", SPACE, null)).resolves.toBeNull();
    await expect(signIns.redeemCode("code", "state", SPACE, created.id)).resolves.toMatchObject({ sessionId: SESSION });
  });

  it("rolls back", async () => {
    await down(mockDb);
    await up(mockDb);
  });
});
