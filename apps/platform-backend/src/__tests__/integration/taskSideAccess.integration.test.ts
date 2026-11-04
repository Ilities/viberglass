import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { TaskSideAccessDAO } from "../../persistence/user/TaskSideAccessDAO";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const KIM = "11111111-1111-4111-8111-111111111111";
const ADA = "22222222-2222-4222-8222-222222222222";
const SPACE = "33333333-3333-4333-8333-333333333333";
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (id uuid PRIMARY KEY, default_owner_id uuid, default_reviewer_ids uuid[] NOT NULL DEFAULT '{}')`.execute(mockDb);
  await sql`CREATE TABLE space_members (project_id uuid, user_id uuid, role text)`.execute(mockDb);
  await sql`CREATE TABLE task_participants (ticket_id text, user_id uuid, role text)`.execute(mockDb);
  await sql`CREATE TABLE api_tokens (id serial PRIMARY KEY, user_id uuid)`.execute(mockDb);
  await sql`INSERT INTO projects VALUES (${SPACE}, ${KIM}, ARRAY[${KIM}, ${ADA}]::uuid[])`.execute(mockDb);
  await sql`INSERT INTO space_members VALUES (${SPACE}, ${KIM}, 'member'), (${SPACE}, ${ADA}, 'maintainer')`.execute(mockDb);
  await sql`INSERT INTO task_participants VALUES ('t1', ${KIM}, 'requester'), ('t1', ${KIM}, 'reviewer'), ('t2', ${KIM}, 'watcher'), ('t2', ${KIM}, 'owner'), ('t1', ${ADA}, 'watcher')`.execute(mockDb);
  await sql`INSERT INTO api_tokens (user_id) VALUES (${KIM}), (${ADA})`.execute(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

describe("taking someone out of spaces and tasks", () => {
  it("removes their memberships, reviews, watches, defaults and API tokens, and keeps the task history", async () => {
    await new TaskSideAccessDAO().removeFor(KIM);

    const members = await sql<{ user_id: string }>`SELECT user_id FROM space_members`.execute(mockDb);
    expect(members.rows).toEqual([{ user_id: ADA }]);
    const participants = await sql<{ user_id: string; role: string }>`SELECT user_id, role FROM task_participants ORDER BY ticket_id, role`.execute(mockDb);
    expect(participants.rows).toEqual([
      { user_id: KIM, role: "requester" },
      { user_id: ADA, role: "watcher" },
      { user_id: KIM, role: "owner" },
    ]);
    const project = await sql<{ default_owner_id: string | null; default_reviewer_ids: string[] }>`SELECT default_owner_id, default_reviewer_ids FROM projects`.execute(mockDb);
    expect(project.rows).toEqual([{ default_owner_id: null, default_reviewer_ids: [ADA] }]);
    const tokens = await sql<{ user_id: string }>`SELECT user_id FROM api_tokens`.execute(mockDb);
    expect(tokens.rows).toEqual([{ user_id: ADA }]);
  });
});
