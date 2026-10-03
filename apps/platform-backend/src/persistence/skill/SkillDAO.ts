import type { Selectable } from "kysely";
import type { Skill } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type SkillRow = Selectable<Database["skills"]>;

/** A skill as stored: what people see, and where its files are. */
export interface SkillRecord extends Skill {
  storageUrl: string;
}

export interface SkillRecordInput {
  name: string;
  description: string;
  storageUrl: string;
  fileCount: number;
  sizeBytes: number;
}

function toSkillRecord(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    storageUrl: row.storage_url,
    fileCount: row.file_count,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class SkillDAO {
  async list(): Promise<SkillRecord[]> {
    const rows = await db.selectFrom("skills").selectAll().orderBy("name", "asc").execute();
    return rows.map(toSkillRecord);
  }

  async get(id: string): Promise<SkillRecord | null> {
    const row = await db.selectFrom("skills").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toSkillRecord(row) : null;
  }

  async getByIds(ids: string[]): Promise<SkillRecord[]> {
    if (ids.length === 0) return [];
    const rows = await db.selectFrom("skills").selectAll().where("id", "in", ids).orderBy("name", "asc").execute();
    return rows.map(toSkillRecord);
  }

  async findByName(name: string): Promise<SkillRecord | null> {
    const row = await db.selectFrom("skills").selectAll().where("name", "=", name).executeTakeFirst();
    return row ? toSkillRecord(row) : null;
  }

  /** The id is chosen before the insert, since the files are stored under it first. */
  async create(id: string, input: SkillRecordInput): Promise<SkillRecord> {
    const row = await db
      .insertInto("skills")
      .values({
        id,
        name: input.name,
        description: input.description,
        storage_url: input.storageUrl,
        file_count: input.fileCount,
        size_bytes: input.sizeBytes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSkillRecord(row);
  }

  async update(id: string, input: SkillRecordInput): Promise<SkillRecord | null> {
    const row = await db
      .updateTable("skills")
      .set({
        name: input.name,
        description: input.description,
        storage_url: input.storageUrl,
        file_count: input.fileCount,
        size_bytes: input.sizeBytes,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    return row ? toSkillRecord(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db.deleteFrom("skills").where("id", "=", id).execute();
  }

  /** The runners that give their agent this skill, by name. */
  async runnersUsing(id: string): Promise<string[]> {
    const rows = await db
      .selectFrom("clanker_skills")
      .innerJoin("clankers", "clankers.id", "clanker_skills.clanker_id")
      .select("clankers.name")
      .where("clanker_skills.skill_id", "=", id)
      .orderBy("clankers.name", "asc")
      .execute();
    return rows.map((row) => row.name);
  }
}
