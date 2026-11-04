import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppAccessDAO } from "../../persistence/apps/AppAccessDAO";
import { InviteDAO } from "../../persistence/user/InviteDAO";
import { up, down } from "../../migrations/138_app_access";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const LAPTOPS = "11111111-1111-4111-8111-111111111111";
const ROTA = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
let container: StartedPostgreSqlContainer;
const invites = new InviteDAO();
const accessList = new AppAccessDAO();
const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function newInvite(email: string, appIds: string[], tokenHash = email) {
  return invites.create({ email, role: "app_user", spaceIds: [], appIds, tokenHash, expiresAt: inAWeek(), createdBy: ADMIN });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL, password_hash text,
    avatar_url text, role text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deactivated_at timestamptz)`.execute(mockDb);
  await sql`CREATE TABLE invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, role text NOT NULL, token_hash text NOT NULL UNIQUE,
    created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
    accepted_at timestamptz, accepted_user_id uuid, revoked_at timestamptz, space_ids uuid[] NOT NULL DEFAULT '{}')`.execute(mockDb);
  await sql`CREATE TABLE space_members (project_id uuid, user_id uuid, role text, added_by uuid, created_at timestamptz DEFAULT now())`.execute(mockDb);
  await sql`INSERT INTO projects (id) VALUES (${LAPTOPS}), (${ROTA})`.execute(mockDb);
  await sql`INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (${ADMIN}, 'ada@example.com', 'Ada', 'admin', now(), now())`.execute(mockDb);
  await up(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`DELETE FROM app_access`.execute(mockDb);
  await sql`DELETE FROM invites`.execute(mockDb);
  await sql`DELETE FROM users WHERE id <> ${ADMIN}`.execute(mockDb);
});

describe("app access invites", () => {
  it("adds and removes apps on an open invite, once each", async () => {
    const invite = await newInvite("kim@example.com", [LAPTOPS]);

    await expect(invites.addApp(invite.id, ROTA)).resolves.toMatchObject({ appIds: [LAPTOPS, ROTA] });
    await expect(invites.addApp(invite.id, ROTA)).resolves.toMatchObject({ appIds: [LAPTOPS, ROTA] });
    await expect(invites.listOpenForApp(ROTA)).resolves.toHaveLength(1);

    await expect(invites.removeApp(invite.id, LAPTOPS)).resolves.toMatchObject({ appIds: [ROTA] });
    await expect(invites.removeApp(invite.id, LAPTOPS)).resolves.toBeNull();
    await expect(invites.listOpenForApp(LAPTOPS)).resolves.toEqual([]);
  });

  it("leaves an invite that's no longer open alone", async () => {
    const invite = await newInvite("kim@example.com", [LAPTOPS]);
    await invites.revoke(invite.id);

    await expect(invites.addApp(invite.id, ROTA)).resolves.toBeNull();
    await expect(invites.findOpenByEmail("kim@example.com")).resolves.toBeNull();
  });

  it("puts the new person on the access list of every app the invite names", async () => {
    await newInvite("kim@example.com", [LAPTOPS, ROTA], "kim-token");

    const accepted = await invites.accept("kim-token", { name: "Kim", passwordHash: "x" });

    expect(accepted).not.toBeNull();
    await expect(accessList.projectIdsFor(accepted!.userId)).resolves.toEqual(expect.arrayContaining([LAPTOPS, ROTA]));
    await expect(accessList.list(LAPTOPS)).resolves.toEqual([
      expect.objectContaining({ userId: accepted!.userId, name: "Kim", email: "kim@example.com", workspaceRole: "app_user" }),
    ]);
    const row = await mockDb.selectFrom("app_access").select("added_by").where("user_id", "=", accepted!.userId).executeTakeFirstOrThrow();
    expect(row.added_by).toBe(ADMIN);
  });
});

describe("app access lists", () => {
  it("adds someone once, answers whether they're on it, and takes them off", async () => {
    await accessList.add({ projectId: LAPTOPS, userId: ADMIN, addedBy: ADMIN });
    await accessList.add({ projectId: LAPTOPS, userId: ADMIN, addedBy: ADMIN });

    await expect(accessList.has(LAPTOPS, ADMIN)).resolves.toBe(true);
    await expect(accessList.has(ROTA, ADMIN)).resolves.toBe(false);
    await expect(accessList.remove(LAPTOPS, ADMIN)).resolves.toBe(true);
    await expect(accessList.remove(LAPTOPS, ADMIN)).resolves.toBe(false);
  });

  it("leaves deactivated people off the list it shows", async () => {
    await accessList.add({ projectId: LAPTOPS, userId: ADMIN, addedBy: ADMIN });
    await sql`UPDATE users SET deactivated_at = now() WHERE id = ${ADMIN}`.execute(mockDb);

    await expect(accessList.list(LAPTOPS)).resolves.toEqual([]);
    await sql`UPDATE users SET deactivated_at = NULL WHERE id = ${ADMIN}`.execute(mockDb);
  });

  it("rolls back", async () => {
    await down(mockDb);
    await up(mockDb);
  });
});
