import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { up, down } from "../../migrations/118_space_backing";

describe("space backing migration", () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<Database>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
    await sql`CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      primary_scm_integration_id uuid,
      repository_url text,
      repository_urls text[] NOT NULL DEFAULT '{}'
    )`.execute(db);
    await sql`CREATE TABLE project_scm_configs (
      project_id uuid REFERENCES projects(id), source_repository text
    )`.execute(db);
    await sql`INSERT INTO projects (repository_url) VALUES ('https://example.com/repo'), (NULL)`.execute(db);
    await up(db);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
    await container?.stop();
  });

  it("backfills configured and unfinished existing spaces as Git", async () => {
    const result = await sql<{ backing_kind: string }>`SELECT backing_kind FROM projects`.execute(db);
    expect(result.rows).toEqual([{ backing_kind: "git" }, { backing_kind: "git" }]);
  });

  it("defaults future legacy inserts to Git", async () => {
    const result = await sql<{ backing_kind: string }>`INSERT INTO projects DEFAULT VALUES RETURNING backing_kind`.execute(db);
    expect(result.rows[0].backing_kind).toBe("git");
  });

  it("rejects unknown backing and legacy repository fields on Files spaces", async () => {
    await expect(sql`INSERT INTO projects (backing_kind) VALUES ('unknown')`.execute(db)).rejects.toMatchObject({ code: "23514" });
    await expect(sql`INSERT INTO projects (backing_kind, repository_url) VALUES ('files', 'https://example.com/repo')`.execute(db)).rejects.toMatchObject({ code: "23514" });
    await expect(sql`INSERT INTO projects (backing_kind, primary_scm_integration_id) VALUES ('files', gen_random_uuid())`.execute(db)).rejects.toMatchObject({ code: "23514" });
  });

  it("prevents backing conversion and SCM insertion or reassignment to Files", async () => {
    const files = await sql<{ id: string }>`INSERT INTO projects (backing_kind) VALUES ('files') RETURNING id`.execute(db);
    const git = await sql<{ id: string }>`INSERT INTO projects DEFAULT VALUES RETURNING id`.execute(db);
    const filesId = files.rows[0].id;
    const gitId = git.rows[0].id;
    await expect(sql`UPDATE projects SET backing_kind = 'git' WHERE id = ${filesId}`.execute(db)).rejects.toMatchObject({ code: "23514" });
    await expect(sql`INSERT INTO project_scm_configs VALUES (${filesId}, 'https://example.com/repo')`.execute(db)).rejects.toMatchObject({ code: "23514" });
    await sql`INSERT INTO project_scm_configs VALUES (${gitId}, 'https://example.com/repo')`.execute(db);
    await expect(sql`UPDATE project_scm_configs SET project_id = ${filesId} WHERE project_id = ${gitId}`.execute(db)).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a rollback that would reinterpret Files spaces as Git", async () => {
    await expect(down(db)).rejects.toThrow("Remove Files spaces");
    await sql`DELETE FROM projects WHERE backing_kind = 'files'`.execute(db);
    await down(db);
    await up(db);
    const result = await sql<{ backing_kind: string }>`SELECT DISTINCT backing_kind FROM projects`.execute(db);
    expect(result.rows).toEqual([{ backing_kind: "git" }]);
  });
});
