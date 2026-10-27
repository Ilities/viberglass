import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { up, down } from "../../migrations/132_task_attention";

describe("task attention migration", () => {
  let container: StartedPostgreSqlContainer;
  let db: Kysely<Database>;
  const user = "11111111-1111-4111-8111-111111111111";
  const ticket = "22222222-2222-4222-8222-222222222222";
  const question = "33333333-3333-4333-8333-333333333333";
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
    await sql`CREATE TABLE users (id uuid PRIMARY KEY)`.execute(db);
    await sql`CREATE TABLE tickets (id uuid PRIMARY KEY)`.execute(db);
    await sql`INSERT INTO users VALUES (${user}::uuid)`.execute(db);
    await sql`INSERT INTO tickets VALUES (${ticket}::uuid)`.execute(db);
    await up(db);
  }, 60_000);
  afterAll(async () => { await db?.destroy(); await container?.stop(); });

  it("keeps dispositions for separate request versions and cascades with the task", async () => {
    await db.insertInto("task_attention").values([
      { user_id: user, ticket_id: ticket, source: "old", mode: "waiting", reason: "Discussion", remind_at: null, question_ids: [question] },
      { user_id: user, ticket_id: ticket, source: "new", mode: "acknowledged", reason: null, remind_at: null, question_ids: [] },
    ]).execute();
    const deferred = await sql<{ source: string }>`SELECT source FROM task_attention WHERE ${question}::uuid = ANY(question_ids)`.execute(db);
    expect(deferred.rows).toEqual([{ source: "old" }]);
    await sql`DELETE FROM tickets WHERE id = ${ticket}::uuid`.execute(db);
    expect(await db.selectFrom("task_attention").selectAll().execute()).toHaveLength(0);
    await down(db);
  });
});
