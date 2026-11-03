import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { up as spaceBacking } from "../../migrations/118_space_backing";
import { up, down } from "../../migrations/133_app_space_backing";

describe("App space backing migration", () => {
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
    await spaceBacking(db);
    await up(db);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
    await container?.stop();
  });

  it("lets App spaces have a repository, as Git spaces do", async () => {
    const app = await sql<{ id: string }>`INSERT INTO projects (backing_kind, primary_scm_integration_id) VALUES ('app', gen_random_uuid()) RETURNING id`.execute(db);
    await sql`INSERT INTO project_scm_configs VALUES (${app.rows[0].id}, 'https://example.com/laptops')`.execute(db);
    await expect(sql`UPDATE projects SET backing_kind = 'git' WHERE id = ${app.rows[0].id}`.execute(db)).rejects.toMatchObject({ code: "23514" });
  });

  it("still keeps repositories off Files spaces", async () => {
    await expect(sql`INSERT INTO projects (backing_kind, repository_url) VALUES ('files', 'https://example.com/repo')`.execute(db)).rejects.toMatchObject({ code: "23514" });
    await expect(sql`INSERT INTO projects (backing_kind) VALUES ('unknown')`.execute(db)).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a rollback while App spaces exist", async () => {
    await expect(down(db)).rejects.toThrow("Remove App spaces");
    await sql`DELETE FROM project_scm_configs`.execute(db);
    await sql`DELETE FROM projects WHERE backing_kind = 'app'`.execute(db);
    await down(db);
    await expect(sql`INSERT INTO projects (backing_kind) VALUES ('app')`.execute(db)).rejects.toMatchObject({ code: "23514" });
  });
});
