import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";
import type { UserRole } from "../types/user";

type UsersRow = Selectable<Database["users"]>;

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export class UserDAO {
  async listUsers(): Promise<PublicUser[]> {
    const rows = await db
      .selectFrom("users")
      .selectAll()
      .orderBy("created_at", "asc")
      .execute();

    return rows.map((row) => this.mapPublicUser(row));
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapUser(row);
  }

  async findById(id: string): Promise<PublicUser | null> {
    const row = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapPublicUser(row);
  }

  async updateUserRole(id: string, role: UserRole): Promise<PublicUser | null> {
    const row = await db
      .updateTable("users")
      .set({
        role,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!row) return null;

    return this.mapPublicUser(row);
  }

  async countByRole(role: UserRole): Promise<number> {
    const row = await db
      .selectFrom("users")
      .select((eb) => eb.fn.count<string>("id").as("count"))
      .where("role", "=", role)
      .executeTakeFirstOrThrow();

    return Number(row.count);
  }

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    avatarUrl?: string | null;
    role?: UserRole;
  }): Promise<PublicUser> {
    const timestamp = new Date();

    const row = await db
      .insertInto("users")
      .values({
        email: input.email,
        name: input.name,
        password_hash: input.passwordHash,
        avatar_url: input.avatarUrl ?? null,
        role: input.role ?? "member",
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapPublicUser(row);
  }

  private mapUser(row: UsersRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      avatarUrl: row.avatar_url ?? null,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapPublicUser(row: UsersRow): PublicUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url ?? null,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async hasAnyUsers(): Promise<boolean> {
    const row = await db
      .selectFrom("users")
      .select("id")
      .limit(1)
      .executeTakeFirst();

    return Boolean(row);
  }
}
