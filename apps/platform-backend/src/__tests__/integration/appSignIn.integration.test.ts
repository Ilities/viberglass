import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { up as upSessions } from "../../migrations/137_app_gateway_sessions";
import { up as upState, down as downState } from "../../migrations/139_app_handoff_state";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const LAPTOPS = "11111111-1111-4111-8111-111111111111";
const ARCHIVED = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
let container: StartedPostgreSqlContainer;
const signIns = new AppSignInDAO();
const inAMinute = () => new Date(Date.now() + 60_000);

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (
    id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL, is_private boolean NOT NULL DEFAULT false,
    backing_kind text NOT NULL, archived_at timestamptz)`.execute(mockDb);
  await sql`CREATE TABLE user_sessions (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`INSERT INTO projects (id, slug, name, backing_kind, archived_at) VALUES
    (${LAPTOPS}, 'laptops', 'Laptops', 'app', NULL), (${ARCHIVED}, 'old-rota', 'Old rota', 'app', now())`.execute(mockDb);
  await sql`INSERT INTO user_sessions (id) VALUES (${SESSION})`.execute(mockDb);
  await upSessions(mockDb);
  await upState(mockDb);
  // Migration 141 adds these with references to previews, which this schema leaves out.
  await sql`ALTER TABLE app_handoff_codes ADD COLUMN preview_id uuid`.execute(mockDb);
  await sql`ALTER TABLE app_sessions ADD COLUMN preview_id uuid`.execute(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

describe("app sign-in", () => {
  it("redeems a code only with the state of the browser that asked for it, and only once", async () => {
    await signIns.createCode({ codeHash: "code", stateHash: "state", projectId: LAPTOPS, previewId: null, sessionId: SESSION, returnPath: "/laptops", expiresAt: inAMinute() });

    await expect(signIns.redeemCode("code", "another-browser", LAPTOPS, null)).resolves.toBeNull();
    await expect(signIns.redeemCode("code", "state", LAPTOPS, null)).resolves.toEqual({ sessionId: SESSION, returnPath: "/laptops" });
    await expect(signIns.redeemCode("code", "state", LAPTOPS, null)).resolves.toBeNull();
  });

  it("can't open an archived App space by its address, while its maintainers still find it", async () => {
    const spaces = new AppSpaceDAO();

    await expect(spaces.findBySlug("laptops")).resolves.toMatchObject({ projectId: LAPTOPS });
    await expect(spaces.findBySlug("old-rota")).resolves.toBeNull();
    await expect(spaces.findById(ARCHIVED)).resolves.toMatchObject({ slug: "old-rota" });
  });

  it("rolls back", async () => {
    await downState(mockDb);
    await upState(mockDb);
  });
});
