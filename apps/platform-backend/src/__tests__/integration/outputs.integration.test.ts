import { promises as fs } from "fs";
import * as path from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { OutputItem } from "@viberglass/types";
import type { Database } from "../../persistence/types/database";
import { OutputsService } from "../../services/outputs/OutputsService";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

let container: StartedPostgreSqlContainer;
const NOW = new Date("2026-11-12T12:00:00.000Z");
const VIEWER = { id: "viewer", role: "member" as const };
const ids = { files: "", app: "", hidden: "", task: "", appTask: "", maria: "" };

async function one<T>(query: Promise<{ rows: T[] }>): Promise<T> {
  return (await query).rows[0];
}

async function space(name: string, slug: string, prefix: string): Promise<string> {
  return (await one(sql<{ id: string }>`INSERT INTO projects (name, slug, key_prefix, ticket_system) VALUES (${name}, ${slug}, ${prefix}, 'native') RETURNING id`.execute(mockDb))).id;
}

async function task(projectId: string, key: string, title: string): Promise<string> {
  return (
    await one(
      sql<{ id: string }>`INSERT INTO tickets (project_id, task_number, task_key, timestamp, title, description, severity, category, metadata, ticket_system)
        VALUES (${projectId}, ${Number(key.split("-")[1])}, ${key}, now(), ${title}, '', 'medium', 'General', '{}', 'native') RETURNING id`.execute(mockDb),
    )
  ).id;
}

/** Versions in order, each a minute after the last; the last is current. */
async function artifact(title: string, format: string, cover: object | null, versions: Array<{ at: string; by?: string }>) {
  const artifactId = (
    await one(sql<{ id: string }>`INSERT INTO artifacts (id, project_id, ticket_id, title) VALUES (gen_random_uuid(), ${ids.files}, ${ids.task}, ${title}) RETURNING id`.execute(mockDb))
  ).id;
  let current = "";
  for (const [index, version] of versions.entries()) {
    const jobId = version.by ? null : `job-${title}-${index}`;
    if (jobId) await sql`INSERT INTO jobs (id, tenant_id, repository, task, ticket_id, status, job_kind) VALUES (${jobId}, 'api-server', 'r', 't', ${ids.task}, 'completed', 'execution')`.execute(mockDb);
    current = (
      await one(
        sql<{ id: string }>`INSERT INTO artifact_versions (id, artifact_id, number, job_id, created_by, format, entrypoint, files, storage_prefix, total_bytes, cover, created_at)
          VALUES (gen_random_uuid(), ${artifactId}, ${index + 1}, ${jobId}, ${version.by ?? null}, ${format}, 'index', '[]', 's3://b/p/', 1, ${cover ? JSON.stringify(cover) : null}, ${version.at}) RETURNING id`.execute(mockDb),
      )
    ).id;
  }
  await sql`UPDATE artifacts SET current_version_id = ${current} WHERE id = ${artifactId}`.execute(mockDb);
}

async function release(projectId: string, sha: string, at: string, fields: { status?: string; liveAt?: string; preview?: boolean } = {}): Promise<string> {
  return (
    await one(
      sql<{ id: string }>`INSERT INTO app_releases (project_id, commit_sha, status, went_live_at, preview, ticket_id, created_at)
        VALUES (${projectId}, ${sha.repeat(40)}, ${fields.status ?? "ready"}, ${fields.liveAt ?? null}, ${fields.preview ?? false}, ${ids.appTask}, ${at}) RETURNING id`.execute(mockDb),
    )
  ).id;
}

function service(visible: string[] | null = [ids.files, ids.app]) {
  return new OutputsService({
    access: { visibleProjectIds: async () => visible },
    origins: { originFor: (slug) => `https://${slug}.apps.test` },
    previewLinks: { link: (versionId) => ({ url: `https://preview.test/${versionId}`, expiresAt: "" }) },
    now: () => NOW,
  });
}

const labels = (items: OutputItem[]) =>
  items.map((item) => (item.type === "artifact" ? `${item.title} v${item.number}` : item.type === "release" ? `release ${item.commitSha[0]} ${item.status}` : `preview ${item.taskTitle}`));

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  const migrator = new Migrator({ db: mockDb, provider: new FileMigrationProvider({ fs, path, migrationFolder: path.resolve(__dirname, "../../migrations") }) });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;

  ids.files = await space("Board reporting", "board-reporting", "BRD");
  ids.app = await space("Expense tracker", "expense-tracker", "EXP");
  ids.hidden = await space("Secret plans", "secret-plans", "SEC");
  ids.task = await task(ids.files, "BRD-1", "Board deck");
  ids.appTask = await task(ids.app, "EXP-1", "CSV export");
  ids.maria = (await one(sql<{ id: string }>`INSERT INTO users (email, name, role, password_hash) VALUES ('maria@acme.test', 'Maria', 'member', 'x') RETURNING id`.execute(mockDb))).id;

  await artifact("Q4 deck", "html", { kind: "deck", slides: ["Q4"], slideCount: 1 }, [{ at: "2026-11-10T09:00:00Z" }, { at: "2026-11-12T09:00:00Z" }]);
  await artifact("Guide", "markdown", { kind: "page", heading: "Guide", excerpt: "" }, [{ at: "2026-11-11T09:00:00Z", by: ids.maria }]);
  await artifact("Pricing page", "html", { kind: "page", heading: "Pricing", excerpt: "" }, [{ at: "2026-11-01T09:00:00Z" }]);
  await artifact("Logo", "image", null, [{ at: "2026-11-09T09:00:00Z" }]);

  const live = await release(ids.app, "b", "2026-11-11T08:00:00Z", { liveAt: "2026-11-11T08:05:00Z" });
  await release(ids.app, "a", "2026-11-02T08:00:00Z", { liveAt: "2026-11-02T08:05:00Z" });
  await release(ids.app, "c", "2026-11-12T08:00:00Z", { status: "failed" });
  await release(ids.app, "d", "2026-11-12T10:00:00Z", { preview: true });
  await release(ids.hidden, "e", "2026-11-12T11:00:00Z");
  await sql`INSERT INTO apps (project_id, current_release_id) VALUES (${ids.app}, ${live})`.execute(mockDb);
  await sql`INSERT INTO app_previews (address, project_id, ticket_id, pull_request_url, commit_sha, state, created_at)
    VALUES ('preview-aaaa2345', ${ids.app}, ${ids.appTask}, 'https://x/pull/1', ${"f".repeat(40)}, 'running', '2026-11-11T12:00:00Z'),
           ('preview-bbbb2345', ${ids.app}, ${ids.appTask}, 'https://x/pull/2', ${"f".repeat(40)}, 'off', '2026-11-11T13:00:00Z')`.execute(mockDb);
}, 180_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

describe("Outputs against Postgres", () => {
  it("lists every version, release and running preview newest first, paging without gaps or repeats", async () => {
    const outputs = service();
    const seen: OutputItem[] = [];
    let cursor: string | undefined;
    do {
      const page = await outputs.page(VIEWER, { cursor }, 3);
      seen.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(labels(seen)).toEqual([
      "Q4 deck v2",
      "release c failed",
      "preview CSV export",
      "Guide v1",
      "release b live",
      "Q4 deck v1",
      "Logo v1",
      "release a was_live",
      "Pricing page v1",
    ]);
  });

  it("keeps only current versions and each app's newest release with latest", async () => {
    const page = await service().page(VIEWER, { latest: true });

    expect(labels(page.items)).toEqual(["Q4 deck v2", "release c failed", "preview CSV export", "Guide v1", "Logo v1", "Pricing page v1"]);
  });

  it("tells decks from pages, and links apps and images", async () => {
    const outputs = service();

    expect(labels((await outputs.page(VIEWER, { kind: "deck" })).items)).toEqual(["Q4 deck v2", "Q4 deck v1"]);
    expect(labels((await outputs.page(VIEWER, { kind: "doc" })).items)).toEqual(["Guide v1", "Pricing page v1"]);
    const [logo] = (await outputs.page(VIEWER, { kind: "image" })).items;
    expect(logo).toMatchObject({ imageUrl: expect.stringContaining("https://preview.test/") });
    const [failed] = (await outputs.page(VIEWER, { kind: "app" })).items;
    expect(failed).toMatchObject({ type: "release", appUrl: "https://expense-tracker.apps.test", taskKey: "EXP-1" });
  });

  it("filters by who made it, by space and by search", async () => {
    const outputs = service();

    const byPeople = (await outputs.page(VIEWER, { producer: "person" })).items;
    expect(byPeople).toEqual([expect.objectContaining({ title: "Guide", producedBy: { kind: "person", name: "Maria" } })]);
    expect(labels((await outputs.page(VIEWER, { spaceId: ids.app, latest: true })).items)).toEqual(["release c failed", "preview CSV export"]);
    expect(labels((await outputs.page(VIEWER, { q: "q4_%" })).items)).toEqual([]);
    expect(labels((await outputs.page(VIEWER, { q: "expense", latest: true })).items)).toEqual(["release c failed", "preview CSV export"]);
  });

  it("shows nothing from spaces the person can't see", async () => {
    const page = await service([ids.files]).page(VIEWER, { kind: "app" });
    const admin = await service(null).page(VIEWER, { kind: "app", latest: true });

    expect(page.items).toEqual([]);
    expect(labels(admin.items)).toContain("release e ready");
  });

  it("counts each filter, and what the last week made", async () => {
    const summary = await service().summary(VIEWER, { latest: true, kind: "deck" });

    expect(summary.counts).toEqual({ all: 6, app: 2, deck: 1, doc: 2, data: 0, pdf: 0, image: 1 });
    expect(summary.week).toEqual({ made: 6, spaces: 2, releasesLive: 1 });
  });
});
