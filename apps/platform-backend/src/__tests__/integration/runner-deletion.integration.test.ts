import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { deleteClanker } from "../../persistence/clanker/deleteClanker";
import { up } from "../../migrations/105_deleted_runners";

const ID = "11111111-1111-4111-8111-111111111111";
let container: StartedPostgreSqlContainer;
let db: Kysely<Database>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: container.getConnectionUri() }),
    }),
  });
  await sql`CREATE TABLE clankers (
    id uuid PRIMARY KEY, name text NOT NULL, slug varchar(255) NOT NULL UNIQUE,
    status text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
  )`.execute(db);
  await sql`CREATE TABLE agent_sessions (
    id uuid PRIMARY KEY, clanker_id uuid NOT NULL REFERENCES clankers(id)
  )`.execute(db);
  await sql`CREATE TABLE agent_turns (
    id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES agent_sessions(id), content_markdown text
  )`.execute(db);
  await up(db);
}, 60000);

afterAll(async () => {
  await db?.destroy();
  await container?.stop();
});

it("reproduces the foreign key failure, then removes the runner while preserving session history and freeing its name", async () => {
  await sql`INSERT INTO clankers (id, name, slug, status) VALUES (${ID}, 'Pi', 'pi', 'active')`.execute(
    db,
  );
  await sql`INSERT INTO agent_sessions VALUES ('22222222-2222-4222-8222-222222222222', ${ID})`.execute(
    db,
  );
  await sql`INSERT INTO agent_turns VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'Saved reply')`.execute(
    db,
  );
  await expect(
    db.deleteFrom("clankers").where("id", "=", ID).execute(),
  ).rejects.toMatchObject({
    code: "23503",
    constraint: "agent_sessions_clanker_id_fkey",
  });

  await deleteClanker(db, ID);
  expect(
    await db
      .selectFrom("clankers")
      .select("id")
      .where("deleted_at", "is", null)
      .execute(),
  ).toEqual([]);
  const history = await db
    .selectFrom("agent_turns")
    .innerJoin("agent_sessions", "agent_sessions.id", "agent_turns.session_id")
    .innerJoin("clankers", "clankers.id", "agent_sessions.clanker_id")
    .select([
      "clankers.name",
      "agent_turns.content_markdown",
      "clankers.status",
    ])
    .executeTakeFirstOrThrow();
  expect(history).toEqual({
    name: "Pi",
    content_markdown: "Saved reply",
    status: "inactive",
  });
  await sql`INSERT INTO clankers (id, name, slug, status) VALUES ('44444444-4444-4444-8444-444444444444', 'Pi', 'pi', 'inactive')`.execute(
    db,
  );
  expect(
    await db
      .selectFrom("clankers")
      .select("id")
      .where("deleted_at", "is", null)
      .execute(),
  ).toHaveLength(1);
});
