import { promises as fs } from "fs";
import * as path from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Pin } from "@viberglass/types";
import type { Database } from "../../persistence/types/database";
import { PinsService, PinTargetNotFound } from "../../services/pins/PinsService";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

let container: StartedPostgreSqlContainer;
let clock = new Date("2026-11-12T12:00:00.000Z");
const ids = { user: "", files: "", app: "", hidden: "", deck: "", doc: "", secret: "", live: "" };

async function one<T>(query: Promise<{ rows: T[] }>): Promise<T> {
  return (await query).rows[0];
}

async function space(name: string, slug: string, backing: string): Promise<string> {
  return (
    await one(sql<{ id: string }>`INSERT INTO projects (name, slug, key_prefix, ticket_system, backing_kind) VALUES (${name}, ${slug}, ${slug.slice(0, 3).toUpperCase()}, 'native', ${backing}) RETURNING id`.execute(mockDb))
  ).id;
}

async function artifact(projectId: string, title: string): Promise<string> {
  return (await one(sql<{ id: string }>`INSERT INTO artifacts (id, project_id, title) VALUES (gen_random_uuid(), ${projectId}, ${title}) RETURNING id`.execute(mockDb))).id;
}

async function version(artifactId: string, number: number, at: string): Promise<void> {
  const id = (
    await one(
      sql<{ id: string }>`INSERT INTO artifact_versions (id, artifact_id, number, format, entrypoint, files, storage_prefix, total_bytes, created_at)
        VALUES (gen_random_uuid(), ${artifactId}, ${number}, 'markdown', 'notes.md', '[]', 's3://b/p/', 1, ${at}) RETURNING id`.execute(mockDb),
    )
  ).id;
  await sql`UPDATE artifacts SET current_version_id = ${id} WHERE id = ${artifactId}`.execute(mockDb);
}

function service(visible: string[] | null = [ids.files, ids.app]) {
  return new PinsService({
    access: { visibleProjectIds: async () => visible },
    origins: { originFor: (slug) => `https://${slug}.apps.test` },
    previewLinks: { link: () => null },
    now: () => clock,
  });
}

const viewer = () => ({ id: ids.user, role: "member" as const });
const titles = (pins: Pin[]) => pins.map((pin) => pin.title);

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  const migrator = new Migrator({ db: mockDb, provider: new FileMigrationProvider({ fs, path, migrationFolder: path.resolve(__dirname, "../../migrations") }) });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;

  ids.user = (await one(sql<{ id: string }>`INSERT INTO users (email, name, role, password_hash) VALUES ('maria@acme.test', 'Maria', 'member', 'x') RETURNING id`.execute(mockDb))).id;
  ids.files = await space("Board reporting", "board-reporting", "files");
  ids.app = await space("Expense tracker", "expense-tracker", "app");
  ids.hidden = await space("Secret plans", "secret-plans", "files");
  ids.deck = await artifact(ids.files, "Q4 deck");
  ids.doc = await artifact(ids.files, "Guide");
  ids.secret = await artifact(ids.hidden, "Layoffs");
  await version(ids.deck, 1, "2026-11-10T09:00:00Z");
  await version(ids.doc, 1, "2026-11-10T09:00:00Z");

  ids.live = (await one(sql<{ id: string }>`INSERT INTO app_releases (project_id, commit_sha, status, went_live_at, created_at) VALUES (${ids.app}, ${"b".repeat(40)}, 'ready', now(), '2026-11-11T08:00:00Z') RETURNING id`.execute(mockDb))).id;
  await sql`INSERT INTO app_releases (project_id, commit_sha, status, created_at) VALUES (${ids.app}, ${"c".repeat(40)}, 'failed', '2026-11-12T08:00:00Z')`.execute(mockDb);
  await sql`INSERT INTO apps (project_id, current_release_id, power, state) VALUES (${ids.app}, ${ids.live}, 'on', 'running')`.execute(mockDb);
}, 180_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

describe("pins against Postgres", () => {
  it("adds pins after the others, once each, and shows an app's live release over a newer failed one", async () => {
    const pins = service();
    await pins.pin(viewer(), { kind: "artifact", artifactId: ids.deck });
    await pins.pin(viewer(), { kind: "app", spaceId: ids.app });
    const listed = await pins.pin(viewer(), { kind: "artifact", artifactId: ids.deck });

    expect(titles(listed)).toEqual(["Q4 deck", "Expense tracker"]);
    expect(listed[1]).toMatchObject({ kind: "app", available: true, appUrl: "https://expense-tracker.apps.test", running: true, release: { status: "live", commitSha: "b".repeat(40) } });
  });

  it("won't pin what the person can't see, nor a space that isn't an app", async () => {
    await expect(service().pin(viewer(), { kind: "artifact", artifactId: ids.secret })).rejects.toBeInstanceOf(PinTargetNotFound);
    await expect(service().pin(viewer(), { kind: "app", spaceId: ids.files })).rejects.toBeInstanceOf(PinTargetNotFound);
  });

  it("reorders, keeping pins it wasn't told about after the named ones", async () => {
    const pins = service();
    const before = await pins.pin(viewer(), { kind: "artifact", artifactId: ids.doc });
    const [deck, app, doc] = before.map((pin) => pin.id);

    expect(titles(await pins.reorder(viewer(), [doc, deck]))).toEqual(["Guide", "Q4 deck", "Expense tracker"]);
    expect(titles(await pins.reorder(viewer(), [app]))).toEqual(["Expense tracker", "Guide", "Q4 deck"]);
  });

  it("marks a new version until the pin is opened, and follows the artifact's renames", async () => {
    const pins = service();
    clock = new Date("2026-11-12T13:00:00.000Z");
    await version(ids.deck, 2, "2026-11-12T12:30:00Z");
    await sql`UPDATE artifacts SET title = 'Q4 board deck' WHERE id = ${ids.deck}`.execute(mockDb);

    const deck = (await pins.list(viewer())).find((pin) => pin.target.kind === "artifact" && pin.target.artifactId === ids.deck);
    expect(deck).toMatchObject({ title: "Q4 board deck", hasNewVersion: true, current: { number: 2 } });

    await pins.opened(viewer(), { kind: "artifact", artifactId: ids.deck });
    const opened = (await pins.list(viewer())).find((pin) => pin.target.kind === "artifact" && pin.target.artifactId === ids.deck);
    expect(opened).toMatchObject({ hasNewVersion: false });
  });

  it("keeps a pin the person lost access to, under its old title, until they unpin it", async () => {
    const hidden = await service([ids.app]).list(viewer());

    expect(hidden.filter((pin) => !pin.available).map((pin) => pin.title)).toEqual(["Guide", "Q4 deck"]);
    const left = await service().unpin(viewer(), hidden[1].id);
    expect(titles(left)).toEqual(["Expense tracker", "Q4 board deck"]);
  });

  it("drops a pin when what it points at is deleted", async () => {
    await sql`DELETE FROM artifacts WHERE id = ${ids.deck}`.execute(mockDb);

    expect(titles(await service().list(viewer()))).toEqual(["Expense tracker"]);
  });
});
